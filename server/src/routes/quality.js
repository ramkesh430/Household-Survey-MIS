import { Router } from 'express';
import { z } from 'zod';
import { one, query, tx } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { badRequest, notFound } from '../middleware/errors.js';
import { audit } from '../services/audit.js';
import { wardScope, assertWardAccess } from '../services/scope.js';
import { findDuplicatePairs, duplicateReasons } from '../../../shared/index.js';

const router = Router();
const OUTLIER_KM = Number(process.env.QUALITY_GPS_OUTLIER_KM || 2);
const POOR_ACCURACY_M = Number(process.env.QUALITY_GPS_POOR_ACCURACY_M || 50);

export const FLAG_LABEL = {
  warnings: 'तथ्यांक जाँच चेतावनी',
  no_gps: 'GPS स्थान छैन',
  gps_poor: `GPS शुद्धता ${POOR_ACCURACY_M} मिटरभन्दा कम`,
  gps_outlier: `बस्तीका अन्य घरभन्दा ${OUTLIER_KM} कि.मि.भन्दा टाढा`,
  resubmitted: 'पहिले फिर्ता भई पुनः पेश',
  duplicate_suspect: 'सम्भावित दोहोरो घरधुरी',
  low_completion: 'अपूर्ण उत्तर',
};

const scopeFilter = (user, alias = 'h', wardId) => {
  const scope = wardScope(user);
  if (scope !== null) return { sql: `${alias}.ward_id = ?`, params: [scope] };
  if (wardId) return { sql: `${alias}.ward_id = ?`, params: [wardId] };
  return { sql: '1=1', params: [] };
};

function haversineKm(a, b) {
  const R = 6371; const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat); const dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
const median = (arr) => { const s = [...arr].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** Load surveys in scope and attach quality flags. */
async function surveysWithFlags(user, { wardId, statuses }) {
  const f = scopeFilter(user, 'h', wardId);
  const rows = await query(
    `SELECT sv.id, sv.uuid, sv.status, sv.completion, sv.warning_count, sv.reject_count, sv.gps_lat, sv.gps_lng, sv.gps_accuracy_m,
       sv.submitted_at, sv.reviewed_at, sv.updated_at, sv.enumerator_id, sv.version, u.full_name AS enumerator_name,
       h.id AS household_id, h.household_code, h.head_name, h.phone, h.ward_id, h.settlement_id, h.house_no, h.family_no, h.uuid AS household_uuid,
       s.name AS settlement_name, w.ward_no
     FROM surveys sv JOIN households h ON h.id = sv.household_id JOIN settlements s ON s.id = h.settlement_id
     JOIN wards w ON w.id = h.ward_id JOIN users u ON u.id = sv.enumerator_id
     WHERE ${f.sql} AND h.duplicate_of IS NULL ${statuses ? `AND sv.status IN (${statuses.map(() => '?').join(',')})` : ''}
     ORDER BY sv.submitted_at IS NULL, sv.submitted_at, sv.id`, [...f.params, ...(statuses || [])]);

  // GPS centre per settlement (median of all surveyed points in scope)
  const pts = await query(`SELECT h.settlement_id, sv.gps_lat, sv.gps_lng FROM surveys sv JOIN households h ON h.id = sv.household_id
    WHERE ${f.sql} AND sv.gps_lat IS NOT NULL`, f.params);
  const centres = {};
  const bySettlement = {};
  pts.forEach((p) => { (bySettlement[p.settlement_id] ||= []).push(p); });
  for (const [sid, list] of Object.entries(bySettlement)) {
    if (list.length >= 3) centres[sid] = { lat: median(list.map((p) => Number(p.gps_lat))), lng: median(list.map((p) => Number(p.gps_lng))) };
  }

  // duplicate suspects among all households in scope
  const hh = await query(`SELECT h.id, h.uuid, h.ward_id, h.settlement_id, h.house_no, h.family_no, h.head_name, h.phone FROM households h
    WHERE ${f.sql} AND h.duplicate_of IS NULL`, f.params);
  const reviewed = await query('SELECT household_a, household_b FROM duplicate_reviews');
  const exclude = new Set(reviewed.map((r) => `${r.household_a}:${r.household_b}`));
  const suspects = new Set();
  findDuplicatePairs(hh, { exclude }).forEach((p) => { suspects.add(p.a.id); suspects.add(p.b.id); });

  return rows.map((r) => {
    const flags = [];
    if (r.warning_count > 0) flags.push('warnings');
    if (r.gps_lat == null) flags.push('no_gps');
    else {
      if (r.gps_accuracy_m != null && Number(r.gps_accuracy_m) > POOR_ACCURACY_M) flags.push('gps_poor');
      const c = centres[r.settlement_id];
      if (c && haversineKm(c, { lat: Number(r.gps_lat), lng: Number(r.gps_lng) }) > OUTLIER_KM) flags.push('gps_outlier');
    }
    if (r.reject_count > 0 && r.status === 'submitted') flags.push('resubmitted');
    if (suspects.has(r.household_id)) flags.push('duplicate_suspect');
    if (Number(r.completion) < 100 && r.status !== 'draft' && r.status !== 'rejected') flags.push('low_completion');
    return { ...r, completion: Number(r.completion), flags };
  });
}

/** Review queue: submitted surveys, oldest first, with quality flags. */
router.get('/queue', requireRole('supervisor', 'admin'), async (req, res) => {
  const q = z.object({ ward_id: z.coerce.number().int().optional() }).parse(req.query);
  const data = await surveysWithFlags(req.user, { wardId: q.ward_id, statuses: ['submitted'] });
  res.json({ data, flagLabels: FLAG_LABEL });
});

/** Surveys with at least one flag (any status except draft). */
router.get('/flags', requireRole('supervisor', 'admin'), async (req, res) => {
  const q = z.object({ ward_id: z.coerce.number().int().optional() }).parse(req.query);
  const data = (await surveysWithFlags(req.user, { wardId: q.ward_id, statuses: ['submitted', 'approved', 'rejected'] })).filter((s) => s.flags.length);
  res.json({ data, flagLabels: FLAG_LABEL });
});

/** Per-enumerator progress and quality. */
router.get('/summary', requireRole('supervisor', 'admin'), async (req, res) => {
  const q = z.object({ ward_id: z.coerce.number().int().optional() }).parse(req.query);
  const all = await surveysWithFlags(req.user, { wardId: q.ward_id });
  const f = scopeFilter(req.user, 'h', q.ward_id);
  const [{ households }] = await query(`SELECT COUNT(*) AS households FROM households h WHERE ${f.sql} AND h.duplicate_of IS NULL`, f.params);
  const by = new Map();
  for (const s of all) {
    if (!by.has(s.enumerator_id)) by.set(s.enumerator_id, { enumerator_id: s.enumerator_id, enumerator_name: s.enumerator_name, total: 0, draft: 0, submitted: 0, approved: 0, rejected: 0, rejections: 0, completionSum: 0, flagged: 0, no_gps: 0, gps_outlier: 0, warnings: 0 });
    const e = by.get(s.enumerator_id);
    e.total += 1; e[s.status] += 1; e.rejections += s.reject_count; e.completionSum += s.completion;
    if (s.flags.length) e.flagged += 1;
    if (s.flags.includes('no_gps') && s.status !== 'draft') e.no_gps += 1;
    if (s.flags.includes('gps_outlier')) e.gps_outlier += 1;
    if (s.flags.includes('warnings')) e.warnings += 1;
  }
  const enumerators = [...by.values()].map(({ completionSum, ...e }) => ({ ...e, avg_completion: e.total ? Math.round(completionSum / e.total) : 0 }))
    .sort((a, b) => a.enumerator_name.localeCompare(b.enumerator_name));
  const totals = enumerators.reduce((t, e) => {
    ['total', 'draft', 'submitted', 'approved', 'rejected', 'flagged', 'no_gps', 'gps_outlier', 'warnings', 'rejections'].forEach((k) => { t[k] = (t[k] || 0) + e[k]; });
    return t;
  }, { households: Number(households) });
  totals.not_started = Math.max(0, totals.households - (totals.total || 0));
  res.json({ data: { totals, enumerators } });
});

/** Suspected duplicate households (pairs not yet reviewed). */
router.get('/duplicates', requireRole('supervisor', 'admin'), async (req, res) => {
  const q = z.object({ ward_id: z.coerce.number().int().optional() }).parse(req.query);
  const f = scopeFilter(req.user, 'h', q.ward_id);
  const hh = await query(`SELECT h.id, h.uuid, h.household_code, h.ward_id, h.settlement_id, h.house_no, h.family_no, h.head_name, h.phone,
      s.name AS settlement_name, sv.id AS survey_id, sv.status AS survey_status, u.full_name AS created_by_name
    FROM households h JOIN settlements s ON s.id = h.settlement_id JOIN users u ON u.id = h.created_by
    LEFT JOIN surveys sv ON sv.household_id = h.id AND sv.round_no = 1
    WHERE ${f.sql} AND h.duplicate_of IS NULL`, f.params);
  const reviewed = await query('SELECT household_a, household_b FROM duplicate_reviews');
  const pairs = findDuplicatePairs(hh, { exclude: new Set(reviewed.map((r) => `${r.household_a}:${r.household_b}`)) });
  res.json({ data: pairs.slice(0, 500), total: pairs.length });
});

/**
 * Decide on a suspected pair.
 *  not_duplicate → pair is hidden from future lists
 *  duplicate     → `duplicate_id` is marked duplicate_of `original_id` and excluded from reports
 */
router.post('/duplicates/review', requireRole('supervisor', 'admin'), async (req, res) => {
  const b = z.object({
    household_a: z.number().int().positive(), household_b: z.number().int().positive(),
    decision: z.enum(['not_duplicate', 'duplicate']), duplicate_id: z.number().int().positive().optional(), note: z.string().trim().max(255).optional(),
  }).parse(req.body);
  const [lo, hi] = b.household_a < b.household_b ? [b.household_a, b.household_b] : [b.household_b, b.household_a];
  if (lo === hi) throw badRequest('दुई फरक घरधुरी चाहिन्छ');
  await tx(async (conn) => {
    const a = await one('SELECT * FROM households WHERE id = ? FOR UPDATE', [lo], conn);
    const c = await one('SELECT * FROM households WHERE id = ? FOR UPDATE', [hi], conn);
    if (!a || !c) throw notFound('घरधुरी फेला परेन');
    assertWardAccess(req.user, a.ward_id); assertWardAccess(req.user, c.ward_id);
    if (b.decision === 'duplicate') {
      if (![lo, hi].includes(b.duplicate_id)) throw badRequest('duplicate_id यी दुईमध्ये एक हुनुपर्छ');
      const original = b.duplicate_id === lo ? hi : lo;
      const dupSurvey = await one("SELECT status FROM surveys WHERE household_id = ? AND status = 'approved'", [b.duplicate_id], conn);
      if (dupSurvey) throw badRequest('स्वीकृत सर्वेक्षण भएको घरधुरीलाई दोहोरो मान्न मिल्दैन; अर्कोलाई दोहोरो चिन्ह लगाउनुहोस्');
      await query('UPDATE households SET duplicate_of = ? WHERE id = ?', [original, b.duplicate_id], conn);
    }
    await query('INSERT INTO duplicate_reviews (household_a, household_b, decision, user_id, note) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE decision = VALUES(decision), user_id = VALUES(user_id), note = VALUES(note)',
      [lo, hi, b.decision, req.user.id, b.note || null], conn);
    await audit(req, 'household.duplicate_review', 'household', `${lo}:${hi}`, { decision: b.decision, duplicate_id: b.duplicate_id }, conn);
  });
  res.json({ ok: true });
});

/** Candidates for a household about to be registered (used online and by tests). */
export async function possibleDuplicates(h, conn) {
  const rows = await query(`SELECT id, uuid, household_code, ward_id, settlement_id, house_no, family_no, head_name, phone FROM households
    WHERE ward_id = ? AND id <> ? AND duplicate_of IS NULL`, [h.ward_id, h.id || 0], conn);
  return rows.map((r) => ({ household: r, reasons: duplicateReasons(h, r) })).filter((x) => x.reasons.length);
}

export default router;
