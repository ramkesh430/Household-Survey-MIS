import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { pool } from './db.js';
import { authenticate } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import wardRoutes, { settlementsRouter } from './routes/wards.js';
import householdRoutes from './routes/households.js';
import surveyRoutes from './routes/surveys.js';
import { questionnaireRouter, auditRouter } from './routes/misc.js';
import syncRoutes from './routes/sync.js';
import reviewRoutes from './routes/review.js';
import qualityRoutes from './routes/quality.js';
import reportRoutes from './routes/reports.js';
import backupRoutes, { restoreUpload } from './routes/backups.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin, credentials: false }));
  app.use(compression());
  app.use(express.json({ limit: '2mb' }));
  app.use('/api', rateLimit({ windowMs: 60_000, limit: config.isTest ? 100000 : 600, standardHeaders: 'draft-7', legacyHeaders: false }));

  app.get('/api/health', async (req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', db: 'ok', time: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: 'degraded', db: 'down' });
    }
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/questionnaire', authenticate, questionnaireRouter);
  app.use('/api/users', authenticate, userRoutes);
  app.use('/api/wards', authenticate, wardRoutes);
  app.use('/api/settlements', authenticate, settlementsRouter);
  app.use('/api/households', authenticate, householdRoutes);
  app.use('/api/surveys', authenticate, reviewRoutes);
  app.use('/api/surveys', authenticate, surveyRoutes);
  app.use('/api/quality', authenticate, qualityRoutes);
  app.use('/api/reports', authenticate, reportRoutes);
  app.post('/api/admin/restore', authenticate, ...restoreUpload);
  app.use('/api/admin/backups', authenticate, backupRoutes);
  app.use('/api/audit-logs', authenticate, auditRouter);
  app.use('/api/sync', authenticate, syncRoutes);

  app.use('/api', notFoundHandler);
  app.use(errorHandler);
  return app;
}
