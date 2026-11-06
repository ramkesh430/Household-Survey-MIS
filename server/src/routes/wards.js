import { Router } from 'express';
import { z } from 'zod';
import { one, query, tx } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { notFound, badRequest } from '../middleware/errors.js';
import { audit } from '../services/audit.js';
import { assertWardAccess, wardScope } from '../services/scope.js';

const router = Router();

router.get('/', async (req, res) => {
  const scope = wardScope(req.user);
  const rows = await query(
    `SELECT w.*, (SELECT COUNT(*) FROM settlements s WHERE s.ward_id = w.id) AS settlement_count,
       (SELECT COUNT(*) FROM households h WHERE h.ward_id = w.id) AS household_count
     FROM wards w ${scope !== null ? 'WHERE w.id = ?' : ''} ORDER BY w.ward_no`, scope !== null ? [scope] : []);
  res.json({ data: rows.map((r) => ({ ...r, is_active: !!r.is_active })) });
});

const wardBody = z.object({
  ward_no: z.number().int().min(1).max(99),
  name: z.string().trim().max(150).optional().nullable(),
  office_address: z.string().trim().max(255).optional().nullable(),
  is_active: z.boolean().optional(),
});

router.post('/', requireRole('admin'), async (req, res) => {
  const b = wardBody.parse(req.body);
  const r = await query('INSERT INTO wards (ward_no, name, office_address) VALUES (?,?,?)', [b.ward_no, b.name || null, b.office_address || null]);
  await audit(req, 'ward.create', 'ward', r.insertId, b);
  res.status(201).json({ data: await one('SELECT * FROM wards WHERE id = ?', [r.insertId]) });
});

router.patch('/:id', requireRole('admin'), async (req, res) => {
  const id = z.coerce.number().int().parse(req.params.id);
  const b = wardBody.partial().parse(req.body);
  const w = await one('SELECT * FROM wards WHERE id = ?', [id]);
  if (!w) throw notFound('वडा फेला परेन');
  await query('UPDATE wards SET ward_no = ?, name = ?, office_address = ?, is_active = ? WHERE id = ?',
    [b.ward_no ?? w.ward_no, b.name !== undefined ? b.name : w.name, b.office_address !== undefined ? b.office_address : w.office_address, b.is_active ?? !!w.is_active, id]);
  await audit(req, 'ward.update', 'ward', id, b);
  res.json({ data: await one('SELECT * FROM wards WHERE id = ?', [id]) });
});

router.get('/:id/settlements', async (req, res) => {
  const id = z.coerce.number().int().parse(req.params.id);
  const scope = wardScope(req.user);
  if (scope !== null && scope !== id) return res.json({ data: [] });
  const rows = await query(
    `SELECT s.*, (SELECT COUNT(*) FROM households h WHERE h.settlement_id = s.id) AS household_count
     FROM settlements s WHERE s.ward_id = ? ORDER BY s.code`, [id]);
  res.json({ data: rows.map((r) => ({ ...r, is_active: !!r.is_active })) });
});

const settlementBody = z.object({
  ward_id: z.number().int().positive(),
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(150),
  is_active: z.boolean().optional(),
});

export const settlementsRouter = Router();
settlementsRouter.post('/', requireRole('admin', 'supervisor', 'enumerator'), async (req, res) => {
  const b = z.object({
    ward_id: z.number().int().positive().optional(),
    code: z.string().trim().min(1).max(20).optional(),
    name: z.string().trim().min(1).max(150),
  }).parse(req.body);
  const scope = wardScope(req.user);
  if (scope !== null && b.ward_id !== undefined) assertWardAccess(req.user, b.ward_id);
  if (scope !== null && b.code !== undefined) throw badRequest('बस्ती कोड प्रणालीले स्वतः बनाउँछ');
  const wardId = scope ?? b.ward_id;
  if (!wardId) throw badRequest('वडा छान्नुहोस्');

  const settlement = await tx(async (conn) => {
    const ward = await one('SELECT id FROM wards WHERE id = ? AND is_active = 1 FOR UPDATE', [wardId], conn);
    if (!ward) throw notFound('सक्रिय वडा फेला परेन');
    let code = b.code;
    if (!code) {
      const rows = await query('SELECT code FROM settlements WHERE ward_id = ?', [wardId], conn);
      const highest = rows.reduce((max, row) => {
        const match = /^S(\d+)$/i.exec(row.code);
        return match ? Math.max(max, Number(match[1])) : max;
      }, 0);
      code = `S${String(highest + 1).padStart(2, '0')}`;
    }
    const result = await query('INSERT INTO settlements (ward_id, code, name) VALUES (?,?,?)', [wardId, code, b.name], conn);
    return one('SELECT * FROM settlements WHERE id = ?', [result.insertId], conn);
  });
  await audit(req, 'settlement.create', 'settlement', settlement.id, { ward_id: wardId, code: settlement.code, name: settlement.name });
  res.status(201).json({ data: settlement });
});
settlementsRouter.patch('/:id', requireRole('admin'), async (req, res) => {
  const id = z.coerce.number().int().parse(req.params.id);
  const b = settlementBody.omit({ ward_id: true }).partial().parse(req.body);
  const s = await one('SELECT * FROM settlements WHERE id = ?', [id]);
  if (!s) throw notFound('बस्ती फेला परेन');
  if (b.code && b.code !== s.code && (await one('SELECT id FROM households WHERE settlement_id = ? LIMIT 1', [id]))) {
    throw badRequest('घरधुरी दर्ता भइसकेको बस्तीको कोड परिवर्तन गर्न मिल्दैन (घरधुरी ID स्थिर रहनुपर्छ)');
  }
  await query('UPDATE settlements SET code = ?, name = ?, is_active = ? WHERE id = ?', [b.code ?? s.code, b.name ?? s.name, b.is_active ?? !!s.is_active, id]);
  await audit(req, 'settlement.update', 'settlement', id, b);
  res.json({ data: await one('SELECT * FROM settlements WHERE id = ?', [id]) });
});

export default router;
