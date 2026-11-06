import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config.js';
import { one, query } from '../db.js';
import { authenticate, signAccessToken } from '../middleware/auth.js';
import { unauthorized, badRequest } from '../middleware/errors.js';
import { audit } from '../services/audit.js';

const router = Router();
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-password', config.security.bcryptRounds);
const COMMON = new Set(['password1', 'password123', 'admin123', 'admin@123', 'nepal123', 'nepal@123', 'qwerty123', 'abc12345', '12345678a', 'welcome1', 'letmein1', 'test1234', 'password@1', 'kathmandu1', 'p@ssw0rd', 'pass1234']);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: config.isTest ? 1000 : 20, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'धेरै प्रयास भयो, केही समयपछि प्रयास गर्नुहोस्' } },
});

export const passwordSchema = z.string().min(8, 'पासवर्ड कम्तीमा ८ अक्षरको हुनुपर्छ').max(100)
  .regex(/[A-Za-z]/, 'पासवर्डमा अक्षर हुनुपर्छ').regex(/[0-9]/, 'पासवर्डमा अंक हुनुपर्छ')
  .refine((p) => !COMMON.has(p.toLowerCase()), 'यो पासवर्ड धेरै सामान्य छ, अर्को छान्नुहोस्');

/** Password must not contain the username. */
export function assertPasswordForUser(password, username) {
  if (username && username.length >= 3 && password.toLowerCase().includes(username.toLowerCase())) throw badRequest('पासवर्डमा प्रयोगकर्ता नाम राख्न मिल्दैन');
}

async function issueTokens(req, user) {
  const refresh = crypto.randomBytes(48).toString('base64url');
  const expires = new Date(Date.now() + config.jwt.refreshTtlDays * 864e5);
  await query('INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip, user_agent) VALUES (?,?,?,?,?)',
    [user.id, sha256(refresh), expires, req.ip, (req.headers['user-agent'] || '').slice(0, 255)]);
  return { accessToken: signAccessToken(user), refreshToken: refresh, refreshExpiresAt: expires.toISOString() };
}

const publicUser = (u) => ({
  id: u.id, username: u.username, full_name: u.full_name, role: u.role, ward_id: u.ward_id,
  must_change_password: !!u.must_change_password,
});

router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = z.object({ username: z.string().min(1).max(60), password: z.string().min(1).max(100) }).parse(req.body);
  const user = await one('SELECT * FROM users WHERE username = ?', [username.trim().toLowerCase()]);
  const invalid = unauthorized('प्रयोगकर्ता नाम वा पासवर्ड मिलेन');
  if (!user || !user.is_active) {
    await bcrypt.compare(password, DUMMY_HASH); // same work as a real check: no username enumeration by timing
    await audit(req, 'auth.login_failed', 'user', null, { username });
    throw invalid;
  }
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    throw unauthorized('धेरै पटक गलत पासवर्ड हालिएकाले खाता केही समयका लागि बन्द गरिएको छ');
  }
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    const fails = user.failed_logins + 1;
    const lock = fails >= config.security.maxFailedLogins ? new Date(Date.now() + config.security.lockMinutes * 60e3) : null;
    await query('UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?', [lock ? 0 : fails, lock, user.id]);
    await audit(req, 'auth.login_failed', 'user', user.id, { locked: !!lock });
    throw invalid;
  }
  await query('UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = NOW() WHERE id = ?', [user.id]);
  req.user = user;
  await audit(req, 'auth.login', 'user', user.id);
  res.json({ user: publicUser(user), ...(await issueTokens(req, user)) });
});

router.post('/refresh', async (req, res) => {
  const { refreshToken } = z.object({ refreshToken: z.string().min(20).max(200) }).parse(req.body);
  const row = await one(
    `SELECT rt.id AS rt_id, rt.user_id, rt.expires_at, rt.revoked_at, u.is_active
     FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id WHERE rt.token_hash = ?`, [sha256(refreshToken)]);
  if (!row || row.revoked_at || new Date(row.expires_at) < new Date() || !row.is_active) {
    if (row && row.revoked_at) {
      // token reuse → revoke all sessions of this user
      await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [row.user_id]);
    }
    throw unauthorized('सत्रको म्याद सकियो, पुनः लगइन गर्नुहोस्');
  }
  await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = ?', [row.rt_id]);
  const user = await one('SELECT * FROM users WHERE id = ?', [row.user_id]);
  res.json({ user: publicUser(user), ...(await issueTokens(req, user)) });
});

router.post('/logout', async (req, res) => {
  const body = z.object({ refreshToken: z.string().max(200).optional() }).parse(req.body || {});
  if (body.refreshToken) await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = ? AND revoked_at IS NULL', [sha256(body.refreshToken)]);
  res.json({ ok: true });
});

router.get('/me', authenticate, async (req, res) => {
  res.json({ user: publicUser(req.user) });
});

router.post('/change-password', authenticate, async (req, res) => {
  const { currentPassword, newPassword } = z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema }).parse(req.body);
  const user = await one('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!(await bcrypt.compare(currentPassword, user.password_hash))) throw badRequest('हालको पासवर्ड मिलेन');
  if (currentPassword === newPassword) throw badRequest('नयाँ पासवर्ड पुरानोभन्दा फरक हुनुपर्छ');
  assertPasswordForUser(newPassword, user.username);
  const hash = await bcrypt.hash(newPassword, config.security.bcryptRounds);
  await query('UPDATE users SET password_hash = ?, must_change_password = 0, token_version = token_version + 1 WHERE id = ?', [hash, user.id]);
  await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [user.id]);
  await audit(req, 'auth.password_changed', 'user', user.id);
  const fresh = await one('SELECT * FROM users WHERE id = ?', [user.id]);
  res.json({ user: publicUser(fresh), ...(await issueTokens(req, fresh)) });
});

export default router;
