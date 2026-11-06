import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';
import { encryptExisting } from './services/encryptExisting.js';

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  encryptExisting({ rotate: process.argv.includes('--rotate') })
    .then((n) => { console.log(`done (${n} surveys changed)`); return pool.end(); })
    .catch(async (e) => { console.error(e.message); await pool.end(); process.exit(1); });
}
