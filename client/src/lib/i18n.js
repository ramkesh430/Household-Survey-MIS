/** Must be imported first (before any module that calls tr() at load time). */
import { setLanguage } from '@shared/i18n/index.js';

const KEY = 'hhs.lang';
export const getStoredLanguage = () => { try { return localStorage.getItem(KEY) || 'ne'; } catch { return 'ne'; } };
export function switchLanguage(lang) {
  try { localStorage.setItem(KEY, lang); } catch { /* private mode */ }
  window.location.reload(); // simplest way to re-render every label (unsaved form edits are already on the device)
}
setLanguage(getStoredLanguage());
if (typeof document !== 'undefined') document.documentElement.lang = getStoredLanguage();
