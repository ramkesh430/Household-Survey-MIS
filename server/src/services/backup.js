/**
 * Logical backup & restore (no mysqldump needed — works inside the API container).
 *
 * File: hhs-backup-<UTC timestamp>[-label].jsonl.gz — gzip of JSON lines:
 *   {"format":"hhs-backup","version":1,"created_at":…,"migrations":[…],"tables":{name:rows},"encryption_key_id":…}
 *   {"t":"<table>","r":{…row…}}   (one line per row, tables in dependency order)
 *   {"end":true,"rows":N,"sha256":"<hash of every preceding line>"}
 * Sensitive answers stay encrypted inside the backup; the same ENCRYPTION_KEY is needed to read them after a restore.
 * Login sessions (refresh_tokens) are not backed up — everyone signs in again after a restore.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import readline from 'node:readline';
import mysql from 'mysql2/promise';
import { config } from '../config.js';
import { currentKeyId } from './crypto.js';

export const TABLES = ['wards', 'settlements', 'users', 'households', 'surveys', 'survey_answers', 'survey_status_history', 'duplicate_reviews', 'audit_logs'];
const JSON_COLS = { surveys: ['answers', 'review_notes'], survey_answers: ['answer'], survey_status_history: ['details'], audit_logs: ['details'] };
export const BACKUP_DIR = path.resolve(process.env.BACKUP_DIR || path.join(process.cwd(), 'backups'));
const NAME_RE = /^hhs-backup-[0-9TZ-]+(-[a-z0-9-]{1,30})?\.jsonl\.gz$/;
export const isBackupName = (n) => NAME_RE.test(n);

async function connect() {
  const conn = await mysql.createConnection({ ...config.db, dateStrings: true, charset: 'utf8mb4_unicode_ci', multipleStatements: false });
  await conn.query("SET time_zone = '+00:00'");
  return conn;
}

/** Write a backup file; returns its metadata. */
export async function createBackup({ label = '' } = {}) {
  await fsp.mkdir(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace(/-\d{3}Z$/, 'Z');
  const name = `hhs-backup-${stamp}${label ? `-${label}` : ''}.jsonl.gz`;
  const file = path.join(BACKUP_DIR, name);
  const tmp = `${file}.part`;
  const conn = await connect();
  const hash = crypto.createHash('sha256');
  const gz = zlib.createGzip({ level: 6 });
  const out = fs.createWriteStream(tmp, { mode: 0o600 });
  gz.pipe(out);
  const write = (obj) => new Promise((resolve) => { const line = `${JSON.stringify(obj)}\n`; hash.update(line); if (!gz.write(line)) gz.once('drain', resolve); else resolve(); });
  let total = 0;
  try {
    await conn.query('START TRANSACTION WITH CONSISTENT SNAPSHOT');
    const [mig] = await conn.query('SELECT version FROM schema_migrations ORDER BY version');
    const counts = {};
    for (const t of TABLES) { const [[{ n }]] = await conn.query(`SELECT COUNT(*) AS n FROM \`${t}\``); counts[t] = Number(n); }
    await write({ format: 'hhs-backup', version: 1, created_at: new Date().toISOString(), migrations: mig.map((m) => m.version), tables: counts, encryption_key_id: currentKeyId });
    for (const t of TABLES) {
      for (let offset = 0; offset < counts[t]; offset += 1000) {
        const [rows] = await conn.query(`SELECT * FROM \`${t}\` ORDER BY 1, 2 LIMIT 1000 OFFSET ?`, [offset]);
        for (const r of rows) { await write({ t, r }); total += 1; }
      }
    }
    await conn.query('COMMIT');
    const end = { end: true, rows: total, sha256: hash.digest('hex') };
    gz.end(`${JSON.stringify(end)}\n`);
    await new Promise((resolve, reject) => { out.on('finish', resolve); out.on('error', reject); });
    await fsp.rename(tmp, file);
  } catch (e) {
    gz.destroy(); out.destroy(); await fsp.rm(tmp, { force: true });
    throw e;
  } finally { await conn.end(); }
  const st = await fsp.stat(file);
  return { name, size: st.size, rows: total, created_at: st.mtime.toISOString() };
}

/** Read and verify a backup stream; returns { header, tables: {name: rows[]} } or throws. */
export async function readBackup(stream) {
  const rl = readline.createInterface({ input: stream.pipe(zlib.createGunzip()), crlfDelay: Infinity });
  const hash = crypto.createHash('sha256');
  let header = null; let end = null; let n = 0;
  const tables = Object.fromEntries(TABLES.map((t) => [t, []]));
  for await (const line of rl) {
    if (!line) continue;
    if (end) throw new Error('बिग्रिएको ब्याकअप: अन्त्य पछि थप डाटा');
    const obj = JSON.parse(line);
    if (obj.end) { end = obj; break; }
    hash.update(`${line}\n`);
    if (!header) {
      if (obj.format !== 'hhs-backup' || obj.version !== 1) throw new Error('यो घरधुरी सर्वेक्षण प्रणालीको ब्याकअप फाइल होइन');
      header = obj; continue;
    }
    if (!TABLES.includes(obj.t)) throw new Error(`अज्ञात तालिका: ${obj.t}`);
    tables[obj.t].push(obj.r); n += 1;
  }
  if (!header || !end) throw new Error('अपूर्ण ब्याकअप फाइल');
  if (end.sha256 !== hash.digest('hex') || end.rows !== n) throw new Error('ब्याकअप फाइलको checksum मिलेन — फाइल बिग्रिएको वा परिवर्तन गरिएको छ');
  for (const t of TABLES) if ((header.tables[t] ?? 0) !== tables[t].length) throw new Error(`तालिका ${t} को पंक्ति संख्या मिलेन`);
  return { header, tables, rows: n };
}

/** Replace all data with the backup's contents, atomically. */
export async function restoreBackup(stream) {
  const { header, tables, rows } = await readBackup(stream);
  const conn = await connect();
  try {
    const [mig] = await conn.query('SELECT version FROM schema_migrations ORDER BY version');
    const current = mig.map((m) => m.version);
    if (JSON.stringify(current) !== JSON.stringify(header.migrations)) {
      throw new Error(`डाटाबेस संरचना मिलेन (ब्याकअप: ${header.migrations.at(-1)}, हाल: ${current.at(-1)}). उही संस्करणको प्रणालीमा मात्र restore गर्नुहोस्।`);
    }
    if (header.encryption_key_id && header.encryption_key_id !== currentKeyId && !(process.env.ENCRYPTION_OLD_KEYS || '').includes(`${header.encryption_key_id}:`)) {
      throw new Error(`यो ब्याकअप "${header.encryption_key_id}" साँचोले सुरक्षित छ — त्यो ENCRYPTION_KEY उपलब्ध छैन`);
    }
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    await conn.beginTransaction();
    await conn.query('DELETE FROM refresh_tokens');
    for (const t of [...TABLES].reverse()) await conn.query(`DELETE FROM \`${t}\``);
    for (const t of TABLES) {
      const list = tables[t];
      if (!list.length) continue;
      const cols = Object.keys(list[0]);
      for (let i = 0; i < list.length; i += 500) {
        const chunk = list.slice(i, i + 500).map((r) => cols.map((c) => {
          const v = r[c];
          return (JSON_COLS[t] || []).includes(c) && v !== null && typeof v === 'object' ? JSON.stringify(v) : v;
        }));
        await conn.query(`INSERT INTO \`${t}\` (${cols.map((c) => `\`${c}\``).join(',')}) VALUES ?`, [chunk]);
      }
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback().catch(() => {});
    throw e;
  } finally {
    await conn.query('SET FOREIGN_KEY_CHECKS = 1').catch(() => {});
    await conn.end();
  }
  return { rows, created_at: header.created_at, tables: header.tables };
}

export async function listBackups() {
  await fsp.mkdir(BACKUP_DIR, { recursive: true });
  const names = (await fsp.readdir(BACKUP_DIR)).filter(isBackupName);
  const out = [];
  for (const n of names) { const st = await fsp.stat(path.join(BACKUP_DIR, n)); out.push({ name: n, size: st.size, created_at: st.mtime.toISOString() }); }
  return out.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function backupPath(name) {
  if (!isBackupName(name)) throw new Error('अमान्य फाइल नाम');
  return path.join(BACKUP_DIR, name);
}

/** Delete scheduled backups older than `days` (manual and pre-restore backups are kept). */
export async function pruneBackups(days) {
  const cutoff = Date.now() - days * 864e5;
  let removed = 0;
  for (const b of await listBackups()) {
    if (b.name.includes('-auto') && Date.parse(b.created_at) < cutoff) { await fsp.rm(backupPath(b.name)); removed += 1; }
  }
  return removed;
}

/** Daily automatic backup at BACKUP_HOUR_UTC (default 19 UTC ≈ 00:45 Nepal time). */
export function scheduleBackups({ log = console.log } = {}) {
  if (process.env.BACKUP_SCHEDULE === 'false' || config.isTest) return null;
  const hour = Number(process.env.BACKUP_HOUR_UTC ?? 19);
  const keep = Number(process.env.BACKUP_RETENTION_DAYS || 14);
  let last = null;
  const tick = async () => {
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    if (now.getUTCHours() !== hour || last === day) return;
    last = day;
    try {
      const b = await createBackup({ label: 'auto' });
      const removed = await pruneBackups(keep);
      log(`💾 automatic backup ${b.name} (${b.rows} rows); removed ${removed} old`);
    } catch (e) { console.error('automatic backup failed:', e.message); }
  };
  return setInterval(tick, 10 * 60 * 1000);
}

export const backupSettings = () => ({
  dir: BACKUP_DIR,
  scheduled: process.env.BACKUP_SCHEDULE !== 'false',
  hour_utc: Number(process.env.BACKUP_HOUR_UTC ?? 19),
  retention_days: Number(process.env.BACKUP_RETENTION_DAYS || 14),
});
