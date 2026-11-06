import { sealAnswers, openAnswers, sealQuestion } from '../services/crypto.js';
import { Router } from 'express';
import { z } from 'zod';
import ExcelJS from 'exceljs';
import { one, query, parseJson } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { badRequest } from '../middleware/errors.js';
import { audit } from '../services/audit.js';
import { wardScope } from '../services/scope.js';
import { themeTables } from '../services/reportTables.js';
import { THEMES, THEME_BY_ID, buildThemeReport, buildCodebook, flattenAnswers, repeatRows, SUPPRESS_BELOW, translate } from '../../../shared/index.js';

/**
 * Reports & exports (supervisor: own ward; admin: all).
 * Basis: which surveys count — 'approved' (default, final figures) or 'submitted' (approved + awaiting review).
 * Households marked as duplicates are always excluded.
 */
const router = Router();
router.use(requireRole('supervisor', 'admin'));

const filterSchema = z.object({
  ward_id: z.coerce.number().int().optional(),
  settlement_id: z.coerce.number().int().optional(),
  basis: z.enum(['approved', 'submitted']).default('approved'),
});
const STATUSES = { approved: ['approved'], submitted: ['approved', 'submitted'] };

function where(user, f, { withStatus = true } = {}) {
  const w = ['h.duplicate_of IS NULL']; const p = [];
  const scope = wardScope(user);
  if (scope !== null) { w.push('h.ward_id = ?'); p.push(scope); } else if (f.ward_id) { w.push('h.ward_id = ?'); p.push(f.ward_id); }
  if (f.settlement_id) { w.push('h.settlement_id = ?'); p.push(f.settlement_id); }
  if (withStatus) { w.push(`sv.status IN (${STATUSES[f.basis].map(() => '?').join(',')})`); p.push(...STATUSES[f.basis]); }
  return { sql: w.join(' AND '), params: p };
}

// ---- answers loader with a small cache invalidated by (count, last update)
const cache = new Map();
const CACHE_MAX = 30;
async function loadAnswers(user, f) {
  const w = where(user, f);
  const [sig] = await query(`SELECT COUNT(*) AS n, MAX(sv.updated_at) AS su, MAX(h.updated_at) AS hu FROM surveys sv JOIN households h ON h.id = sv.household_id WHERE ${w.sql}`, w.params);
  const key = JSON.stringify([w.sql, w.params]);
  const stamp = `${sig.n}|${sig.su?.toISOString?.() ?? sig.su}|${sig.hu?.toISOString?.() ?? sig.hu}`;
  const hit = cache.get(key);
  if (hit && hit.stamp === stamp) return hit.list;
  // signatures are large and never reported → strip them in SQL
  const rows = await query(`SELECT sv.id, JSON_REMOVE(sv.answers, '$.verify') AS answers FROM surveys sv JOIN households h ON h.id = sv.household_id WHERE ${w.sql}`, w.params);
  const list = rows.map((r) => openAnswers(parseJson(r.answers) || {}));
  cache.set(key, { stamp, list });
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return list;
}

const langOf = (req) => (req.query.lang === 'en' ? 'en' : 'ne');
async function filterLabel(user, f, lang = 'ne') {
  const scope = wardScope(user);
  const wardId = scope ?? f.ward_id;
  const ward = wardId ? await one('SELECT ward_no FROM wards WHERE id = ?', [wardId]) : null;
  const st = f.settlement_id ? await one('SELECT code, name FROM settlements WHERE id = ?', [f.settlement_id]) : null;
  if (lang === 'en') return [ward ? `Ward no. ${ward.ward_no}` : 'All wards', st ? `Settlement ${st.code} ${st.name}` : 'All settlements', f.basis === 'approved' ? 'Approved surveys only' : 'Approved + awaiting review'].join(' · ');
  return [ward ? `वडा नं. ${ward.ward_no}` : 'सबै वडा', st ? `बस्ती ${st.code} ${st.name}` : 'सबै बस्ती', f.basis === 'approved' ? 'स्वीकृत सर्वेक्षण मात्र' : 'स्वीकृत + समीक्षा बाँकी'].join(' · ');
}

// ---------------------------------------------------------------- overview
router.get('/overview', async (req, res) => {
  const f = filterSchema.parse(req.query);
  const scope = wardScope(req.user);
  const hw = ['h.duplicate_of IS NULL']; const hp = [];
  if (scope !== null) { hw.push('h.ward_id = ?'); hp.push(scope); } else if (f.ward_id) { hw.push('h.ward_id = ?'); hp.push(f.ward_id); }
  if (f.settlement_id) { hw.push('h.settlement_id = ?'); hp.push(f.settlement_id); }
  const W = hw.join(' AND ');

  const byWard = await query(
    `SELECT w.id AS ward_id, w.ward_no, COUNT(h.id) AS households,
       SUM(sv.id IS NOT NULL) AS started, SUM(sv.status = 'draft') AS draft, SUM(sv.status = 'submitted') AS submitted,
       SUM(sv.status = 'approved') AS approved, SUM(sv.status = 'rejected') AS rejected,
       SUM(CASE WHEN sv.status IN (${STATUSES[f.basis].map(() => '?').join(',')}) THEN COALESCE(JSON_EXTRACT(sv.answers, '$.q5.family_size'), 0) ELSE 0 END) AS population
     FROM households h JOIN wards w ON w.id = h.ward_id LEFT JOIN surveys sv ON sv.household_id = h.id AND sv.round_no = 1
     WHERE ${W} GROUP BY w.id, w.ward_no ORDER BY w.ward_no`, [...STATUSES[f.basis], ...hp]);
  const num = (v) => Number(v || 0);
  const wards = byWard.map((r) => ({ ward_id: r.ward_id, ward_no: r.ward_no, households: num(r.households), started: num(r.started), draft: num(r.draft),
    submitted: num(r.submitted), approved: num(r.approved), rejected: num(r.rejected), population: num(r.population) }));
  const totalKeys = ['households', 'started', 'draft', 'submitted', 'approved', 'rejected', 'population'];
  const totals = wards.reduce((t, r) => { for (const k of totalKeys) t[k] += r[k]; return t; }, Object.fromEntries(totalKeys.map((key) => [key, 0])));

  const daily = await query(
    `SELECT DATE(hst.created_at) AS day, hst.to_status AS status, COUNT(DISTINCT hst.survey_id) AS n
     FROM survey_status_history hst JOIN surveys sv ON sv.id = hst.survey_id JOIN households h ON h.id = sv.household_id
     WHERE ${W} AND hst.to_status IN ('submitted','approved') AND hst.created_at >= UTC_TIMESTAMP() - INTERVAL 30 DAY
     GROUP BY DATE(hst.created_at), hst.to_status ORDER BY day`, hp);
  const registeredDaily = await query(
    `SELECT DATE(h.created_at) AS day, COUNT(*) AS n
     FROM households h
     WHERE ${W} AND h.created_at >= UTC_TIMESTAMP() - INTERVAL 30 DAY
     GROUP BY DATE(h.created_at) ORDER BY day`, hp);
  const days = [];
  const householdDays = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    const pick = (s) => num(daily.find((r) => (r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day).slice(0, 10)) === d && r.status === s)?.n);
    days.push({ day: d, submitted: pick('submitted'), approved: pick('approved') });
    const registered = registeredDaily.find((r) => (r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day).slice(0, 10)) === d);
    householdDays.push({ day: d, registered: num(registered?.n) });
  }

  const list = await loadAnswers(req.user, f);
  const demo = buildThemeReport('demography', list);
  res.json({ data: { filter: await filterLabel(req.user, f), totals, wards, days, householdDays, demography: demo.indicators,
    pyramid: demo.questions.find((q) => q.id === 'q5').fields.find((x) => x.key === 'age_table'), generatedAt: new Date().toISOString() } });
});

// ---------------------------------------------------------------- themes
router.get('/themes', (req, res) => res.json({ data: THEMES.map((t) => ({ id: t.id, title: t.title, questions: t.questions })) }));

router.get('/theme/:id', async (req, res) => {
  const theme = THEME_BY_ID[req.params.id];
  if (!theme) throw badRequest('अज्ञात प्रतिवेदन');
  const f = filterSchema.parse(req.query);
  const list = await loadAnswers(req.user, f);
  res.json({ data: { ...buildThemeReport(theme.id, list), filter: await filterLabel(req.user, f), suppressBelow: SUPPRESS_BELOW, generatedAt: new Date().toISOString() } });
});

// ---------------------------------------------------------------- household-wise list
const hhSchema = filterSchema.extend({
  status: z.enum(['none', 'draft', 'submitted', 'approved', 'rejected', 'any']).default('any'),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});

async function householdRows(user, f, { limit, offset } = {}) {
  const w = where(user, f, { withStatus: false });
  const extra = []; const p = [...w.params];
  if (f.status === 'none') extra.push('sv.id IS NULL');
  else if (f.status !== 'any') { extra.push('sv.status = ?'); p.push(f.status); }
  if (f.q) { extra.push('(h.head_name LIKE ? OR h.household_code LIKE ?)'); p.push(`%${f.q}%`, `%${f.q}%`); }
  const W = [w.sql, ...extra].join(' AND ');
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM households h LEFT JOIN surveys sv ON sv.household_id = h.id AND sv.round_no = 1 WHERE ${W}`, p);
  const rows = await query(
    `SELECT h.household_code, h.head_name, h.head_gender, w.ward_no, s.code AS settlement_code, s.name AS settlement_name, h.house_no, h.family_no,
       sv.id AS survey_id, sv.status, sv.completion, u.full_name AS enumerator, sv.submitted_at, sv.reviewed_at, sv.gps_lat IS NOT NULL AS has_gps,
       JSON_EXTRACT(sv.answers, '$.q5.family_size') AS family_size,
       JSON_EXTRACT(sv.answers, '$.q5.age_table._total.female') AS female,
       JSON_EXTRACT(sv.answers, '$.q5.age_table._total.male') AS male,
       JSON_EXTRACT(sv.answers, '$.q5.age_table._total.third') AS third,
       JSON_UNQUOTE(JSON_EXTRACT(sv.answers, '$.q2.caste')) AS caste,
       JSON_UNQUOTE(JSON_EXTRACT(sv.answers, '$.q60.ans')) AS occupation
     FROM households h JOIN wards w ON w.id = h.ward_id JOIN settlements s ON s.id = h.settlement_id
     LEFT JOIN surveys sv ON sv.household_id = h.id AND sv.round_no = 1 LEFT JOIN users u ON u.id = sv.enumerator_id
     WHERE ${W} ORDER BY w.ward_no, s.code, h.house_no, h.family_no ${limit ? 'LIMIT ? OFFSET ?' : ''}`, limit ? [...p, limit, offset] : p);
  const n = (v) => (v === null || v === undefined ? null : Number(v));
  return { total: Number(total), rows: rows.map((r) => ({ ...r, family_size: n(r.family_size), female: n(r.female), male: n(r.male), third: n(r.third), completion: n(r.completion), has_gps: !!r.has_gps })) };
}

router.get('/households', async (req, res) => {
  const f = hhSchema.parse(req.query);
  const { total, rows } = await householdRows(req.user, f, { limit: f.pageSize, offset: (f.page - 1) * f.pageSize });
  res.json({ data: rows, total, page: f.page, pageSize: f.pageSize, filter: await filterLabel(req.user, f) });
});

// ---------------------------------------------------------------- exports
const STATUS_NE = { draft: 'मस्यौदा', submitted: 'पेश गरिएको', approved: 'स्वीकृत', rejected: 'फिर्ता' };
const GENDER_NE = { '१': 'महिला', '२': 'पुरुष', '३': 'तेस्रो लिङ्गी' };
const HH_COLUMNS = [
  ['household_code', 'घरधुरी ID'], ['head_name', 'परिवार मूली'], ['head_gender', 'लिङ्ग'], ['ward_no', 'वडा'], ['settlement_code', 'बस्ती कोड'],
  ['settlement_name', 'बस्ती'], ['house_no', 'घर क्र.सं.'], ['family_no', 'परिवार क्र.सं.'], ['family_size', 'परिवार संख्या'], ['female', 'महिला'],
  ['male', 'पुरुष'], ['third', 'तेस्रो लिङ्गी'], ['caste', 'जाति'], ['occupation', 'मुख्य पेशा (कोड)'], ['status', 'अवस्था'], ['completion', 'पूर्णता %'],
  ['enumerator', 'गणक'], ['has_gps', 'GPS'], ['submitted_at', 'पेश मिति'],
];
const HH_EN = { 'घरधुरी ID': 'Household ID', 'परिवार मूली': 'Household head', 'लिङ्ग': 'Sex', 'वडा': 'Ward', 'बस्ती कोड': 'Settlement code', 'बस्ती': 'Settlement',
  'घर क्र.सं.': 'House no.', 'परिवार क्र.सं.': 'Family no.', 'परिवार संख्या': 'Family size', 'महिला': 'Female', 'पुरुष': 'Male', 'तेस्रो लिङ्गी': 'Third gender', 'जाति': 'Caste/ethnicity',
  'मुख्य पेशा (कोड)': 'Main occupation (code)', 'अवस्था': 'Status', 'पूर्णता %': 'Completion %', 'गणक': 'Enumerator', 'GPS': 'GPS', 'पेश मिति': 'Submitted at' };
const hhValue = (r, k) => (k === 'status' ? (STATUS_NE[r.status] || 'सर्वेक्षण बाँकी') : k === 'head_gender' ? GENDER_NE[r.head_gender] || '' : k === 'has_gps' ? (r.has_gps ? 'छ' : 'छैन') : r[k] ?? '');
// note: values such as head names and settlement names are data and are never translated

const csvEscape = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
function sendCsv(res, filename, rows) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(`﻿${rows.map((r) => r.map(csvEscape).join(',')).join('\r\n')}`); // BOM so Excel shows Nepali correctly
}
async function sendXlsx(res, filename, wb) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await wb.xlsx.write(res);
  res.end();
}
const safeSheet = (name, used) => {
  let base = name.replace(/[[\]:*?/\\]/g, ' ').slice(0, 28) || 'Sheet';
  let n = base; let i = 2;
  while (used.has(n)) n = `${base.slice(0, 25)} ${i++}`;
  used.add(n); return n;
};
function newBook(user) {
  const wb = new ExcelJS.Workbook();
  wb.creator = `HHS MIS – ${user.username}`; wb.created = new Date();
  return wb;
}
function headerRow(ws, values) {
  const r = ws.addRow(values);
  r.font = { bold: true }; r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
  return r;
}
const stamp = () => new Date().toISOString().slice(0, 10);

router.get('/export/theme/:id.:fmt', async (req, res) => {
  const theme = THEME_BY_ID[req.params.id];
  if (!theme || !['xlsx', 'csv'].includes(req.params.fmt)) throw badRequest('अज्ञात प्रतिवेदन वा ढाँचा');
  const f = filterSchema.parse(req.query);
  const report = buildThemeReport(theme.id, await loadAnswers(req.user, f));
  const lang = langOf(req);
  const label = await filterLabel(req.user, f, lang);
  const tables = themeTables(report, lang);
  const themeTitle = translate(theme.title, lang);
  const hhLabel = lang === 'en' ? 'Households' : 'घरधुरी';
  await audit(req, 'report.export', 'report', theme.id, { format: req.params.fmt, filter: label });
  const fname = `report-${theme.id}-${stamp()}.${req.params.fmt}`;
  if (req.params.fmt === 'csv') {
    const rows = [[themeTitle], [label], [`${hhLabel}: ${report.households}`], []];
    for (const t of tables) { rows.push([t.title]); if (t.groupRow) rows.push(t.groupRow); rows.push(t.header, ...t.rows, []); }
    return sendCsv(res, fname, rows);
  }
  const wb = newBook(req.user); const used = new Set();
  const sheets = new Map();
  for (const t of tables) {
    let ws = sheets.get(t.sheet);
    if (!ws) {
      ws = wb.addWorksheet(safeSheet(t.sheet, used), { views: [{ rightToLeft: false }] });
      ws.addRow([themeTitle]).font = { bold: true, size: 13 };
      ws.addRow([label]).font = { italic: true, color: { argb: 'FF475569' } };
      ws.addRow([`${hhLabel}: ${report.households}`]);
      ws.columns = [{ width: 48 }, ...Array.from({ length: 30 }, () => ({ width: 14 }))];
      sheets.set(t.sheet, ws);
    }
    ws.addRow([]);
    ws.addRow([t.title]).font = { bold: true };
    if (t.groupRow) headerRow(ws, t.groupRow);
    headerRow(ws, t.header);
    t.rows.forEach((r) => ws.addRow(r));
  }
  return sendXlsx(res, fname, wb);
});

router.get('/export/households.:fmt', async (req, res) => {
  if (!['xlsx', 'csv'].includes(req.params.fmt)) throw badRequest('अज्ञात ढाँचा');
  const f = hhSchema.parse(req.query);
  const { rows } = await householdRows(req.user, f);
  await audit(req, 'report.export', 'report', 'households', { format: req.params.fmt, rows: rows.length });
  const lang = langOf(req);
  const header = HH_COLUMNS.map(([, l]) => (lang === 'en' ? HH_EN[l] || l : l));
  const body = rows.map((r) => HH_COLUMNS.map(([k]) => { const v = hhValue(r, k); return lang === 'en' && typeof v === 'string' ? translate(v, 'en') : v; }));
  const fname = `households-${stamp()}.${req.params.fmt}`;
  if (req.params.fmt === 'csv') return sendCsv(res, fname, [header, ...body]);
  const wb = newBook(req.user);
  const ws = wb.addWorksheet('घरधुरी सूची', { views: [{ state: 'frozen', ySplit: 1 }] });
  headerRow(ws, header); body.forEach((r) => ws.addRow(r));
  ws.columns.forEach((c, i) => { c.width = i === 1 ? 28 : 14; });
  ws.autoFilter = { from: 'A1', to: { row: 1, column: header.length } };
  return sendXlsx(res, fname, wb);
});

/** Full dataset (admin): one row per household + codebook + repeat tables. */
router.get('/export/dataset.:fmt', requireRole('admin'), async (req, res) => {
  if (!['xlsx', 'csv'].includes(req.params.fmt)) throw badRequest('अज्ञात ढाँचा');
  const f = filterSchema.extend({ include_sensitive: z.enum(['0', '1']).default('0') }).parse(req.query);
  const includeSensitive = f.include_sensitive === '1';
  const w = where(req.user, f);
  const rows = await query(`SELECT h.household_code, h.head_name, w.ward_no, s.code AS settlement_code, sv.status, sv.gps_lat, sv.gps_lng,
      JSON_REMOVE(sv.answers, '$.verify') AS answers FROM surveys sv JOIN households h ON h.id = sv.household_id
      JOIN wards w ON w.id = h.ward_id JOIN settlements s ON s.id = h.settlement_id WHERE ${w.sql} ORDER BY w.ward_no, s.code, h.house_no, h.family_no`, w.params);
  const codebook = buildCodebook({ includeSensitive });
  await audit(req, 'report.export_dataset', 'report', 'dataset', { format: req.params.fmt, rows: rows.length, include_sensitive: includeSensitive });
  const fixed = ['household_code', 'head_name', 'ward_no', 'settlement_code', 'status', 'gps_lat', 'gps_lng'];
  const header = [...fixed, ...codebook.map((c) => c.key)];
  const data = rows.map((r) => { const a = openAnswers(parseJson(r.answers) || {}); const flat = flattenAnswers(a, codebook); return { r, a, values: [...fixed.map((k) => r[k] ?? ''), ...codebook.map((c) => flat[c.key])] }; });
  const fname = `dataset${includeSensitive ? '-sensitive' : ''}-${stamp()}.${req.params.fmt}`;
  if (req.params.fmt === 'csv') return sendCsv(res, fname, [header, ...data.map((d) => d.values)]);
  // stream the workbook: large datasets never sit in memory as one object
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true, useSharedStrings: false });
  wb.creator = `HHS MIS – ${req.user.username}`;
  const ws = wb.addWorksheet('data', { views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }] });
  const h = ws.addRow(header); h.font = { bold: true }; h.commit();
  for (const d of data) ws.addRow(d.values).commit();
  await ws.commit();
  const cb = wb.addWorksheet('codebook');
  cb.columns = [{ width: 34 }, { width: 8 }, { width: 50 }, { width: 50 }, { width: 8 }, { width: 60 }];
  const ch = cb.addRow(['column', 'प्रश्न नं.', 'प्रश्न', 'विवरण', 'प्रकार', 'मान/कोड']); ch.font = { bold: true }; ch.commit();
  const lang = langOf(req);
  const T = (x) => translate(x, lang);
  // codebook labels look like "row › group › column" or "label: क) option" — translate each part, keep option codes
  const part = (seg) => { const m = /^(\S+\) )?(.*)$/s.exec(seg); return `${m[1] || ''}${T(m[2])}`; };
  const tField = (x) => (lang === 'en' ? String(x).split(' › ').map((seg) => seg.split(': ').map(part).join(': ')).join(' › ') : x);
  [...fixed.map((k) => [k, '', '', '', '', '']), ...codebook.map((c) => [c.key, c.no, T(c.question), tField(c.field), c.type,
    lang === 'en' ? (c.values || '').split('; ').map((v) => { const [code, ...rest] = v.split('='); return rest.length ? `${code}=${T(rest.join('='))}` : v; }).join('; ') : c.values || ''])].forEach((r) => cb.addRow(r).commit());
  await cb.commit();
  const long = new Map();
  for (const d of data) for (const rr of repeatRows(d.a, { includeSensitive })) {
    if (!long.has(rr.table)) long.set(rr.table, { title: rr.title, no: rr.no, rows: [] });
    long.get(rr.table).rows.push({ household_code: d.r.household_code, index: rr.index, ...rr.row });
  }
  const used = new Set(['data', 'codebook']);
  for (const [table, t] of long) {
    const sh = wb.addWorksheet(safeSheet(table, used));
    const cols = Object.keys(t.rows[0]);
    const tt = sh.addRow([`प्रश्न ${t.no}. ${t.title}`]); tt.font = { bold: true }; tt.commit();
    const hr = sh.addRow(cols); hr.font = { bold: true }; hr.commit();
    t.rows.forEach((row) => sh.addRow(cols.map((c) => row[c])).commit());
    await sh.commit();
  }
  await wb.commit();
});

export default router;
