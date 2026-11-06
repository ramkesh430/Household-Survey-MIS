import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, setupDb, api, login, clearTokens, PASSWORD } from './helpers.js';
import { pool, query } from '../src/db.js';
import { buildCompleteAnswers } from '../../shared/test/fixtures.js';

let defaultWardNos;
before(async () => { defaultWardNos = await setupDb(); clearTokens(); });
after(async () => { await pool.end(); });

describe('health & auth', () => {
  test('health check reports database ok', async () => {
    const r = await request(app).get('/api/health');
    assert.equal(r.status, 200);
    assert.equal(r.body.db, 'ok');
  });

  test('protected routes require a token', async () => {
    const r = await request(app).get('/api/households');
    assert.equal(r.status, 401);
  });

  test('login returns tokens and user; wrong password fails', async () => {
    const ok = await request(app).post('/api/auth/login').send({ username: 'enum1', password: PASSWORD });
    assert.equal(ok.status, 200);
    assert.ok(ok.body.accessToken && ok.body.refreshToken);
    assert.equal(ok.body.user.role, 'enumerator');
    const bad = await request(app).post('/api/auth/login').send({ username: 'enum1', password: 'wrong-pass1' });
    assert.equal(bad.status, 401);
  });

  test('account locks after repeated failed logins', async () => {
    for (let i = 0; i < 5; i++) await request(app).post('/api/auth/login').send({ username: 'enum2', password: 'nope-nope1' });
    const r = await request(app).post('/api/auth/login').send({ username: 'enum2', password: PASSWORD });
    assert.equal(r.status, 401);
    assert.match(r.body.error.message, /बन्द/);
    await query('UPDATE users SET locked_until = NULL, failed_logins = 0 WHERE username = ?', ['enum2']);
  });

  test('refresh token rotates and reuse revokes the session family', async () => {
    const l = await request(app).post('/api/auth/login').send({ username: 'sup1', password: PASSWORD });
    const r1 = await request(app).post('/api/auth/refresh').send({ refreshToken: l.body.refreshToken });
    assert.equal(r1.status, 200);
    assert.notEqual(r1.body.refreshToken, l.body.refreshToken);
    const reuse = await request(app).post('/api/auth/refresh').send({ refreshToken: l.body.refreshToken });
    assert.equal(reuse.status, 401);
    const afterReuse = await request(app).post('/api/auth/refresh').send({ refreshToken: r1.body.refreshToken });
    assert.equal(afterReuse.status, 401, 'rotated token revoked after reuse detected');
  });

  test('change password invalidates old access tokens', async () => {
    const l = await request(app).post('/api/auth/login').send({ username: 'enum3', password: PASSWORD });
    const ch = await request(app).post('/api/auth/change-password').set('Authorization', `Bearer ${l.body.accessToken}`)
      .send({ currentPassword: PASSWORD, newPassword: 'NewPass@2083' });
    assert.equal(ch.status, 200);
    const old = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${l.body.accessToken}`);
    assert.equal(old.status, 401);
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${ch.body.accessToken}`);
    assert.equal(me.status, 200);
    // restore
    await request(app).post('/api/auth/change-password').set('Authorization', `Bearer ${ch.body.accessToken}`)
      .send({ currentPassword: 'NewPass@2083', newPassword: PASSWORD });
  });
});

describe('users, wards, settlements (RBAC)', () => {
  test('municipal wards 1 through 8 are created by migration', () => {
    assert.deepEqual(defaultWardNos, [1, 2, 3, 4, 5, 6, 7, 8]);
  });

  test('admin creates users; weak password and missing ward rejected', async () => {
    const weak = await api('admin', 'post', '/api/users', { username: 'x1', full_name: 'X', role: 'enumerator', ward_id: 1, password: 'short' });
    assert.equal(weak.status, 400);
    const noWard = await api('admin', 'post', '/api/users', { username: 'x2', full_name: 'X दुई', role: 'enumerator', password: 'Strong@123' });
    assert.equal(noWard.status, 400);
    const ok = await api('admin', 'post', '/api/users', { username: 'New.Enum', full_name: 'नयाँ गणक', role: 'enumerator', ward_id: 1, password: 'Strong@123' });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.data.username, 'new.enum');
  });

  test('enumerator cannot manage users or wards', async () => {
    assert.equal((await api('enum1', 'post', '/api/users', {})).status, 403);
    assert.equal((await api('enum1', 'post', '/api/wards', { ward_no: 9 })).status, 403);
    assert.equal((await api('enum1', 'get', '/api/audit-logs')).status, 403);
  });

  test('supervisor only sees users and wards of own ward', async () => {
    const u = await api('sup1', 'get', '/api/users');
    assert.equal(u.status, 200);
    assert.ok(u.body.data.every((x) => x.ward_id === 1));
    const w = await api('sup1', 'get', '/api/wards');
    assert.deepEqual(w.body.data.map((x) => x.id), [1]);
    const s = await api('sup1', 'get', '/api/wards/2/settlements');
    assert.deepEqual(s.body.data, []);
  });

  test('admin manages wards and settlements', async () => {
    const w = await api('admin', 'post', '/api/wards', { ward_no: 3, name: 'वडा ३' });
    assert.equal(w.status, 201);
    const dup = await api('admin', 'post', '/api/wards', { ward_no: 3 });
    assert.equal(dup.status, 409);
    const s = await api('admin', 'post', '/api/settlements', { ward_id: w.body.data.id, code: 'S09', name: 'नयाँ बस्ती' });
    assert.equal(s.status, 201);
  });

  test('enumerators can add settlements only in their assigned ward with generated codes', async () => {
    const created = await api('enum1', 'post', '/api/settlements', { name: 'गणकले थपेको टोल' });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.ward_id, 1);
    assert.equal(created.body.data.code, 'S02');
    assert.equal(created.body.data.name, 'गणकले थपेको टोल');

    const otherWard = await api('enum1', 'post', '/api/settlements', { ward_id: 2, name: 'अनधिकृत बस्ती' });
    assert.equal(otherWard.status, 403);
    const customCode = await api('enum1', 'post', '/api/settlements', { code: 'S99', name: 'आफैं कोड' });
    assert.equal(customCode.status, 400);
  });

  test('deactivated user is logged out immediately', async () => {
    const created = await api('admin', 'post', '/api/users', { username: 'temp1', full_name: 'अस्थायी', role: 'enumerator', ward_id: 1, password: 'Strong@123' });
    const l = await request(app).post('/api/auth/login').send({ username: 'temp1', password: 'Strong@123' });
    assert.equal(l.status, 200);
    await api('admin', 'patch', `/api/users/${created.body.data.id}`, { is_active: false });
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${l.body.accessToken}`);
    assert.equal(me.status, 401);
  });
});

describe('households', () => {
  let hh;
  test('enumerator registers a household with a unique readable ID', async () => {
    const r = await api('enum1', 'post', '/api/households', { settlement_id: 1, house_no: 45, family_no: 1, head_name: 'राम बहादुर थापा', head_gender: '२' });
    assert.equal(r.status, 201);
    assert.equal(r.body.data.household_code, 'W01-S01-H0045-F01');
    hh = r.body.data;
  });

  test('duplicate house/family number in same settlement is rejected', async () => {
    const r = await api('enum2', 'post', '/api/households', { settlement_id: 1, house_no: 45, family_no: 1, head_name: 'अर्को' });
    assert.equal(r.status, 409);
    assert.equal(r.body.error.details.existing.id, hh.id);
  });

  test('re-sending the same uuid is idempotent (offline retry safe)', async () => {
    const uuid = '3f8a6c5e-1d2b-4c3a-9e8f-7a6b5c4d3e2f';
    const a = await api('enum1', 'post', '/api/households', { uuid, settlement_id: 1, house_no: 46, family_no: 1, head_name: 'सीता' });
    const b = await api('enum1', 'post', '/api/households', { uuid, settlement_id: 1, house_no: 46, family_no: 1, head_name: 'सीता' });
    assert.equal(a.status, 201);
    assert.equal(b.status, 200);
    assert.equal(a.body.data.id, b.body.data.id);
  });

  test('enumerator from another ward cannot register or view ward-1 households', async () => {
    const r = await api('enum3', 'post', '/api/households', { settlement_id: 1, house_no: 1, family_no: 1, head_name: 'क ख' });
    assert.equal(r.status, 403);
    const g = await api('enum3', 'get', `/api/households/${hh.id}`);
    assert.equal(g.status, 403);
    const list = await api('enum3', 'get', '/api/households');
    assert.equal(list.body.total, 0);
  });

  test('search by head name works with Nepali text', async () => {
    const r = await api('sup1', 'get', `/api/households?q=${encodeURIComponent('थापा')}`);
    assert.equal(r.body.total, 1);
  });
});

describe('survey workflow', () => {
  let hh; let survey;
  before(async () => {
    const r = await api('enum1', 'post', '/api/households', { settlement_id: 1, house_no: 100, family_no: 2, head_name: 'हरि प्रसाद', head_gender: '२' });
    hh = r.body.data;
  });

  test('questionnaire endpoint returns all 77 questions', async () => {
    const r = await api('enum1', 'get', '/api/questionnaire');
    assert.equal(r.status, 200);
    assert.equal(r.body.data.questions.filter((q) => q.no).length, 77);
  });

  test('creating a survey pre-fills header and Q1 from the household', async () => {
    const r = await api('enum1', 'post', '/api/surveys', { household_id: hh.id });
    assert.equal(r.status, 201);
    survey = r.body.data;
    assert.equal(survey.status, 'draft');
    assert.equal(survey.answers.hdr.house_no, 100);
    assert.equal(survey.answers.hdr.settlement_code, 'S01');
    assert.equal(survey.answers.q1.head_name, 'हरि प्रसाद');
    const again = await api('enum1', 'post', '/api/surveys', { household_id: hh.id });
    assert.equal(again.status, 409);
  });

  test('supervisor cannot start surveys', async () => {
    const r = await api('sup1', 'post', '/api/surveys', { household_id: hh.id });
    assert.equal(r.status, 403);
  });

  test('draft save computes totals, bumps version and stores per-question rows', async () => {
    const answers = { q5: { age_table: { '25_45': { female: 1, male: 1 } } }, q6: { ans: 'क' } };
    const r = await api('enum1', 'put', `/api/surveys/${survey.id}`, { answers, version: survey.version });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.data.version, survey.version + 1);
    assert.equal(r.body.data.answers.q5.family_size, 2);
    assert.equal(r.body.data.answers.q5.age_table._total.total, 2);
    assert.equal(r.body.data.answers.hdr.house_no, 100, 'header cannot be overwritten by client');
    const rows = await query('SELECT question_id FROM survey_answers WHERE survey_id = ? ORDER BY question_id', [survey.id]);
    assert.deepEqual(rows.map((x) => x.question_id).sort(), ['hdr', 'q5', 'q6']);
    survey = r.body.data;
  });

  test('stale version is rejected with 409 (no silent overwrite)', async () => {
    const r = await api('enum1', 'put', `/api/surveys/${survey.id}`, { answers: {}, version: survey.version - 1 });
    assert.equal(r.status, 409);
    assert.equal(r.body.error.details.currentVersion, survey.version);
  });

  test('invalid answers are rejected even in draft mode', async () => {
    const r = await api('enum1', 'put', `/api/surveys/${survey.id}`, { answers: { q6: { ans: 'Z' } }, version: survey.version });
    assert.equal(r.status, 422);
    assert.equal(r.body.error.details.errors[0].path, 'q6.ans');
  });

  test('other enumerators cannot read or edit the survey', async () => {
    assert.equal((await api('enum2', 'get', `/api/surveys/${survey.id}`)).status, 403);
    assert.equal((await api('enum3', 'get', `/api/surveys/${survey.id}`)).status, 403);
    assert.equal((await api('sup1', 'get', `/api/surveys/${survey.id}`)).status, 200, 'supervisor of the ward can read');
    const list = await api('enum2', 'get', '/api/surveys');
    assert.equal(list.body.total, 0);
  });

  test('incomplete submission returns the list of missing answers', async () => {
    const r = await api('enum1', 'post', `/api/surveys/${survey.id}/submit`, { answers: survey.answers, version: survey.version });
    assert.equal(r.status, 422);
    assert.ok(r.body.error.details.errors.length > 30);
  });

  test('complete submission succeeds, records GPS, history and locks editing', async () => {
    const answers = buildCompleteAnswers();
    const r = await api('enum1', 'post', `/api/surveys/${survey.id}/submit`, {
      answers, version: survey.version, gps: { lat: 27.7, lng: 85.3, accuracy: 12.5 },
    });
    assert.equal(r.status, 200, JSON.stringify(r.body.error?.details?.errors?.slice(0, 3)));
    assert.equal(r.body.data.status, 'submitted');
    assert.equal(r.body.data.completion, 100);
    assert.equal(Number(r.body.data.gps_lat), 27.7);
    const h = await api('enum1', 'get', `/api/surveys/${survey.id}/history`);
    assert.deepEqual(h.body.data.map((x) => x.to_status), ['draft', 'submitted']);
    const edit = await api('enum1', 'put', `/api/surveys/${survey.id}`, { answers, version: r.body.data.version });
    assert.equal(edit.status, 400);
    const hh2 = await api('enum1', 'get', `/api/households/${hh.id}`);
    assert.equal(hh2.body.data.head_name, 'परीक्षण', 'household register synced from Q1 on submit');
  });

  test('stats are scoped by role', async () => {
    const e = await api('enum1', 'get', '/api/surveys/stats');
    assert.equal(e.body.data.surveys.submitted, 1);
    const e3 = await api('enum3', 'get', '/api/surveys/stats');
    assert.equal(e3.body.data.surveys.submitted, 0);
  });

  test('audit log captured the actions', async () => {
    const r = await api('admin', 'get', `/api/audit-logs?entity_type=survey&entity_id=${survey.id}`);
    const actions = r.body.data.map((x) => x.action);
    assert.ok(actions.includes('survey.create'));
    assert.ok(actions.includes('survey.save'));
    assert.ok(actions.includes('survey.submit'));
  });
});
