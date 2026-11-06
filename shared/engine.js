/**
 * Survey engine shared by the browser and the API server:
 *  - Devanagari digit normalisation
 *  - conditional visibility
 *  - automatic calculations (row/column totals, family size)
 *  - validation (draft = type checks only, submit = completeness + consistency)
 */
import { questions } from './questionnaire.js';
import { getLanguage } from './i18n/index.js';

const DEV = '०१२३४५६७८९';

/** Convert Devanagari digits to ASCII digits. */
export function toLatinDigits(input) {
  if (input === null || input === undefined) return input;
  return String(input).replace(/[०-९]/g, (d) => String(DEV.indexOf(d)));
}

/** Convert ASCII digits to Devanagari digits (display only). */
export function toNepaliDigits(input) {
  if (input === null || input === undefined) return '';
  if (getLanguage() === 'en') return toLatinDigits(String(input)); // English UI shows Latin digits
  return String(input).replace(/[0-9]/g, (d) => DEV[Number(d)]);
}

/** Parse a user-entered number (accepts Nepali digits); returns number, null for blank, NaN if invalid. */
export function parseNumber(input) {
  if (input === null || input === undefined || input === '') return null;
  if (typeof input === 'number') return input;
  const s = toLatinDigits(String(input)).trim().replace(/,/g, '');
  if (s === '') return null;
  if (!/^-?\d+(\.\d+)?$/.test(s)) return NaN;
  return Number(s);
}

export const questionById = Object.fromEntries(questions.map((q) => [q.id, q]));

const isEmpty = (v) =>
  v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0) ||
  (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);

/** Evaluate a `showIf` condition. `local` = answers of the current question / repeat row. */
export function evalCondition(cond, local, answers) {
  if (!cond) return true;
  const scope = cond.q ? answers?.[cond.q] || {} : local || {};
  if (cond.q && !isQuestionVisible(questionById[cond.q], answers)) return false;
  const v = scope[cond.field];
  if ('eq' in cond) return v === cond.eq;
  if ('in' in cond) return cond.in.includes(v);
  if ('includesAny' in cond) return Array.isArray(v) && v.some((x) => cond.includesAny.includes(x));
  return true;
}

export function isQuestionVisible(q, answers) {
  if (!q) return false;
  return evalCondition(q.showIf, answers?.[q.id], answers);
}

export function isFieldVisible(q, field, answers) {
  if (!isQuestionVisible(q, answers)) return false;
  return evalCondition(field.showIf, answers?.[q.id], answers);
}

const sumValues = (vals) => vals.reduce((a, v) => (typeof v === 'number' && Number.isFinite(v) ? a + v : a), 0);
const anyNumber = (vals) => vals.some((v) => typeof v === 'number' && Number.isFinite(v));

/** Compute per-row `sumOf` columns in place for a row object. */
function computeRow(columns, row) {
  for (const c of columns) {
    if (c.sumOf) {
      const parts = c.sumOf.map((k) => row[k]);
      if (anyNumber(parts)) row[c.key] = sumValues(parts);
      else delete row[c.key];
    }
  }
}

/** Column totals across rows (numbers only). */
export function columnTotals(columns, rows) {
  const total = {};
  for (const c of columns) {
    if (c.type !== 'number' || c.noTotal) continue;
    const vals = rows.map((r) => r?.[c.key]);
    if (anyNumber(vals)) total[c.key] = sumValues(vals);
  }
  return total;
}

/**
 * Return a deep-copied answers object with all automatic calculations applied
 * and values of hidden questions/fields removed.
 */
export function compute(input) {
  const answers = JSON.parse(JSON.stringify(input || {}));
  for (const q of questions) {
    if (!isQuestionVisible(q, answers)) { delete answers[q.id]; continue; }
    const qa = answers[q.id];
    if (!qa || typeof qa !== 'object') continue;
    for (const f of q.fields) {
      if (!evalCondition(f.showIf, qa, answers)) {
        delete qa[f.key]; delete qa[`${f.key}__other`];
        continue;
      }
      const v = qa[f.key];
      if (f.type === 'grid' && v && typeof v === 'object') {
        const rows = f.rows.map((r) => (v[r.key] = v[r.key] || {}));
        rows.forEach((row) => computeRow(f.cols, row));
        if (f.totalRow) v._total = columnTotals(f.cols, rows);
        for (const r of f.rows) if (isEmpty(v[r.key])) delete v[r.key];
      } else if (f.type === 'repeat' && Array.isArray(v)) {
        v.forEach((row) => computeRow(f.columns, row));
        f.columns.forEach((c) => {
          if (c.showIf) v.forEach((row) => { if (!evalCondition(c.showIf, row, answers)) { delete row[c.key]; delete row[`${c.key}__other`]; } });
        });
      } else if (f.type === 'groupedRepeat' && v && typeof v === 'object') {
        for (const g of f.groups) if (Array.isArray(v[g.key])) v[g.key].forEach((row) => computeRow(f.columns, row));
      }
      // drop "other" text when the specify option is not selected
      if ((f.type === 'single' || f.type === 'multi') && `${f.key}__other` in qa) {
        const sel = f.type === 'single' ? [qa[f.key]] : qa[f.key] || [];
        const needs = f.options.some((op) => op.specify && sel.includes(op.value));
        if (!needs) delete qa[`${f.key}__other`];
      }
    }
    // computedFrom: e.g. Q5 family size from the age table total
    for (const f of q.fields) {
      if (f.computedFrom) {
        const t = qa[f.computedFrom]?._total;
        const tot = t && t.total;
        if (typeof tot === 'number' && tot > 0) qa[f.key] = tot;
      }
    }
  }
  return answers;
}

// ---------------- validation ----------------
const DEFAULT_MAX = 100000;
const MAX_TEXT = 500;
const MAX_SIGNATURE_CHARS = 300000;

function checkNumber(spec, v, push) {
  if (v === null || v === undefined || v === '') return;
  if (typeof v !== 'number' || !Number.isFinite(v)) return push('संख्या मात्र लेख्नुहोस्');
  const min = spec.min ?? 0;
  const max = spec.max ?? DEFAULT_MAX;
  if (v < min) return push(`न्यूनतम ${toNepaliDigits(min)} हुनुपर्छ`);
  if (v > max) return push(`अधिकतम ${toNepaliDigits(max)} हुनुपर्छ`);
  if (!spec.decimal && !Number.isInteger(v)) return push('पूर्णाङ्क मात्र लेख्नुहोस्');
}

function checkText(v, push) {
  if (v === null || v === undefined) return;
  if (typeof v !== 'string') return push('अमान्य पाठ');
  if (v.length > MAX_TEXT) push(`${toNepaliDigits(MAX_TEXT)} अक्षरभन्दा लामो हुन सक्दैन`);
}

export function isValidBsDate(v) {
  if (typeof v !== 'string') return false;
  const s = toLatinDigits(v.trim());
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return y >= 2000 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 32;
}

function checkCell(col, v, push, row, answers) {
  if (v === undefined || v === null || v === '') return;
  if (col.type === 'number') checkNumber(col, v, push);
  else if (col.type === 'text') checkText(v, push);
  else if (col.type === 'check') { if (typeof v !== 'boolean') push('अमान्य चिन्ह'); }
  else if (col.type === 'select') {
    if (!col.options.some((op) => op.value === v)) push('अमान्य विकल्प');
  }
  if (col.maxOf && typeof v === 'number' && typeof row?.[col.maxOf] === 'number' && v > row[col.maxOf]) {
    push('जम्मा संख्याभन्दा बढी हुन सक्दैन');
  }
}

/**
 * Validate answers.
 * @param {object} answers  raw or computed answers
 * @param {{mode?: 'draft'|'submit', role?: string}} opts
 * @returns {{ errors: Array<{q,field,path,message}>, warnings: Array<{q,field,path,message}> }}
 */
export function validate(answersIn, opts = {}) {
  const mode = opts.mode || 'draft';
  const answers = compute(answersIn);
  const errors = [];
  const warnings = [];
  const knownQ = new Set(questions.map((q) => q.id));

  for (const key of Object.keys(answersIn || {})) {
    if (!knownQ.has(key)) errors.push({ q: key, field: null, path: key, message: 'अज्ञात प्रश्न' });
  }

  for (const q of questions) {
    if (!isQuestionVisible(q, answers)) continue;
    const qa = answers[q.id] || {};
    const knownF = new Set(q.fields.flatMap((f) => [f.key, `${f.key}__other`]));
    for (const k of Object.keys(qa)) if (!knownF.has(k)) errors.push({ q: q.id, field: k, path: `${q.id}.${k}`, message: 'अज्ञात फिल्ड' });

    for (const f of q.fields) {
      if (!evalCondition(f.showIf, qa, answers)) continue;
      const v = qa[f.key];
      const path = `${q.id}.${f.key}`;
      const push = (message, sub = '', warn = false) =>
        (warn ? warnings : errors).push({ q: q.id, field: f.key, path: sub ? `${path}.${sub}` : path, message });

      if (f.reviewOnly && opts.role === 'enumerator' && !isEmpty(v)) {
        push('यो फिल्ड सुपरभाइजरले मात्र भर्न सक्छ');
        continue;
      }
      if (mode === 'submit' && f.required && !f.reviewOnly && isEmpty(v)) {
        push('यो प्रश्नको उत्तर आवश्यक छ');
        continue;
      }
      if (isEmpty(v)) continue;

      switch (f.type) {
        case 'number': checkNumber(f, v, push); break;
        case 'text': checkText(v, push); break;
        case 'date':
          if (!isValidBsDate(v)) push('मिति वि.सं. YYYY-MM-DD ढाँचामा हुनुपर्छ');
          break;
        case 'signature':
          if (typeof v !== 'string' || !v.startsWith('data:image/png;base64,')) push('अमान्य सही');
          else if (v.length > MAX_SIGNATURE_CHARS) push('सहीको फाइल धेरै ठूलो भयो');
          break;
        case 'single': {
          const op = f.options.find((x) => x.value === v);
          if (!op) push('अमान्य विकल्प');
          else if (op.specify && mode === 'submit' && isEmpty(qa[`${f.key}__other`])) push('"अन्य" खुलाउनुहोस्', 'other');
          break;
        }
        case 'multi': {
          if (!Array.isArray(v)) { push('अमान्य उत्तर'); break; }
          const ops = v.map((x) => f.options.find((op) => op.value === x));
          if (ops.some((x) => !x)) { push('अमान्य विकल्प'); break; }
          if (new Set(v).size !== v.length) push('दोहोरिएको विकल्प');
          if (ops.some((x) => x.exclusive) && v.length > 1) push('"कुनै पनि होइन" विकल्प अरूसँग छान्न मिल्दैन');
          if (mode === 'submit' && ops.some((x) => x.specify) && isEmpty(qa[`${f.key}__other`])) push('"अन्य" खुलाउनुहोस्', 'other');
          break;
        }
        case 'grid': validateGrid(f, v, push, mode); break;
        case 'repeat': validateRepeat(f, v, push, answers, mode); break;
        case 'groupedRepeat': {
          if (typeof v !== 'object' || Array.isArray(v)) { push('अमान्य तालिका'); break; }
          for (const gk of Object.keys(v)) {
            const g = f.groups.find((x) => x.key === gk);
            if (!g) { push('अज्ञात समूह', gk); continue; }
            validateRepeat({ ...f, maxRows: 50 }, v[gk], (m, sub) => push(m, `${gk}.${sub}`), answers, mode);
          }
          break;
        }
        default: break;
      }
      if (f.type === 'single' || f.type === 'multi') {
        const other = qa[`${f.key}__other`];
        if (other !== undefined) checkText(other, (m) => push(m, 'other'));
      }
    }
  }

  crossChecks(answers, errors, warnings, mode);
  return { errors, warnings, answers };
}

function validateGrid(f, v, push, mode) {
  if (typeof v !== 'object' || Array.isArray(v)) return push('अमान्य तालिका');
  const rowKeys = new Set(f.rows.map((r) => r.key).concat('_total'));
  for (const rk of Object.keys(v)) if (!rowKeys.has(rk)) push('अज्ञात पंक्ति', rk);
  for (const r of f.rows) {
    const row = v[r.key];
    if (!row) continue;
    if (typeof row !== 'object') { push('अमान्य पंक्ति', r.key); continue; }
    const colKeys = new Set(f.cols.map((c) => c.key).concat('__label'));
    for (const ck of Object.keys(row)) if (!colKeys.has(ck)) push('अज्ञात स्तम्भ', `${r.key}.${ck}`);
    if (row.__label !== undefined) checkText(row.__label, (m) => push(m, `${r.key}.__label`));
    for (const c of f.cols) checkCell(c, row[c.key], (m) => push(m, `${r.key}.${c.key}`), row);
    if (f.rowChoice) {
      const n = f.cols.filter((c) => row[c.key] === true).length;
      if (n > 1) push('प्रत्येक पंक्तिमा एउटा मात्र छान्नुहोस्', r.key);
    }
    if (r.specify && mode === 'submit') {
      const hasData = f.cols.some((c) => !isEmpty(row[c.key]) && row[c.key] !== 0);
      if (hasData && isEmpty(row.__label)) push('"अन्य" को नाम खुलाउनुहोस्', `${r.key}.__label`);
    }
    for (const rule of f.rowRules || []) {
      const parts = rule.sum.map((k) => row[k]);
      const target = row[rule.equals];
      if (anyNumber(parts) && typeof target === 'number' && sumValues(parts) !== target) {
        push(rule.message, r.key, !!rule.warn);
      }
    }
  }
}

function validateRepeat(f, v, push, answers, mode) {
  if (!Array.isArray(v)) return push('अमान्य तालिका');
  if (v.length > (f.maxRows || 50)) push(`अधिकतम ${toNepaliDigits(f.maxRows || 50)} पंक्ति मात्र`);
  v.forEach((row, i) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return push('अमान्य पंक्ति', String(i));
    const colKeys = new Set(f.columns.flatMap((c) => [c.key, `${c.key}__other`]).concat('_id'));
    for (const ck of Object.keys(row)) if (!colKeys.has(ck)) push('अज्ञात स्तम्भ', `${i}.${ck}`);
    for (const c of f.columns) {
      if (c.showIf && !evalCondition(c.showIf, row, answers)) continue;
      checkCell(c, row[c.key], (m) => push(m, `${i}.${c.key}`), row, answers);
      if (c.type === 'select' && mode === 'submit') {
        const op = c.options.find((x) => x.value === row[c.key]);
        if (op?.specify && isEmpty(row[`${c.key}__other`])) push('"अन्य" खुलाउनुहोस्', `${i}.${c.key}__other`);
      }
    }
  });
}

/** Consistency checks spanning several questions. */
function crossChecks(a, errors, warnings, mode) {
  const add = (list, q, field, message) => list.push({ q, field, path: `${q}.${field}`, message });
  const t5 = a.q5?.age_table?._total;
  if (mode === 'submit' && a.q5 && typeof a.q5.family_size === 'number' && t5 && typeof t5.total === 'number' &&
      a.q5.family_size !== t5.total) {
    add(errors, 'q5', 'family_size', 'परिवार संख्या उमेर समूह तालिकाको जम्मासँग मिलेन');
  }
  if (mode === 'submit' && a.q5 && !t5?.total) add(errors, 'q5', 'age_table', 'उमेर समूह तालिका भर्नुहोस्');

  // Q17: vaccinated under-1 children cannot exceed under-1 members recorded in Q5
  const u1 = a.q5?.age_table ? a.q5.age_table.lt1 || {} : null;
  const q17 = a.q17?.table;
  if (u1 && q17) {
    const pairs = [['boy', 'male'], ['girl', 'female'], ['third', 'third']];
    for (const [r, c] of pairs) {
      if (typeof q17[r]?.total === 'number' && q17[r].total > (u1[c] ?? 0)) {
        add(warnings, 'q17', 'table', `प्र.१७ को ${r === 'boy' ? 'बालक' : r === 'girl' ? 'बालिका' : 'तेस्रो लिङ्गी'} संख्या प्र.५ को १ वर्षमुनिको संख्याभन्दा बढी छ`);
      }
    }
  }
  // Q29: header counts vs detail rows
  if (a.q29?.has === '१' && Array.isArray(a.q29.rows)) {
    const count = (s) => a.q29.rows.filter((r) => r.sex === s).length;
    const map = [['boys', 'बालक'], ['girls', 'बालिका'], ['third', 'तेस्रो लिङ्गी']];
    for (const [k, s] of map) {
      if (typeof a.q29[k] === 'number' && a.q29.rows.length && a.q29[k] !== count(s)) {
        add(warnings, 'q29', k, `${s} संख्या (${toNepaliDigits(a.q29[k])}) तलको विवरणसँग (${toNepaliDigits(count(s))}) मिलेन`);
      }
    }
  }
  // Q28: number of ages recorded should equal count
  const q28 = a.q28?.table;
  if (q28) {
    for (const r of ['male', 'female', 'third']) {
      const row = q28[r];
      if (!row || typeof row.count !== 'number') continue;
      const ages = [1, 2, 3, 4, 5, 6, 7].filter((i) => typeof row[`age${i}`] === 'number').length;
      if (ages !== row.count) add(warnings, 'q28', 'table', 'विवाह संख्या र उमेर लेखिएको संख्या मिलेन');
      for (let i = 1; i <= 7; i++) {
        if (typeof row[`age${i}`] === 'number' && row[`age${i}`] < 20) {
          add(warnings, 'q28', 'table', '२० वर्षभन्दा कम उमेरमा विवाह — बालविवाह (प्र.३६) जाँच गर्नुहोस्');
          break;
        }
      }
    }
  }
  // Q36 exclusive "none" vs Q35 yes
  if (a.q35?.ans === 'क' && Array.isArray(a.q36?.ans) && a.q36.ans.includes('ञ')) {
    add(warnings, 'q36', 'ans', 'प्र.३५ मा यौनशोषणको घटना "छ" भनिएको छ तर प्र.३६ मा "कुनै घटना नघटेको"');
  }
}

/** Fraction of required visible fields that are answered (0..1). */
export function completion(answersIn) {
  const answers = compute(answersIn);
  let total = 0; let done = 0;
  for (const q of questions) {
    if (!isQuestionVisible(q, answers)) continue;
    for (const f of q.fields) {
      if (!f.required || f.reviewOnly || !evalCondition(f.showIf, answers[q.id], answers)) continue;
      total += 1;
      if (!isEmpty(answers[q.id]?.[f.key])) done += 1;
    }
  }
  return total ? done / total : 0;
}
