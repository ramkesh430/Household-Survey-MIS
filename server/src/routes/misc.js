import { Router } from 'express';
import { z } from 'zod';
import { query, parseJson } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { questionnaire } from '../../../shared/index.js';

export const questionnaireRouter = Router();
questionnaireRouter.get('/', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ data: questionnaire });
});

export const auditRouter = Router();
auditRouter.get('/', requireRole('admin'), async (req, res) => {
  const q = z.object({
    action: z.string().max(60).optional(),
    entity_type: z.string().max(40).optional(),
    entity_id: z.string().max(64).optional(),
    user_id: z.coerce.number().int().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(50),
  }).parse(req.query);
  const where = []; const params = [];
  if (q.action) { where.push('a.action LIKE ?'); params.push(`${q.action}%`); }
  if (q.entity_type) { where.push('a.entity_type = ?'); params.push(q.entity_type); }
  if (q.entity_id) { where.push('a.entity_id = ?'); params.push(q.entity_id); }
  if (q.user_id) { where.push('a.user_id = ?'); params.push(q.user_id); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM audit_logs a ${w}`, params);
  const rows = await query(`SELECT a.*, u.username FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id ${w}
    ORDER BY a.id DESC LIMIT ? OFFSET ?`, [...params, q.pageSize, (q.page - 1) * q.pageSize]);
  res.json({ data: rows.map((r) => ({ ...r, details: parseJson(r.details) })), total: Number(total), page: q.page, pageSize: q.pageSize });
});
