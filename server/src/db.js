import mysql from 'mysql2/promise';
import { config } from './config.js';

export const pool = mysql.createPool({
  ...config.db,
  charset: 'utf8mb4_unicode_ci',
  waitForConnections: true,
  dateStrings: false,
  timezone: 'Z',
  supportBigNumbers: true,
  decimalNumbers: true,
  multipleStatements: false,
});

// All DATETIME values are stored and compared in UTC, whatever the server's local zone.
pool.pool.on('connection', (conn) => { conn.query("SET time_zone = '+00:00'"); });

/** Run a query and return rows. */
export async function query(sql, params = [], conn = pool) {
  const [rows] = await conn.query(sql, params);
  return rows;
}

export async function one(sql, params = [], conn = pool) {
  const rows = await query(sql, params, conn);
  return rows[0] || null;
}

/** Run fn inside a transaction; fn receives a connection. */
export async function tx(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const out = await fn(conn);
    await conn.commit();
    return out;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** MySQL returns JSON columns parsed; MariaDB returns strings. Normalise. */
export function parseJson(v) {
  if (v === null || v === undefined) return v;
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return v; }
  }
  return v;
}
