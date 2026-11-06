// Vercel serverless entry point. Every request is routed here by server/vercel.json.
// On a cold start it runs the same one-time setup as src/index.js (migrations, first admin,
// encrypting old answers) once, then hands requests to the Express app.
// Scheduled backups are not started: serverless functions have no long-running process or disk.
import { createApp } from '../src/app.js';
import { migrate } from '../src/migrate.js';
import { seed } from '../src/seed.js';
import { encryptExisting } from '../src/services/encryptExisting.js';

const app = createApp();
let ready = null;

function init() {
  if (!ready) {
    ready = (async () => {
      if (process.env.AUTO_MIGRATE !== 'false') await migrate();
      if (process.env.ADMIN_PASSWORD) await seed({ demo: process.env.SEED_DEMO === 'true' });
      await encryptExisting();
    })();
    ready.catch(() => { ready = null; }); // retry setup on the next request
  }
  return ready;
}

export default async function handler(req, res) {
  try {
    await init();
  } catch (err) {
    console.error('startup failed:', err);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'service_unavailable', message: 'Server is starting or the database is unreachable' }));
    return;
  }
  return app(req, res);
}
