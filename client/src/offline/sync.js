import { tr } from '@shared/i18n/index.js';
/**
 * Sync engine: pushes the outbox in order, then pulls server changes.
 *
 * Guarantees
 *  - Operations are sent strictly in queue order; a failed operation blocks only
 *    later operations of the same household/survey, never unrelated ones.
 *  - Every request is idempotent (household/survey uuid, save op_id), so a
 *    request whose response was lost can be retried safely.
 *  - Server edits are never silently overwritten: a version mismatch becomes a
 *    "conflict" that the enumerator resolves explicitly.
 */
import { getDb, getMeta, setMeta } from './db.js';
import { nowIso } from './store.js';

const BACKOFF = [5e3, 15e3, 60e3, 300e3, 900e3];

const isNetworkError = (e) => !e?.status || e.status >= 500 || e.status === 429;

export class SyncEngine {
  constructor({ user, api, isOnline = () => navigator.onLine, now = () => Date.now() }) {
    this.user = user;
    this.api = api;
    this.isOnline = isOnline;
    this.now = now;
    this.listeners = new Set();
    this.running = null;
    this.state = { status: 'idle', pending: 0, conflicts: 0, errors: 0, lastSync: null, lastError: null };
  }

  subscribe(fn) { this.listeners.add(fn); fn(this.state); return () => this.listeners.delete(fn); }
  emit(patch) { this.state = { ...this.state, ...patch }; this.listeners.forEach((l) => l(this.state)); }

  async refreshCounts() {
    const db = await getDb(this.user.id);
    const [pending, hh, sv, lastSync] = await Promise.all([db.count('outbox'), db.getAll('households'), db.getAll('surveys'), getMeta(db, 'lastSyncAt')]);
    const conflicts = hh.filter((h) => h.sync_state === 'conflict').length + sv.filter((s) => s.sync_state === 'conflict').length;
    const errors = hh.filter((h) => h.sync_state === 'error').length + sv.filter((s) => s.sync_state === 'error').length;
    this.emit({ pending, conflicts, errors, lastSync });
  }

  /** Run one sync cycle (concurrent calls share the same run). */
  sync({ force = false } = {}) {
    if (!this.running) {
      this.running = this._run(force).finally(() => { this.running = null; });
    }
    return this.running;
  }

  async _run(force) {
    if (!this.isOnline()) { await this.refreshCounts(); this.emit({ status: 'offline' }); return { ok: false, offline: true }; }
    this.emit({ status: 'syncing', lastError: null });
    try {
      const pushed = await this.push(force);
      if (pushed.stopped) {
        await this.refreshCounts();
        this.emit({ status: pushed.auth ? 'auth' : 'offline', lastError: pushed.error || null });
        return { ok: false, ...pushed };
      }
      await this.pull();
      const db = await getDb(this.user.id);
      await setMeta(db, 'lastSyncAt', nowIso());
      await this.refreshCounts();
      this.emit({ status: 'idle' });
      return { ok: true, ...pushed };
    } catch (e) {
      await this.refreshCounts();
      this.emit({ status: isNetworkError(e) ? 'offline' : 'error', lastError: e.message });
      return { ok: false, error: e.message };
    }
  }

  // ---------------------------------------------------------------- push
  async push(force) {
    const db = await getDb(this.user.id);
    const ops = await db.getAll('outbox');
    const blockedEntities = new Set();
    let sent = 0;
    for (const op of ops) {
      if (op.user_id !== this.user.id) continue;
      const deps = await this.dependencies(db, op);
      if (op.blocked || deps.some((d) => blockedEntities.has(d))) { blockedEntities.add(op.uuid); continue; }
      if (!force && op.next_attempt_at && op.next_attempt_at > this.now()) { blockedEntities.add(op.uuid); continue; }
      try {
        const outcome = await this.send(db, op);
        if (outcome === 'blocked') { blockedEntities.add(op.uuid); continue; }
        sent += 1;
      } catch (e) {
        if (e.status === 401) return { stopped: true, auth: true, sent, error: tr("पुनः लगइन आवश्यक छ") };
        if (isNetworkError(e)) {
          const attempts = (op.attempts || 0) + 1;
          await db.put('outbox', { ...op, attempts, last_error: e.message, next_attempt_at: this.now() + BACKOFF[Math.min(attempts - 1, BACKOFF.length - 1)] });
          return { stopped: true, sent, error: e.message };
        }
        throw e;
      }
    }
    return { stopped: false, sent };
  }

  /** Entities an operation depends on (a survey depends on its household). */
  async dependencies(db, op) {
    if (op.type.startsWith('survey.')) {
      const s = await db.get('surveys', op.uuid);
      return s ? [s.household_uuid] : [];
    }
    return [];
  }

  async removeOp(db, op) { await db.delete('outbox', op.seq); }

  async send(db, op) {
    switch (op.type) {
      case 'household.create': return this.sendHousehold(db, op);
      case 'survey.create': return this.sendSurveyCreate(db, op);
      case 'survey.save':
      case 'survey.submit': return this.sendSurveySave(db, op);
      default: await this.removeOp(db, op); return 'done';
    }
  }

  async sendHousehold(db, op) {
    const h = await db.get('households', op.uuid);
    if (!h) { await this.removeOp(db, op); return 'done'; }
    try {
      const r = await this.api('/households', { method: 'POST', body: {
        uuid: h.uuid, settlement_id: h.settlement_id, house_no: h.house_no, family_no: h.family_no,
        head_name: h.head_name, head_gender: h.head_gender || null, phone: h.phone || null,
      } });
      await db.put('households', { ...h, id: r.data.id, household_code: r.data.household_code, sync_state: 'synced', sync_error: null, conflict: null });
      await this.removeOp(db, op);
      return 'done';
    } catch (e) {
      if (e.status === 409 && e.details?.existing) {
        await db.put('households', { ...h, sync_state: 'conflict', conflict: { type: 'duplicate', existing: e.details.existing }, sync_error: e.message });
        await db.put('outbox', { ...op, blocked: true });
        return 'blocked';
      }
      if (e.status && e.status < 500 && e.status !== 401 && e.status !== 429) {
        await db.put('households', { ...h, sync_state: 'error', sync_error: e.message });
        await db.put('outbox', { ...op, blocked: true });
        return 'blocked';
      }
      throw e;
    }
  }

  async sendSurveyCreate(db, op) {
    const s = await db.get('surveys', op.uuid);
    if (!s) { await this.removeOp(db, op); return 'done'; }
    try {
      const r = await this.api('/surveys', { method: 'POST', body: { household_uuid: s.household_uuid, uuid: s.uuid } });
      const cur = await db.get('surveys', op.uuid);
      await db.put('surveys', { ...cur, id: r.data.id, base_version: r.data.version, sync_state: cur.dirty ? 'pending' : 'synced', sync_error: null });
      await this.removeOp(db, op);
      return 'done';
    } catch (e) {
      if (e.status === 409) {
        await db.put('surveys', { ...s, sync_state: 'error', sync_error: tr("यस घरधुरीको सर्वेक्षण सर्भरमा अर्को गणकले सुरु गरिसकेका छन्।"), taken: true });
        await db.put('outbox', { ...op, blocked: true });
        return 'blocked';
      }
      if (e.status && e.status < 500 && e.status !== 401 && e.status !== 429) {
        await db.put('surveys', { ...s, sync_state: 'error', sync_error: e.message });
        await db.put('outbox', { ...op, blocked: true });
        return 'blocked';
      }
      throw e;
    }
  }

  async sendSurveySave(db, op) {
    const s = await db.get('surveys', op.uuid);
    if (!s) { await this.removeOp(db, op); return 'done'; }
    if (!s.id || s.base_version == null) return 'blocked'; // create not yet confirmed
    const submit = op.type === 'survey.submit';
    const snapshotAt = s.updated_at;
    const body = {
      answers: s.answers, version: s.base_version, op_id: op.op_id, client_updated_at: snapshotAt,
      ...(s.gps ? { gps: s.gps } : {}),
    };
    try {
      const r = await this.api(submit ? `/surveys/${s.id}/submit` : `/surveys/${s.id}`, { method: submit ? 'POST' : 'PUT', body });
      const cur = await db.get('surveys', op.uuid);
      const untouched = cur.updated_at === snapshotAt;
      await db.put('surveys', {
        ...cur,
        base_version: r.data.version,
        status: r.data.status,
        answers: untouched ? r.data.answers : cur.answers,
        completion: untouched ? Math.round(Number(r.data.completion)) : cur.completion,
        dirty: !untouched,
        pending_submit: false,
        warnings: r.warnings || [],
        sync_state: untouched ? 'synced' : 'pending',
        sync_error: null,
        synced_at: nowIso(),
      });
      await this.removeOp(db, op);
      if (!untouched && ['draft', 'rejected'].includes(r.data.status)) {
        await db.add('outbox', { type: 'survey.save', uuid: s.uuid, user_id: this.user.id, op_id: crypto.randomUUID(), attempts: 0, created_at: nowIso(), next_attempt_at: 0 });
      }
      return 'done';
    } catch (e) {
      if (e.status === 409 || (e.status === 400 && /सम्पादन गर्न मिल्दैन/.test(e.message))) {
        // someone else changed it (another device, or a supervisor) → keep both, ask the user
        let server = null;
        try { server = (await this.api(`/surveys/${s.id}`)).data; } catch { /* keep null */ }
        await db.put('surveys', { ...s, sync_state: 'conflict', sync_error: e.message, conflict: server ? { server: {
          answers: server.answers, version: server.version, status: server.status, completion: server.completion,
          review_comment: server.review_comment, review_notes: server.review_notes || null, updated_at: server.updated_at,
        } } : { server: null } });
        await this.removeOp(db, op);
        return 'blocked';
      }
      if (e.status === 422) {
        const errors = e.details?.errors || [];
        await db.put('surveys', {
          ...s, sync_state: 'error', sync_error: e.message, server_errors: errors,
          ...(submit ? { status: s.prev_status || 'draft', pending_submit: false } : {}),
        });
        await this.removeOp(db, op);
        return 'blocked';
      }
      if (e.status && e.status < 500 && e.status !== 401 && e.status !== 429) {
        await db.put('surveys', { ...s, sync_state: 'error', sync_error: e.message });
        await db.put('outbox', { ...op, blocked: true });
        return 'blocked';
      }
      throw e;
    }
  }

  // ---------------------------------------------------------------- pull
  async pull() {
    const db = await getDb(this.user.id);
    const since = await getMeta(db, 'lastPullServerTime');
    const r = await this.api(`/sync/pull${since ? `?since=${encodeURIComponent(since)}` : ''}`);
    const outbox = await db.getAll('outbox');
    const pendingUuids = new Set(outbox.map((o) => o.uuid));

    const tx = db.transaction(['wards', 'settlements', 'households', 'surveys', 'meta'], 'readwrite');
    await tx.objectStore('wards').clear();
    for (const w of r.wards) await tx.objectStore('wards').put(w);
    await tx.objectStore('settlements').clear();
    for (const s of r.settlements) await tx.objectStore('settlements').put(s);

    const hStore = tx.objectStore('households');
    for (const h of r.households) {
      const local = await hStore.get(h.uuid);
      if (local && (pendingUuids.has(h.uuid) || local.sync_state === 'conflict')) continue;
      await hStore.put({ ...local, ...h, sync_state: 'synced', sync_error: null, conflict: null });
    }

    const sStore = tx.objectStore('surveys');
    const dropOps = [];
    for (const srv of r.surveys) {
      const local = await sStore.get(srv.uuid);
      const fromServer = {
        uuid: srv.uuid, id: srv.id, household_uuid: srv.household_uuid, status: srv.status, answers: srv.answers || {},
        base_version: srv.version, completion: Math.round(Number(srv.completion)), review_comment: srv.review_comment,
        review_notes: srv.review_notes || null, reject_count: srv.reject_count || 0,
        gps: srv.gps_lat != null ? { lat: Number(srv.gps_lat), lng: Number(srv.gps_lng), accuracy: srv.gps_accuracy_m != null ? Number(srv.gps_accuracy_m) : null } : null,
        updated_at: srv.updated_at, dirty: false, sync_state: 'synced', sync_error: null, conflict: null, enumerator_id: this.user.id,
      };
      if (!local) { await sStore.put(fromServer); continue; }
      if (local.sync_state === 'conflict') continue;
      const localBusy = local.dirty || pendingUuids.has(srv.uuid);
      if (!localBusy) {
        if (srv.version !== local.base_version || srv.status !== local.status) await sStore.put({ ...local, ...fromServer });
      } else if (local.base_version != null && srv.version > local.base_version) {
        // changed on the server while I have unsent edits
        await sStore.put({ ...local, sync_state: 'conflict', sync_error: tr("सर्भरमा यो फारम परिवर्तन भएको छ"), conflict: { server: {
          answers: fromServer.answers, version: srv.version, status: srv.status, completion: srv.completion, review_comment: srv.review_comment,
          review_notes: srv.review_notes || null, updated_at: srv.updated_at,
        } } });
        dropOps.push(...outbox.filter((o) => o.uuid === srv.uuid).map((o) => o.seq));
      }
    }
    await tx.objectStore('meta').put({ key: 'lastPullServerTime', value: r.serverTime });
    await tx.objectStore('meta').put({ key: 'formVersion', value: r.form?.version });
    await tx.done;
    for (const seq of dropOps) await db.delete('outbox', seq);
    return r;
  }
}

// ---------------------------------------------------------------- singleton per user
let engine = null;
export function getEngine(user, api) {
  if (!user) return null;
  if (!engine || engine.user.id !== user.id) engine = new SyncEngine({ user, api });
  return engine;
}
export function resetEngine() { engine = null; }
