import { tr } from '@shared/i18n/index.js';
/** Fetch wrapper with access-token auth and transparent refresh-token rotation. */
const BASE = import.meta.env.VITE_API_BASE || '';
const KEY = 'hhs.session';

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message || `HTTP ${status}`);
    this.status = status;
    this.code = body?.error?.code;
    this.details = body?.error?.details;
  }
}

export const session = {
  get() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } },
  set(s) { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); listeners.forEach((l) => l(s)); },
};
const listeners = new Set();
export const onSessionChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

let refreshing = null;
async function refresh() {
  const s = session.get();
  if (!s?.refreshToken) throw new ApiError(401, { error: { message: tr("सत्र सकियो") } });
  if (!refreshing) {
    refreshing = fetch(`${BASE}/api/auth/refresh`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: s.refreshToken }),
    }).then(async (r) => {
      const body = await r.json().catch(() => ({}));
      // only a definitive 401 ends the session; server/network trouble keeps the user logged in (offline work continues)
      if (!r.ok) { if (r.status === 401) session.set(null); throw new ApiError(r.status, body); }
      session.set({ user: body.user, accessToken: body.accessToken, refreshToken: body.refreshToken });
      return body;
    }).finally(() => { refreshing = null; });
  }
  return refreshing;
}

export async function api(path, { method = 'GET', body, retry = true } = {}) {
  const s = session.get();
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(s?.accessToken ? { Authorization: `Bearer ${s.accessToken}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && retry && s?.refreshToken && !path.startsWith('/auth/login')) {
    await refresh();
    return api(path, { method, body, retry: false });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export const qs = (params) => {
  const p = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return p.length ? `?${new URLSearchParams(p).toString()}` : '';
};
