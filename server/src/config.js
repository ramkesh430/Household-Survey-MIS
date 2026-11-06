import 'dotenv/config';

const env = process.env.NODE_ENV || 'development';
const isTest = env === 'test';

function required(name, fallback) {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') throw new Error(`Missing required environment variable ${name}`);
  return v;
}

const jwtSecret = process.env.JWT_SECRET || (env === 'production' ? undefined : 'dev-only-secret-change-me-0123456789abcdef');
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set and at least 32 characters long');
}

export const config = {
  env,
  isTest,
  port: Number(process.env.PORT || 4000),
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: required('DB_USER', 'hhs'),
    password: process.env.DB_PASSWORD ?? 'hhs_pass',
    database: isTest ? process.env.DB_NAME_TEST || 'hhs_test' : required('DB_NAME', 'hhs_dev'),
    connectionLimit: Number(process.env.DB_POOL || 10),
  },
  jwt: {
    secret: jwtSecret,
    accessTtl: process.env.ACCESS_TOKEN_TTL || '15m',
    refreshTtlDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30),
  },
  security: {
    maxFailedLogins: Number(process.env.MAX_FAILED_LOGINS || 5),
    lockMinutes: Number(process.env.LOCK_MINUTES || 15),
    bcryptRounds: isTest ? 4 : Number(process.env.BCRYPT_ROUNDS || 12),
  },
  corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim()),
};
