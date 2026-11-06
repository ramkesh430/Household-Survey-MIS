import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { setupDb, api, clearTokens } from './helpers.js';
import { pool, query } from '../src/db.js';
import { encryptValue, decryptValue, sealAnswers, openAnswers, SENSITIVE_QIDS } from '../src/services/crypto.js';
import { encryptExisting } from '../src/services/encryptExisting.js';
import { buildCompleteAnswers, TINY_PNG } from '../../shared/test/fixtures.js';

before(async () => { await setupDb(); clearTokens(); });
after(async () => { await pool.end(); });

describe('field-level encryption', () => {
  test('sensitive question list matches the questionnaire flags', () => {
    assert.deepEqual([...SENSITIVE_QIDS].sort(), ['q19', 'q20', 'q21', 'q22', 'q23', 'q29', 'q30', 'q31', 'q35', 'q36', 'q37', 'q38', 'q40'].sort());
  });

  test('round trip, random IV, tamper detection', () => {
    const v = { ans: 'क', note: 'यौन शोषण' };
    const a = encryptValue(v); const b = encryptValue(v);
    assert.notEqual(a.__enc, b.__enc, 'fresh IV every time');
    assert.deepEqual(decryptValue(a), v);
    const parts = a.__enc.split(':');
    const ct = Buffer.from(parts[3], 'base64'); ct[0] ^= 1;
    assert.throws(() => decryptValue({ __enc: [...parts.slice(0, 3), ct.toString('base64')].join(':') }));
    const sealed = sealAnswers({ q6: { ans: 'क' }, q35: { ans: 'क' } });
    assert.deepEqual(sealed.q6, { ans: 'क' }, 'non-sensitive stays plain');
    assert.ok(sealed.q35.__enc);
    assert.deepEqual(openAnswers(sealed).q35, { ans: 'क' });
  });

  test('database never stores sensitive answers in plain text; the API returns them decrypted', async () => {
    const h = (await api('enum1', 'post', '/api/households', { settlement_id: 1, house_no: 5, family_no: 1, head_name: 'गोप्य परिवार' })).body.data;
    const s = (await api('enum1', 'post', '/api/surveys', { household_id: h.id })).body.data;
    const answers = { ...buildCompleteAnswers(), q35: { ans: 'क' }, q21: { has: '१', table: { hiv: { girl: 1 } } } };
    const r = await api('enum1', 'post', `/api/surveys/${s.id}/submit`, { answers, version: s.version });
    assert.equal(r.status, 200, JSON.stringify(r.body.error));
    const [row] = await query('SELECT answers FROM surveys WHERE id = ?', [s.id]);
    const raw = typeof row.answers === 'string' ? row.answers : JSON.stringify(row.answers);
    assert.ok(!raw.includes('"hiv"'), 'HIV table not readable in the database');
    assert.match(raw, /"q35":\{"__enc":"k1:/);
    assert.match(raw, /"q6":\{"ans":/, 'non-sensitive answers stay queryable');
    const [qrow] = await query("SELECT answer FROM survey_answers WHERE survey_id = ? AND question_id = 'q21'", [s.id]);
    assert.ok(String(typeof qrow.answer === 'string' ? qrow.answer : JSON.stringify(qrow.answer)).includes('__enc'));
    const got = await api('sup1', 'get', `/api/surveys/${s.id}`);
    assert.equal(got.body.data.answers.q21.table.hiv.girl, 1);
    const pull = await api('enum1', 'get', '/api/sync/pull');
    assert.equal(pull.body.surveys[0].answers.q35.ans, 'क');
    // approval re-encrypts; reports still count the (decrypted) answers
    const ap = await api('sup1', 'post', `/api/surveys/${s.id}/approve`, { version: r.body.data.version, verifier_name: 'सु', verifier_sign: TINY_PNG });
    assert.equal(ap.status, 200);
    const [row2] = await query('SELECT answers FROM surveys WHERE id = ?', [s.id]);
    assert.ok(!String(typeof row2.answers === 'string' ? row2.answers : JSON.stringify(row2.answers)).includes('"hiv"'));
    const rep = await api('sup1', 'get', '/api/reports/theme/health');
    const q21 = rep.body.data.questions.find((q) => q.id === 'q21');
    assert.equal(q21.eligible, 1);
  });

  test('plain-text rows from before encryption are migrated, idempotently', async () => {
    const [{ id }] = await query('SELECT id FROM surveys LIMIT 1');
    const [cur] = await query('SELECT answers FROM surveys WHERE id = ?', [id]);
    const plain = openAnswers(typeof cur.answers === 'string' ? JSON.parse(cur.answers) : cur.answers);
    await query('UPDATE surveys SET answers = ? WHERE id = ?', [JSON.stringify(plain), id]);
    assert.equal(await encryptExisting({ log: () => {} }), 1);
    assert.equal(await encryptExisting({ log: () => {} }), 0, 'nothing left to do');
    const [after] = await query('SELECT answers FROM surveys WHERE id = ?', [id]);
    assert.match(String(typeof after.answers === 'string' ? after.answers : JSON.stringify(after.answers)), /"q35":\{"__enc"/);
  });

  test('key rotation: values under an old key are re-encrypted with the new key', () => {
    const oldKey = crypto.randomBytes(32).toString('base64');
    const newKey = crypto.randomBytes(32).toString('base64');
    const script = `
      const { encryptValue, decryptValue, needsRotation } = await import('./src/services/crypto.js');
      const v = encryptValue({ a: 1 }); console.log(JSON.stringify(v));`;
    const run = (env, code) => spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: new URL('..', import.meta.url).pathname, env: { ...process.env, NODE_ENV: 'test', ...env }, encoding: 'utf8' });
    const enc = JSON.parse(run({ ENCRYPTION_KEY: oldKey, ENCRYPTION_KEY_ID: 'k0' }, script).stdout.trim());
    const check = `const { decryptValue, needsRotation, encryptValue } = await import('./src/services/crypto.js');
      const v = ${JSON.stringify(enc)}; console.log(needsRotation(v), JSON.stringify(decryptValue(v)), encryptValue(1).__enc.split(':')[0]);`;
    const out = run({ ENCRYPTION_KEY: newKey, ENCRYPTION_KEY_ID: 'k2', ENCRYPTION_OLD_KEYS: `k0:${oldKey}` }, check);
    assert.equal(out.stdout.trim(), 'true {"a":1} k2', out.stderr);
    const noOld = run({ ENCRYPTION_KEY: newKey, ENCRYPTION_KEY_ID: 'k2' }, check);
    assert.match(noOld.stderr, /No decryption key for key id "k0"/);
  });

  test('production refuses to start without an encryption key', () => {
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', "await import('./src/services/crypto.js')"], {
      cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8',
      env: { ...process.env, NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40), ENCRYPTION_KEY: '', DB_USER: 'hhs', DB_NAME: 'hhs' },
    });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /ENCRYPTION_KEY is required in production/);
  });
});
