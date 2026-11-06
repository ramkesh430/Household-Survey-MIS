/**
 * Report engine (pure functions, used by the API and tests).
 *  - aggregateQuestion: generic aggregation of any question in the definition
 *  - THEMES: thematic reports (which questions + curated indicators)
 *  - suppression of small counts for sensitive questions
 *  - flattening for dataset export (one row per household + codebook)
 */
import { questions } from './questionnaire.js';
import { evalCondition, isQuestionVisible } from './engine.js';

export const SUPPRESS_BELOW = 3; // counts 1..2 on sensitive questions are hidden

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const sum = (arr) => arr.reduce((a, v) => (isNum(v) ? a + v : a), 0);
const qById = Object.fromEntries(questions.map((q) => [q.id, q]));

// ------------------------------------------------------------------ generic aggregation
function aggChoice(f, values, multi) {
  const counts = new Map(f.options.map((o) => [o.value, 0]));
  let answered = 0;
  for (const v of values) {
    const sel = multi ? (Array.isArray(v) ? v : []) : (v ? [v] : []);
    if (!sel.length) continue;
    answered += 1;
    sel.forEach((x) => counts.set(x, (counts.get(x) || 0) + 1));
  }
  return { answered, counts: f.options.map((o) => ({ value: o.value, code: o.code, label: o.label, n: counts.get(o.value) || 0 })) };
}

function aggNumber(values) {
  const nums = values.filter(isNum);
  return { answered: nums.length, sum: sum(nums), mean: nums.length ? sum(nums) / nums.length : null, min: nums.length ? Math.min(...nums) : null, max: nums.length ? Math.max(...nums) : null };
}

function topValues(values, limit = 25) {
  const m = new Map();
  for (const v of values) {
    if (typeof v !== 'string' || !v.trim()) continue;
    const k = v.trim().replace(/\s+/g, ' ');
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([value, n]) => ({ value, n }));
}

function aggGrid(f, values) {
  const cells = {}; const labels = {};
  let answered = 0;
  for (const r of f.rows) { cells[r.key] = {}; for (const c of f.cols) if (c.type !== 'text') cells[r.key][c.key] = 0; }
  for (const g of values) {
    if (!g || typeof g !== 'object') continue;
    answered += 1;
    for (const r of f.rows) {
      const row = g[r.key];
      if (!row) continue;
      if (r.specify && row.__label) (labels[r.key] ||= []).push(row.__label);
      for (const c of f.cols) {
        if (c.type === 'number' && isNum(row[c.key])) cells[r.key][c.key] += row[c.key];
        else if (c.type === 'check' && row[c.key] === true) cells[r.key][c.key] += 1;
      }
    }
  }
  const total = {};
  for (const c of f.cols) if (c.type !== 'text' && !c.noTotal) total[c.key] = sum(f.rows.map((r) => cells[r.key][c.key]));
  return {
    answered, cells, total,
    rows: f.rows.map((r) => ({ key: r.key, label: r.label })),
    cols: f.cols.filter((c) => c.type !== 'text').map((c) => ({ key: c.key, label: c.label, group: c.group || null, type: c.type, noTotal: !!c.noTotal })),
    otherLabels: Object.fromEntries(Object.entries(labels).map(([k, v]) => [k, topValues(v, 10)])),
  };
}

function aggRows(columns, rowsList) {
  const sums = {}; const selects = {};
  for (const c of columns) {
    if (c.type === 'number') sums[c.key] = sum(rowsList.map((r) => r[c.key]));
    if (c.type === 'select') {
      const m = new Map(c.options.map((o) => [o.value, 0]));
      rowsList.forEach((r) => { if (r[c.key] !== undefined) m.set(r[c.key], (m.get(r[c.key]) || 0) + 1); });
      selects[c.key] = c.options.map((o) => ({ value: o.value, code: o.code, label: o.label, n: m.get(o.value) || 0 }));
    }
  }
  return { sums, selects };
}

function aggRepeat(f, values) {
  const all = []; let households = 0;
  for (const v of values) if (Array.isArray(v) && v.length) { households += 1; all.push(...v); }
  return {
    answered: households, rows: all.length, households,
    columns: f.columns.map((c) => ({ key: c.key, label: c.label, group: c.group || null, type: c.type })),
    ...aggRows(f.columns, all),
  };
}

function aggGroupedRepeat(f, values) {
  const groups = {}; let answered = 0;
  for (const g of f.groups) groups[g.key] = { label: g.label, rows: 0, households: 0, area_ha: 0, production: 0, crops: [] };
  const crops = {};
  for (const v of values) {
    if (!v || typeof v !== 'object') continue;
    let any = false;
    for (const g of f.groups) {
      const rows = (v[g.key] || []).filter((r) => r && (r.crop || isNum(r.area_ha) || isNum(r.production)));
      if (!rows.length) continue;
      any = true;
      groups[g.key].rows += rows.length; groups[g.key].households += 1;
      groups[g.key].area_ha += sum(rows.map((r) => r.area_ha));
      groups[g.key].production += sum(rows.map((r) => r.production));
      (crops[g.key] ||= []).push(...rows.map((r) => r.crop).filter(Boolean));
    }
    if (any) answered += 1;
  }
  for (const k of Object.keys(crops)) groups[k].crops = topValues(crops[k], 10);
  return { answered, groups };
}

/**
 * Aggregate one question across households.
 * @param q        question definition
 * @param list     array of answers objects (already computed by the engine)
 */
export function aggregateQuestion(q, list) {
  const visibleList = list.filter((a) => isQuestionVisible(q, a));
  const fields = [];
  for (const f of q.fields) {
    if (['signature', 'date'].includes(f.type) || f.fromHousehold) continue;
    const scoped = visibleList.filter((a) => evalCondition(f.showIf, a[q.id], a));
    const values = scoped.map((a) => a[q.id]?.[f.key]);
    let result;
    switch (f.type) {
      case 'single': result = aggChoice(f, values, false); break;
      case 'multi': result = aggChoice(f, values, true); break;
      case 'number': result = aggNumber(values); break;
      case 'text': result = f.suggest || f.key === 'fiscal_year' ? { answered: values.filter(Boolean).length, top: topValues(values) } : { answered: values.filter(Boolean).length, freeText: true }; break;
      case 'grid': result = aggGrid(f, values); break;
      case 'repeat': result = aggRepeat(f, values); break;
      case 'groupedRepeat': result = aggGroupedRepeat(f, values); break;
      default: continue;
    }
    fields.push({ key: f.key, label: f.label || null, type: f.type, eligible: scoped.length, ...result });
  }
  return { id: q.id, no: q.no, title: q.title, sensitive: !!q.sensitive, households: list.length, eligible: visibleList.length, fields };
}

// ------------------------------------------------------------------ suppression
const SUP = (n) => (isNum(n) && n > 0 && n < SUPPRESS_BELOW ? null : n);
/** Hide small counts of a sensitive question's aggregate (returns a copy, `suppressed: true` marks it). */
export function suppress(agg) {
  if (!agg.sensitive) return agg;
  const copy = JSON.parse(JSON.stringify(agg));
  for (const f of copy.fields) {
    if (f.counts) f.counts.forEach((c) => { c.n = SUP(c.n); });
    if (f.cells) {
      for (const r of Object.keys(f.cells)) for (const c of Object.keys(f.cells[r])) f.cells[r][c] = SUP(f.cells[r][c]);
      for (const c of Object.keys(f.total)) f.total[c] = SUP(f.total[c]);
      f.otherLabels = {};
    }
    if (f.sums) for (const k of Object.keys(f.sums)) f.sums[k] = SUP(f.sums[k]);
    if (f.selects) for (const k of Object.keys(f.selects)) f.selects[k].forEach((c) => { c.n = SUP(c.n); });
    if ('rows' in f && isNum(f.rows)) { f.rows = SUP(f.rows); f.households = SUP(f.households); }
    if (isNum(f.sum)) { f.sum = SUP(f.sum); f.mean = f.sum === null ? null : f.mean; }
  }
  copy.suppressed = true;
  return copy;
}

// ------------------------------------------------------------------ indicators
const pct = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);
const ind = (id, label, value, unit, extra = {}) => ({ id, label, value, unit, ...extra });
const opt = (agg, key, ...values) => {
  const f = agg?.fields.find((x) => x.key === key);
  if (!f?.counts) return { n: 0, den: 0 };
  return { n: sum(f.counts.filter((c) => values.includes(c.value)).map((c) => c.n)), den: f.answered };
};
const optPct = (agg, key, ...values) => { const r = opt(agg, key, ...values); return pct(r.n, r.den); };
const field = (agg, key) => agg?.fields.find((x) => x.key === key);
const gridTotal = (agg, key, col) => field(agg, key)?.total?.[col] ?? 0;
const gridCell = (agg, key, row, col) => field(agg, key)?.cells?.[row]?.[col] ?? 0;
const sensitiveCount = (n) => SUP(n);

export const AGE_GROUPS = ['lt1', '1_2', '3_4', '5_6', '7_8', '9_10', '11_12', '13_14', '15_16', '17_18', '19_24', '25_45', '46_60', '61_75', 'gt75'];

/**
 * Thematic reports. `questions` are shown in full (generic aggregation);
 * `indicators(agg, list)` computes the headline figures for the theme.
 */
export const THEMES = [
  {
    id: 'demography', title: 'जनसांख्यिकी (लिङ्ग, उमेर, जाति, धर्म, भाषा)', questions: ['q1', 'q2', 'q3', 'q4', 'q5'],
    indicators: (a, list) => {
      const t = field(a.q5, 'age_table')?.total || {};
      const pop = t.total || 0;
      const u5 = ['lt1', '1_2', '3_4'].reduce((s, r) => s + gridCell(a.q5, 'age_table', r, 'total'), 0);
      const child = AGE_GROUPS.slice(0, 10).reduce((s, r) => s + gridCell(a.q5, 'age_table', r, 'total'), 0);
      const old = ['61_75', 'gt75'].reduce((s, r) => s + gridCell(a.q5, 'age_table', r, 'total'), 0);
      return [
        ind('households', 'घरधुरी संख्या', list.length, 'घरधुरी'),
        ind('population', 'जम्मा जनसंख्या', pop, 'जना'),
        ind('female', 'महिला', t.female || 0, 'जना'),
        ind('male', 'पुरुष', t.male || 0, 'जना'),
        ind('third', 'तेस्रो लिङ्गी', t.third || 0, 'जना'),
        ind('sex_ratio', 'लैङ्गिक अनुपात (प्रति १०० महिलामा पुरुष)', t.female ? Math.round(((t.male || 0) / t.female) * 1000) / 10 : null, ''),
        ind('avg_size', 'औसत परिवार संख्या', list.length ? Math.round((pop / list.length) * 100) / 100 : null, 'जना'),
        ind('female_head', 'महिला घरमूली भएका घरधुरी', optPct(a.q1, 'head_gender', '१'), '%'),
        ind('under5', '५ वर्षमुनिका बालबालिका', u5, 'जना'),
        ind('children', '१८ वर्षसम्मका बालबालिका', child, 'जना', { share: pct(child, pop) }),
        ind('elderly', '६१ वर्षमाथिका', old, 'जना', { share: pct(old, pop) }),
      ];
    },
  },
  {
    id: 'wash', title: 'खानेपानी, सरसफाइ र स्वास्थ्य सेवा', questions: ['q6', 'q7', 'q8', 'q9', 'q10', 'q11', 'q12', 'q13', 'q14'],
    indicators: (a) => [
      ind('piped', 'पाइपको धाराको पानी प्रयोग गर्ने', optPct(a.q6, 'ans', 'क'), '%'),
      ind('water_home', 'घरैमा खानेपानी', optPct(a.q7, 'ans', 'क'), '%'),
      ind('water_far', 'पानी ल्याउन ३० मिनेटभन्दा बढी', optPct(a.q7, 'ans', 'घ'), '%'),
      ind('treated', 'सुरक्षित/प्रशोधित खानेपानी', optPct(a.q8, 'ans', 'क', 'ख', 'ग'), '%'),
      ind('no_diarrhoea', 'वर्षभर झाडापखाला नलागेका', optPct(a.q9, 'ans', 'क'), '%'),
      ind('toilet', 'शौचालय भएका घरधुरी', optPct(a.q10, 'ans', 'क', 'ख१', 'ख२'), '%'),
      ind('no_toilet', 'शौचालय नभएका घरधुरी', optPct(a.q10, 'ans', 'ग'), '%'),
      ind('soap', 'साबुनपानीले हात धुने', optPct(a.q11, 'ans', 'क'), '%'),
      ind('facility_first', 'बिरामी हुँदा पहिला स्वास्थ्य संस्था/अस्पताल जाने', optPct(a.q12, 'ans', 'ग', 'घ'), '%'),
      ind('afford', 'बालबालिकाको तुरुन्त उपचार गर्ने आर्थिक क्षमता भएका', optPct(a.q14, 'ans', 'क'), '%'),
    ],
  },
  {
    id: 'health', title: 'मातृ, शिशु तथा बाल स्वास्थ्य', questions: ['q15', 'q16', 'q17', 'q18', 'q19', 'q20', 'q21', 'q22', 'q23', 'q24', 'q25', 'q26', 'q27'],
    indicators: (a) => {
      const births = gridTotal(a.q15, 'table', 'live_births');
      const u1 = gridTotal(a.q17, 'table', 'total');
      const u5 = gridTotal(a.q18, 'table', 'total');
      const preg = field(a.q19, 'rows');
      const delivered = preg?.selects?.delivered?.find((x) => x.value === 'भएको')?.n || 0;
      const facility = preg?.selects?.delivery_place?.find((x) => x.value === '१')?.n || 0;
      const reg = (p) => pct(gridTotal(a.q27, 'table', `${p}_reg`), gridTotal(a.q27, 'table', `${p}_total`));
      return [
        ind('births', 'पछिल्लो २ वर्षमा जीवित जन्म', births, 'जना'),
        ind('early_bf', 'जन्मनेबित्तिकै बिगौती दुध खुवाइएका', pct(gridTotal(a.q15, 'table', 'bf_immediate'), births), '%'),
        ind('excl_bf', '६ महिनासम्म आमाको दुध मात्र', pct(gridTotal(a.q15, 'table', 'excl_6m'), births), '%'),
        ind('bcg', 'बि.सि.जी. खोप (१ वर्षमुनि)', pct(gridTotal(a.q17, 'table', 'bcg'), u1), '%'),
        ind('dpt3', 'डि.पि.टि. ३ खोप', pct(gridTotal(a.q17, 'table', 'dpt3'), u1), '%'),
        ind('mr', 'दादुरा/रुबेला खोप', pct(gridTotal(a.q17, 'table', 'mr'), u1), '%'),
        ind('vita', 'भिटामिन ए (५ वर्षमुनि)', pct(gridTotal(a.q18, 'table', 'vita'), u5), '%'),
        ind('facility_delivery', 'स्वास्थ्य संस्थामा प्रसूति', pct(facility, delivered), '%', { den: delivered }),
        ind('u5_deaths', '५ वर्षमुनिको मृत्यु (१ वर्षभित्र)', sensitiveCount(gridTotal(a.q23, 'table', 'deaths')), 'जना', { sensitive: true }),
        ind('iodised', 'आयोडिनयुक्त नुन प्रयोग गर्ने', optPct(a.q24, 'ans', 'क'), '%'),
        ind('u5_birth_reg', 'जन्म दर्ता (५ वर्षमुनि)', reg('u5'), '%'),
        ind('o6_birth_reg', 'जन्म दर्ता (६–१८ वर्ष)', reg('o6'), '%'),
      ];
    },
  },
  {
    id: 'protection', title: 'बाल संरक्षण', questions: ['q28', 'q29', 'q30', 'q31', 'q32', 'q33', 'q34', 'q35', 'q36', 'q37', 'q38', 'q39', 'q40', 'q41', 'q42', 'q43'],
    indicators: (a, list) => {
      let early = 0;
      for (const ans of list) {
        const t = ans.q28?.table || {};
        for (const r of ['male', 'female', 'third']) for (let i = 1; i <= 7; i++) if (isNum(t[r]?.[`age${i}`]) && t[r][`age${i}`] < 20) early += 1;
      }
      const labour = list.filter((x) => x.q29?.has === '१').length;
      const violence = list.filter((x) => Array.isArray(x.q36?.ans) && x.q36.ans.some((v) => v !== 'ञ')).length;
      return [
        ind('marriages', 'पछिल्लो ३ वर्षमा विवाह', gridTotal(a.q28, 'table', 'count'), 'जना'),
        ind('early_marriage', '२० वर्षभन्दा कम उमेरमा विवाह', sensitiveCount(early), 'जना', { sensitive: true }),
        ind('child_labour_hh', 'बालबालिका अरूको घरमा काम गर्न बसेका घरधुरी', sensitiveCount(labour), 'घरधुरी', { sensitive: true }),
        ind('violence_hh', 'हिंसा/कुरीतिका घटना भएका घरधुरी', sensitiveCount(violence), 'घरधुरी', { sensitive: true }),
        ind('institution', 'बालगृह/संस्थामा बसेका बालबालिका', sensitiveCount(field(a.q37, 'rows')?.rows || 0), 'जना', { sensitive: true }),
        ind('street', 'सडक बालबालिका', sensitiveCount(field(a.q38, 'rows')?.rows || 0), 'जना', { sensitive: true }),
        ind('rights_aware', 'बाल अधिकारबारे जानकारी भएका', optPct(a.q39, 'ans', 'क'), '%'),
        ind('study_room', 'बालबालिकाको अलग्गै कोठा भएका', optPct(a.q42, 'ans', 'क'), '%'),
        ind('shed_separate', 'गोठ र मूल घर अलग्गै', optPct(a.q43, 'ans', 'क'), '%'),
      ];
    },
  },
  {
    id: 'education', title: 'शिक्षा', questions: ['q44', 'q45', 'q46', 'q47', 'q48', 'q49', 'q50', 'q51', 'q52'],
    indicators: (a) => {
      const t = field(a.q45, 'table')?.total || {};
      const LEVELS = ['illiterate_', 'literate_', 'see_', 'plus2_', 'bachelor_', 'master_', 'phd_'];
      const tot = (sx) => sum(LEVELS.map((l) => t[`${l}${sx}`]));
      const lit = (sx) => pct(tot(sx) - (t[`illiterate_${sx}`] || 0), tot(sx));
      const lit6_18 = field(a.q45, 'table')?.cells?.['6_18'] || {};
      const total6_18 = sum(Object.values(lit6_18));
      return [
        ind('literacy_f', 'साक्षरता दर — महिला (६ वर्षमाथि)', lit('female'), '%'),
        ind('literacy_m', 'साक्षरता दर — पुरुष (६ वर्षमाथि)', lit('male'), '%'),
        ind('literacy_6_18', 'साक्षरता दर — ६–१८ वर्ष', pct(total6_18 - (lit6_18.illiterate_female || 0) - (lit6_18.illiterate_male || 0), total6_18), '%'),
        ind('ecd', 'बाल विकास केन्द्र जाने (३–४ वर्ष)', gridTotal(a.q44, 'table', 'total'), 'जना'),
        ind('in_school', 'विद्यालयमा अध्ययनरत', ['ecd', 'in', 'out1', 'out2'].reduce((s, p) => s + gridTotal(a.q46, 'table', `${p}_t`), 0), 'जना'),
        ind('out_of_school', 'विद्यालय भर्ना नभएका', ['p5', 'basic', 'sec'].reduce((s, p) => s + gridTotal(a.q50, 'table', `${p}_t`), 0), 'जना'),
        ind('out_disabled', 'भर्ना नभएका अपाङ्गता भएका', ['p5', 'basic', 'sec'].reduce((s, p) => s + gridCell(a.q50, 'table', 'disabled', `${p}_t`), 0), 'जना'),
        ind('dropout', 'बीचमै विद्यालय छोडेका (६–१५ वर्ष)', gridTotal(a.q51, 'table', 'total'), 'जना'),
        ind('cf_toilet', 'विद्यालयमा बालमैत्री शौचालय', optPct(a.q48, 'ans', 'क'), '%'),
        ind('special_ed', 'अपाङ्गताका लागि विशेष शिक्षा सुविधा', optPct(a.q49, 'ans', 'क'), '%'),
      ];
    },
  },
  {
    id: 'participation', title: 'सहभागिता, संघसंस्था र तालिम', questions: ['q53', 'q54', 'q55', 'q56', 'q57', 'q58', 'q59'],
    indicators: (a) => {
      const none = opt(a.q56, 'ans', 'झ');
      const trained = (qa) => { const s = field(qa, 'rows')?.sums || {}; return sum(Object.entries(s).filter(([k]) => k.endsWith('_t')).map(([, v]) => v)); };
      return [
        ind('child_participation', 'निर्णयमा बालबालिकालाई सहभागी गराउने', optPct(a.q53, 'ans', 'क'), '%'),
        ind('child_clubs', 'बाल क्लबमा आबद्ध बालबालिका', ['school', 'community', 'labour'].reduce((s, c) => s + gridTotal(a.q54, 'table', c), 0), 'जना'),
        ind('org_member', 'संघसंस्थामा आबद्ध घरधुरी', pct(none.den - none.n, none.den), '%'),
        ind('paralegal', 'प्यारालिगल कमिटिमा गएका', optPct(a.q57, 'has', '१'), '%'),
        ind('awareness_trained', 'जनचेतनामूलक तालिम प्राप्त व्यक्ति', trained(a.q58), 'जना'),
        ind('vocational_trained', 'व्यवसायिक तालिम प्राप्त व्यक्ति', trained(a.q59), 'जना'),
      ];
    },
  },
  {
    id: 'economy', title: 'पेशा, रोजगारी, आम्दानी, आवास र ऊर्जा', questions: ['q60', 'q61', 'q62', 'q63', 'q64', 'q65', 'q66', 'q67', 'q68', 'q69', 'q70', 'q71', 'q72', 'q73', 'q74'],
    indicators: (a, list) => {
      const inc = field(a.q70, 'income'); const exp = field(a.q70, 'expense');
      const withInc = list.filter((x) => isNum(x.q70?.income?._total?.amount)).length;
      const withExp = list.filter((x) => isNum(x.q70?.expense?._total?.amount)).length;
      const empl = field(a.q67, 'table')?.total || {};
      const employed = sum(Object.entries(empl).filter(([k]) => k.endsWith('_t')).map(([, v]) => v));
      const decisions = field(a.q74, 'table'); const decWomen = decisions?.cells?.decision?.female || 0;
      return [
        ind('agri_main', 'मुख्य पेशा कृषि/पशुपालन', optPct(a.q60, 'ans', 'क'), '%'),
        ind('remit_main', 'मुख्य पेशा विप्रेषण', optPct(a.q60, 'ans', 'ङ'), '%'),
        ind('employed', 'पेशा/रोजगारीमा संलग्न (१६ वर्षमाथि)', employed, 'जना'),
        ind('abroad', 'रोजगारीका लागि विदेश गएका', gridTotal(a.q68, 'table', 'n_t'), 'जना'),
        ind('abroad_women', 'विदेश गएका महिला', gridTotal(a.q68, 'table', 'n_f'), 'जना'),
        ind('disabled_children', 'अपाङ्गता भएका बालबालिका', gridTotal(a.q69, 'table', 'total'), 'जना'),
        ind('avg_income', 'औसत वार्षिक आम्दानी (प्रति घरधुरी)', withInc ? Math.round((inc?.total?.amount || 0) / withInc) : null, 'रु.'),
        ind('avg_expense', 'औसत वार्षिक खर्च (प्रति घरधुरी)', withExp ? Math.round((exp?.total?.amount || 0) / withExp) : null, 'रु.'),
        ind('food_lt6', 'वर्षमा ६ महिनाभन्दा कम खान पुग्ने', optPct(a.q71, 'ans', 'क', 'ख'), '%'),
        ind('loan', 'ऋण लिएका घरधुरी', optPct(a.q72, 'has', '१'), '%'),
        ind('grid_power', 'राष्ट्रिय प्रसारणको विजुली', optPct(a.q63, 'ans', 'च'), '%'),
        ind('firewood', 'खाना पकाउन दाउरा', optPct(a.q64, 'ans', 'क'), '%'),
        ind('lpg', 'खाना पकाउन एल.पि. ग्याँस', optPct(a.q64, 'ans', 'ङ'), '%'),
        ind('mobile', 'मोबाइल भएका घरधुरी', optPct(a.q66, 'ans', 'घ'), '%'),
        ind('women_decide', 'घर व्यवहारको निर्णय प्रायः महिलाले गर्ने', pct(decWomen, decisions?.answered || 0), '%'),
      ];
    },
  },
  {
    id: 'agriculture', title: 'कृषि तथा पशुपालन', questions: ['q75', 'q76'],
    indicators: (a) => {
      const g = field(a.q75, 'crops')?.groups || {};
      const area = sum(Object.values(g).map((x) => x.area_ha));
      const lv = field(a.q76, 'livestock')?.cells || {};
      const pt = field(a.q76, 'poultry')?.cells || {};
      const fb = field(a.q76, 'fish_bee')?.cells || {};
      return [
        ind('farming_hh', 'बाली उत्पादन गर्ने घरधुरी', field(a.q75, 'crops')?.answered || 0, 'घरधुरी'),
        ind('crop_area', 'जम्मा बाली क्षेत्रफल', Math.round(area * 100) / 100, 'हेक्टर'),
        ind('cereal_prod', 'अन्नबाली उत्पादन', Math.round((g.cereal?.production || 0) * 10) / 10, 'क्विन्टल'),
        ind('cattle', 'गाई गोरु', lv.cattle?.total || 0, 'संख्या'),
        ind('buffalo', 'भैंसी राँगा', lv.buffalo?.total || 0, 'संख्या'),
        ind('goat', 'बाख्रा', lv.goat?.total || 0, 'संख्या'),
        ind('chicken', 'कुखुरा', pt.chicken?.total || 0, 'संख्या'),
        ind('milk', 'दूध उत्पादन', Math.round(sum(Object.values(lv).map((r) => r.milk_l)) * 10) / 10, 'लिटर'),
        ind('eggs', 'अण्डा उत्पादन', sum(Object.values(pt).map((r) => r.eggs)), 'संख्या'),
        ind('fish', 'माछा उत्पादन', fb.fish?.kg || 0, 'केजी'),
        ind('beehives', 'मौरी घार', fb.bee?.hives || 0, 'संख्या'),
      ];
    },
  },
  {
    id: 'disaster', title: 'विपद्', questions: ['q77'],
    indicators: (a, list) => {
      const affectedHh = list.filter((x) => (x.q77?.affected?.row?.total || 0) > 0).length;
      const t = field(a.q77, 'affected')?.total || {};
      const loss = field(a.q77, 'loss_estimate');
      const schoolAnswered = field(a.q77, 'school_risk')?.answered || 0;
      return [
        ind('affected_hh', 'पछिल्लो ३ वर्षमा प्रकोप प्रभावित घरधुरी', pct(affectedHh, list.length), '%', { count: affectedHh }),
        ind('affected_people', 'प्रकोप प्रभावित व्यक्ति', t.total || 0, 'जना'),
        ind('flood', 'बाढी प्रभावित', t.flood || 0, 'जना'),
        ind('landslide', 'पहिरो प्रभावित', t.landslide || 0, 'जना'),
        ind('loss', 'अनुमानित नोक्सानी', loss?.sum || 0, 'रु.'),
        ind('school_risk', 'विद्यालय जोखिममा भनेका घरधुरी', pct(schoolAnswered, list.length), '%'),
      ];
    },
  },
];

export const THEME_BY_ID = Object.fromEntries(THEMES.map((t) => [t.id, t]));

/** Build a complete theme report from a list of (computed) answers. */
export function buildThemeReport(themeId, list) {
  const theme = THEME_BY_ID[themeId];
  if (!theme) throw new Error(`unknown theme ${themeId}`);
  const raw = Object.fromEntries(theme.questions.map((qid) => [qid, aggregateQuestion(qById[qid], list)]));
  const indicators = theme.indicators(raw, list);
  return {
    theme: { id: theme.id, title: theme.title },
    households: list.length,
    indicators,
    questions: theme.questions.map((qid) => suppress(raw[qid])),
  };
}

// ------------------------------------------------------------------ dataset flattening
/**
 * Column definitions for a wide dataset (one row per household).
 * Repeat tables are summarised (row count + numeric sums); their detail rows go to long sheets.
 */
export function buildCodebook({ includeSensitive = false } = {}) {
  const cols = [];
  for (const q of questions) {
    if (q.sensitive && !includeSensitive) continue;
    for (const f of q.fields) {
      const base = { qid: q.id, no: q.no, question: q.title, field: f.label || '' };
      const key = `${q.id}.${f.key}`;
      switch (f.type) {
        case 'signature': break;
        case 'single':
          cols.push({ ...base, key, type: 'code', values: f.options.map((o) => `${o.value}=${o.label}`).join('; ') });
          if (f.options.some((o) => o.specify)) cols.push({ ...base, key: `${key}__other`, type: 'text', field: `${f.label || ''} (अन्य खुलाउने)` });
          break;
        case 'multi':
          f.options.forEach((o) => cols.push({ ...base, key: `${key}.${o.value}`, type: '0/1', field: `${f.label ? `${f.label}: ` : ''}${o.code}) ${o.label}` }));
          if (f.options.some((o) => o.specify)) cols.push({ ...base, key: `${key}__other`, type: 'text', field: `${f.label || ''} (अन्य खुलाउने)` });
          break;
        case 'grid':
          for (const r of f.rows) {
            if (r.specify) cols.push({ ...base, key: `${key}.${r.key}.__label`, type: 'text', field: `${f.label ? `${f.label} › ` : ''}${r.label} (नाम)` });
            for (const c of f.cols) cols.push({ ...base, key: `${key}.${r.key}.${c.key}`, type: c.type === 'check' ? '0/1' : c.type, field: `${f.label ? `${f.label} › ` : ''}${r.label} › ${c.group ? `${c.group} › ` : ''}${c.label}` });
          }
          break;
        case 'repeat':
          cols.push({ ...base, key: `${key}.#rows`, type: 'number', field: `${f.label || f.rowLabel || ''} (पंक्ति संख्या)` });
          for (const c of f.columns) if (c.type === 'number') cols.push({ ...base, key: `${key}.sum.${c.key}`, type: 'number', field: `जम्मा: ${c.group ? `${c.group} › ` : ''}${c.label}` });
          break;
        case 'groupedRepeat':
          for (const g of f.groups) {
            cols.push({ ...base, key: `${key}.${g.key}.area_ha`, type: 'number', field: `${g.label} › क्षेत्रफल (हेक्टर)` });
            cols.push({ ...base, key: `${key}.${g.key}.production`, type: 'number', field: `${g.label} › उत्पादन` });
          }
          break;
        default:
          cols.push({ ...base, key, type: f.type });
      }
    }
  }
  return cols;
}

const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

/** Flatten one household's answers into the codebook columns. */
export function flattenAnswers(answers, codebook) {
  const out = {};
  for (const c of codebook) {
    const [qid, fkey, ...rest] = c.key.split('.');
    const fv = answers?.[qid]?.[fkey.replace(/__other$/, '')];
    if (fkey.endsWith('__other')) { out[c.key] = answers?.[qid]?.[fkey] ?? ''; continue; }
    if (c.type === '0/1' && rest.length === 1 && Array.isArray(fv)) { out[c.key] = fv.includes(rest[0]) ? 1 : 0; continue; }
    if (c.type === '0/1' && rest.length === 1) { out[c.key] = fv === undefined ? '' : 0; continue; }
    if (rest[0] === '#rows') { out[c.key] = Array.isArray(fv) ? fv.length : 0; continue; }
    if (rest[0] === 'sum') { out[c.key] = Array.isArray(fv) ? sum(fv.map((r) => r[rest[1]])) : ''; continue; }
    if (rest.length === 2 && qById[qid].fields.find((f) => f.key === fkey)?.type === 'groupedRepeat') {
      out[c.key] = Array.isArray(fv?.[rest[0]]) ? sum(fv[rest[0]].map((r) => r[rest[1]])) : '';
      continue;
    }
    const v = rest.length ? getPath(fv, rest.join('.')) : fv;
    out[c.key] = c.type === '0/1' ? (v === true ? 1 : v === undefined ? '' : 0) : v ?? '';
  }
  return out;
}

/** Detail rows of repeatable tables (long format) for a household. */
export function repeatRows(answers, { includeSensitive = false } = {}) {
  const out = [];
  for (const q of questions) {
    if (q.sensitive && !includeSensitive) continue;
    for (const f of q.fields) {
      const v = answers?.[q.id]?.[f.key];
      if (f.type === 'repeat' && Array.isArray(v)) v.forEach((row, i) => out.push({ table: `${q.id}.${f.key}`, no: q.no, title: q.title, index: i + 1, row: Object.fromEntries(f.columns.map((c) => [c.label, row[c.key] ?? ''])) }));
      if (f.type === 'groupedRepeat' && v) {
        for (const g of f.groups) (v[g.key] || []).forEach((row, i) => out.push({ table: `${q.id}.${f.key}`, no: q.no, title: q.title, index: i + 1, row: { समूह: g.label, वाली: row.crop ?? '', 'क्षेत्रफल (हेक्टर)': row.area_ha ?? '', उत्पादन: row.production ?? '' } }));
      }
    }
  }
  return out;
}
