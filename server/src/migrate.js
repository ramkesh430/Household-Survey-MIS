import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { config } from './config.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/** Apply pending SQL migrations in filename order. Returns list of applied versions. */
export async function migrate({ log = console.log } = {}) {
  const conn = await mysql.createConnection({ ...config.db, multipleStatements: true, charset: 'utf8mb4_unicode_ci' });
  try {
    await conn.query("SET time_zone = '+00:00'");
    await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(100) NOT NULL PRIMARY KEY,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    const [rows] = await conn.query('SELECT version FROM schema_migrations');
    const done = new Set(rows.map((r) => r.version));
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
    const applied = [];
    for (const f of files) {
      if (done.has(f)) continue;
      const sql = await fs.readFile(path.join(dir, f), 'utf8');
      log(`→ applying ${f}`);
      await conn.query(sql);
      await conn.query('INSERT INTO schema_migrations (version) VALUES (?)', [f]);
      applied.push(f);
    }
    if (!applied.length) log('database is up to date');
    return applied;
  } finally {
    await conn.end();
  }
}

/** Drop every table (used by tests only). */
export async function resetDatabase() {
  if (!config.isTest) throw new Error('resetDatabase is only allowed in test mode');
  const conn = await mysql.createConnection({ ...config.db, multipleStatements: true });
  try {
    const [tables] = await conn.query('SHOW TABLES');
    const names = tables.map((t) => Object.values(t)[0]);
    if (names.length) {
      await conn.query(`SET FOREIGN_KEY_CHECKS=0; DROP TABLE ${names.map((n) => `\`${n}\``).join(',')}; SET FOREIGN_KEY_CHECKS=1;`);
    }
  } finally {
    await conn.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  migrate().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
