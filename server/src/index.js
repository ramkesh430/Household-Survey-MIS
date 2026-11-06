import { createApp } from './app.js';
import { config } from './config.js';
import { migrate } from './migrate.js';
import { seed } from './seed.js';
import { pool } from './db.js';
import { encryptExisting } from './services/encryptExisting.js';
import { scheduleBackups } from './services/backup.js';

if (process.env.AUTO_MIGRATE !== 'false') await migrate();
// Create the first admin on a fresh database when ADMIN_PASSWORD is provided (idempotent).
if (process.env.ADMIN_PASSWORD) await seed({ demo: process.env.SEED_DEMO === 'true' });
// protect any sensitive answers saved before encryption was enabled (idempotent, fast when nothing to do)
await encryptExisting();

scheduleBackups();
const server = createApp().listen(config.port, () => console.log(`HHS API listening on :${config.port} (${config.env})`));

const shutdown = () => { server.close(() => pool.end().then(() => process.exit(0))); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
