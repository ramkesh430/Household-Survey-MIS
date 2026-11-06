/**
 * Turns a theme report into plain tables (title + header + rows) so the same
 * content can be written to Excel, CSV or shown on screen.
 */
import { SUPPRESS_BELOW, translate } from '../../../shared/index.js';

const SUPPRESSED = `<${SUPPRESS_BELOW}`;
const cell = (v) => (v === null ? SUPPRESSED : v);
const pct = (n, d) => (n === null ? '' : d > 0 ? Math.round((n / d) * 1000) / 10 : '');

export function themeTables(report, lang = 'ne') {
  const T = (x) => (typeof x === 'string' ? translate(x, lang) : x);
  const en = lang === 'en';
  const tables = [];
  tables.push({
    title: `${T(report.theme.title)} — ${en ? 'Key indicators' : 'मुख्य सूचक'}`,
    sheet: en ? 'Key indicators' : 'मुख्य सूचक',
    header: en ? ['Indicator', 'Value', 'Unit'] : ['सूचक', 'मान', 'एकाइ'],
    rows: report.indicators.map((i) => [T(i.label), cell(i.value), T(i.unit || '')]),
  });
  for (const q of report.questions) {
    const qTitle = `${q.no ? `${en ? 'Question' : 'प्रश्न'} ${q.no}. ` : ''}${T(q.title)}${q.suppressed ? (en ? ` (sensitive: counts below ${SUPPRESS_BELOW} hidden)` : ` (संवेदनशील: ${SUPPRESS_BELOW} भन्दा कम संख्या लुकाइएको)`) : ''}`;
    for (const f of q.fields) {
      const title = f.label ? `${qTitle} — ${T(f.label)}` : qTitle;
      const sheet = `${en ? 'Q' : 'प्र.'}${q.no || q.id}`;
      const base = { title, sheet, eligible: f.eligible, answered: f.answered };
      if (f.counts) {
        tables.push({ ...base, header: en ? ['Code', 'Option', 'Households', `% (of ${f.answered} answering)`] : ['कोड', 'विकल्प', 'घरधुरी', `% (उत्तर दिएका ${f.answered} मध्ये)`],
          rows: f.counts.map((c) => [c.code, T(c.label), cell(c.n), pct(c.n, f.answered)]) });
      } else if (f.cells) {
        const cols = f.cols;
        const groupRow = cols.some((c) => c.group) ? ['', ...cols.map((c) => T(c.group || ''))] : null;
        tables.push({ ...base, groupRow, header: [en ? 'Item' : 'विवरण', ...cols.map((c) => T(c.label))],
          rows: [
            ...f.rows.map((r) => [T(r.label), ...cols.map((c) => cell(f.cells[r.key][c.key]))]),
            [en ? 'Total' : 'जम्मा', ...cols.map((c) => (c.noTotal ? '' : cell(f.total[c.key])))],
          ] });
        for (const [rk, vals] of Object.entries(f.otherLabels || {})) {
          if (vals.length) tables.push({ ...base, title: `${title} — "${T(f.rows.find((r) => r.key === rk)?.label)}" ${en ? 'specified' : 'मा खुलाइएका'}`, header: en ? ['Name', 'Households'] : ['नाम', 'घरधुरी'], rows: vals.map((v) => [v.value, v.n]) });
        }
      } else if (f.sums) {
        const numCols = f.columns.filter((c) => c.type === 'number');
        tables.push({ ...base, header: en ? ['Item', 'Value'] : ['विवरण', 'मान'], rows: [
          [en ? 'Households with details' : 'विवरण भएका घरधुरी', cell(f.households)], [en ? 'Total rows' : 'जम्मा पंक्ति', cell(f.rows)],
          ...numCols.map((c) => [`${en ? 'Total' : 'जम्मा'}: ${c.group ? `${T(c.group)} › ` : ''}${T(c.label)}`, cell(f.sums[c.key])]),
        ] });
        for (const [ck, counts] of Object.entries(f.selects || {})) {
          const col = f.columns.find((c) => c.key === ck);
          tables.push({ ...base, title: `${title} — ${T(col.label)}`, header: en ? ['Option', 'Count'] : ['विकल्प', 'संख्या'], rows: counts.map((c) => [T(c.label), cell(c.n)]) });
        }
      } else if (f.groups) {
        tables.push({ ...base, header: en ? ['Group', 'Households', 'Rows', 'Area (hectare)', 'Production', 'Main crops'] : ['समूह', 'घरधुरी', 'पंक्ति', 'क्षेत्रफल (हेक्टर)', 'उत्पादन', 'मुख्य बाली'],
          rows: Object.values(f.groups).map((g) => [T(g.label), g.households, g.rows, Math.round(g.area_ha * 100) / 100, Math.round(g.production * 100) / 100, g.crops.map((c) => `${c.value} (${c.n})`).join(', ')]) });
      } else if ('sum' in f) {
        const L = en ? ['Statistic', 'Value', 'Answered', 'Total', 'Mean', 'Minimum', 'Maximum'] : ['तथ्यांक', 'मान', 'उत्तर दिएका', 'जम्मा', 'औसत', 'न्यूनतम', 'अधिकतम'];
        tables.push({ ...base, header: [L[0], L[1]], rows: [[L[2], f.answered], [L[3], cell(f.sum)], [L[4], f.mean === null ? '' : Math.round(f.mean * 100) / 100], [L[5], f.min ?? ''], [L[6], f.max ?? '']] });
      } else if (f.top) {
        tables.push({ ...base, header: en ? ['Answer', 'Households'] : ['उत्तर', 'घरधुरी'], rows: f.top.map((t) => [t.value, t.n]) });
      }
    }
  }
  return tables;
}
