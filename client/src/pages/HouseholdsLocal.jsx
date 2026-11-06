import { tr } from '@shared/i18n/index.js';
import { useCallback, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { useOffline, useAfterSync } from '../lib/offline.jsx';
import * as store from '../offline/store.js';
import { Alert, Badge, PageHeader, np } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';

const PAGE = 30;

export function SyncDot({ state }) {
  if (!state || state === 'synced') return null;
  const map = { pending: [tr("⇡ पठाउन बाँकी"), 'text-amber-700'], conflict: [tr("⚠ द्वन्द्व"), 'text-orange-700'], error: [tr("⚠ त्रुटि"), 'text-red-700'] };
  const [l, c] = map[state] || [state, ''];
  return <span className={`text-xs font-semibold ${c}`}>{l}</span>;
}

export default function HouseholdsLocal() {
  const { user } = useAuth();
  const { kick } = useOffline();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const f = { ward_id: sp.get('ward_id') || '', settlement_id: sp.get('settlement_id') || '', status: sp.get('status') || '', q: sp.get('q') || '' };
  const page = Number(sp.get('page') || 1);
  const [rows, setRows] = useState(null);
  const [wards, setWards] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [q, setQ] = useState(f.q);
  const [err, setErr] = useState(null);
  const wardId = f.ward_id || user.ward_id || '';

  const load = useCallback(async () => {
    const [h, w, s] = await Promise.all([
      store.listHouseholds(user.id, { ...f, ward_id: f.ward_id || undefined }),
      store.listWards(user.id),
      store.listSettlements(user.id, wardId || undefined),
    ]);
    setRows(h); setWards(w); setSettlements(s);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, sp.toString()]);
  useAfterSync(load);

  const set = (k, v) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); if (k !== 'page') n.delete('page'); setSp(n); };
  const start = async (h) => {
    setErr(null);
    try {
      const s = await store.startSurvey(user, h.uuid);
      kick();
      nav(`/s/${s.uuid}`);
    } catch (e) { setErr(e.message); }
  };
  const shown = rows ? rows.slice((page - 1) * PAGE, page * PAGE) : [];
  const pages = rows ? Math.max(1, Math.ceil(rows.length / PAGE)) : 1;

  return (
    <div>
      <PageHeader title={tr("घरधुरी सूची")}><Link to="/households/new" className="btn-primary"><Icon name="plus" size={17} />{tr("नयाँ घरधुरी")}</Link></PageHeader>
      {err && <div className="mb-3"><Alert>{err}</Alert></div>}
      <div className="card mb-4 grid gap-3 p-3 sm:grid-cols-4">
        {user.role === 'admin' && (
          <select className="field-input" value={f.ward_id} onChange={(e) => { const n = new URLSearchParams(sp); n.delete('settlement_id'); if (e.target.value) n.set('ward_id', e.target.value); else n.delete('ward_id'); setSp(n); }} aria-label={tr("वडा")}>
            <option value="">{tr("सबै वडा")}</option>
            {wards.map((w) => <option key={w.id} value={w.id}>{tr("वडा नं.")} {np(w.ward_no)}</option>)}
          </select>
        )}
        <select className="field-input" value={f.settlement_id} onChange={(e) => set('settlement_id', e.target.value)} aria-label={tr("बस्ती")}>
          <option value="">{tr("सबै बस्ती")}</option>
          {settlements.map((s) => <option key={s.id} value={s.id}>{s.code} – {s.name}</option>)}
        </select>
        <select className="field-input" value={f.status} onChange={(e) => set('status', e.target.value)} aria-label={tr("अवस्था")}>
          <option value="">{tr("सबै अवस्था")}</option><option value="none">{tr("सर्वेक्षण बाँकी")}</option><option value="draft">{tr("मस्यौदा")}</option>
          <option value="submitted">{tr("पेश गरिएको")}</option><option value="approved">{tr("स्वीकृत")}</option><option value="rejected">{tr("फिर्ता")}</option>
        </select>
        <form onSubmit={(e) => { e.preventDefault(); set('q', q); }} className="flex gap-2">
          <input className="field-input" placeholder={tr("नाम वा ID खोज्नुहोस्")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={tr("खोज")} />
          <button className="btn-secondary"><Icon name="search" size={16} />{tr("खोज")}</button>
        </form>
      </div>
      {rows && rows.length === 0 && <p className="card p-6 text-center text-slate-500">{tr("कुनै घरधुरी छैन।")} {wards.length === 0 && tr("पहिलो पटक इन्टरनेटमा जोडिएर सिंक गर्नुहोस्।")}</p>}
      <div className="space-y-2">
        {shown.map((h) => (
          <div key={h.uuid} className="card flex flex-wrap items-center justify-between gap-2 p-3">
            <div className="min-w-0">
              <p className="font-semibold">{h.head_name} <SyncDot state={h.sync_state} /></p>
              <p className="font-mono text-xs text-slate-500">{h.household_code}</p>
              <p className="text-xs text-slate-500">{tr("वडा")} {np(h.ward_no)} · {h.settlement_name} {tr("· घर")} {np(h.house_no)} {tr("/ परिवार")} {np(h.family_no)}</p>
            </div>
            <div className="flex items-center gap-3">
              <Badge status={h.survey_status} />
              {h.survey_status === 'draft' && h.survey_completion != null && <span className="text-xs text-slate-500">{np(Math.round(h.survey_completion))}%</span>}
              {h.mine && h.survey_uuid ? (
                <Link className="flex items-center gap-1 text-sm font-semibold text-blue-700 hover:underline" to={`/s/${h.survey_uuid}`}><Icon name={['draft', 'rejected'].includes(h.survey_status) ? 'edit' : 'view'} size={15} />{['draft', 'rejected'].includes(h.survey_status) ? tr("जारी राख्नुहोस्") : tr("हेर्नुहोस्")}<Icon name="next" size={14} /></Link>
              ) : h.survey_status ? (
                <span className="text-xs text-slate-500">{tr("अर्को गणकको")}</span>
              ) : (
                <button className="btn-primary px-3 py-1.5 text-sm" onClick={() => start(h)}><Icon name="plus" size={15} />{tr("सर्वेक्षण सुरु")}</button>
              )}
            </div>
          </div>
        ))}
      </div>
      {rows && (
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-slate-500">{tr("जम्मा")} {np(rows.length)}</span>
          {pages > 1 && <div className="flex gap-2">
            <button className="btn-secondary" disabled={page <= 1} onClick={() => set('page', String(page - 1))}><Icon name="previous" size={16} />{tr("अघिल्लो")}</button>
            <button className="btn-secondary" disabled={page >= pages} onClick={() => set('page', String(page + 1))}>{tr("अर्को")}<Icon name="next" size={16} /></button>
          </div>}
        </div>
      )}
    </div>
  );
}
