import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new AppError(400, 'BAD_REQUEST', msg, details);
export const unauthorized = (msg = 'प्रमाणीकरण आवश्यक छ') => new AppError(401, 'UNAUTHORIZED', msg);
export const forbidden = (msg = 'यो कार्य गर्ने अनुमति छैन') => new AppError(403, 'FORBIDDEN', msg);
export const notFound = (msg = 'फेला परेन') => new AppError(404, 'NOT_FOUND', msg);
export const conflict = (msg, details) => new AppError(409, 'CONFLICT', msg, details);
export const unprocessable = (msg, details) => new AppError(422, 'VALIDATION_FAILED', msg, details);

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `Route not found: ${req.method} ${req.path}` } });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'अमान्य अनुरोध', details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
    });
  }
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'डाटा धेरै ठूलो भयो' } });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'BAD_JSON', message: 'अमान्य JSON' } });
  }
  if (err?.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: { code: 'DUPLICATE', message: 'यो रेकर्ड पहिले नै छ' } });
  }
  console.error(err);
  return res.status(500).json({ error: { code: 'INTERNAL', message: 'सर्भरमा समस्या आयो' } });
}
