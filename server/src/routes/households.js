import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { one, query } from '../db.js';
import { notFound, conflict, badRequest } from '../middleware/errors.js';
import { audit } from '../services/audit.js';
import { wardScope, assertWardAccess } from '../services/scope.js';
import { householdCode } from '../services/householdCode.js';
import { possibleDuplicates } from './quality.js';

const router = Router();

const SELECT = `SELECT h.*, w.ward_no, s.code AS settlement_code, s.name AS settlement_name,
  sv.id AS survey_id, sv.status AS survey_status, sv.completion AS survey_completion, u.full_name AS created_by_name
  FROM households h
  JOIN wards w ON w.id = h.ward_id
  JOIN settlements s ON s.id = h.settlement_id
  JOIN users u ON u.id = h.created_by
  LEFT JOIN surveys sv ON sv.household_id = h.id AND sv.round_no = 1`;

router.get('/', async (req, res) => {
  const q = z.object({
    ward_id: z.coerce.number().int().optional(),
    settlement_id: z.coerce.number().int().optional(),
    status: z.enum(['none', 'draft', 'submitted', 'approved', 'rejected']).optional(),
    q: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(25),
  }).parse(req.query);
  const where = []; const params = [];
  const scope = wardScope(req.user);
  if (scope !== null) { where.push('h.ward_id = ?'); params.push(scope); }
  else if (q.ward_id) { where.push('h.ward_id = ?'); params.push(q.ward_id); }
  if (q.settlement_id) { where.push('h.settlement_id = ?'); params.push(q.settlement_id); }
  if (q.status === 'none') where.push('sv.id IS NULL');
  else if (q.status) { where.push('sv.status = ?'); params.push(q.status); }
  if (q.q) { where.push('(h.head_name LIKE ? OR h.household_code LIKE ?)'); params.push(`%${q.q}%`, `%${q.q}%`); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM households h LEFT JOIN surveys sv ON sv.household_id = h.id AND sv.round_no = 1 ${w}`, params);
  const rows = await query(`${SELECT} ${w} ORDER BY w.ward_no, s.code, h.house_no, h.family_no LIMIT ? OFFSET ?`,
    [...params, q.pageSize, (q.page - 1) * q.pageSize]);
  res.json({ data: rows, page: q.page, pageSize: q.pageSize, total: Number(total) });
});

router.get('/:id', async (req, res) => {
  const id = z.coerce.number().int().parse(req.params.id);
  const h = await one(`${SELECT} WHERE h.id = ?`, [id]);
  if (!h) throw notFound('घरधुरी फेला परेन');
  assertWardAccess(req.user, h.ward_id);
  res.json({ data: h });
});

const body = z.object({
  uuid: z.string().uuid().optional(),
  settlement_id: z.number().int().positive(),
  house_no: z.number().int().min(1).max(99999),
  family_no: z.number().int().min(1).max(99),
  head_name: z.string().trim().min(2).max(150),
  head_gender: z.enum(['१', '२', '३']).optional().nullable(),
  phone: z.string().trim().regex(/^[0-9+\- ]{0,20}$/, 'अमान्य फोन नम्बर').optional().nullable(),
});

router.post('/', async (req, res) => {
  const b = body.parse(req.body);
  const s = await one('SELECT s.*, w.ward_no, w.is_active AS ward_is_active FROM settlements s JOIN wards w ON w.id = s.ward_id WHERE s.id = ?', [b.settlement_id]);
  if (!s || !s.is_active || !s.ward_is_active) throw badRequest('वडा वा बस्ती फेला परेन वा निष्क्रिय छ');
  assertWardAccess(req.user, s.ward_id);
  if (b.uuid) {
    const existingUuid = await one(`${SELECT} WHERE h.uuid = ?`, [b.uuid]);
    if (existingUuid) return res.status(200).json({ data: existingUuid, idempotent: true });
  }
  const dup = await one(`${SELECT} WHERE h.settlement_id = ? AND h.house_no = ? AND h.family_no = ?`, [b.settlement_id, b.house_no, b.family_no]);
  if (dup) throw conflict('यही बस्ती, घर क्र.सं. र परिवार क्र.सं. भएको घरधुरी पहिले नै दर्ता छ', { existing: dup });
  const code = householdCode({ wardNo: s.ward_no, settlementCode: s.code, houseNo: b.house_no, familyNo: b.family_no });
  const r = await query(
    `INSERT INTO households (uuid, household_code, ward_id, settlement_id, house_no, family_no, head_name, head_gender, phone, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [b.uuid || crypto.randomUUID(), code, s.ward_id, s.id, b.house_no, b.family_no, b.head_name, b.head_gender || null, b.phone || null, req.user.id],
  );
  await audit(req, 'household.create', 'household', r.insertId, { household_code: code });
  const created = await one(`${SELECT} WHERE h.id = ?`, [r.insertId]);
  // non-blocking: tell the client about similar households already registered (fuzzy name / phone)
  const possible_duplicates = await possibleDuplicates(created);
  res.status(201).json({ data: created, possible_duplicates });
});

router.patch('/:id', async (req, res) => {
  const id = z.coerce.number().int().parse(req.params.id);
  const b = body.pick({ head_name: true, head_gender: true, phone: true }).partial().parse(req.body);
  const h = await one(`${SELECT} WHERE h.id = ?`, [id]);
  if (!h) throw notFound('घरधुरी फेला परेन');
  assertWardAccess(req.user, h.ward_id);
  if (req.user.role === 'enumerator' && h.created_by !== req.user.id) throw badRequest('अर्को गणकले दर्ता गरेको घरधुरी सम्पादन गर्न मिल्दैन');
  if (h.survey_status && ['submitted', 'approved'].includes(h.survey_status) && req.user.role === 'enumerator') {
    throw badRequest('पेश भइसकेको सर्वेक्षणको घरधुरी विवरण सम्पादन गर्न मिल्दैन');
  }
  await query('UPDATE households SET head_name = ?, head_gender = ?, phone = ? WHERE id = ?',
    [b.head_name ?? h.head_name, b.head_gender !== undefined ? b.head_gender : h.head_gender, b.phone !== undefined ? b.phone : h.phone, id]);
  await audit(req, 'household.update', 'household', id, b);
  res.json({ data: await one(`${SELECT} WHERE h.id = ?`, [id]) });
});

export default router;
