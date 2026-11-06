import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { setupDb, api, clearTokens } from './helpers.js';
import { pool } from '../src/db.js';
import { buildCompleteAnswers } from '../../shared/test/fixtures.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

before(async () => { await setupDb(); clearTokens(); });
after(async () => { await pool.end(); });

describe('offline sync – pull', () => {
  let hhUuid; let serverTime;

  test('household and survey can be created by uuid only (offline device flow)', async () => {
    hhUuid = crypto.randomUUID();
    const h = await api('enum1', 'post', '/api/households', { uuid: hhUuid, settlement_id: 1, house_no: 7, family_no: 1, head_name: 'अफलाइन परिवार' });
    assert.equal(h.status, 201);
    const sUuid = crypto.randomUUID();
    const s = await api('enum1', 'post', '/api/surveys', { household_uuid: hhUuid, uuid: sUuid });
    assert.equal(s.status, 201);
    assert.equal(s.body.data.uuid, sUuid);
    const retry = await api('enum1', 'post', '/api/surveys', { household_uuid: hhUuid, uuid: sUuid });
    assert.equal(retry.status, 200, 'retrying the same create is idempotent');
    const missing = await api('enum1', 'post', '/api/surveys', {});
    assert.equal(missing.status, 400);
  });

  test('full pull returns scoped reference data, households and own surveys with answers', async () => {
    await api('enum3', 'post', '/api/households', { settlement_id: 2, house_no: 1, family_no: 1, head_name: 'वडा दुई' });
    const r = await api('enum1', 'get', '/api/sync/pull');
    assert.equal(r.status, 200);
    assert.equal(r.body.full, true);
    assert.deepEqual(r.body.wards.map((w) => w.id), [1]);
    assert.ok(r.body.settlements.every((s) => s.ward_id === 1));
    assert.ok(r.body.households.every((h) => h.ward_id === 1));
    assert.equal(r.body.households.length, 1);
    assert.equal(r.body.households[0].survey_status, 'draft');
    assert.equal(r.body.surveys.length, 1);
    assert.equal(r.body.surveys[0].household_uuid, hhUuid);
    assert.equal(r.body.surveys[0].answers.q1.head_name, 'अफलाइन परिवार');
    assert.equal(r.body.form.version, '1.0.0');
    serverTime = r.body.serverTime;
  });

  test('another enumerator sees the household (to avoid duplicates) but not the survey', async () => {
    const r = await api('enum2', 'get', '/api/sync/pull');
    assert.equal(r.body.households.length, 1);
    assert.equal(r.body.surveys.length, 0);
    const sup = await api('sup1', 'get', '/api/sync/pull');
    assert.equal(sup.body.surveys.length, 0, 'supervisors do not download answers for offline editing');
  });

  test('incremental pull returns only rows changed since the last serverTime', async () => {
    await sleep(2500); // updated_at has second precision; pull uses a 2 s overlap
    serverTime = (await api('enum1', 'get', '/api/sync/pull')).body.serverTime;
    const quiet = await api('enum1', 'get', `/api/sync/pull?since=${encodeURIComponent(serverTime)}`);
    assert.equal(quiet.body.full, false);
    assert.equal(quiet.body.households.length, 0);
    assert.equal(quiet.body.surveys.length, 0);
    await api('enum2', 'post', '/api/households', { settlement_id: 1, house_no: 8, family_no: 1, head_name: 'नयाँ घर' });
    const changed = await api('enum1', 'get', `/api/sync/pull?since=${encodeURIComponent(serverTime)}`);
    assert.deepEqual(changed.body.households.map((h) => h.house_no), [8]);
  });
});

describe('offline sync – idempotent saves', () => {
  let survey;
  before(async () => {
    const h = await api('enum1', 'post', '/api/households', { settlement_id: 1, house_no: 20, family_no: 1, head_name: 'पुनःप्रयास' });
    survey = (await api('enum1', 'post', '/api/surveys', { household_id: h.body.data.id })).body.data;
  });

  test('a retried save with the same op_id is acknowledged, not rejected as a conflict', async () => {
    const op = crypto.randomUUID();
    const body = { answers: { q6: { ans: 'क' } }, version: survey.version, op_id: op, client_updated_at: new Date().toISOString() };
    const first = await api('enum1', 'put', `/api/surveys/${survey.id}`, body);
    assert.equal(first.status, 200);
    assert.equal(first.body.data.version, survey.version + 1);
    const retry = await api('enum1', 'put', `/api/surveys/${survey.id}`, body);
    assert.equal(retry.status, 200);
    assert.equal(retry.body.idempotent, true);
    assert.equal(retry.body.data.version, survey.version + 1, 'not applied twice');
    const otherOp = await api('enum1', 'put', `/api/surveys/${survey.id}`, { ...body, op_id: crypto.randomUUID() });
    assert.equal(otherOp.status, 409, 'a genuinely different stale save is still a conflict');
    survey = first.body.data;
  });

  test('a retried submit after success returns 200 instead of "cannot edit"', async () => {
    const op = crypto.randomUUID();
    const body = { answers: buildCompleteAnswers(), version: survey.version, op_id: op };
    const first = await api('enum1', 'post', `/api/surveys/${survey.id}/submit`, body);
    assert.equal(first.status, 200);
    const retry = await api('enum1', 'post', `/api/surveys/${survey.id}/submit`, body);
    assert.equal(retry.status, 200);
    assert.equal(retry.body.data.status, 'submitted');
  });

  test('GPS outside Nepal is rejected', async () => {
    const h = await api('enum1', 'post', '/api/households', { settlement_id: 1, house_no: 21, family_no: 1, head_name: 'जीपीएस' });
    const s = (await api('enum1', 'post', '/api/surveys', { household_id: h.body.data.id })).body.data;
    const bad = await api('enum1', 'put', `/api/surveys/${s.id}`, { answers: {}, version: s.version, gps: { lat: 51.5, lng: -0.1 } });
    assert.equal(bad.status, 400);
    const ok = await api('enum1', 'put', `/api/surveys/${s.id}`, { answers: {}, version: s.version, gps: { lat: 27.71, lng: 85.32, accuracy: 8 } });
    assert.equal(ok.status, 200);
    assert.equal(Number(ok.body.data.gps_lng), 85.32);
  });
});
