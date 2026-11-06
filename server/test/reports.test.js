import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import ExcelJS from 'exceljs';
import { app, setupDb, api, clearTokens, login } from './helpers.js';
import { pool } from '../src/db.js';
import { buildCompleteAnswers, TINY_PNG } from '../../shared/test/fixtures.js';

before(async () => { await setupDb(); clearTokens(); });
after(async () => { await pool.end(); });

let house = 1;
async function survey({ user = 'enum1', settlement = 1, approve = true, patch = {} } = {}) {
  house += 1;
  const h = (await api(user, 'post', '/api/households', { settlement_id: settlement, house_no: house, family_no: 1, head_name: `परिवार ${house}` })).body.data;
  const s = (await api(user, 'post', '/api/surveys', { household_id: h.id })).body.data;
  const r = await api(user, 'post', `/api/surveys/${s.id}/submit`, { answers: { ...buildCompleteAnswers(), ...patch }, version: s.version });
  assert.equal(r.status, 200, JSON.stringify(r.body.error));
  if (approve) {
    const sup = settlement === 1 ? 'sup1' : 'admin';
    const a = await api(sup, 'post', `/api/surveys/${s.id}/approve`, { version: r.body.data.version, verifier_name: 'सु', verifier_sign: TINY_PNG });
    assert.equal(a.status, 200, JSON.stringify(a.body.error));
  }
  return { h, s };
}
const binary = (res, cb) => { const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks))); };

describe('reports', () => {
  before(async () => {
    // 3 approved in ward 1: two with piped water, one with tubewell; one submitted (not yet approved)
    await survey({ patch: { q6: { ans: 'क' }, q35: { ans: 'ख' }, q5: { age_table: { '25_45': { female: 2, male: 1 } }, family_size: 3 } } });
    await survey({ patch: { q6: { ans: 'क' }, q35: { ans: 'ख' }, q5: { age_table: { '25_45': { female: 1, male: 1 }, lt1: { male: 1 } }, family_size: 3 } } });
    await survey({ patch: { q6: { ans: 'ख' }, q35: { ans: 'क' } } });
    await survey({ approve: false, patch: { q6: { ans: 'ख' } } });
    await survey({ user: 'enum3', settlement: 2, patch: { q6: { ans: 'ग' } } }); // ward 2
  });

  test('enumerators cannot open reports', async () => {
    assert.equal((await api('enum1', 'get', '/api/reports/theme/wash')).status, 403);
  });

  test('theme report: approved basis counts only approved surveys in scope', async () => {
    const r = await api('sup1', 'get', '/api/reports/theme/wash');
    assert.equal(r.status, 200);
    assert.equal(r.body.data.households, 3);
    assert.equal(r.body.data.indicators.find((i) => i.id === 'piped').value, 66.7);
    const sub = await api('sup1', 'get', '/api/reports/theme/wash?basis=submitted');
    assert.equal(sub.body.data.households, 4);
    assert.equal(sub.body.data.indicators.find((i) => i.id === 'piped').value, 50);
    const all = await api('admin', 'get', '/api/reports/theme/wash');
    assert.equal(all.body.data.households, 4, 'admin sees both wards');
    const w2 = await api('admin', 'get', '/api/reports/theme/wash?ward_id=2');
    assert.equal(w2.body.data.households, 1);
  });

  test('demography indicators and age-sex table', async () => {
    const r = await api('sup1', 'get', '/api/reports/theme/demography');
    const v = Object.fromEntries(r.body.data.indicators.map((i) => [i.id, i.value]));
    assert.equal(v.population, 3 + 3 + 3); // third household uses fixture (3 members)
    const q5 = r.body.data.questions.find((q) => q.id === 'q5');
    assert.equal(q5.fields.find((f) => f.key === 'age_table').cells['25_45'].female, 4);
  });

  test('sensitive questions suppress small counts in the API', async () => {
    const r = await api('sup1', 'get', '/api/reports/theme/protection');
    const q35 = r.body.data.questions.find((q) => q.id === 'q35');
    assert.equal(q35.suppressed, true);
    assert.equal(q35.fields[0].counts.find((c) => c.value === 'क').n, null);
  });

  test('cache refreshes when a new survey is approved', async () => {
    const before = (await api('sup1', 'get', '/api/reports/theme/wash')).body.data.households;
    await survey({ patch: { q6: { ans: 'क' } } });
    const afterR = (await api('sup1', 'get', '/api/reports/theme/wash')).body.data.households;
    assert.equal(afterR, before + 1);
  });

  test('duplicates are excluded from reports', async () => {
    const { h } = await survey({ patch: { q6: { ans: 'घ' } } });
    const n1 = (await api('sup1', 'get', '/api/reports/theme/wash')).body.data.households;
    const other = (await api('enum1', 'post', '/api/households', { settlement_id: 1, house_no: 999, family_no: 1, head_name: 'मूल' })).body.data;
    await api('sup1', 'post', '/api/quality/duplicates/review', { household_a: h.id, household_b: other.id, decision: 'duplicate', duplicate_id: h.id }).then((r) => assert.equal(r.status, 400, 'approved cannot be the duplicate'));
    // mark the other way round: approved one kept, the empty one excluded — counts unchanged
    await api('sup1', 'post', '/api/quality/duplicates/review', { household_a: h.id, household_b: other.id, decision: 'duplicate', duplicate_id: other.id });
    assert.equal((await api('sup1', 'get', '/api/reports/theme/wash')).body.data.households, n1);
    const list = await api('sup1', 'get', '/api/reports/households?q=मूल');
    assert.equal(list.body.total, 0, 'duplicate household hidden from household-wise list');
  });

  test('overview: totals, per-ward progress, daily series, pyramid', async () => {
    const r = await api('admin', 'get', '/api/reports/overview');
    assert.equal(r.status, 200);
    const d = r.body.data;
    assert.equal(d.days.length, 30);
    assert.equal(d.householdDays.length, 30);
    assert.ok(d.householdDays.every((day) => /^\d{4}-\d{2}-\d{2}$/.test(day.day) && Number.isInteger(day.registered) && day.registered >= 0));
    assert.ok(d.householdDays.some((day) => day.registered > 0));
    assert.ok(d.days[29].submitted >= 1);
    assert.deepEqual(d.wards.map((w) => w.ward_no), [1, 2]);
    assert.equal(d.totals.approved, 6);
    assert.equal(d.totals.submitted, 1);
    assert.ok(d.pyramid.cells['25_45']);
  });

  test('overview: empty ward scopes return zero-valued totals', async () => {
    const r = await api('admin', 'get', '/api/reports/overview?ward_id=999999');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.data.totals, {
      households: 0, started: 0, draft: 0, submitted: 0, approved: 0, rejected: 0, population: 0,
    });
  });

  test('household-wise list with family size and filters', async () => {
    const r = await api('sup1', 'get', '/api/reports/households?status=approved');
    assert.ok(r.body.data.every((x) => x.status === 'approved' && x.ward_no === 1));
    assert.ok(r.body.data.some((x) => x.family_size === 3 && x.female === 2));
    const none = await api('sup1', 'get', '/api/reports/households?status=none');
    assert.equal(none.body.total, 0);
  });

  test('exports: theme to Excel and CSV', async () => {
    const t = await login('sup1');
    const x = await request(app).get('/api/reports/export/theme/wash.xlsx').set('Authorization', `Bearer ${t}`).buffer(true).parse(binary);
    assert.equal(x.status, 200);
    assert.match(x.headers['content-type'], /spreadsheetml/);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(x.body);
    const names = wb.worksheets.map((w) => w.name);
    assert.ok(names.includes('मुख्य सूचक'));
    assert.ok(names.includes('प्र.६'));
    const ind = wb.getWorksheet('मुख्य सूचक');
    const vals = []; ind.eachRow((row) => vals.push(row.values.slice(1)));
    assert.ok(vals.some((v) => v[0] === 'पाइपको धाराको पानी प्रयोग गर्ने'));
    const c = await request(app).get('/api/reports/export/theme/protection.csv').set('Authorization', `Bearer ${t}`);
    assert.equal(c.status, 200);
    assert.ok(c.text.startsWith('﻿'), 'UTF-8 BOM for Excel');
    assert.match(c.text, /<3/);
  });

  test('exports: household list; dataset is admin-only and hides sensitive answers by default', async () => {
    const t = await login('sup1');
    const h = await request(app).get('/api/reports/export/households.csv').set('Authorization', `Bearer ${t}`);
    assert.equal(h.status, 200);
    assert.match(h.text, /घरधुरी ID/);
    assert.equal((await request(app).get('/api/reports/export/dataset.xlsx').set('Authorization', `Bearer ${t}`)).status, 403);
    const at = await login('admin');
    const d = await request(app).get('/api/reports/export/dataset.xlsx').set('Authorization', `Bearer ${at}`).buffer(true).parse(binary);
    assert.equal(d.status, 200);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(d.body);
    const header = wb.getWorksheet('data').getRow(1).values.slice(1);
    assert.ok(header.includes('q6.ans'));
    assert.ok(!header.some((k) => String(k).startsWith('q35.')));
    assert.ok(!header.some((k) => String(k).includes('sign')));
    assert.ok(wb.getWorksheet('codebook').rowCount > 300);
    assert.equal(wb.getWorksheet('data').rowCount, 1 + 6); // 6 approved households in both wards
    const ds = await request(app).get('/api/reports/export/dataset.csv?include_sensitive=1').set('Authorization', `Bearer ${at}`);
    assert.match(ds.text.split('\r\n')[0], /q35\.ans/);
    const logs = await api('admin', 'get', '/api/audit-logs?action=report.export_dataset');
    assert.equal(logs.body.data[0].details.include_sensitive, true);
  });
});
