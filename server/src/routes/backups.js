import { Router } from 'express';
import express from 'express';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { one } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { badRequest, notFound, forbidden } from '../middleware/errors.js';
import { audit } from '../services/audit.js';
import { createBackup, listBackups, backupPath, isBackupName, restoreBackup, backupSettings } from '../services/backup.js';

/** Admin-only backup management. Restores need the admin's password and the word RESTORE. */
const router = Router();
router.use(requireRole('admin'));

async function confirmAdmin(req, password, confirm) {
  if (confirm !== 'RESTORE') throw badRequest('पुष्टि गर्न "RESTORE" लेख्नुहोस्');
  const u = await one('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
  if (!password || !(await bcrypt.compare(password, u.password_hash))) throw forbidden('पासवर्ड मिलेन');
}

router.get('/', async (req, res) => res.json({ data: await listBackups(), settings: backupSettings() }));

router.post('/', async (req, res) => {
  const b = await createBackup({ label: 'manual' });
  await audit(req, 'backup.create', 'backup', b.name, { rows: b.rows, size: b.size });
  res.status(201).json({ data: b });
});

router.get('/:name', async (req, res) => {
  if (!isBackupName(req.params.name)) throw badRequest('अमान्य फाइल नाम');
  const file = backupPath(req.params.name);
  if (!fs.existsSync(file)) throw notFound('ब्याकअप फेला परेन');
  await audit(req, 'backup.download', 'backup', req.params.name);
  res.setHeader('Content-Type', 'application/gzip');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.name}"`);
  fs.createReadStream(file).pipe(res);
});

router.delete('/:name', async (req, res) => {
  if (!isBackupName(req.params.name)) throw badRequest('अमान्य फाइल नाम');
  const file = backupPath(req.params.name);
  if (!fs.existsSync(file)) throw notFound('ब्याकअप फेला परेन');
  fs.rmSync(file);
  await audit(req, 'backup.delete', 'backup', req.params.name);
  res.json({ ok: true });
});

async function doRestore(req, res, stream, source) {
  const safety = await createBackup({ label: 'pre-restore' }); // always keep a way back
  let result;
  try { result = await restoreBackup(stream); } catch (e) { throw badRequest(`Restore भएन: ${e.message}`, { safety_backup: safety.name }); }
  // the audit table was replaced by the backup's copy; record the restore in the restored log
  // the audit table now holds the backup's copy; the acting admin may not exist in it
  const stillExists = await one('SELECT id FROM users WHERE id = ?', [req.user.id]);
  const actor = stillExists ? req : { user: null, ip: req.ip, headers: req.headers };
  await audit(actor, 'backup.restore', 'backup', source, { rows: result.rows, backup_created_at: result.created_at, safety_backup: safety.name, by: req.user.username });
  res.json({ data: { ...result, safety_backup: safety.name } });
}

/** Restore one of the backups stored on the server. */
router.post('/:name/restore', async (req, res) => {
  const b = z.object({ password: z.string().min(1), confirm: z.string() }).parse(req.body);
  await confirmAdmin(req, b.password, b.confirm);
  if (!isBackupName(req.params.name)) throw badRequest('अमान्य फाइल नाम');
  const file = backupPath(req.params.name);
  if (!fs.existsSync(file)) throw notFound('ब्याकअप फेला परेन');
  await doRestore(req, res, fs.createReadStream(file), req.params.name);
});

/** Restore an uploaded backup file (body = the .jsonl.gz file). */
export const restoreUpload = [
  requireRole('admin'),
  express.raw({ type: ['application/gzip', 'application/octet-stream'], limit: process.env.BACKUP_UPLOAD_LIMIT || '500mb' }),
  async (req, res) => {
    await confirmAdmin(req, req.get('X-Admin-Password'), req.get('X-Confirm'));
    if (!Buffer.isBuffer(req.body) || req.body.length < 20) throw badRequest('ब्याकअप फाइल पठाउनुहोस्');
    await doRestore(req, res, Readable.from(req.body), 'upload');
  },
];

export default router;
