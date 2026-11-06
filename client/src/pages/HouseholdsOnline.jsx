import { tr } from '@shared/i18n/index.js';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { qs } from '../lib/api.js';
import { useFetch } from '../lib/useFetch.js';
import { useAuth } from '../lib/auth.jsx';
import { Alert, Badge, PageHeader, Pager, Spinner, np } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';

export default function HouseholdsOnline() {
  const { user } = useAuth();
  const [sp, setSp] = useSearchParams();
  const params = { ward_id: sp.get('ward_id'), settlement_id: sp.get('settlement_id'), status: sp.get('status'), q: sp.get('q'), page: sp.get('page') || 1 };
  const { data, error, loading } = useFetch(`/households${qs(params)}`);
  const wards = useFetch('/wards');
  const wardId = params.ward_id || user.ward_id;
  const settlements = useFetch(wardId ? `/wards/${wardId}/settlements` : null);
  const [q, setQ] = useState(params.q || '');
  const set = (k, v) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); if (k !== 'page') n.delete('page'); setSp(n); };

  return (
    <div>
      <PageHeader title={tr("घरधुरी सूची")}>
      </PageHeader>
      <div className="card mb-4 grid gap-3 p-3 sm:grid-cols-4">
        {user.role === 'admin' && (
          <select className="field-input" value={params.ward_id || ''} onChange={(e) => { set('ward_id', e.target.value); }} aria-label={tr("वडा")}>
            <option value="">{tr("सबै वडा")}</option>
            {wards.data?.data.map((w) => <option key={w.id} value={w.id}>{tr("वडा नं.")} {np(w.ward_no)}</option>)}
          </select>
        )}
        <select className="field-input" value={params.settlement_id || ''} onChange={(e) => set('settlement_id', e.target.value)} aria-label={tr("बस्ती")} disabled={!wardId}>
          <option value="">{tr("सबै बस्ती")}</option>
          {settlements.data?.data.map((s) => <option key={s.id} value={s.id}>{s.code} – {s.name}</option>)}
        </select>
        <select className="field-input" value={params.status || ''} onChange={(e) => set('status', e.target.value)} aria-label={tr("अवस्था")}>
          <option value="">{tr("सबै अवस्था")}</option>
          <option value="none">{tr("सर्वेक्षण बाँकी")}</option><option value="draft">{tr("मस्यौदा")}</option>
          <option value="submitted">{tr("पेश गरिएको")}</option><option value="approved">{tr("स्वीकृत")}</option><option value="rejected">{tr("फिर्ता")}</option>
        </select>
        <form onSubmit={(e) => { e.preventDefault(); set('q', q); }} className="flex gap-2">
          <input className="field-input" placeholder={tr("नाम वा ID खोज्नुहोस्")} value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn-secondary"><Icon name="search" size={16} />{tr("खोज")}</button>
        </form>
      </div>
      {loading && <Spinner />}
      {error && <Alert>{error.message}</Alert>}
      {data && (
        <>
          <div className="space-y-2 md:hidden">
            {data.data.map((h) => (
              <div key={h.id} className="card p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{h.head_name}</p>
                    <p className="font-mono text-xs text-slate-500">{h.household_code}</p>
                    <p className="text-xs text-slate-500">{tr("वडा")} {np(h.ward_no)} · {h.settlement_name} {tr("· घर")} {np(h.house_no)} {tr("/ परिवार")} {np(h.family_no)}</p>
                  </div>
                  <Badge status={h.survey_status} />
                </div>
                <Action h={h} />
              </div>
            ))}
          </div>
          <div className="card hidden overflow-x-auto md:block">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100 text-left"><tr>
                {[tr("घरधुरी ID"), tr("परिवार मूली"), tr("वडा"), tr("बस्ती"), tr("घर / परिवार क्र.सं."), tr("अवस्था"), ''].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}
              </tr></thead>
              <tbody>
                {data.data.map((h) => (
                  <tr key={h.id} className="border-t">
                    <td className="px-3 py-2 font-mono text-xs">{h.household_code}</td>
                    <td className="px-3 py-2 font-semibold">{h.head_name}</td>
                    <td className="px-3 py-2">{np(h.ward_no)}</td>
                    <td className="px-3 py-2">{h.settlement_code} – {h.settlement_name}</td>
                    <td className="px-3 py-2">{np(h.house_no)} / {np(h.family_no)}</td>
                    <td className="px-3 py-2"><Badge status={h.survey_status} />{h.survey_status === 'draft' && <span className="ml-1 text-xs text-slate-500">{np(Math.round(h.survey_completion))}%</span>}</td>
                    <td className="px-3 py-2 text-right"><Action h={h} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.data.length === 0 && <p className="p-6 text-center text-slate-500">{tr("कुनै घरधुरी फेला परेन।")}</p>}
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => set('page', String(p))} />
        </>
      )}
    </div>
  );
}

function Action({ h }) {
  if (!h.survey_id) return null;
  return <Link className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:underline md:mt-0" to={`/surveys/view/${h.survey_id}`}><Icon name="view" size={15} />{tr("हेर्नुहोस्")}<Icon name="next" size={14} /></Link>;
}
