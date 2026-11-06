import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import request from 'supertest';

process.env.BACKUP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hhs-backup-test-'));
const { app, setupDb, api, clearTokens, login, PASSWORD } = await import('./helpers.js');
const { pool, query } = await import('../src/db.js');
const { buildCompleteAnswers } = await import('../../shared/test/fixtures.js');

before(async () => { await setupDb(); clearTokens(); });
after(async () => { await pool.end(); fs.rmSync(process.env.BACKUP_DIR, { recursive: true, force: true }); });

const binary = (res, cb) => { const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); };

describe('backup & restore', () => {
  let backup; let surveyId;

  before(async () => {
    const h = (await api('enum1', 'post', '/api/households', { settlement_id: 1, house_no: 1, family_no: 1, head_name: 'ब्याकअप परिवार' })).body.data;
    const s = (await api('enum1', 'post', '/api/surveys', { household_id: h.id })).body.data;
    surveyId = s.id;
    await api('enum1', 'post', `/api/surveys/${s.id}/submit`, { answers: { ...buildCompleteAnswers(), q35: { ans: 'क' } }, version: s.version });
  });

  test('only admins can manage backups', async () => {
    assert.equal((await api('sup1', 'get', '/api/admin/backups')).status, 403);
    assert.equal((await api('enum1', 'post', '/api/admin/backups')).status, 403);
  });

  test('creating a backup writes a verified, compressed file; sensitive answers stay encrypted', async () => {
    const r = await api('admin', 'post', '/api/admin/backups');
    assert.equal(r.status, 201);
    backup = r.body.data;
    assert.match(backup.name, /^hhs-backup-.*-manual\.jsonl\.gz$/);
    const text = zlib.gunzipSync(fs.readFileSync(path.join(process.env.BACKUP_DIR, backup.name))).toString('utf8');
    const lines = text.trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(lines[0].format, 'hhs-backup');
    assert.equal(lines.at(-1).end, true);
    assert.ok(lines.some((l) => l.t === 'surveys'));
    assert.ok(!text.includes('"refresh_tokens"'), 'sessions are not backed up');
    const survey = lines.find((l) => l.t === 'surveys').r;
    assert.match(typeof survey.answers === 'string' ? survey.answers : JSON.stringify(survey.answers), /"q35":\{"__enc"/);
    const list = await api('admin', 'get', '/api/admin/backups');
    assert.equal(list.body.data[0].name, backup.name);
  });

  test('restore needs RESTORE + the admin password, and rejects path tricks', async () => {
    assert.equal((await api('admin', 'post', `/api/admin/backups/${backup.name}/restore`, { password: PASSWORD, confirm: 'yes' })).status, 400);
    assert.equal((await api('admin', 'post', `/api/admin/backups/${backup.name}/restore`, { password: 'wrong-pass1', confirm: 'RESTORE' })).status, 403);
    assert.equal((await api('admin', 'get', '/api/admin/backups/..%2F..%2Fetc%2Fpasswd')).status, 400);
  });

  test('restoring brings the data back exactly and logs everyone out', async () => {
    const [{ head_name: original }] = await query('SELECT head_name FROM households WHERE house_no = 1');
    // damage the data after the backup
    await query("UPDATE households SET head_name = 'बिग्रिएको' WHERE house_no = 1");
    await query('DELETE FROM survey_status_history WHERE survey_id = ?', [surveyId]);
    await api('enum1', 'post', '/api/households', { settlement_id: 1, house_no: 2, family_no: 1, head_name: 'पछि थपिएको' });
    const r = await api('admin', 'post', `/api/admin/backups/${backup.name}/restore`, { password: PASSWORD, confirm: 'RESTORE' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.match(r.body.data.safety_backup, /pre-restore/);
    const [{ head_name }] = await query('SELECT head_name FROM households WHERE house_no = 1');
    assert.equal(head_name, original);
    assert.equal((await query('SELECT * FROM households WHERE house_no = 2')).length, 0);
    assert.equal((await query('SELECT * FROM survey_status_history WHERE survey_id = ?', [surveyId])).length, 2);
    assert.equal((await query('SELECT * FROM refresh_tokens')).length, 0);
    // encrypted answers are still readable through the API after restore
    clearTokens();
    const s = await api('sup1', 'get', `/api/surveys/${surveyId}`);
    assert.equal(s.body.data.answers.q35.ans, 'क');
    const logs = await api('admin', 'get', '/api/audit-logs?action=backup.restore');
    assert.equal(logs.body.total, 1);
  });

  test('uploaded backups are verified; a tampered file is rejected and nothing changes', async () => {
    const t = await login('admin');
    const file = fs.readFileSync(path.join(process.env.BACKUP_DIR, backup.name));
    const lines = zlib.gunzipSync(file).toString('utf8').split('\n');
    const i = lines.findIndex((l) => l.includes('"t":"households"'));
    const row = JSON.parse(lines[i]); row.r.head_name = 'नक्कली परिवार'; lines[i] = JSON.stringify(row);
    const [{ head_name: before }] = await query('SELECT head_name FROM households WHERE house_no = 1');
    const tampered = zlib.gzipSync(lines.join('\n'));
    const bad = await request(app).post('/api/admin/restore').set('Authorization', `Bearer ${t}`).set('Content-Type', 'application/gzip')
      .set('X-Confirm', 'RESTORE').set('X-Admin-Password', PASSWORD).send(tampered);
    assert.equal(bad.status, 400);
    assert.match(bad.body.error.message, /checksum/);
    assert.equal((await query('SELECT head_name FROM households WHERE house_no = 1'))[0].head_name, before);
    const good = await request(app).post('/api/admin/restore').set('Authorization', `Bearer ${t}`).set('Content-Type', 'application/gzip')
      .set('X-Confirm', 'RESTORE').set('X-Admin-Password', PASSWORD).send(file);
    assert.equal(good.status, 200, JSON.stringify(good.body));
  });

  test('download returns the file', async () => {
    clearTokens();
    const t = await login('admin');
    const r = await request(app).get(`/api/admin/backups/${backup.name}`).set('Authorization', `Bearer ${t}`).buffer(true).parse(binary);
    assert.equal(r.status, 200);
    assert.equal(r.body[0], 0x1f, 'gzip magic');
  });
});
