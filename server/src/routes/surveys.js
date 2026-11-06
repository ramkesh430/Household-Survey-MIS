import { sealAnswers, openAnswers, sealQuestion } from '../services/crypto.js';
import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { one, query, tx, parseJson } from '../db.js';
import { notFound, conflict, unprocessable, forbidden, badRequest } from '../middleware/errors.js';
import { audit } from '../services/audit.js';
import { wardScope, assertWardAccess, assertSurveyAccess } from '../services/scope.js';
import { FORM_ID, FORM_VERSION, validate, completion } from '../../../shared/index.js';

const router = Router();

const SELECT = `SELECT sv.*, h.household_code, h.ward_id, h.settlement_id, h.house_no, h.family_no, h.head_name, h.head_gender,
  w.ward_no, s.code AS settlement_code, s.name AS settlement_name, u.full_name AS enumerator_name
  FROM surveys sv
  JOIN households h ON h.id = sv.household_id
  JOIN wards w ON w.id = h.ward_id
  JOIN settlements s ON s.id = h.settlement_id
  JOIN users u ON u.id = sv.enumerator_id`;

const EDITABLE = ['draft', 'rejected'];

function present(row, { includeAnswers = true } = {}) {
  if (!row) return row;
  const out = { ...row, completion: Number(row.completion) };
  out.review_notes = parseJson(row.review_notes) || null;
  if (includeAnswers) out.answers = openAnswers(parseJson(row.answers) || {});
  else delete out.answers;
  return out;
}

/** Authoritative header block (page 1) is always taken from the registered household. */
function headerFrom(h) {
  return {
    ward_no: h.ward_no, settlement_code: h.settlement_code, settlement_name: h.settlement_name,
    house_no: h.house_no, family_no: h.family_no,
  };
}

async function loadSurvey(id, conn) {
  const row = await one(`${SELECT} WHERE sv.id = ?`, [id], conn);
  if (!row) throw notFound('सर्वेक्षण फेला परेन');
  return row;
}

async function persistAnswers(conn, surveyId, answers) {
  await query('DELETE FROM survey_answers WHERE survey_id = ?', [surveyId], conn);
  const entries = Object.entries(answers).filter(([, v]) => v && typeof v === 'object');
  if (entries.length) {
    await query('INSERT INTO survey_answers (survey_id, question_id, answer) VALUES ?',
      [entries.map(([k, v]) => [surveyId, k, JSON.stringify(sealQuestion(k, v))])], conn);
  }
}

const gpsSchema = z.object({
  lat: z.number().min(26).max(31),
  lng: z.number().min(80).max(89),
  accuracy: z.number().min(0).max(100000).optional().nullable(),
  captured_at: z.string().datetime().optional(),
}).nullable().optional();

const answersSchema = z.record(z.string(), z.any()).refine((v) => JSON.stringify(v).length < 1_500_000, 'उत्तर डाटा धेरै ठूलो भयो');

// ---------- list ----------
router.get('/', async (req, res) => {
  const q = z.object({
    status: z.enum(['draft', 'submitted', 'approved', 'rejected']).optional(),
    ward_id: z.coerce.number().int().optional(),
    settlement_id: z.coerce.number().int().optional(),
    enumerator_id: z.coerce.number().int().optional(),
    q: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(25),
  }).parse(req.query);
  const where = []; const params = [];
  const scope = wardScope(req.user);
  if (scope !== null) { where.push('h.ward_id = ?'); params.push(scope); }
  else if (q.ward_id) { where.push('h.ward_id = ?'); params.push(q.ward_id); }
  if (req.user.role === 'enumerator') { where.push('sv.enumerator_id = ?'); params.push(req.user.id); }
  else if (q.enumerator_id) { where.push('sv.enumerator_id = ?'); params.push(q.enumerator_id); }
  if (q.status) { where.push('sv.status = ?'); params.push(q.status); }
  if (q.settlement_id) { where.push('h.settlement_id = ?'); params.push(q.settlement_id); }
  if (q.q) { where.push('(h.head_name LIKE ? OR h.household_code LIKE ?)'); params.push(`%${q.q}%`, `%${q.q}%`); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM surveys sv JOIN households h ON h.id = sv.household_id ${w}`, params);
  const rows = await query(`${SELECT} ${w} ORDER BY sv.updated_at DESC LIMIT ? OFFSET ?`, [...params, q.pageSize, (q.page - 1) * q.pageSize]);
  res.json({ data: rows.map((r) => present(r, { includeAnswers: false })), page: q.page, pageSize: q.pageSize, total: Number(total) });
});

router.get('/stats', async (req, res) => {
  const where = []; const params = [];
  const scope = wardScope(req.user);
  if (scope !== null) { where.push('h.ward_id = ?'); params.push(scope); }
  if (req.user.role === 'enumerator') { where.push('sv.enumerator_id = ?'); params.push(req.user.id); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await query(`SELECT sv.status, COUNT(*) AS n FROM surveys sv JOIN households h ON h.id = sv.household_id ${w} GROUP BY sv.status`, params);
  const hhWhere = scope !== null ? 'WHERE ward_id = ?' : '';
  const [{ households }] = await query(`SELECT COUNT(*) AS households FROM households ${hhWhere}`, scope !== null ? [scope] : []);
  const byStatus = { draft: 0, submitted: 0, approved: 0, rejected: 0 };
  rows.forEach((r) => { byStatus[r.status] = Number(r.n); });
  res.json({ data: { households: Number(households), surveys: byStatus } });
});

// ---------- create ----------
router.post('/', async (req, res) => {
  if (req.user.role === 'supervisor') throw forbidden('सर्वेक्षण गणक वा प्रशासकले मात्र सुरु गर्न सक्छन्');
  const b = z.object({
    household_id: z.number().int().positive().optional(),
    household_uuid: z.string().uuid().optional(),
    uuid: z.string().uuid().optional(),
  }).refine((x) => x.household_id || x.household_uuid, 'household_id वा household_uuid आवश्यक छ').parse(req.body);
  if (b.uuid) {
    const byUuid = await one(`${SELECT} WHERE sv.uuid = ?`, [b.uuid]);
    if (byUuid) { assertSurveyAccess(req.user, byUuid); return res.status(200).json({ data: present(byUuid), idempotent: true }); }
  }
  const h = await one(`SELECT h.*, w.ward_no, s.code AS settlement_code, s.name AS settlement_name
    FROM households h JOIN wards w ON w.id = h.ward_id JOIN settlements s ON s.id = h.settlement_id
    WHERE ${b.household_id ? 'h.id = ?' : 'h.uuid = ?'}`, [b.household_id || b.household_uuid]);
  if (!h) throw notFound('घरधुरी फेला परेन');
  assertWardAccess(req.user, h.ward_id);
  const existing = await one('SELECT id, status, enumerator_id FROM surveys WHERE household_id = ? AND round_no = 1', [h.id]);
  if (existing) throw conflict('यस घरधुरीको सर्वेक्षण पहिले नै सुरु भइसकेको छ', { survey_id: existing.id, status: existing.status });

  const answers = { hdr: headerFrom(h), q1: { head_name: h.head_name, ...(h.head_gender ? { head_gender: h.head_gender } : {}) } };
  const id = await tx(async (conn) => {
    const r = await query(
      `INSERT INTO surveys (uuid, household_id, form_id, form_version, status, answers, completion, enumerator_id)
       VALUES (?,?,?,?, 'draft', ?, ?, ?)`,
      [b.uuid || crypto.randomUUID(), h.id, FORM_ID, FORM_VERSION, JSON.stringify(sealAnswers(answers)), (completion(answers) * 100).toFixed(2), req.user.id], conn);
    await persistAnswers(conn, r.insertId, answers);
    await query('INSERT INTO survey_status_history (survey_id, from_status, to_status, user_id) VALUES (?,?,?,?)', [r.insertId, null, 'draft', req.user.id], conn);
    return r.insertId;
  });
  await audit(req, 'survey.create', 'survey', id, { household_id: h.id });
  res.status(201).json({ data: present(await loadSurvey(id)) });
});

// ---------- read ----------
router.get('/:id', async (req, res) => {
  const id = z.coerce.number().int().parse(req.params.id);
  const s = await loadSurvey(id);
  assertSurveyAccess(req.user, s);
  const out = present(s);
  // reading another person's survey exposes sensitive answers → leave a trace
  if (s.enumerator_id !== req.user.id) await audit(req, 'survey.view', 'survey', id, { role: req.user.role });
  const { warnings } = validate(out.answers, { mode: 'draft' });
  res.json({ data: out, warnings });
});

router.get('/:id/history', async (req, res) => {
  const id = z.coerce.number().int().parse(req.params.id);
  const s = await loadSurvey(id);
  assertSurveyAccess(req.user, s);
  const rows = await query(`SELECT hst.*, u.full_name AS user_name FROM survey_status_history hst JOIN users u ON u.id = hst.user_id
    WHERE hst.survey_id = ? ORDER BY hst.id`, [id]);
  res.json({ data: rows.map((r) => ({ ...r, details: parseJson(r.details) })) });
});

// ---------- save draft / submit ----------
async function saveSurvey(req, mode) {
  const id = z.coerce.number().int().parse(req.params.id);
  const b = z.object({
    answers: answersSchema, version: z.number().int().positive(), gps: gpsSchema,
    op_id: z.string().uuid().optional(), client_updated_at: z.string().datetime().optional(),
  }).parse(req.body);
  return tx(async (conn) => {
    const s = await one(`${SELECT} WHERE sv.id = ? FOR UPDATE`, [id], conn);
    if (!s) throw notFound('सर्वेक्षण फेला परेन');
    assertSurveyAccess(req.user, s);
    if (b.op_id && s.last_op_id === b.op_id) {
      // retry of an operation that was already applied (e.g. response lost offline)
      return { data: present(s), warnings: validate(present(s).answers, { mode: 'draft' }).warnings, idempotent: true };
    }
    if (req.user.role === 'supervisor') throw forbidden('सुपरभाइजरले गणकको फारम सम्पादन गर्न सक्दैनन् (समीक्षा चरण ३ मा)');
    if (!EDITABLE.includes(s.status)) throw badRequest(`"${s.status}" अवस्थाको सर्वेक्षण सम्पादन गर्न मिल्दैन`);
    if (s.version !== b.version) {
      throw conflict('यो फारम अर्को उपकरण/सत्रबाट परिवर्तन भइसकेको छ। पछिल्लो संस्करण लोड गर्नुहोस्।', { currentVersion: s.version });
    }
    const input = { ...b.answers, hdr: headerFrom(s) };
    const role = req.user.role === 'admin' ? 'admin' : 'enumerator';
    const result = validate(input, { mode, role });
    if (result.errors.length) {
      throw unprocessable(mode === 'submit' ? 'फारम अपूर्ण वा त्रुटिपूर्ण छ' : 'केही उत्तर अमान्य छन्', { errors: result.errors, warnings: result.warnings });
    }
    const answers = result.answers;
    const pct = (completion(answers) * 100).toFixed(2);
    const newStatus = mode === 'submit' ? 'submitted' : s.status;
    const gps = b.gps;
    await query(
      `UPDATE surveys SET answers = ?, completion = ?, warning_count = ?, status = ?, version = version + 1,
         last_op_id = ?, client_updated_at = ?,
         submitted_at = ${mode === 'submit' ? 'NOW()' : 'submitted_at'}
         ${gps ? ', gps_lat = ?, gps_lng = ?, gps_accuracy_m = ?, gps_captured_at = ?' : ''}
       WHERE id = ?`,
      [JSON.stringify(sealAnswers(answers)), pct, result.warnings.length, newStatus, b.op_id || null,
        b.client_updated_at ? new Date(b.client_updated_at) : null,
        ...(gps ? [gps.lat, gps.lng, gps.accuracy ?? null, gps.captured_at ? new Date(gps.captured_at) : new Date()] : []), id],
      conn,
    );
    await persistAnswers(conn, id, answers);
    if (mode === 'submit' && answers.q1?.head_name) {
      // keep the household register in sync with the confirmed answers of Q1
      await query('UPDATE households SET head_name = ?, head_gender = ? WHERE id = ?', [answers.q1.head_name, answers.q1.head_gender || null, s.household_id], conn);
    }
    if (newStatus !== s.status) {
      await query('INSERT INTO survey_status_history (survey_id, from_status, to_status, user_id) VALUES (?,?,?,?)', [id, s.status, newStatus, req.user.id], conn);
    }
    await audit(req, mode === 'submit' ? 'survey.submit' : 'survey.save', 'survey', id, { version: s.version + 1, completion: Number(pct) }, conn);
    const saved = present(await one(`${SELECT} WHERE sv.id = ?`, [id], conn));
    return { data: saved, warnings: result.warnings };
  });
}

router.put('/:id', async (req, res) => res.json(await saveSurvey(req, 'draft')));
router.post('/:id/submit', async (req, res) => res.json(await saveSurvey(req, 'submit')));

// ---------- validate without saving (used by the client before submit) ----------
router.post('/validate', async (req, res) => {
  const b = z.object({ answers: answersSchema, mode: z.enum(['draft', 'submit']).default('submit') }).parse(req.body);
  const { errors, warnings } = validate(b.answers, { mode: b.mode, role: req.user.role === 'admin' ? 'admin' : 'enumerator' });
  res.json({ errors, warnings, completion: completion(b.answers) });
});

export default router;
