import { sealAnswers, openAnswers, sealQuestion } from '../services/crypto.js';
import { Router } from 'express';
import { z } from 'zod';
import { one, query, tx, parseJson } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { notFound, conflict, badRequest, unprocessable, forbidden } from '../middleware/errors.js';
import { audit } from '../services/audit.js';
import { assertWardAccess } from '../services/scope.js';
import { questions, validate } from '../../../shared/index.js';

/**
 * Supervisor review workflow
 *   submitted → approved   (POST /surveys/:id/approve)  verifier name + signature recorded in the form
 *   submitted → rejected   (POST /surveys/:id/reject)   overall comment + optional per-question notes
 *   approved  → rejected   (POST /surveys/:id/reopen)   admin only, with reason
 * The enumerator edits a rejected survey (on or offline) and submits again.
 */
const router = Router();
const QIDS = new Set(questions.map((q) => q.id));

async function lockSurvey(conn, id) {
  const s = await one(`SELECT sv.*, h.ward_id FROM surveys sv JOIN households h ON h.id = sv.household_id WHERE sv.id = ? FOR UPDATE`, [id], conn);
  if (!s) throw notFound('सर्वेक्षण फेला परेन');
  return s;
}

async function history(conn, id, from, to, userId, comment, details) {
  await query('INSERT INTO survey_status_history (survey_id, from_status, to_status, user_id, comment, details) VALUES (?,?,?,?,?,?)',
    [id, from, to, userId, comment || null, details ? JSON.stringify(details) : null], conn);
}

const SELECT_ONE = `SELECT sv.*, h.household_code, h.ward_id, h.head_name, w.ward_no, s.name AS settlement_name, u.full_name AS enumerator_name,
  r.full_name AS reviewer_name FROM surveys sv JOIN households h ON h.id = sv.household_id JOIN wards w ON w.id = h.ward_id
  JOIN settlements s ON s.id = h.settlement_id JOIN users u ON u.id = sv.enumerator_id LEFT JOIN users r ON r.id = sv.reviewer_id WHERE sv.id = ?`;
const present = (r) => ({ ...r, answers: openAnswers(parseJson(r.answers)), review_notes: parseJson(r.review_notes), completion: Number(r.completion) });

const idParam = (req) => z.coerce.number().int().parse(req.params.id);

router.post('/:id/approve', requireRole('supervisor', 'admin'), async (req, res) => {
  const id = idParam(req);
  const b = z.object({
    version: z.number().int().positive(),
    verifier_name: z.string().trim().min(2).max(150),
    verifier_sign: z.string().startsWith('data:image/png;base64,').max(300000),
    comment: z.string().trim().max(1000).optional(),
  }).parse(req.body);
  const out = await tx(async (conn) => {
    const s = await lockSurvey(conn, id);
    assertWardAccess(req.user, s.ward_id);
    if (s.enumerator_id === req.user.id) throw forbidden('आफूले संकलन गरेको सर्वेक्षण आफैँ स्वीकृत गर्न मिल्दैन');
    if (s.status !== 'submitted') throw badRequest('पेश गरिएको सर्वेक्षण मात्र स्वीकृत गर्न सकिन्छ');
    if (s.version !== b.version) throw conflict('सर्वेक्षण परिवर्तन भइसकेको छ, पुनः लोड गर्नुहोस्', { currentVersion: s.version });
    const answers = openAnswers(parseJson(s.answers));
    answers.verify = { ...(answers.verify || {}), verifier_name: b.verifier_name, verifier_sign: b.verifier_sign };
    const v = validate(answers, { mode: 'submit', role: 'admin' });
    if (v.errors.length) throw unprocessable('सर्वेक्षणमा त्रुटि छ — स्वीकृत गर्न मिल्दैन, फिर्ता पठाउनुहोस्', { errors: v.errors });
    await query(`UPDATE surveys SET status = 'approved', answers = ?, reviewer_id = ?, reviewed_at = NOW(), review_comment = ?, review_notes = NULL,
      version = version + 1 WHERE id = ?`, [JSON.stringify(sealAnswers(v.answers)), req.user.id, b.comment || null, id], conn);
    await query('INSERT INTO survey_answers (survey_id, question_id, answer) VALUES (?,?,?) ON DUPLICATE KEY UPDATE answer = VALUES(answer)',
      [id, 'verify', JSON.stringify(v.answers.verify)], conn);
    await history(conn, id, 'submitted', 'approved', req.user.id, b.comment, { verifier_name: b.verifier_name, previous_notes: parseJson(s.review_notes) });
    await audit(req, 'survey.approve', 'survey', id, { verifier_name: b.verifier_name }, conn);
    return present(await one(SELECT_ONE, [id], conn));
  });
  res.json({ data: out });
});

const noteSchema = z.array(z.object({ q: z.string().max(20), note: z.string().trim().min(1).max(500) })).max(100);

router.post('/:id/reject', requireRole('supervisor', 'admin'), async (req, res) => {
  const id = idParam(req);
  const b = z.object({ version: z.number().int().positive(), comment: z.string().trim().min(3, 'फिर्ता पठाउने कारण लेख्नुहोस्').max(1000), notes: noteSchema.optional() }).parse(req.body);
  const notes = Object.fromEntries((b.notes || []).map((n) => {
    if (!QIDS.has(n.q)) throw badRequest(`अज्ञात प्रश्न: ${n.q}`);
    return [n.q, n.note];
  }));
  const out = await tx(async (conn) => {
    const s = await lockSurvey(conn, id);
    assertWardAccess(req.user, s.ward_id);
    if (s.status !== 'submitted') throw badRequest('पेश गरिएको सर्वेक्षण मात्र फिर्ता पठाउन सकिन्छ');
    if (s.version !== b.version) throw conflict('सर्वेक्षण परिवर्तन भइसकेको छ, पुनः लोड गर्नुहोस्', { currentVersion: s.version });
    await query(`UPDATE surveys SET status = 'rejected', reviewer_id = ?, reviewed_at = NOW(), review_comment = ?, review_notes = ?,
      reject_count = reject_count + 1, version = version + 1 WHERE id = ?`,
      [req.user.id, b.comment, Object.keys(notes).length ? JSON.stringify(notes) : null, id], conn);
    await history(conn, id, 'submitted', 'rejected', req.user.id, b.comment, Object.keys(notes).length ? { notes } : null);
    await audit(req, 'survey.reject', 'survey', id, { comment: b.comment, notes: Object.keys(notes) }, conn);
    return present(await one(SELECT_ONE, [id], conn));
  });
  res.json({ data: out });
});

router.post('/:id/reopen', requireRole('admin'), async (req, res) => {
  const id = idParam(req);
  const b = z.object({ version: z.number().int().positive(), comment: z.string().trim().min(3).max(1000) }).parse(req.body);
  const out = await tx(async (conn) => {
    const s = await lockSurvey(conn, id);
    if (s.status !== 'approved') throw badRequest('स्वीकृत सर्वेक्षण मात्र पुनः खोल्न सकिन्छ');
    if (s.version !== b.version) throw conflict('सर्वेक्षण परिवर्तन भइसकेको छ', { currentVersion: s.version });
    const answers = openAnswers(parseJson(s.answers));
    if (answers.verify) { delete answers.verify.verifier_name; delete answers.verify.verifier_sign; }
    await query(`UPDATE surveys SET status = 'rejected', answers = ?, review_comment = ?, reviewer_id = ?, reviewed_at = NOW(),
      reject_count = reject_count + 1, version = version + 1 WHERE id = ?`, [JSON.stringify(sealAnswers(answers)), b.comment, req.user.id, id], conn);
    await query('UPDATE survey_answers SET answer = ? WHERE survey_id = ? AND question_id = ?', [JSON.stringify(answers.verify || {}), id, 'verify'], conn);
    await history(conn, id, 'approved', 'rejected', req.user.id, b.comment, { reopened: true });
    await audit(req, 'survey.reopen', 'survey', id, { comment: b.comment }, conn);
    return present(await one(SELECT_ONE, [id], conn));
  });
  res.json({ data: out });
});

export default router;
