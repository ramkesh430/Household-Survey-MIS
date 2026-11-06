import { query } from '../db.js';

/** Append an audit-log entry. Never throws (audit failure must not break the request). */
export async function audit(req, action, entityType = null, entityId = null, details = null, conn) {
  try {
    await query(
      'INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, ip, user_agent) VALUES (?,?,?,?,?,?,?)',
      [
        req?.user?.id ?? null, action, entityType, entityId === null ? null : String(entityId),
        details ? JSON.stringify(details) : null, req?.ip ?? null, (req?.headers?.['user-agent'] || '').slice(0, 255) || null,
      ],
      conn,
    );
  } catch (e) {
    console.error('audit log failed', e.message);
  }
}
