import { sealAnswers, openAnswers, sealQuestion } from '../services/crypto.js';
import { Router } from 'express';
import { z } from 'zod';
import { query, parseJson } from '../db.js';
import { wardScope } from '../services/scope.js';
import { FORM_ID, FORM_VERSION } from '../../../shared/index.js';

/**
 * Offline sync – download side.
 * GET /api/sync/pull?since=<ISO>
 * Returns everything the device needs to work offline for the caller's scope:
 *  - wards & settlements (always full; small)
 *  - households in scope (changed since `since`)
 *  - the caller's own surveys with answers (changed since `since`)
 * The client stores `serverTime` and sends it back as `since` next time.
 */
const router = Router();
const MAX_HOUSEHOLDS = 20000;

router.get('/pull', async (req, res) => {
  const q = z.object({ since: z.string().datetime().optional() }).parse(req.query);
  const [{ now }] = await query('SELECT UTC_TIMESTAMP(3) AS now');
  // 2 s overlap: updated_at has second precision; re-sending a few rows is harmless (client upserts)
  const since = q.since ? new Date(Date.parse(q.since) - 2000) : null;
  const scope = wardScope(req.user);

  const wards = await query(`SELECT id, ward_no, name, is_active FROM wards ${scope !== null ? 'WHERE id = ?' : ''} ORDER BY ward_no`, scope !== null ? [scope] : []);
  const settlements = await query(`SELECT id, ward_id, code, name, is_active FROM settlements ${scope !== null ? 'WHERE ward_id = ?' : ''} ORDER BY ward_id, code`, scope !== null ? [scope] : []);

  const hWhere = []; const hParams = [];
  if (scope !== null) { hWhere.push('h.ward_id = ?'); hParams.push(scope); }
  if (since) { hWhere.push('(h.updated_at >= ? OR sv.updated_at >= ?)'); hParams.push(since, since); }
  const households = await query(
    `SELECT h.id, h.uuid, h.household_code, h.ward_id, h.settlement_id, h.house_no, h.family_no, h.head_name, h.head_gender, h.phone,
       h.created_by, h.duplicate_of, h.updated_at, sv.id AS survey_id, sv.uuid AS survey_uuid, sv.status AS survey_status,
       sv.enumerator_id AS survey_enumerator_id, sv.completion AS survey_completion
     FROM households h LEFT JOIN surveys sv ON sv.household_id = h.id AND sv.round_no = 1
     ${hWhere.length ? `WHERE ${hWhere.join(' AND ')}` : ''} ORDER BY h.id LIMIT ?`, [...hParams, MAX_HOUSEHOLDS]);

  let surveys = [];
  if (req.user.role !== 'supervisor') {
    const sWhere = ['sv.enumerator_id = ?']; const sParams = [req.user.id];
    if (since) { sWhere.push('sv.updated_at >= ?'); sParams.push(since); }
    surveys = (await query(
      `SELECT sv.id, sv.uuid, sv.household_id, h.uuid AS household_uuid, sv.status, sv.answers, sv.version, sv.completion,
         sv.review_comment, sv.review_notes, sv.reject_count, sv.gps_lat, sv.gps_lng, sv.gps_accuracy_m, sv.gps_captured_at, sv.submitted_at, sv.updated_at
       FROM surveys sv JOIN households h ON h.id = sv.household_id WHERE ${sWhere.join(' AND ')} ORDER BY sv.id`, sParams))
      .map((r) => ({ ...r, answers: openAnswers(parseJson(r.answers)), review_notes: parseJson(r.review_notes), completion: Number(r.completion) }));
  }

  res.json({
    serverTime: new Date(now).toISOString(),
    full: !since,
    form: { id: FORM_ID, version: FORM_VERSION },
    wards: wards.map((w) => ({ ...w, is_active: !!w.is_active })),
    settlements: settlements.map((s) => ({ ...s, is_active: !!s.is_active })),
    households,
    surveys,
    truncated: households.length >= MAX_HOUSEHOLDS,
  });
});

export default router;
