import { session, api } from './api.js';

const BASE = import.meta.env.VITE_API_BASE || '';

/** Download an authenticated file (Excel/CSV export) and save it with the server's file name. */
export async function downloadFile(path) {
  const go = () => fetch(`${BASE}/api${path}`, { headers: { Authorization: `Bearer ${session.get()?.accessToken}` } });
  let res = await go();
  if (res.status === 401) { await api('/auth/me').catch(() => {}); res = await go(); } // triggers token refresh
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message || `HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition') || '';
  const name = /filename="([^"]+)"/.exec(cd)?.[1] || 'export';
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
