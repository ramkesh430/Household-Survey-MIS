// Vercel serverless entry point. Every request is routed here by server/vercel.json.
// On a cold start it loads the app and runs the same one-time setup as src/index.js
// (migrations, first admin, encrypting old answers) once, then hands requests to Express.
// Modules are imported lazily so a missing env var or unreachable database returns a clear
// JSON error (with CORS headers) instead of crashing the function.
// Scheduled backups are not started: serverless functions have no long-running process or disk.
let app = null;
let ready = null;

function init() {
  if (!ready) {
    ready = (async () => {
      const { createApp } = await import('../src/app.js');
      const { migrate } = await import('../src/migrate.js');
      const { seed } = await import('../src/seed.js');
      const { encryptExisting } = await import('../src/services/encryptExisting.js');
      if (process.env.AUTO_MIGRATE !== 'false') await migrate();
      if (process.env.ADMIN_PASSWORD) await seed({ demo: process.env.SEED_DEMO === 'true' });
      await encryptExisting();
      app = createApp();
    })();
    ready.catch(() => { ready = null; }); // retry setup on the next request
  }
  return ready;
}

function fail(req, res, err) {
  const origins = (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
  const origin = req.headers.origin;
  if (origin && origins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  }
  res.statusCode = 503;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    error: { code: 'SERVICE_UNAVAILABLE', message: `Server setup failed: ${err.message}` },
  }));
}

export default async function handler(req, res) {
  try {
    await init();
  } catch (err) {
    console.error('startup failed:', err);
    return fail(req, res, err);
  }
  return app(req, res);
}
