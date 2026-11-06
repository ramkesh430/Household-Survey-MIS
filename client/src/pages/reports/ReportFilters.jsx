import { getLanguage, translate } from '@shared/i18n/index.js';
import { tr } from '@shared/i18n/index.js';
import { NavLink, useSearchParams } from 'react-router-dom';
import { useFetch } from '../../lib/useFetch.js';
import { useAuth } from '../../lib/auth.jsx';
import { np } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';

/** Server filter description "वडा नं. 1 · सबै बस्ती · …" → current language. */
export function translateFilter(s) {
  if (getLanguage() !== 'en' || !s) return s;
  return s.split(' · ').map((seg) => {
    const w = /^वडा नं\. (\S+)$/.exec(seg); if (w) return `Ward no. ${w[1]}`;
    const st = /^बस्ती (\S+) (.+)$/.exec(seg); if (st) return `Settlement ${st[1]} ${st[2]}`;
    return { 'सबै वडा': 'All wards', 'सबै बस्ती': 'All settlements', 'स्वीकृत सर्वेक्षण मात्र': 'Approved surveys only', 'स्वीकृत + समीक्षा बाँकी': 'Approved + awaiting review' }[seg] || translate(seg);
  }).join(' · ');
}

export function useReportFilters() {
  const [sp, setSp] = useSearchParams();
  const f = { ward_id: sp.get('ward_id') || '', settlement_id: sp.get('settlement_id') || '', basis: sp.get('basis') || 'approved' };
  const set = (k, v) => {
    const n = new URLSearchParams(sp);
    if (v) n.set(k, v); else n.delete(k);
    if (k === 'ward_id') n.delete('settlement_id');
    n.delete('page');
    setSp(n);
  };
  return [f, set, sp];
}

export const THEME_TABS = [
  ['demography', tr("जनसांख्यिकी")], ['wash', tr("खानेपानी/सरसफाइ")], ['health', tr("स्वास्थ्य")], ['protection', tr("बाल संरक्षण")], ['education', tr("शिक्षा")],
  ['participation', tr("सहभागिता")], ['economy', tr("रोजगारी/आम्दानी")], ['agriculture', tr("कृषि/पशुपालन")], ['disaster', tr("विपद्")],
];

export function ReportNav() {
  const [, , sp] = useReportFilters();
  const keep = new URLSearchParams(sp); keep.delete('page'); keep.delete('q'); keep.delete('status');
  const qs = keep.toString() ? `?${keep}` : '';
  const cls = ({ isActive }) => `inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold ${isActive ? 'bg-blue-700 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'}`;
  return (
    <nav className="no-print -mx-3 mb-3 overflow-x-auto px-3 sm:mx-0 sm:px-0" aria-label={tr("प्रतिवेदनहरू")}>
      <ul className="flex gap-2 pb-1">
        <li><NavLink end to={`/reports${qs}`} className={cls}><Icon name="reports" size={15} />{tr("सारांश")}</NavLink></li>
        {THEME_TABS.map(([id, l]) => <li key={id}><NavLink to={`/reports/theme/${id}${qs}`} className={cls}><Icon name={id === 'agriculture' ? 'households' : id === 'disaster' ? 'warning' : 'reports'} size={15} />{l}</NavLink></li>)}
        <li><NavLink to={`/reports/households${qs}`} className={cls}><Icon name="households" size={15} />{tr("घरधुरीगत सूची")}</NavLink></li>
      </ul>
    </nav>
  );
}

export default function ReportFilters({ showBasis = true, children }) {
  const { user } = useAuth();
  const [f, set] = useReportFilters();
  const wards = useFetch(user.role === 'admin' ? '/wards' : null);
  const wardId = f.ward_id || user.ward_id;
  const settlements = useFetch(wardId ? `/wards/${wardId}/settlements` : null);
  return (
    <div className="no-print card mb-4 flex flex-wrap items-center gap-3 p-3">
      {user.role === 'admin' && (
        <select className="field-input max-w-40" value={f.ward_id} onChange={(e) => set('ward_id', e.target.value)} aria-label={tr("वडा")}>
          <option value="">{tr("सबै वडा")}</option>
          {wards.data?.data.map((w) => <option key={w.id} value={w.id}>{tr("वडा नं.")} {np(w.ward_no)}</option>)}
        </select>
      )}
      <select className="field-input max-w-56" value={f.settlement_id} disabled={!wardId} onChange={(e) => set('settlement_id', e.target.value)} aria-label={tr("बस्ती")}>
        <option value="">{tr("सबै बस्ती")}</option>
        {settlements.data?.data.map((s) => <option key={s.id} value={s.id}>{s.code} – {s.name}</option>)}
      </select>
      {showBasis && (
        <select className="field-input max-w-64" value={f.basis} onChange={(e) => set('basis', e.target.value === 'approved' ? '' : e.target.value)} aria-label={tr("आधार")}>
          <option value="approved">{tr("स्वीकृत सर्वेक्षण मात्र (अन्तिम)")}</option>
          <option value="submitted">{tr("स्वीकृत + समीक्षा बाँकी (अस्थायी)")}</option>
        </select>
      )}
      <div className="ml-auto flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
