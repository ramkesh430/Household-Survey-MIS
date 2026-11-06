/**
 * Minimal i18n: the Nepali text is the key; English comes from dictionaries.
 *   tr('पेश गर्नु अघि {0} वटा त्रुटि सच्याउनुहोस्।', [n])
 * Leading/trailing whitespace of the key is preserved. Unknown keys fall back to Nepali.
 */
import { EN_QUESTIONNAIRE } from './en.questionnaire.js';
import { EN_UI, EN_PATTERNS } from './en.ui.js';

let LANG = 'ne';
export const LANGUAGES = [{ code: 'ne', label: 'नेपाली' }, { code: 'en', label: 'English' }];
export function setLanguage(lang) { LANG = lang === 'en' ? 'en' : 'ne'; }
export const getLanguage = () => LANG;

export function translate(text, lang = LANG) {
  if (lang !== 'en' || typeof text !== 'string') return text;
  const k = text.trim();
  if (!k) return text;
  let hit = EN_UI[k] ?? EN_QUESTIONNAIRE[k];
  if (hit === undefined) {
    for (const [re, fn] of EN_PATTERNS) { const m = re.exec(k); if (m) { hit = fn(m); break; } }
  }
  return hit === undefined ? text : text.replace(k, hit);
}

export function tr(key, args) {
  let s = translate(key);
  if (args) s = s.replace(/\{(\d+)\}/g, (_, i) => (args[i] ?? ''));
  return s;
}

/** Deep-translate a question definition for display (codes, values and keys untouched). */
const cache = new Map();
export function localizeQuestion(q, lang = LANG) {
  if (lang !== 'en') return q;
  const key = `${lang}:${q.id}`;
  if (cache.has(key)) return cache.get(key);
  const t = (s) => translate(s, lang);
  const opts = (list) => list?.map((o) => ({ ...o, label: t(o.label) }));
  const cols = (list) => list?.map((c) => ({ ...c, label: t(c.label), group: c.group ? t(c.group) : c.group, options: opts(c.options) }));
  const out = {
    ...q, no: q.no ? q.no.replace(/[०-९]/g, (d) => '०१२३४५६७८९'.indexOf(d)) : q.no, title: t(q.title), note: q.note ? t(q.note) : q.note,
    fields: q.fields.map((f) => ({
      ...f, label: f.label ? t(f.label) : f.label, rowLabel: f.rowLabel ? t(f.rowLabel) : f.rowLabel,
      options: opts(f.options), rows: f.rows?.map((r) => ({ ...r, label: t(r.label) })), cols: cols(f.cols), columns: cols(f.columns),
      groups: f.groups?.map((g) => ({ ...g, label: t(g.label) })),
    })),
  };
  cache.set(key, out);
  return out;
}
export function localizeSection(s, lang = LANG) { return lang === 'en' ? { ...s, title: translate(s.title, lang), pages: s.pages.replace(/[०-९]/g, (d) => '०१२३४५६७८९'.indexOf(d)) } : s; }
