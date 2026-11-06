// @vitest-environment node
/**
 * Offline → online integration tests: real sync engine + real IndexedDB API (fake-indexeddb)
 * + the real Express API and MySQL test database. Network failures are simulated.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { SyncEngine } from '../offline/sync.js';
import * as store from '../offline/store.js';
import { getDb } from '../offline/db.js';
import { buildCompleteAnswers } from '../../../shared/test/fixtures.js';

process.env.NODE_ENV = 'test';
const { createApp } = await import('../../../server/src/app.js');
const { setupDb } = await import('../../../server/test/helpers.js');
const { pool, query } = await import('../../../server/src/db.js');

const app = createApp();
const PASSWORD = 'Test@12345';

/** API adapter with a switchable network. mode: 'online' | 'offline' | 'lose-response' */
function makeApi(username) {
  let token = null;
  const net = { mode: 'online' };
  const call = async (path, { method = 'GET', body } = {}) => {
    if (net.mode === 'offline') throw new TypeError('Failed to fetch');
    if (!token) token = (await request(app).post('/api/auth/login').send({ username, password: PASSWORD })).body.accessToken;
    const r = await request(app)[method.toLowerCase()](`/api${path}`).set('Authorization', `Bearer ${token}`).send(body);
    if (net.mode === 'lose-response') { net.mode = 'online'; throw new TypeError('network connection lost'); }
    if (r.status >= 400) { const e = new Error(r.body?.error?.message || `HTTP ${r.status}`); e.status = r.status; e.details = r.body?.error?.details; throw e; }
    return r.body;
  };
  return { call, net };
}

let enum1; let engine; let api1;
const online = { v: true };

beforeAll(async () => {
  await setupDb();
  enum1 = { id: 3, role: 'enumerator', ward_id: 1 };
  api1 = makeApi('enum1');
  engine = new SyncEngine({ user: enum1, api: api1.call, isOnline: () => online.v });
  const first = await engine.sync();
  expect(first.ok).toBe(true);
});
afterAll(async () => { await pool.end(); });

const serverSurvey = async (uuid) => {
  const [row] = await query('SELECT id, status, version, answers FROM surveys WHERE uuid = ?', [uuid]);
  if (!row) return null;
  return { ...row, answers: typeof row.answers === 'string' ? JSON.parse(row.answers) : row.answers };
};

describe('offline data collection', () => {
  let hh; let sv;

  it('downloads reference data for the assigned ward on first sync', async () => {
    const wards = await store.listWards(enum1.id);
    expect(wards.map((w) => w.id)).toEqual([1]);
    expect((await store.listSettlements(enum1.id, 1)).map((s) => s.code)).toEqual(['S01']);
  });

  it('registers a household and fills a survey with no network', async () => {
    online.v = false;
    hh = await store.createHousehold(enum1, { settlement_id: 1, house_no: 31, family_no: 1, head_name: 'अफलाइन राम', head_gender: '२' });
    expect(hh.household_code).toBe('W01-S01-H0031-F01');
    sv = await store.startSurvey(enum1, hh.uuid);
    expect(sv.answers.hdr.house_no).toBe(31);
    await store.saveSurvey(enum1, sv.uuid, { ...sv.answers, q6: { ans: 'क' } });
    await store.saveSurvey(enum1, sv.uuid, { ...sv.answers, q6: { ans: 'ख' } });
    const r = await engine.sync();
    expect(r.offline).toBe(true);
    expect(engine.state.status).toBe('offline');
    expect(engine.state.pending).toBe(3); // household.create, survey.create, one coalesced survey.save
    await expect(store.createHousehold(enum1, { settlement_id: 1, house_no: 31, family_no: 1, head_name: 'दोहोरो' }))
      .rejects.toMatchObject({ code: 'DUPLICATE' });
  });

  it('uploads everything in order when the network returns', async () => {
    online.v = true;
    const r = await engine.sync();
    expect(r.ok).toBe(true);
    expect(engine.state.pending).toBe(0);
    const local = await store.getSurvey(enum1.id, sv.uuid);
    expect(local.id).toBeTruthy();
    expect(local.sync_state).toBe('synced');
    const srv = await serverSurvey(sv.uuid);
    expect(srv.answers.q6.ans).toBe('ख');
    expect(local.base_version).toBe(srv.version);
    const h = await store.getHousehold(enum1.id, hh.uuid);
    expect(h.id).toBeTruthy();
  });

  it('a save whose response is lost is retried without being applied twice', async () => {
    const before = await serverSurvey(sv.uuid);
    const cur = await store.getSurvey(enum1.id, sv.uuid);
    await store.saveSurvey(enum1, sv.uuid, { ...cur.answers, q7: { ans: 'क' } });
    api1.net.mode = 'lose-response';
    const r1 = await engine.sync();
    expect(r1.ok).toBe(false);
    expect((await serverSurvey(sv.uuid)).version).toBe(before.version + 1); // applied once on server
    const r2 = await engine.sync({ force: true });
    expect(r2.ok).toBe(true);
    const after = await serverSurvey(sv.uuid);
    expect(after.version).toBe(before.version + 1); // idempotent retry, not applied again
    expect((await store.getSurvey(enum1.id, sv.uuid)).base_version).toBe(after.version);
  });

  it('detects an edit made elsewhere and lets the enumerator keep their version', async () => {
    const srv = await serverSurvey(sv.uuid);
    // another device changes the survey on the server
    await api1.call(`/surveys/${srv.id}`, { method: 'PUT', body: { answers: { ...srv.answers, q8: { ans: 'घ' } }, version: srv.version } });
    const cur = await store.getSurvey(enum1.id, sv.uuid);
    await store.saveSurvey(enum1, sv.uuid, { ...cur.answers, q8: { ans: 'क' } });
    await engine.sync();
    const conflicted = await store.getSurvey(enum1.id, sv.uuid);
    expect(conflicted.sync_state).toBe('conflict');
    expect(conflicted.conflict.server.answers.q8.ans).toBe('घ');
    expect(engine.state.conflicts).toBe(1);
    await store.resolveSurveyConflict(enum1, sv.uuid, 'mine');
    await engine.sync();
    expect((await serverSurvey(sv.uuid)).answers.q8.ans).toBe('क');
    expect((await store.getSurvey(enum1.id, sv.uuid)).sync_state).toBe('synced');
  });

  it('pull refreshes an unmodified local survey that changed on the server', async () => {
    const srv = await serverSurvey(sv.uuid);
    await api1.call(`/surveys/${srv.id}`, { method: 'PUT', body: { answers: { ...srv.answers, q9: { ans: 'क' } }, version: srv.version } });
    await engine.sync();
    expect((await store.getSurvey(enum1.id, sv.uuid)).answers.q9.ans).toBe('क');
  });

  it('an incomplete submission is rejected by the server and reopened for correction', async () => {
    const cur = await store.getSurvey(enum1.id, sv.uuid);
    await store.submitSurvey(enum1, sv.uuid, cur.answers);
    expect((await store.getSurvey(enum1.id, sv.uuid)).status).toBe('submitted');
    await engine.sync();
    const after = await store.getSurvey(enum1.id, sv.uuid);
    expect(after.status).toBe('draft');
    expect(after.sync_state).toBe('error');
    expect(after.server_errors.length).toBeGreaterThan(10);
  });

  it('a complete survey submitted offline is accepted once online', async () => {
    online.v = false;
    const answers = { ...buildCompleteAnswers(), hdr: (await store.getSurvey(enum1.id, sv.uuid)).answers.hdr };
    await store.submitSurvey(enum1, sv.uuid, answers, { gps: { lat: 27.7, lng: 85.3, accuracy: 9 } });
    await engine.sync();
    expect(engine.state.pending).toBe(1);
    online.v = true;
    await engine.sync();
    const srv = await serverSurvey(sv.uuid);
    expect(srv.status).toBe('submitted');
    const [g] = await query('SELECT gps_lat FROM surveys WHERE uuid = ?', [sv.uuid]);
    expect(Number(g.gps_lat)).toBe(27.7);
    const local = await store.getSurvey(enum1.id, sv.uuid);
    expect(local.status).toBe('submitted');
    expect(local.sync_state).toBe('synced');
    await expect(store.saveSurvey(enum1, sv.uuid, {})).rejects.toMatchObject({ code: 'LOCKED' });
  });
});

describe('duplicate households registered on two devices', () => {
  it('flags the duplicate, keeps unrelated work flowing, and links to the server household', async () => {
    online.v = false;
    const mine = await store.createHousehold(enum1, { settlement_id: 1, house_no: 55, family_no: 1, head_name: 'मेरो दर्ता' });
    const s = await store.startSurvey(enum1, mine.uuid);
    await store.saveSurvey(enum1, s.uuid, { ...s.answers, q6: { ans: 'ग' } });
    const other = await store.createHousehold(enum1, { settlement_id: 1, house_no: 56, family_no: 1, head_name: 'अर्को घर' });
    // meanwhile enum2 registers house 55 on the server
    const api2 = makeApi('enum2');
    const theirs = (await api2.call('/households', { method: 'POST', body: { settlement_id: 1, house_no: 55, family_no: 1, head_name: 'उनको दर्ता' } })).data;

    online.v = true;
    await engine.sync();
    const h = (await store.listProblems(enum1.id)).households[0];
    expect(h.uuid).toBe(mine.uuid);
    expect(h.conflict.existing.id).toBe(theirs.id);
    expect((await store.getHousehold(enum1.id, other.uuid)).id).toBeTruthy(); // not blocked by the duplicate

    await store.resolveHouseholdConflict(enum1, mine.uuid, 'link');
    await engine.sync();
    const moved = await store.getSurvey(enum1.id, s.uuid);
    expect(moved.household_uuid).toBe(theirs.uuid);
    expect(moved.sync_state).toBe('synced');
    const srv = await serverSurvey(s.uuid);
    expect(srv.answers.q6.ans).toBe('ग');
    const [row] = await query('SELECT household_id FROM surveys WHERE uuid = ?', [s.uuid]);
    expect(row.household_id).toBe(theirs.id);
    expect(engine.state.conflicts).toBe(0);
  });

  it('renumbering a duplicate retries with the corrected house number', async () => {
    online.v = false;
    const dup = await store.createHousehold(enum1, { settlement_id: 1, house_no: 77, family_no: 1, head_name: 'गलत नम्बर' });
    online.v = true;
    await makeApi('enum2').call('/households', { method: 'POST', body: { settlement_id: 1, house_no: 77, family_no: 1, head_name: 'सही' } });
    await engine.sync();
    expect((await store.getHousehold(enum1.id, dup.uuid)).sync_state).toBe('conflict');
    await store.resolveHouseholdConflict(enum1, dup.uuid, 'renumber', { house_no: 78, family_no: 1 });
    await engine.sync();
    const fixed = await store.getHousehold(enum1.id, dup.uuid);
    expect(fixed.sync_state).toBe('synced');
    expect(fixed.household_code).toBe('W01-S01-H0078-F01');
  });
});

describe('isolation', () => {
  it('each user has a separate offline database', async () => {
    const db3 = await getDb(3);
    const db4 = await getDb(4);
    expect(await db3.count('households')).toBeGreaterThan(0);
    expect(await db4.count('households')).toBe(0);
  });
});

describe('supervisor review reaches the device', () => {
  it('rejected → notes on device → corrected offline → resubmitted → approved → locked', async () => {
    const TINY = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    const h = await store.createHousehold(enum1, { settlement_id: 1, house_no: 901, family_no: 1, head_name: 'समीक्षा परिवार' });
    const s = await store.startSurvey(enum1, h.uuid);
    const answers = { ...buildCompleteAnswers(), hdr: s.answers.hdr };
    await store.submitSurvey(enum1, s.uuid, answers);
    await engine.sync();
    const sup = makeApi('sup1');
    let srv = await serverSurvey(s.uuid);
    expect(srv.status).toBe('submitted');

    const rej = await sup.call(`/surveys/${srv.id}/reject`, { method: 'POST', body: { version: srv.version, comment: 'प्र.६ जाँच्नुहोस्', notes: [{ q: 'q6', note: 'मुख्य स्रोत फेरि सोध्नुहोस्' }] } });
    expect(rej.data.status).toBe('rejected');
    await engine.sync();
    let local = await store.getSurvey(enum1.id, s.uuid);
    expect(local.status).toBe('rejected');
    expect(local.review_notes.q6).toBe('मुख्य स्रोत फेरि सोध्नुहोस्');
    expect(local.review_comment).toBe('प्र.६ जाँच्नुहोस्');

    online.v = false;
    await store.saveSurvey(enum1, s.uuid, { ...local.answers, q6: { ans: 'ख' } });
    local = await store.getSurvey(enum1.id, s.uuid);
    await store.submitSurvey(enum1, s.uuid, local.answers);
    online.v = true;
    await engine.sync();
    srv = await serverSurvey(s.uuid);
    expect(srv.status).toBe('submitted');
    expect(srv.answers.q6.ans).toBe('ख');

    await sup.call(`/surveys/${srv.id}/approve`, { method: 'POST', body: { version: srv.version, verifier_name: 'सुपरभाइजर', verifier_sign: TINY } });
    await engine.sync();
    local = await store.getSurvey(enum1.id, s.uuid);
    expect(local.status).toBe('approved');
    expect(local.answers.verify.verifier_name).toBe('सुपरभाइजर');
    await expect(store.saveSurvey(enum1, s.uuid, local.answers)).rejects.toMatchObject({ code: 'LOCKED' });
  });
});
