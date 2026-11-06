/**
 * Field-level encryption of sensitive answers (AES-256-GCM).
 *
 * Answers to questions marked `sensitive` in the questionnaire (HIV, chronic illness, child deaths,
 * child labour, abuse, violence, institutions, street children, substance use) are stored as
 *   { "__enc": "<keyId>:<iv b64>:<tag b64>:<ciphertext b64>" }
 * in both `surveys.answers` and `survey_answers.answer`. Everything else stays plain JSON so
 * that reports on non-sensitive questions can still use SQL JSON functions.
 *
 * Keys: ENCRYPTION_KEY (32 bytes, base64 or 64 hex chars), id ENCRYPTION_KEY_ID (default "k1").
 * Rotation: put the previous key(s) in ENCRYPTION_OLD_KEYS="k0:<key>,..." and run
 *   npm run encrypt:rotate
 */
import crypto from 'node:crypto';
import { config } from '../config.js';
import { questions } from '../../../shared/index.js';

export const SENSITIVE_QIDS = new Set(questions.filter((q) => q.sensitive).map((q) => q.id));

function parseKey(raw, name) {
  if (!raw) return null;
  const s = raw.trim();
  const buf = /^[0-9a-f]{64}$/i.test(s) ? Buffer.from(s, 'hex') : Buffer.from(s, 'base64');
  if (buf.length !== 32) throw new Error(`${name} must be 32 bytes (base64 or 64 hex characters)`);
  return buf;
}

function loadKeys() {
  const id = process.env.ENCRYPTION_KEY_ID || 'k1';
  let key = parseKey(process.env.ENCRYPTION_KEY, 'ENCRYPTION_KEY');
  if (!key) {
    if (config.env === 'production') throw new Error('ENCRYPTION_KEY is required in production');
    key = crypto.createHash('sha256').update('hhs-development-only-key').digest(); // dev/test only
    if (!config.isTest) console.warn('⚠ ENCRYPTION_KEY not set — using an insecure development key');
  }
  const keys = new Map([[id, key]]);
  for (const pair of (process.env.ENCRYPTION_OLD_KEYS || '').split(',').map((x) => x.trim()).filter(Boolean)) {
    const [oid, ...rest] = pair.split(':');
    keys.set(oid, parseKey(rest.join(':'), `ENCRYPTION_OLD_KEYS(${oid})`));
  }
  return { currentId: id, keys };
}
const KEYS = loadKeys();
export const currentKeyId = KEYS.currentId;

export function encryptValue(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEYS.keys.get(KEYS.currentId), iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return { __enc: [KEYS.currentId, iv.toString('base64'), cipher.getAuthTag().toString('base64'), ct.toString('base64')].join(':') };
}

export const isEncrypted = (v) => !!v && typeof v === 'object' && typeof v.__enc === 'string';

export function decryptValue(v) {
  if (!isEncrypted(v)) return v;
  const [id, iv, tag, ct] = v.__enc.split(':');
  const key = KEYS.keys.get(id);
  if (!key) throw new Error(`No decryption key for key id "${id}" (set ENCRYPTION_OLD_KEYS)`);
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8'));
}

/** Encrypt the sensitive questions of an answers object (returns a copy). */
export function sealAnswers(answers) {
  if (!answers || typeof answers !== 'object') return answers;
  const out = { ...answers };
  for (const qid of Object.keys(out)) if (SENSITIVE_QIDS.has(qid) && out[qid] && !isEncrypted(out[qid])) out[qid] = encryptValue(out[qid]);
  return out;
}

/** Decrypt any encrypted questions (returns a copy). */
export function openAnswers(answers) {
  if (!answers || typeof answers !== 'object') return answers;
  const out = { ...answers };
  for (const qid of Object.keys(out)) if (isEncrypted(out[qid])) out[qid] = decryptValue(out[qid]);
  return out;
}

/** Value for one survey_answers row. */
export const sealQuestion = (qid, value) => (SENSITIVE_QIDS.has(qid) && !isEncrypted(value) ? encryptValue(value) : value);

/** True when an encrypted value uses an old key (needs rotation). */
export const needsRotation = (v) => isEncrypted(v) && !v.__enc.startsWith(`${KEYS.currentId}:`);
