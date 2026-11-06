import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { one } from '../db.js';
import { unauthorized, forbidden } from './errors.js';

export function signAccessToken(user) {
  return jwt.sign(
    { sub: String(user.id), role: user.role, ward_id: user.ward_id, tv: user.token_version },
    config.jwt.secret,
    { expiresIn: config.jwt.accessTtl, issuer: 'hhs-api', audience: 'hhs-client' },
  );
}

/** Verify bearer token and attach req.user (fresh from DB so deactivation takes effect immediately). */
export async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw unauthorized();
  let payload;
  try {
    payload = jwt.verify(token, config.jwt.secret, { issuer: 'hhs-api', audience: 'hhs-client' });
  } catch {
    throw unauthorized('टोकनको म्याद सकियो वा अमान्य छ');
  }
  const user = await one(
    'SELECT id, username, full_name, role, ward_id, is_active, token_version, must_change_password FROM users WHERE id = ?',
    [payload.sub],
  );
  if (!user || !user.is_active || user.token_version !== payload.tv) throw unauthorized('सत्र अमान्य भयो, पुनः लगइन गर्नुहोस्');
  req.user = user;
  next();
}

export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) throw forbidden();
  next();
};
