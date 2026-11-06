import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { config } from '../config.js';
import { one, query } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { notFound, badRequest, conflict } from '../middleware/errors.js';
import { audit } from '../services/audit.js';
import { passwordSchema, assertPasswordForUser } from './auth.js';

const router = Router();
const COLS = 'u.id, u.username, u.full_name, u.role, u.ward_id, w.ward_no, u.phone, u.email, u.is_active, u.last_login_at, u.created_at';

const userBody = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,60}$/, 'प्रयोगकर्ता नाम ३–६० अक्षर (a-z, 0-9, . _ -) हुनुपर्छ'),
  full_name: z.string().trim().min(2).max(150),
  role: z.enum(['admin', 'supervisor', 'enumerator']),
  ward_id: z.number().int().positive().nullable().optional(),
  phone: z.string().trim().max(20).optional().nullable(),
  email: z.string().trim().email().max(150).optional().nullable().or(z.literal('')),
  password: passwordSchema,
});

async function checkWard(role, wardId) {
  if (role !== 'admin' && !wardId) throw badRequest('सुपरभाइजर र गणकलाई वडा तोक्नुपर्छ');
  if (wardId && !(await one('SELECT id FROM wards WHERE id = ?', [wardId]))) throw badRequest('वडा फेला परेन');
}

// supervisors may list users of their ward (to see enumerators); admins see all
router.get('/', requireRole('admin', 'supervisor'), async (req, res) => {
  const q = z.object({ role: z.enum(['admin', 'supervisor', 'enumerator']).optional(), ward_id: z.coerce.number().int().optional() }).parse(req.query);
  const where = []; const params = [];
  if (req.user.role === 'supervisor') { where.push('u.ward_id = ?'); params.push(req.user.ward_id); }
  else if (q.ward_id) { where.push('u.ward_id = ?'); params.push(q.ward_id); }
  if (q.role) { where.push('u.role = ?'); params.push(q.role); }
  const rows = await query(`SELECT ${COLS} FROM users u LEFT JOIN wards w ON w.id = u.ward_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY u.role, u.username`, params);
  res.json({ data: rows.map((r) => ({ ...r, is_active: !!r.is_active })) });
});

router.post('/', requireRole('admin'), async (req, res) => {
  const b = userBody.parse(req.body);
  assertPasswordForUser(b.password, b.username);
  await checkWard(b.role, b.ward_id);
  if (await one('SELECT id FROM users WHERE username = ?', [b.username])) throw conflict('यो प्रयोगकर्ता नाम पहिले नै छ');
  const hash = await bcrypt.hash(b.password, config.security.bcryptRounds);
  const r = await query(
    'INSERT INTO users (username, password_hash, full_name, role, ward_id, phone, email, must_change_password, created_by) VALUES (?,?,?,?,?,?,?,1,?)',
    [b.username, hash, b.full_name, b.role, b.role === 'admin' ? null : b.ward_id, b.phone || null, b.email || null, req.user.id],
  );
  await audit(req, 'user.create', 'user', r.insertId, { username: b.username, role: b.role, ward_id: b.ward_id });
  res.status(201).json({ data: await one(`SELECT ${COLS} FROM users u LEFT JOIN wards w ON w.id = u.ward_id WHERE u.id = ?`, [r.insertId]) });
});

router.patch('/:id', requireRole('admin'), async (req, res) => {
  const id = z.coerce.number().int().parse(req.params.id);
  const b = z.object({
    full_name: z.string().trim().min(2).max(150).optional(),
    role: z.enum(['admin', 'supervisor', 'enumerator']).optional(),
    ward_id: z.number().int().positive().nullable().optional(),
    phone: z.string().trim().max(20).nullable().optional(),
    email: z.string().trim().email().max(150).nullable().optional().or(z.literal('')),
    is_active: z.boolean().optional(),
  }).parse(req.body);
  const user = await one('SELECT * FROM users WHERE id = ?', [id]);
  if (!user) throw notFound('प्रयोगकर्ता फेला परेन');
  if (id === req.user.id && (b.is_active === false || (b.role && b.role !== 'admin'))) throw badRequest('आफ्नै खाता निष्क्रिय वा भूमिका परिवर्तन गर्न मिल्दैन');
  const role = b.role ?? user.role;
  const wardId = role === 'admin' ? null : (b.ward_id !== undefined ? b.ward_id : user.ward_id);
  await checkWard(role, wardId);
  const deactivate = b.is_active === false || (b.role && b.role !== user.role);
  await query(
    `UPDATE users SET full_name = ?, role = ?, ward_id = ?, phone = ?, email = ?, is_active = ?,
     token_version = token_version + ? WHERE id = ?`,
    [b.full_name ?? user.full_name, role, wardId, b.phone !== undefined ? b.phone : user.phone,
      b.email !== undefined ? b.email || null : user.email, b.is_active ?? !!user.is_active, deactivate ? 1 : 0, id],
  );
  if (deactivate) await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [id]);
  await audit(req, 'user.update', 'user', id, b);
  res.json({ data: await one(`SELECT ${COLS} FROM users u LEFT JOIN wards w ON w.id = u.ward_id WHERE u.id = ?`, [id]) });
});

router.post('/:id/reset-password', requireRole('admin'), async (req, res) => {
  const id = z.coerce.number().int().parse(req.params.id);
  const { password } = z.object({ password: passwordSchema }).parse(req.body);
  const target = await one('SELECT id, username FROM users WHERE id = ?', [id]);
  if (!target) throw notFound('प्रयोगकर्ता फेला परेन');
  assertPasswordForUser(password, target.username);
  const hash = await bcrypt.hash(password, config.security.bcryptRounds);
  await query('UPDATE users SET password_hash = ?, must_change_password = 1, failed_logins = 0, locked_until = NULL, token_version = token_version + 1 WHERE id = ?', [hash, id]);
  await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [id]);
  await audit(req, 'user.reset_password', 'user', id);
  res.json({ ok: true });
});

export default router;
