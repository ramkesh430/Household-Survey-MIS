import { test } from 'node:test';
import assert from 'node:assert/strict';
import { questions } from '../questionnaire.js';
import { compute } from '../engine.js';
import { aggregateQuestion, buildThemeReport, THEMES, suppress, buildCodebook, flattenAnswers, repeatRows, SUPPRESS_BELOW } from '../reports.js';
import { buildCompleteAnswers } from './fixtures.js';

const hh = (over = {}) => compute({ ...buildCompleteAnswers(), ...over });

test('every numbered question belongs to exactly one theme', () => {
  const inThemes = THEMES.flatMap((t) => t.questions);
  const numbered = questions.filter((q) => q.no).map((q) => q.id);
  assert.deepEqual([...inThemes].sort(), [...numbered].sort());
  assert.equal(new Set(inThemes).size, inThemes.length);
});

test('every theme report builds without error and indicators are finite or null', () => {
  const list = [hh(), hh({ q6: { ans: 'ख' } })];
  for (const t of THEMES) {
    const r = buildThemeReport(t.id, list);
    assert.equal(r.households, 2);
    assert.ok(r.indicators.length >= 5, t.id);
    for (const i of r.indicators) assert.ok(i.value === null || Number.isFinite(i.value), `${t.id}.${i.id}=${i.value}`);
  }
});

test('single choice counts and percentages', () => {
  const list = [hh({ q6: { ans: 'क' } }), hh({ q6: { ans: 'क' } }), hh({ q6: { ans: 'ख' } }), hh({ q6: {} })];
  const a = aggregateQuestion(questions.find((q) => q.id === 'q6'), list);
  const f = a.fields[0];
  assert.equal(f.answered, 3);
  assert.equal(f.counts.find((c) => c.value === 'क').n, 2);
  const r = buildThemeReport('wash', list);
  assert.equal(r.indicators.find((i) => i.id === 'piped').value, 66.7);
});

test('grid sums give population, sex ratio and household size', () => {
  const list = [
    hh({ q5: { age_table: { '25_45': { female: 1, male: 1 }, lt1: { male: 1 } } } }),
    hh({ q5: { age_table: { '25_45': { female: 2, male: 1 }, '3_4': { female: 1 } } } }),
  ];
  const r = buildThemeReport('demography', list);
  const v = Object.fromEntries(r.indicators.map((i) => [i.id, i.value]));
  assert.equal(v.population, 7);
  assert.equal(v.female, 4);
  assert.equal(v.male, 3);
  assert.equal(v.sex_ratio, 75);
  assert.equal(v.avg_size, 3.5);
  assert.equal(v.under5, 2);
  const cells = r.questions.find((q) => q.id === 'q5').fields.find((f) => f.key === 'age_table').cells;
  assert.equal(cells['25_45'].total, 5);
});

test('conditional questions use only eligible households as denominator', () => {
  const list = [hh({ q72: { has: '१', source: ['क'] }, q73: { ans: ['ख'] } }), hh({ q72: { has: '२' } })];
  const a = aggregateQuestion(questions.find((q) => q.id === 'q73'), list.map((x) => compute(x)));
  assert.equal(a.eligible, 1);
  assert.equal(a.fields[0].counts.find((c) => c.value === 'ख').n, 1);
});

test('small counts on sensitive questions are suppressed', () => {
  const list = [hh({ q35: { ans: 'क' } }), ...Array.from({ length: 4 }, () => hh({ q35: { ans: 'ख' } }))];
  const agg = aggregateQuestion(questions.find((q) => q.id === 'q35'), list);
  const s = suppress(agg);
  assert.equal(s.suppressed, true);
  assert.equal(s.fields[0].counts.find((c) => c.value === 'क').n, null, `counts below ${SUPPRESS_BELOW} hidden`);
  assert.equal(s.fields[0].counts.find((c) => c.value === 'ख').n, 4);
  const nonSensitive = suppress(aggregateQuestion(questions.find((q) => q.id === 'q6'), list));
  assert.equal(nonSensitive.suppressed, undefined);
});

test('child marriage indicator counts each marriage under 20', () => {
  const list = [hh({ q28: { table: { female: { count: 2, age1: 17, age2: 22 }, male: { count: 1, age1: 19 } } } })];
  const r = buildThemeReport('protection', [...list, ...list, ...list]);
  assert.equal(r.indicators.find((i) => i.id === 'early_marriage').value, 6);
  const one = buildThemeReport('protection', [hh({ q28: { table: { female: { count: 1, age1: 17 } } } })]);
  assert.equal(one.indicators.find((i) => i.id === 'early_marriage').value, null, 'single case suppressed');
});

test('dataset codebook and flattening', () => {
  const cb = buildCodebook();
  const keys = cb.map((c) => c.key);
  assert.ok(keys.includes('q6.ans'));
  assert.ok(keys.includes('q66.ans.घ'));
  assert.ok(keys.includes('q5.age_table.25_45.female'));
  assert.ok(!keys.some((k) => k.startsWith('q35.')), 'sensitive excluded by default');
  assert.ok(buildCodebook({ includeSensitive: true }).some((c) => c.key.startsWith('q35.')));
  assert.ok(!keys.some((k) => k.includes('sign')), 'signatures never exported');
  const a = hh({ q66: { ans: ['क', 'घ'] }, q5: { age_table: { '25_45': { female: 2 } } }, q75: { crops: { cereal: [{ crop: 'धान', area_ha: 0.5, production: 12 }, { crop: 'गहुँ', area_ha: 0.25 }] } } });
  const row = flattenAnswers(a, cb);
  assert.equal(row['q66.ans.घ'], 1);
  assert.equal(row['q66.ans.ख'], 0);
  assert.equal(row['q5.age_table.25_45.female'], 2);
  assert.equal(row['q75.crops.cereal.area_ha'], 0.75);
  const long = repeatRows(a);
  assert.equal(long.filter((r) => r.table === 'q75.crops').length, 2);
});
