import { tr } from '@shared/i18n/index.js';
/**
 * Local-first data operations. Every write goes to IndexedDB first and an
 * operation is queued in the outbox; the sync engine sends it when online.
 */
import { getDb } from './db.js';
import { householdCode } from '@shared/householdCode.js';
import { completion } from '@shared/engine.js';

const uuid = () => crypto.randomUUID();
export const nowIso = () => new Date().toISOString();

export class LocalError extends Error {
  constructor(code, message, details) { super(message); this.code = code; this.details = details; }
}

// ---------------- reference data ----------------
export async function listWards(userId) {
  const db = await getDb(userId);
  return (await db.getAll('wards')).sort((a, b) => a.ward_no - b.ward_no);
}
export async function cacheWards(userId, wards) {
  const db = await getDb(userId);
  const tx = db.transaction('wards', 'readwrite');
  await tx.objectStore('wards').clear();
  for (const ward of wards) await tx.objectStore('wards').put(ward);
  await tx.done;
}
export async function listSettlements(userId, wardId) {
  const db = await getDb(userId);
  const all = wardId ? await db.getAllFromIndex('settlements', 'ward_id', Number(wardId)) : await db.getAll('settlements');
  return all.sort((a, b) => a.code.localeCompare(b.code));
}
export async function cacheSettlements(userId, settlements) {
  const db = await getDb(userId);
  const tx = db.transaction('settlements', 'readwrite');
  for (const settlement of settlements) await tx.objectStore('settlements').put(settlement);
  await tx.done;
}
export async function cacheSettlement(userId, settlement) {
  const db = await getDb(userId);
  await db.put('settlements', settlement);
}

// ---------------- outbox ----------------
async function pendingOps(tx, entityUuid) {
  return tx.objectStore('outbox').index('uuid').getAll(entityUuid);
}

export async function enqueue(tx, op) {
  return tx.objectStore('outbox').add({
    op_id: uuid(), attempts: 0, created_at: nowIso(), next_attempt_at: 0, ...op,
  });
}

/** Keep at most one pending save per survey (the engine always sends the latest answers). */
async function ensureSaveOp(tx, surveyUuid, userId) {
  const ops = await pendingOps(tx, surveyUuid);
  if (ops.some((o) => o.type === 'survey.save' || o.type === 'survey.submit')) return;
  await enqueue(tx, { type: 'survey.save', uuid: surveyUuid, user_id: userId });
}

export async function outboxCount(userId) {
  const db = await getDb(userId);
  return db.count('outbox');
}

// ---------------- households ----------------
function decorateHousehold(h, settlementsById, wardsById) {
  const s = settlementsById[h.settlement_id];
  const w = wardsById[h.ward_id];
  return { ...h, settlement_code: s?.code, settlement_name: s?.name, ward_no: w?.ward_no };
}

export async function listHouseholds(userId, { ward_id, settlement_id, status, q } = {}) {
  const db = await getDb(userId);
  const [all, settlements, wards, surveys] = await Promise.all([db.getAll('households'), db.getAll('settlements'), db.getAll('wards'), db.getAll('surveys')]);
  const sById = Object.fromEntries(settlements.map((s) => [s.id, s]));
  const wById = Object.fromEntries(wards.map((w) => [w.id, w]));
  const localSurveys = Object.fromEntries(surveys.map((s) => [s.household_uuid, s]));
  const needle = q?.trim().toLowerCase();
  return all
    .map((h) => {
      const ls = localSurveys[h.uuid];
      const merged = ls ? { ...h, survey_uuid: ls.uuid, survey_id: ls.id, survey_status: ls.status, survey_completion: ls.completion, survey_sync: ls.sync_state, mine: true } : h;
      return decorateHousehold(merged, sById, wById);
    })
    .filter((h) => (!ward_id || h.ward_id === Number(ward_id))
      && (!settlement_id || h.settlement_id === Number(settlement_id))
      && (!status || (status === 'none' ? !h.survey_status : h.survey_status === status))
      && (!needle || h.head_name?.toLowerCase().includes(needle) || h.household_code?.toLowerCase().includes(needle)))
    .sort((a, b) => (a.ward_no - b.ward_no) || String(a.settlement_code).localeCompare(String(b.settlement_code)) || a.house_no - b.house_no || a.family_no - b.family_no);
}

export async function getHousehold(userId, hhUuid) {
  const db = await getDb(userId);
  const h = await db.get('households', hhUuid);
  if (!h) return null;
  const [s, w] = [await db.get('settlements', h.settlement_id), await db.get('wards', h.ward_id)];
  return decorateHousehold(h, { [h.settlement_id]: s }, { [h.ward_id]: w });
}

/** Register a household on this device. Blocks duplicates known locally (from the last sync). */
export async function createHousehold(user, data) {
  const db = await getDb(user.id);
  const settlement = await db.get('settlements', Number(data.settlement_id));
  if (!settlement || !settlement.is_active) throw new LocalError('BAD_SETTLEMENT', tr("बस्ती फेला परेन वा निष्क्रिय छ"));
  const ward = await db.get('wards', settlement.ward_id);
  const houseNo = Number(data.house_no); const familyNo = Number(data.family_no);
  if (!Number.isInteger(houseNo) || houseNo < 1 || !Number.isInteger(familyNo) || familyNo < 1) throw new LocalError('BAD_INPUT', tr("घर र परिवार क्र.सं. सही लेख्नुहोस्"));
  const dup = await db.getFromIndex('households', 'place', [settlement.id, houseNo, familyNo]);
  if (dup) throw new LocalError('DUPLICATE', tr("यही बस्ती, घर क्र.सं. र परिवार क्र.सं. भएको घरधुरी पहिले नै दर्ता छ"), { existing: decorateHousehold(dup, { [settlement.id]: settlement }, { [ward.id]: ward }) });
  const h = {
    uuid: uuid(), id: null,
    household_code: householdCode({ wardNo: ward.ward_no, settlementCode: settlement.code, houseNo, familyNo }),
    ward_id: settlement.ward_id, settlement_id: settlement.id, house_no: houseNo, family_no: familyNo,
    head_name: data.head_name.trim(), head_gender: data.head_gender || null, phone: data.phone || null,
    created_by: user.id, sync_state: 'pending', local_created_at: nowIso(),
  };
  const tx = db.transaction(['households', 'outbox'], 'readwrite');
  await tx.objectStore('households').add(h);
  await enqueue(tx, { type: 'household.create', uuid: h.uuid, user_id: user.id });
  await tx.done;
  return decorateHousehold(h, { [settlement.id]: settlement }, { [ward.id]: ward });
}

// ---------------- surveys ----------------
export async function listSurveys(userId) {
  const db = await getDb(userId);
  const [surveys, households, settlements, wards] = await Promise.all([db.getAll('surveys'), db.getAll('households'), db.getAll('settlements'), db.getAll('wards')]);
  const hByUuid = Object.fromEntries(households.map((h) => [h.uuid, h]));
  const sById = Object.fromEntries(settlements.map((s) => [s.id, s]));
  const wById = Object.fromEntries(wards.map((w) => [w.id, w]));
  return surveys.map((s) => ({ ...s, household: hByUuid[s.household_uuid] ? decorateHousehold(hByUuid[s.household_uuid], sById, wById) : null }))
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
}

export async function getSurvey(userId, sUuid) {
  const db = await getDb(userId);
  const s = await db.get('surveys', sUuid);
  if (!s) return null;
  return { ...s, household: await getHousehold(userId, s.household_uuid) };
}

/** Start (or reopen) the survey for a household. */
export async function startSurvey(user, hhUuid) {
  const db = await getDb(user.id);
  const h = await getHousehold(user.id, hhUuid);
  if (!h) throw new LocalError('NOT_FOUND', tr("घरधुरी फेला परेन"));
  const existing = await db.getFromIndex('surveys', 'household_uuid', hhUuid);
  if (existing) return existing;
  if (h.survey_uuid && h.survey_enumerator_id && h.survey_enumerator_id !== user.id) {
    throw new LocalError('TAKEN', tr("यस घरधुरीको सर्वेक्षण अर्को गणकले सुरु गरिसकेका छन्"));
  }
  const answers = {
    hdr: { ward_no: h.ward_no, settlement_code: h.settlement_code, settlement_name: h.settlement_name, house_no: h.house_no, family_no: h.family_no },
    q1: { head_name: h.head_name, ...(h.head_gender ? { head_gender: h.head_gender } : {}) },
  };
  const s = {
    uuid: uuid(), id: null, household_uuid: hhUuid, status: 'draft', answers, base_version: null,
    completion: Math.round(completion(answers) * 100), dirty: false, gps: null,
    updated_at: nowIso(), sync_state: 'pending', enumerator_id: user.id,
  };
  const tx = db.transaction(['surveys', 'outbox'], 'readwrite');
  await tx.objectStore('surveys').add(s);
  await enqueue(tx, { type: 'survey.create', uuid: s.uuid, user_id: user.id });
  await tx.done;
  return s;
}

const EDITABLE = ['draft', 'rejected'];

/** Persist answers locally and queue a save. */
export async function saveSurvey(user, sUuid, answers, { gps } = {}) {
  const db = await getDb(user.id);
  const tx = db.transaction(['surveys', 'outbox'], 'readwrite');
  const s = await tx.objectStore('surveys').get(sUuid);
  if (!s) throw new LocalError('NOT_FOUND', tr("सर्वेक्षण फेला परेन"));
  if (!EDITABLE.includes(s.status)) throw new LocalError('LOCKED', tr("पेश भइसकेको सर्वेक्षण सम्पादन गर्न मिल्दैन"));
  const next = {
    ...s, answers, dirty: true, updated_at: nowIso(), completion: Math.round(completion(answers) * 100),
    ...(gps !== undefined ? { gps } : {}),
    sync_state: s.sync_state === 'conflict' ? 'conflict' : 'pending',
  };
  await tx.objectStore('surveys').put(next);
  if (next.sync_state !== 'conflict') await ensureSaveOp(tx, sUuid, user.id);
  await tx.done;
  return next;
}

/** Mark as submitted locally; the engine sends it with full server-side validation. */
export async function submitSurvey(user, sUuid, answers, { gps } = {}) {
  const db = await getDb(user.id);
  const tx = db.transaction(['surveys', 'outbox'], 'readwrite');
  const s = await tx.objectStore('surveys').get(sUuid);
  if (!s) throw new LocalError('NOT_FOUND', tr("सर्वेक्षण फेला परेन"));
  if (!EDITABLE.includes(s.status)) throw new LocalError('LOCKED', tr("पहिले नै पेश भइसकेको छ"));
  if (s.sync_state === 'conflict') throw new LocalError('CONFLICT', tr("पहिले द्वन्द्व समाधान गर्नुहोस्"));
  const ops = await pendingOps(tx, sUuid);
  for (const o of ops) if (o.type === 'survey.save') await tx.objectStore('outbox').delete(o.seq);
  const next = {
    ...s, answers, dirty: true, status: 'submitted', pending_submit: true, prev_status: s.status, updated_at: nowIso(),
    completion: Math.round(completion(answers) * 100), ...(gps !== undefined ? { gps } : {}), sync_state: 'pending', sync_error: null,
  };
  await tx.objectStore('surveys').put(next);
  await enqueue(tx, { type: 'survey.submit', uuid: sUuid, user_id: user.id });
  await tx.done;
  return next;
}

export async function setSurveyGps(user, sUuid, gps) {
  const db = await getDb(user.id);
  const s = await db.get('surveys', sUuid);
  if (!s) return null;
  if (!EDITABLE.includes(s.status)) throw new LocalError('LOCKED', tr("पेश भइसकेको सर्वेक्षण"));
  return saveSurvey(user, sUuid, s.answers, { gps });
}

// ---------------- conflict resolution ----------------
/** choice: 'server' = discard my edits; 'mine' = re-apply my answers on top of the server version. */
export async function resolveSurveyConflict(user, sUuid, choice) {
  const db = await getDb(user.id);
  const tx = db.transaction(['surveys', 'outbox'], 'readwrite');
  const s = await tx.objectStore('surveys').get(sUuid);
  if (!s?.conflict) { await tx.done; return s; }
  const server = s.conflict.server;
  const ops = await pendingOps(tx, sUuid);
  for (const o of ops) await tx.objectStore('outbox').delete(o.seq);
  let next;
  if (choice === 'server') {
    next = { ...s, answers: server.answers, base_version: server.version, status: server.status, review_comment: server.review_comment ?? s.review_comment, review_notes: server.review_notes ?? null,
      dirty: false, completion: Math.round(Number(server.completion ?? 0)), conflict: null, sync_state: 'synced', sync_error: null, pending_submit: false };
  } else {
    if (!EDITABLE.includes(server.status)) throw new LocalError('LOCKED', tr(
      "सर्भरमा यो सर्वेक्षण सम्पादन गर्न नमिल्ने अवस्थामा छ; सर्भरको संस्करण राख्नुहोस्"
    ));
    const wasSubmit = s.pending_submit;
    next = { ...s, base_version: server.version, status: wasSubmit ? 'submitted' : server.status, conflict: null, dirty: true, sync_state: 'pending', sync_error: null };
    await enqueue(tx, { type: wasSubmit ? 'survey.submit' : 'survey.save', uuid: sUuid, user_id: user.id });
  }
  await tx.objectStore('surveys').put(next);
  await tx.done;
  return next;
}

/** After a submit was rejected by server validation: reopen locally for correction. */
export async function reopenSurvey(user, sUuid) {
  const db = await getDb(user.id);
  const s = await db.get('surveys', sUuid);
  if (!s || !s.pending_submit) return s;
  const next = { ...s, status: s.prev_status || 'draft', pending_submit: false, sync_state: 'pending' };
  await db.put('surveys', next);
  return next;
}

/**
 * Household duplicate (409 from server):
 *  'link'    – use the household already on the server; my survey moves to it
 *  'discard' – delete my household and its survey
 *  'renumber'– change house / family number and retry
 */
export async function resolveHouseholdConflict(user, hhUuid, choice, extra = {}) {
  const db = await getDb(user.id);
  // read reference data before the transaction (IndexedDB transactions end when awaiting other work)
  const pre = await db.get('households', hhUuid);
  const settlement = pre ? await db.get('settlements', pre.settlement_id) : null;
  const ward = pre ? await db.get('wards', pre.ward_id) : null;
  if (choice === 'renumber') {
    const houseNo = Number(extra.house_no); const familyNo = Number(extra.family_no);
    if (!Number.isInteger(houseNo) || houseNo < 1 || !Number.isInteger(familyNo) || familyNo < 1) throw new LocalError('BAD_INPUT', tr("घर र परिवार क्र.सं. सही लेख्नुहोस्"));
    const clash = await db.getFromIndex('households', 'place', [pre.settlement_id, houseNo, familyNo]);
    if (clash && clash.uuid !== hhUuid) throw new LocalError('DUPLICATE', tr("यो नम्बरको घरधुरी पनि पहिले नै दर्ता छ"), { existing: clash });
  }
  const tx = db.transaction(['households', 'surveys', 'outbox'], 'readwrite');
  const h = await tx.objectStore('households').get(hhUuid);
  if (!h) { await tx.done; return null; }
  const ops = await pendingOps(tx, hhUuid);
  const survey = await tx.objectStore('surveys').index('household_uuid').get(hhUuid);
  if (choice === 'discard' || choice === 'link') {
    for (const o of ops) await tx.objectStore('outbox').delete(o.seq);
    await tx.objectStore('households').delete(hhUuid);
  }
  if (choice === 'discard' && survey) {
    for (const o of await pendingOps(tx, survey.uuid)) await tx.objectStore('outbox').delete(o.seq);
    await tx.objectStore('surveys').delete(survey.uuid);
  }
  if (choice === 'link') {
    const ex = h.conflict?.existing;
    if (!ex) throw new LocalError('NO_TARGET', tr("सर्भरको घरधुरी विवरण छैन"));
    await tx.objectStore('households').put({
      uuid: ex.uuid, id: ex.id, household_code: ex.household_code, ward_id: ex.ward_id, settlement_id: ex.settlement_id,
      house_no: ex.house_no, family_no: ex.family_no, head_name: ex.head_name, head_gender: ex.head_gender, phone: ex.phone,
      created_by: ex.created_by, survey_id: ex.survey_id, survey_status: ex.survey_status, sync_state: 'synced',
    });
    if (survey) {
      await tx.objectStore('surveys').put({ ...survey, household_uuid: ex.uuid, sync_state: 'pending', sync_error: null });
      for (const o of await pendingOps(tx, survey.uuid)) await tx.objectStore('outbox').put({ ...o, blocked: false, next_attempt_at: 0 });
    }
  }
  if (choice === 'renumber') {
    const houseNo = Number(extra.house_no); const familyNo = Number(extra.family_no);
    const next = { ...h, house_no: houseNo, family_no: familyNo, conflict: null, sync_state: 'pending', sync_error: null,
      household_code: householdCode({ wardNo: ward.ward_no, settlementCode: settlement.code, houseNo, familyNo }) };
    await tx.objectStore('households').put(next);
    for (const o of ops) await tx.objectStore('outbox').put({ ...o, blocked: false, next_attempt_at: 0 });
    if (survey) {
      const answers = { ...survey.answers, hdr: { ...survey.answers.hdr, house_no: houseNo, family_no: familyNo } };
      await tx.objectStore('surveys').put({ ...survey, answers });
    }
  }
  await tx.done;
  return true;
}

/** Items needing the user's attention. */
export async function listProblems(userId) {
  const db = await getDb(userId);
  const [hh, sv] = await Promise.all([db.getAll('households'), db.getAll('surveys')]);
  return {
    households: hh.filter((h) => h.sync_state === 'conflict' || h.sync_state === 'error'),
    surveys: sv.filter((s) => s.sync_state === 'conflict' || s.sync_state === 'error'),
  };
}

/** Remove a survey (and its unsent operations) from this device. */
export async function discardSurvey(user, sUuid) {
  const db = await getDb(user.id);
  const tx = db.transaction(['surveys', 'outbox'], 'readwrite');
  for (const o of await pendingOps(tx, sUuid)) await tx.objectStore('outbox').delete(o.seq);
  await tx.objectStore('surveys').delete(sUuid);
  await tx.done;
}
