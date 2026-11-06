import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, api, clearTokens } from './helpers.js';
import { pool, query } from '../src/db.js';
import { buildCompleteAnswers, TINY_PNG } from '../../shared/test/fixtures.js';

before(async () => { await setupDb(); clearTokens(); });
after(async () => { await pool.end(); });

let house = 100;
async function submitted(user = 'enum1', gps = { lat: 27.7, lng: 85.3, accuracy: 10 }, head = `परिवार ${house}`) {
  house += 1;
  const h = (await api(user, 'post', '/api/households', { settlement_id: 1, house_no: house, family_no: 1, head_name: head })).body.data;
  const s = (await api(user, 'post', '/api/surveys', { household_id: h.id })).body.data;
  const r = await api(user, 'post', `/api/surveys/${s.id}/submit`, { answers: buildCompleteAnswers(), version: s.version, ...(gps ? { gps } : {}) });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return { household: h, survey: r.body.data };
}

describe('review workflow', () => {
  let s;
  before(async () => { s = (await submitted()).survey; });

  test('enumerators cannot review; supervisors of another ward cannot either', async () => {
    assert.equal((await api('enum1', 'post', `/api/surveys/${s.id}/approve`, {})).status, 403);
    assert.equal((await api('enum1', 'post', `/api/surveys/${s.id}/reject`, {})).status, 403);
    await api('admin', 'post', '/api/users', { username: 'sup2', full_name: 'अर्को सुपरभाइजर', role: 'supervisor', ward_id: 2, password: 'Test@12345' });
    await query('UPDATE users SET must_change_password = 0 WHERE username = ?', ['sup2']);
    const r = await api('sup2', 'post', `/api/surveys/${s.id}/reject`, { version: s.version, comment: 'जाँच' });
    assert.equal(r.status, 403);
  });

  test('queue lists submitted surveys with quality flags', async () => {
    const r = await api('sup1', 'get', '/api/quality/queue');
    assert.equal(r.status, 200);
    const item = r.body.data.find((x) => x.id === s.id);
    assert.ok(item);
    assert.ok(Array.isArray(item.flags));
    assert.ok(r.body.flagLabels.no_gps);
  });

  test('reject needs a reason; notes must reference real questions', async () => {
    assert.equal((await api('sup1', 'post', `/api/surveys/${s.id}/reject`, { version: s.version, comment: '' })).status, 400);
    assert.equal((await api('sup1', 'post', `/api/surveys/${s.id}/reject`, { version: s.version, comment: 'कारण', notes: [{ q: 'q999', note: 'x' }] })).status, 400);
  });

  test('reject with question notes sends the survey back to the enumerator', async () => {
    const r = await api('sup1', 'post', `/api/surveys/${s.id}/reject`, {
      version: s.version, comment: 'प्र.५ र प्र.१७ जाँच गर्नुहोस्', notes: [{ q: 'q5', note: 'परिवार संख्या पुनः गन्नुहोस्' }, { q: 'q17', note: 'खोप कार्ड हेर्नुहोस्' }],
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.data.status, 'rejected');
    assert.equal(r.body.data.reject_count, 1);
    assert.deepEqual(Object.keys(r.body.data.review_notes), ['q5', 'q17']);
    const pull = await api('enum1', 'get', '/api/sync/pull');
    const mine = pull.body.surveys.find((x) => x.id === s.id);
    assert.equal(mine.status, 'rejected');
    assert.equal(mine.review_notes.q5, 'परिवार संख्या पुनः गन्नुहोस्');
    const again = await api('sup1', 'post', `/api/surveys/${s.id}/reject`, { version: r.body.data.version, comment: 'फेरि' });
    assert.equal(again.status, 400, 'only submitted surveys can be rejected');
    s = r.body.data;
  });

  test('enumerator corrects and resubmits; the queue marks it as resubmitted', async () => {
    const answers = { ...buildCompleteAnswers(), q5: { age_table: { '25_45': { female: 2, male: 1 } }, family_size: 3 } };
    const r = await api('enum1', 'post', `/api/surveys/${s.id}/submit`, { answers, version: s.version });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.data.status, 'submitted');
    const q = await api('sup1', 'get', '/api/quality/queue');
    assert.ok(q.body.data.find((x) => x.id === s.id).flags.includes('resubmitted'));
    s = r.body.data;
  });

  test('approval records the verifier name and signature in the form', async () => {
    assert.equal((await api('sup1', 'post', `/api/surveys/${s.id}/approve`, { version: s.version - 1, verifier_name: 'सुपरभाइजर', verifier_sign: TINY_PNG })).status, 409);
    assert.equal((await api('sup1', 'post', `/api/surveys/${s.id}/approve`, { version: s.version, verifier_name: 'सुपरभाइजर', verifier_sign: 'not-a-signature' })).status, 400);
    const r = await api('sup1', 'post', `/api/surveys/${s.id}/approve`, { version: s.version, verifier_name: 'सुपरभाइजर', verifier_sign: TINY_PNG, comment: 'ठीक छ' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.data.status, 'approved');
    assert.equal(r.body.data.answers.verify.verifier_name, 'सुपरभाइजर');
    assert.equal(r.body.data.review_notes, null);
    const [row] = await query("SELECT answer FROM survey_answers WHERE survey_id = ? AND question_id = 'verify'", [s.id]);
    const verify = typeof row.answer === 'string' ? JSON.parse(row.answer) : row.answer;
    assert.equal(verify.verifier_name, 'सुपरभाइजर');
    const edit = await api('enum1', 'put', `/api/surveys/${s.id}`, { answers: {}, version: r.body.data.version });
    assert.equal(edit.status, 400, 'approved surveys are locked');
    const h = await api('sup1', 'get', `/api/surveys/${s.id}/history`);
    assert.deepEqual(h.body.data.map((x) => x.to_status), ['draft', 'submitted', 'rejected', 'submitted', 'approved']);
    assert.equal(h.body.data[2].details.notes.q17, 'खोप कार्ड हेर्नुहोस्');
    s = r.body.data;
  });

  test('only an admin can reopen an approved survey; verifier fields are cleared', async () => {
    assert.equal((await api('sup1', 'post', `/api/surveys/${s.id}/reopen`, { version: s.version, comment: 'त्रुटि' })).status, 403);
    const r = await api('admin', 'post', `/api/surveys/${s.id}/reopen`, { version: s.version, comment: 'जन्म दर्ता संख्या गलत' });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.status, 'rejected');
    assert.equal(r.body.data.answers.verify.verifier_name, undefined);
  });
});

describe('data quality', () => {
  test('GPS outliers and missing GPS are flagged; summary aggregates per enumerator', async () => {
    for (const d of [0, 0.001, 0.002]) await submitted('enum2', { lat: 27.7 + d, lng: 85.3 + d, accuracy: 8 });
    const far = (await submitted('enum2', { lat: 27.9, lng: 85.6, accuracy: 120 })).survey;
    const none = (await submitted('enum2', null)).survey;
    const f = await api('sup1', 'get', '/api/quality/flags');
    const byId = Object.fromEntries(f.body.data.map((x) => [x.id, x.flags]));
    assert.ok(byId[far.id].includes('gps_outlier'));
    assert.ok(byId[far.id].includes('gps_poor'));
    assert.ok(byId[none.id].includes('no_gps'));
    const sum = await api('sup1', 'get', '/api/quality/summary');
    const e2 = sum.body.data.enumerators.find((e) => e.enumerator_name === 'गणक दुई');
    assert.equal(e2.submitted, 5);
    assert.equal(e2.gps_outlier, 1);
    assert.equal(e2.no_gps, 1);
    assert.equal(sum.body.data.totals.households, 6);
    assert.equal(sum.body.data.totals.not_started, 0);
    assert.equal((await api('enum1', 'get', '/api/quality/summary')).status, 403);
  });
});

describe('duplicate households', () => {
  let a; let b; let c;
  test('registration reports similar existing households (non-blocking)', async () => {
    a = (await api('enum1', 'post', '/api/households', { settlement_id: 1, house_no: 501, family_no: 1, head_name: 'गोपाल बहादुर श्रेष्ठ', phone: '9841111111' })).body.data;
    const r = await api('enum2', 'post', '/api/households', { settlement_id: 1, house_no: 502, family_no: 1, head_name: 'गोपालबहादुर श्रेस्ठ' });
    assert.equal(r.status, 201);
    b = r.body.data;
    assert.equal(r.body.possible_duplicates[0].household.id, a.id);
    c = (await api('enum2', 'post', '/api/households', { settlement_id: 1, house_no: 640, family_no: 1, head_name: 'अर्को नाम', phone: '+977 9841111111' })).body.data;
  });

  test('supervisor sees suspected pairs with reasons', async () => {
    const r = await api('sup1', 'get', '/api/quality/duplicates');
    const pair = r.body.data.find((p) => p.a.id === a.id && p.b.id === b.id);
    assert.ok(pair);
    assert.equal(pair.reasons[0].code, 'name');
    assert.ok(r.body.data.find((p) => p.a.id === a.id && p.b.id === c.id).reasons.some((x) => x.code === 'phone'));
  });

  test('"not duplicate" hides the pair; "duplicate" excludes the household', async () => {
    await api('sup1', 'post', '/api/quality/duplicates/review', { household_a: a.id, household_b: c.id, decision: 'not_duplicate' });
    const before = await api('sup1', 'get', '/api/quality/summary');
    const r = await api('sup1', 'post', '/api/quality/duplicates/review', { household_a: b.id, household_b: a.id, decision: 'duplicate', duplicate_id: b.id });
    assert.equal(r.status, 200);
    const [row] = await query('SELECT duplicate_of FROM households WHERE id = ?', [b.id]);
    assert.equal(row.duplicate_of, a.id);
    const list = await api('sup1', 'get', '/api/quality/duplicates');
    assert.ok(!list.body.data.some((p) => [p.a.id, p.b.id].includes(b.id)));
    assert.ok(!list.body.data.some((p) => p.a.id === a.id && p.b.id === c.id));
    const afterSum = await api('sup1', 'get', '/api/quality/summary');
    assert.equal(afterSum.body.data.totals.households, before.body.data.totals.households - 1);
  });

  test('an approved household cannot be marked as the duplicate', async () => {
    const x = await submitted('enum1', { lat: 27.7, lng: 85.3, accuracy: 5 }, 'राधा कुमारी पौडेल');
    await api('sup1', 'post', `/api/surveys/${x.survey.id}/approve`, { version: x.survey.version, verifier_name: 'सुपरभाइजर', verifier_sign: TINY_PNG });
    const y = (await api('enum2', 'post', '/api/households', { settlement_id: 1, house_no: 777, family_no: 1, head_name: 'राधाकुमारी पौडेल' })).body.data;
    const r = await api('sup1', 'post', '/api/quality/duplicates/review', { household_a: x.household.id, household_b: y.id, decision: 'duplicate', duplicate_id: x.household.id });
    assert.equal(r.status, 400);
  });
});
