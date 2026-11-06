import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { pool, one, query } from './db.js';
import { config } from './config.js';

/**
 * Idempotent seed: creates the first admin account (from env) and, optionally,
 * demo wards/settlements/users when SEED_DEMO=true.
 */
export async function seed({ demo = process.env.SEED_DEMO === 'true', log = console.log } = {}) {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD;
  const existing = await one('SELECT id FROM users WHERE username = ?', [username]);
  if (!existing) {
    if (!password || password.length < 10) throw new Error('Set ADMIN_PASSWORD (min 10 characters) before seeding');
    const hash = await bcrypt.hash(password, config.security.bcryptRounds);
    await query(
      'INSERT INTO users (username, password_hash, full_name, role, must_change_password) VALUES (?,?,?,?,1)',
      [username, hash, 'प्रणाली प्रशासक', 'admin'],
    );
    log(`✓ admin user "${username}" created (must change password on first login)`);
  } else log(`admin user "${username}" already exists`);

  if (demo) {
    for (const w of [1, 2, 3]) {
      await query('INSERT IGNORE INTO wards (ward_no, name) VALUES (?, ?)', [w, `वडा नं. ${w}`]);
    }
    const ward1 = await one('SELECT id FROM wards WHERE ward_no = 1');
    const settlements = [['S01', 'मूल बस्ती'], ['S02', 'पूर्वी टोल'], ['S03', 'खोला किनार']];
    for (const [code, name] of settlements) {
      await query('INSERT IGNORE INTO settlements (ward_id, code, name) VALUES (?,?,?)', [ward1.id, code, name]);
    }
    const demoPass = process.env.DEMO_USER_PASSWORD || 'Demo@12345';
    const hash = await bcrypt.hash(demoPass, config.security.bcryptRounds);
    for (const [u, n, r] of [['supervisor1', 'सुपरभाइजर एक', 'supervisor'], ['enumerator1', 'गणक एक', 'enumerator']]) {
      await query('INSERT IGNORE INTO users (username, password_hash, full_name, role, ward_id) VALUES (?,?,?,?,?)', [u, hash, n, r, ward1.id]);
    }
    log(`✓ demo data: wards 1–3, settlements in ward 1, users supervisor1/enumerator1 (password: ${demoPass})`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  seed().then(() => pool.end()).catch(async (e) => { console.error(e.message); await pool.end(); process.exit(1); });
}
