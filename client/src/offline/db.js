import { openDB } from 'idb';

/**
 * One IndexedDB database per user, so two people sharing a tablet never see
 * or sync each other's unsent work.
 */
const DB_VERSION = 1;
const cache = new Map();

export function dbName(userId) { return `hhs-offline-u${userId}`; }

export function getDb(userId) {
  if (!userId) throw new Error('getDb requires a user id');
  if (!cache.has(userId)) {
    cache.set(userId, openDB(dbName(userId), DB_VERSION, {
      upgrade(db) {
        db.createObjectStore('meta', { keyPath: 'key' });
        db.createObjectStore('wards', { keyPath: 'id' });
        const st = db.createObjectStore('settlements', { keyPath: 'id' });
        st.createIndex('ward_id', 'ward_id');
        const hh = db.createObjectStore('households', { keyPath: 'uuid' });
        hh.createIndex('settlement_id', 'settlement_id');
        hh.createIndex('place', ['settlement_id', 'house_no', 'family_no']);
        const sv = db.createObjectStore('surveys', { keyPath: 'uuid' });
        sv.createIndex('household_uuid', 'household_uuid');
        const ob = db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
        ob.createIndex('uuid', 'uuid');
      },
    }));
  }
  return cache.get(userId);
}

/** For tests / logout. */
export async function closeDb(userId) {
  const p = cache.get(userId);
  if (p) { (await p).close(); cache.delete(userId); }
}

export async function getMeta(db, key, fallback = null) {
  const r = await db.get('meta', key);
  return r ? r.value : fallback;
}
export async function setMeta(db, key, value) { await db.put('meta', { key, value }); }
