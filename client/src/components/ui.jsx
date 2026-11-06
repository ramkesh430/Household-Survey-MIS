import { tr } from '@shared/i18n/index.js';
import { toNepaliDigits } from '@shared/engine.js';
import Icon from './Icon.jsx';

export const np = (v) => toNepaliDigits(v ?? '');

export function Spinner({ label = tr("लोड हुँदैछ…") }) {
  return (
    <div className="flex items-center gap-2 p-6 text-slate-500" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      {label}
    </div>
  );
}

export function Alert({ kind = 'error', children }) {
  const cls = {
    error: 'border-red-200 bg-red-50 text-red-800',
    warn: 'border-amber-200 bg-amber-50 text-amber-900',
    ok: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    info: 'border-blue-200 bg-blue-50 text-blue-800',
  }[kind];
  const icon = { error: 'close', warn: 'warning', ok: 'submit', info: 'info' }[kind];
  return <div role={kind === 'error' ? 'alert' : 'status'} className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${cls}`}><Icon name={icon} size={17} className="mt-0.5 shrink-0" /><div className="min-w-0">{children}</div></div>;
}

export function Badge({ status }) {
  const map = {
    draft: [tr("मस्यौदा"), 'bg-slate-100 text-slate-700', 'edit'],
    submitted: [tr("पेश गरिएको"), 'bg-blue-100 text-blue-800', 'sync'],
    approved: [tr("स्वीकृत"), 'bg-emerald-100 text-emerald-800', 'submit'],
    rejected: [tr("फिर्ता"), 'bg-red-100 text-red-800', 'close'],
    none: [tr("सर्वेक्षण बाँकी"), 'bg-amber-100 text-amber-800', 'calendar'],
  };
  const [label, cls, icon] = map[status || 'none'] || [status, 'bg-slate-100', 'section'];
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}><Icon name={icon} size={13} />{label}</span>;
}

export function Field({ label, children, error, hint, htmlFor }) {
  return (
    <div className="space-y-1">
      {label && <label htmlFor={htmlFor} className="block text-sm font-semibold text-slate-700">{label}</label>}
      {children}
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

const PAGE_ICONS = [
  [['ड्यासबोर्ड', 'dashboard', 'overview'], 'dashboard'],
  [['घरधुरी', 'household'], 'households'],
  [['सर्वेक्षण', 'survey'], 'surveys'],
  [['समीक्षा', 'review'], 'review'],
  [['प्रतिवेदन', 'report'], 'reports'],
  [['गुणस्तर', 'quality'], 'quality'],
  [['प्रयोगकर्ता', 'user'], 'users'],
  [['वडा', 'बस्ती', 'ward'], 'wards'],
  [['अडिट', 'audit'], 'audit'],
  [['ब्याकअप', 'backup', 'restore'], 'backup'],
  [['सिंक', 'sync', 'offline'], 'sync'],
  [['पासवर्ड', 'password'], 'password'],
];

export function PageHeader({ title, children, icon }) {
  const titleText = String(title ?? '').toLocaleLowerCase();
  const titleIcon = icon || PAGE_ICONS.find(([terms]) => terms.some((term) => titleText.includes(term)))?.[1] || 'section';
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 className="app-page-title flex items-center gap-2 text-xl font-bold text-slate-900 sm:text-2xl"><Icon name={titleIcon} size={23} />{title}</h1>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export function Pager({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return <p className="mt-3 text-sm text-slate-500">{tr("जम्मा")} {np(total)}</p>;
  return (
    <div className="mt-3 flex items-center justify-between text-sm">
      <span className="text-slate-500">{tr("जम्मा")} {np(total)} {tr("· पृष्ठ")} {np(page)}/{np(pages)}</span>
      <div className="flex gap-2">
        <button className="btn-secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}><Icon name="previous" size={16} />{tr("अघिल्लो")}</button>
        <button className="btn-secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>{tr("अर्को")}<Icon name="next" size={16} /></button>
      </div>
    </div>
  );
}
