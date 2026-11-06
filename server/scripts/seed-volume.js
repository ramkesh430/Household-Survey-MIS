/**
 * Load-test data: inserts N synthetic, fully answered, APPROVED households into the
 * configured database (never run against production).
 *   node scripts/seed-volume.js 3000
 */
import crypto from 'node:crypto';
import { pool, query, one } from '../src/db.js';
import { compute, householdCode, questions } from '../../shared/index.js';
import { buildCompleteAnswers } from '../../shared/test/fixtures.js';

if (process.env.NODE_ENV === 'production') { console.error('refusing to run in production'); process.exit(1); }
const N = Number(process.argv[2] || 1000);
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const AGE = ['lt1', '1_2', '3_4', '5_6', '7_8', '9_10', '11_12', '13_14', '15_16', '17_18', '19_24', '25_45', '46_60', '61_75', 'gt75'];

function randomAnswers() {
  const a = buildCompleteAnswers();
  // randomise every single-choice question with no follow-ups
  for (const q of questions) for (const f of q.fields) if (f.type === 'single' && !q.fields.some((x) => x.showIf?.field === f.key) && !f.fromHousehold) a[q.id] = { ...a[q.id], [f.key]: pick(f.options).value };
  const table = {};
  const members = rnd(2, 8);
  for (let i = 0; i < members; i++) { const g = pick(AGE); const s = Math.random() < 0.51 ? 'female' : 'male'; table[g] = { ...table[g], [s]: (table[g]?.[s] || 0) + 1 }; }
  a.q5 = { age_table: table };
  a.q2 = { caste: pick(['क्षेत्री', 'ब्राह्मण (पहाड)', 'मगर', 'थारु', 'तामाङ', 'नेवार', 'कामी']) };
  a.q66 = { ans: ['घ', ...(Math.random() < 0.5 ? ['ख'] : [])] };
  a.q70 = { income: { agri: { amount: rnd(20, 400) * 1000 }, remit: { amount: rnd(0, 600) * 1000 } }, expense: { food: { amount: rnd(50, 300) * 1000 } } };
  a.q75 = { crops: { cereal: [{ crop: 'धान', area_ha: rnd(1, 20) / 10, production: rnd(5, 60) }] } };
  a.q76 = { livestock: { goat: { local: rnd(0, 6) }, buffalo: { local: rnd(0, 2), milk_l: rnd(0, 900) } }, poultry: { chicken: { local: rnd(0, 15) } } };
  return compute(a);
}

const ward = await one('SELECT w.id, w.ward_no FROM wards w ORDER BY w.ward_no LIMIT 1');
const st = await one('SELECT id, code FROM settlements WHERE ward_id = ? ORDER BY code LIMIT 1', [ward.id]);
const enumr = await one("SELECT id FROM users WHERE role IN ('enumerator','admin') ORDER BY role = 'enumerator' DESC, id LIMIT 1");
const [{ maxHouse }] = await query('SELECT COALESCE(MAX(house_no), 0) AS maxHouse FROM households WHERE settlement_id = ?', [st.id]);
const t0 = Date.now();
for (let i = 0; i < N; i += 200) {
  const batch = Array.from({ length: Math.min(200, N - i) }, (_, k) => maxHouse + i + k + 1);
  const hh = batch.map((h) => [crypto.randomUUID(), householdCode({ wardNo: ward.ward_no, settlementCode: st.code, houseNo: h, familyNo: 1 }), ward.id, st.id, h, 1, `परीक्षण परिवार ${h}`, pick(['१', '२']), enumr.id]);
  const r = await query('INSERT INTO households (uuid, household_code, ward_id, settlement_id, house_no, family_no, head_name, head_gender, created_by) VALUES ?', [hh]);
  const sv = batch.map((_, k) => [crypto.randomUUID(), r.insertId + k, 'household-survey-anusuchi-1', '1.0.0', 'approved', JSON.stringify(randomAnswers()), 100, enumr.id, new Date(), new Date()]);
  await query('INSERT INTO surveys (uuid, household_id, form_id, form_version, status, answers, completion, enumerator_id, submitted_at, reviewed_at) VALUES ?', [sv]);
}
console.log(`inserted ${N} approved households in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
await pool.end();
