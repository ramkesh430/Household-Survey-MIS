import bcrypt from 'bcryptjs';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { migrate, resetDatabase } from '../src/migrate.js';
import { query } from '../src/db.js';

export const app = createApp();
export const PASSWORD = 'Test@12345';

/** Fresh schema + fixed fixtures: 2 wards, 2 settlements, 1 admin, 1 supervisor, 2 enumerators (ward 1) + 1 enumerator (ward 2). */
export async function setupDb() {
  await resetDatabase();
  await migrate({ log: () => {} });
  const defaultWardNos = (await query('SELECT ward_no FROM wards ORDER BY ward_no')).map((row) => row.ward_no);
  await query('DELETE FROM wards');
  const hash = await bcrypt.hash(PASSWORD, 4);
  await query("INSERT INTO wards (id, ward_no, name) VALUES (1, 1, 'वडा १'), (2, 2, 'वडा २')");
  await query("INSERT INTO settlements (id, ward_id, code, name) VALUES (1, 1, 'S01', 'मूल बस्ती'), (2, 2, 'S01', 'अर्को बस्ती')");
  await query(
    `INSERT INTO users (id, username, password_hash, full_name, role, ward_id) VALUES
     (1,'admin',?, 'प्रशासक','admin',NULL),
     (2,'sup1',?, 'सुपरभाइजर','supervisor',1),
     (3,'enum1',?, 'गणक एक','enumerator',1),
     (4,'enum2',?, 'गणक दुई','enumerator',1),
     (5,'enum3',?, 'गणक तीन','enumerator',2)`, [hash, hash, hash, hash, hash]);
  return defaultWardNos;
}

const tokens = {};
export async function login(username) {
  if (tokens[username]) return tokens[username];
  const res = await request(app).post('/api/auth/login').send({ username, password: PASSWORD });
  if (res.status !== 200) throw new Error(`login failed for ${username}: ${JSON.stringify(res.body)}`);
  tokens[username] = res.body.accessToken;
  return tokens[username];
}
export function clearTokens() { for (const k of Object.keys(tokens)) delete tokens[k]; }

export async function api(username, method, url, body) {
  const t = await login(username);
  const r = request(app)[method](url).set('Authorization', `Bearer ${t}`);
  return body !== undefined ? r.send(body) : r;
}
