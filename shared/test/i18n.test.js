import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { questions, sections } from '../questionnaire.js';
import { THEMES } from '../reports.js';
import { setLanguage, tr, translate, localizeQuestion } from '../i18n/index.js';
import { EN_QUESTIONNAIRE } from '../i18n/en.questionnaire.js';
import { EN_UI } from '../i18n/en.ui.js';
import { toNepaliDigits } from '../engine.js';

const DEV = /[ऀ-ॿ]/;
const missing = (s) => !!s && DEV.test(s) && translate(s, 'en') === s && !/^[\s०-९.,()\-–:/]*$/.test(s);

test('every questionnaire text has an English translation', () => {
  const gaps = [];
  const check = (s) => { if (missing(s)) gaps.push(s); };
  sections.forEach((s) => check(s.title));
  for (const q of questions) {
    check(q.title); check(q.note);
    for (const f of q.fields) {
      check(f.label); check(f.rowLabel);
      (f.options || []).forEach((o) => check(o.label));
      (f.rows || []).forEach((r) => check(r.label));
      [...(f.cols || []), ...(f.columns || [])].forEach((c) => { check(c.label); check(c.group); (c.options || []).forEach((o) => check(o.label)); });
      (f.groups || []).forEach((g) => check(g.label));
      (f.rowRules || []).forEach((r) => check(r.message));
    }
  }
  assert.deepEqual(gaps, []);
});

test('every tr() key in the client and every report indicator has an English translation', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../client/src');
  const keys = new Set();
  (function walk(d) {
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (/\.(jsx?|js)$/.test(f)) {
        const src = fs.readFileSync(p, 'utf8');
        for (const m of src.matchAll(/\btr\(\s*"((?:[^"\\]|\\.)*)"/g)) keys.add(JSON.parse(`"${m[1]}"`));
        for (const m of src.matchAll(/\btr\(\s*'((?:[^'\\]|\\.)*)'/g)) keys.add(m[1].replace(/\\'/g, "'"));
      }
    }
  })(root);
  assert.ok(keys.size > 400, `found ${keys.size} keys`);
  const gaps = [...keys].filter(missing);
  assert.deepEqual(gaps, []);
  const indicatorGaps = [];
  for (const t of THEMES) {
    if (missing(t.title)) indicatorGaps.push(t.title);
    for (const i of t.indicators(Object.fromEntries(t.questions.map((q) => [q, null])), [])) if (missing(i.label) || missing(i.unit)) indicatorGaps.push(i.label);
  }
  assert.deepEqual(indicatorGaps, []);
});

test('tr interpolates, preserves spacing and falls back to Nepali', () => {
  setLanguage('en');
  assert.equal(tr('पेश गर्नु अघि {0} वटा त्रुटि सच्याउनुहोस्।', [2]), 'Correct 2 errors before submitting.');
  assert.equal(tr(' · सबै वडा'), ' · all wards');
  assert.equal(tr('अनुवाद नभएको नयाँ वाक्य'), 'अनुवाद नभएको नयाँ वाक्य');
  assert.equal(translate('अधिकतम १०० हुनुपर्छ'), 'Must be at most 100');
  assert.equal(toNepaliDigits(42), '42', 'Latin digits in English');
  setLanguage('ne');
  assert.equal(tr('सबै'), 'सबै');
  assert.equal(toNepaliDigits(42), '४२');
});

test('localizing a question never changes codes, values or keys', () => {
  const q = questions.find((x) => x.id === 'q9');
  const l = localizeQuestion(q, 'en');
  assert.equal(l.title, 'Water quality: water-borne illness in the past year');
  assert.deepEqual(l.fields[0].options.map((o) => [o.code, o.value]), q.fields[0].options.map((o) => [o.code, o.value]));
  assert.equal(q.title.includes('खानेपानी'), true, 'original untouched');
  assert.ok(Object.keys(EN_QUESTIONNAIRE).length >= 540 && Object.keys(EN_UI).length >= 550);
});
