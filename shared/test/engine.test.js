import { test } from 'node:test';
import assert from 'node:assert/strict';
import { questions, MAIN_QUESTION_COUNT } from '../questionnaire.js';
import { compute, validate, parseNumber, toLatinDigits, toNepaliDigits, isValidBsDate, completion } from '../engine.js';
import { buildCompleteAnswers } from './fixtures.js';

test('questionnaire contains all 77 numbered questions in order', () => {
  assert.equal(MAIN_QUESTION_COUNT, 77);
  const nums = questions.filter((q) => q.no).map((q) => Number(toLatinDigits(q.no)));
  assert.deepEqual(nums, Array.from({ length: 77 }, (_, i) => i + 1));
});

test('question ids, field keys and option values are unique', () => {
  const ids = questions.map((q) => q.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const q of questions) {
    const keys = q.fields.map((f) => f.key);
    assert.equal(new Set(keys).size, keys.length, `dup field in ${q.id}`);
    for (const f of q.fields) {
      if (f.options) {
        const vals = f.options.map((o) => o.value);
        assert.equal(new Set(vals).size, vals.length, `dup option value in ${q.id}.${f.key}`);
      }
      if (f.type === 'grid') {
        assert.equal(new Set(f.cols.map((c) => c.key)).size, f.cols.length, `dup col ${q.id}`);
        assert.equal(new Set(f.rows.map((r) => r.key)).size, f.rows.length, `dup row ${q.id}`);
      }
    }
  }
});

test('PDF option codes are preserved even when repeated (Q9 has two "घ")', () => {
  const q9 = questions.find((q) => q.id === 'q9');
  assert.deepEqual(q9.fields[0].options.map((o) => o.code), ['क', 'ख', 'घ', 'घ']);
  assert.deepEqual(q9.fields[0].options.map((o) => o.value), ['क', 'ख', 'घ', 'घ२']);
});

test('digit helpers handle Nepali numerals', () => {
  assert.equal(toLatinDigits('२०८३-०७-१९'), '2083-07-19');
  assert.equal(toNepaliDigits(125), '१२५');
  assert.equal(parseNumber('१२'), 12);
  assert.equal(parseNumber('1,200'), 1200);
  assert.equal(parseNumber(''), null);
  assert.ok(Number.isNaN(parseNumber('abc')));
  assert.ok(isValidBsDate('२०८३-०७-१९'));
  assert.ok(!isValidBsDate('2083-13-01'));
});

test('compute fills row totals, total row and family size', () => {
  const out = compute({ q5: { age_table: { lt1: { female: 1, male: 2 }, '25_45': { female: 1, male: 1, third: 1 } } } });
  assert.equal(out.q5.age_table.lt1.total, 3);
  assert.equal(out.q5.age_table['25_45'].total, 3);
  assert.deepEqual(out.q5.age_table._total, { female: 2, male: 3, third: 1, total: 6 });
  assert.equal(out.q5.family_size, 6);
});

test('compute removes answers of hidden conditional fields', () => {
  const out = compute({ q20: { has: '२', arv: '१' }, q72: { has: '२' }, q73: { ans: ['क'] } });
  assert.equal(out.q20.arv, undefined);
  assert.equal(out.q73, undefined, 'Q73 hidden when no loan in Q72');
});

test('draft validation accepts partial answers; submit requires completeness', () => {
  const partial = { q6: { ans: 'क' } };
  assert.equal(validate(partial, { mode: 'draft' }).errors.length, 0);
  const sub = validate(partial, { mode: 'submit' });
  assert.ok(sub.errors.some((e) => e.q === 'q1'));
});

test('a complete household passes submit validation', () => {
  const { errors } = validate(buildCompleteAnswers(), { mode: 'submit', role: 'enumerator' });
  assert.deepEqual(errors, []);
  assert.equal(completion(buildCompleteAnswers()), 1);
});

test('invalid values are rejected', () => {
  const bad = {
    q6: { ans: 'X' },
    q15: { table: { boy: { live_births: 1, bf_immediate: 3 } } },
    q36: { ans: ['क', 'ञ'] },
    q5: { age_table: { lt1: { female: -1 } } },
    q47: { table: { upto5: { lt15: true, gt60: true } } },
    zz: {},
  };
  const { errors } = validate(bad);
  const paths = errors.map((e) => e.path);
  assert.ok(paths.includes('q6.ans'));
  assert.ok(paths.includes('q15.table.boy.bf_immediate'));
  assert.ok(paths.includes('q36.ans'));
  assert.ok(paths.includes('q5.age_table.lt1.female'));
  assert.ok(paths.includes('q47.table.upto5'));
  assert.ok(paths.includes('zz'));
});

test('"other" option requires specification on submit', () => {
  const a = buildCompleteAnswers();
  a.q6 = { ans: 'च' };
  const { errors } = validate(a, { mode: 'submit' });
  assert.ok(errors.some((e) => e.path === 'q6.ans.other'));
  a.q6.ans__other = 'मुहान';
  assert.equal(validate(a, { mode: 'submit' }).errors.length, 0);
});

test('family size mismatch is an error; cross-question warnings are raised', () => {
  const a = buildCompleteAnswers();
  a.q17 = { table: { boy: { total: 5 } } };
  a.q29 = { has: '१', boys: 2, rows: [{ age: 14, sex: 'बालक' }] };
  const r = validate(a, { mode: 'submit' });
  assert.ok(r.warnings.some((w) => w.q === 'q17'));
  assert.ok(r.warnings.some((w) => w.q === 'q29'));
});

test('enumerators cannot fill supervisor-only verification fields', () => {
  const a = buildCompleteAnswers();
  a.verify.verifier_name = 'सुपरभाइजर';
  const r = validate(a, { mode: 'submit', role: 'enumerator' });
  assert.ok(r.errors.some((e) => e.path === 'verify.verifier_name'));
});

test('birth registration rule: registered + not registered = total', () => {
  const r = validate({ q27: { table: { boy: { u5_total: 2, u5_reg: 1, u5_notreg: 0 } } } });
  assert.ok(r.errors.some((e) => e.path === 'q27.table.boy'));
});
