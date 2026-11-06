import { query, tx, parseJson } from '../db.js';
import { SENSITIVE_QIDS, isEncrypted, needsRotation, decryptValue, encryptValue, sealAnswers, openAnswers } from './crypto.js';

/**
 * Idempotent: encrypt sensitive answers stored in plain text (data from before encryption was enabled),
 * and with { rotate: true } re-encrypt values that use an old key. Runs in batches.
 */
export async function encryptExisting({ rotate = false, log = console.log } = {}) {
  let changed = 0; let lastId = 0;
  for (;;) {
    const rows = await query('SELECT id, answers FROM surveys WHERE id > ? ORDER BY id LIMIT 500', [lastId]);
    if (!rows.length) break;
    for (const r of rows) {
      lastId = r.id;
      const a = parseJson(r.answers) || {};
      const plain = Object.keys(a).some((q) => SENSITIVE_QIDS.has(q) && a[q] && !isEncrypted(a[q]));
      const stale = rotate && Object.values(a).some(needsRotation);
      if (!plain && !stale) continue;
      const next = sealAnswers(stale ? openAnswers(a) : a);
      await tx(async (conn) => {
        await query('UPDATE surveys SET answers = ? WHERE id = ?', [JSON.stringify(next), r.id], conn);
        for (const qid of SENSITIVE_QIDS) {
          if (!(qid in next)) continue;
          await query('UPDATE survey_answers SET answer = ? WHERE survey_id = ? AND question_id = ?', [JSON.stringify(next[qid]), r.id, qid], conn);
        }
      });
      changed += 1;
    }
  }
  // per-question table rows that may exist without the survey JSON being plain (defensive)
  const loose = await query(`SELECT survey_id, question_id, answer FROM survey_answers WHERE question_id IN (${[...SENSITIVE_QIDS].map(() => '?').join(',')})`, [...SENSITIVE_QIDS]);
  for (const r of loose) {
    const v = parseJson(r.answer);
    if (isEncrypted(v) && !(rotate && needsRotation(v))) continue;
    await query('UPDATE survey_answers SET answer = ? WHERE survey_id = ? AND question_id = ?', [JSON.stringify(encryptValue(decryptValue(v))), r.survey_id, r.question_id]);
  }
  if (changed) log(`🔒 ${rotate ? 're-encrypted' : 'encrypted'} sensitive answers in ${changed} surveys`);
  return changed;
}
