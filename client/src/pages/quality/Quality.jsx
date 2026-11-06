import { tr } from '@shared/i18n/index.js';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, qs } from '../../lib/api.js';
import { useFetch } from '../../lib/useFetch.js';
import { useAuth, STATUS_LABEL } from '../../lib/auth.jsx';
import { REASON_LABEL } from '@shared/similarity.js';
import { Alert, Badge, PageHeader, Spinner, np } from '../../components/ui.jsx';
import { Flags } from '../review/ReviewQueue.jsx';
import Icon from '../../components/Icon.jsx';

const TABS = [['summary', tr("प्रगति तथा गुणस्तर"), 'reports'], ['flags', tr("संकेत भएका सर्वेक्षण"), 'warning'], ['duplicates', tr("सम्भावित दोहोरो घरधुरी"), 'households']];

export default function Quality() {
  const { user } = useAuth();
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') || 'summary';
  const wardId = sp.get('ward_id') || '';
  const wards = useFetch(user.role === 'admin' ? '/wards' : null);
  const set = (k, v) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); setSp(n); };
  return (
    <div>
      <PageHeader title={tr("तथ्यांक गुणस्तर")}>
        {user.role === 'admin' && (
          <select className="field-input" value={wardId} onChange={(e) => set('ward_id', e.target.value)} aria-label={tr("वडा")}>
            <option value="">{tr("सबै वडा")}</option>
            {wards.data?.data.map((w) => <option key={w.id} value={w.id}>{tr("वडा नं.")} {np(w.ward_no)}</option>)}
          </select>
        )}
      </PageHeader>
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map(([k, l, icon]) => <button key={k} onClick={() => set('tab', k === 'summary' ? '' : k)} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold ${tab === k ? 'bg-slate-800 text-white' : 'bg-white ring-1 ring-slate-200'}`}><Icon name={icon} size={15} />{l}</button>)}
      </div>
      {tab === 'summary' && <Summary wardId={wardId} />}
      {tab === 'flags' && <Flagged wardId={wardId} />}
      {tab === 'duplicates' && <Duplicates wardId={wardId} />}
    </div>
  );
}

function Summary({ wardId }) {
  const { data, error, loading } = useFetch(`/quality/summary${qs({ ward_id: wardId })}`);
  if (loading) return <Spinner />;
  if (error) return <Alert>{error.message}</Alert>;
  const { totals, enumerators } = data.data;
  const pct = totals.households ? Math.round(((totals.approved || 0) / totals.households) * 100) : 0;
  const cards = [[tr("दर्ता घरधुरी"), totals.households, 'households'], [tr("सर्वेक्षण सुरु नभएका"), totals.not_started, 'surveys'], [tr("मस्यौदा"), totals.draft || 0, 'edit'], [tr("समीक्षा बाँकी"), totals.submitted || 0, 'review'],
    [tr("स्वीकृत"), totals.approved || 0, 'submit'], [tr("फिर्ता (हाल)"), totals.rejected || 0, 'reset'], [tr("संकेत भएका"), totals.flagged || 0, 'warning'], [tr("GPS नभएका"), totals.no_gps || 0, 'gps']];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map(([l, n, icon]) => <div key={l} className="card p-3"><div className="flex items-center gap-1.5 text-xs text-slate-500"><Icon name={icon} size={15} className="text-blue-700" />{l}</div><p className="mt-1 text-2xl font-bold">{np(n)}</p></div>)}
      </div>
      <div className="card p-4">
        <div className="flex justify-between text-sm"><span>{tr("स्वीकृत भइसकेका घरधुरी")}</span><b>{np(pct)}%</b></div>
        <div className="mt-1 h-3 rounded-full bg-slate-200"><div className="h-3 rounded-full bg-emerald-600" style={{ width: `${pct}%` }} /></div>
      </div>
      <div className="card overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100 text-left"><tr>
            {[tr("गणक"), tr("जम्मा"), tr("मस्यौदा"), tr("पेश"), tr("स्वीकृत"), tr("फिर्ता"), tr("जम्मा फिर्ता पटक"), tr("औसत पूर्णता"), tr("चेतावनी"), tr("GPS छैन"), tr("GPS टाढा")].map((h) => <th key={h} className="whitespace-nowrap px-3 py-2">{h}</th>)}
          </tr></thead>
          <tbody>
            {enumerators.map((e) => (
              <tr key={e.enumerator_id} className="border-t">
                <td className="whitespace-nowrap px-3 py-2 font-semibold">{e.enumerator_name}</td>
                {[e.total, e.draft, e.submitted, e.approved, e.rejected, e.rejections].map((n, i) => <td key={i} className="px-3 py-2 text-right">{np(n)}</td>)}
                <td className="px-3 py-2 text-right">{np(e.avg_completion)}%</td>
                <td className={`px-3 py-2 text-right ${e.warnings ? 'text-amber-700' : ''}`}>{np(e.warnings)}</td>
                <td className={`px-3 py-2 text-right ${e.no_gps ? 'text-red-700' : ''}`}>{np(e.no_gps)}</td>
                <td className={`px-3 py-2 text-right ${e.gps_outlier ? 'text-red-700' : ''}`}>{np(e.gps_outlier)}</td>
              </tr>
            ))}
            {enumerators.length === 0 && <tr><td colSpan={11} className="p-6 text-center text-slate-500">{tr("अहिलेसम्म कुनै सर्वेक्षण छैन।")}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Flagged({ wardId }) {
  const { data, error, loading } = useFetch(`/quality/flags${qs({ ward_id: wardId })}`);
  const [flag, setFlag] = useState('');
  if (loading) return <Spinner />;
  if (error) return <Alert>{error.message}</Alert>;
  const rows = data.data.filter((s) => !flag || s.flags.includes(flag));
  return (
    <div>
      <select className="field-input mb-3 max-w-xs" value={flag} onChange={(e) => setFlag(e.target.value)} aria-label={tr("संकेत")}>
        <option value="">{tr("सबै संकेत")}</option>
        {Object.entries(data.flagLabels).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <div className="card divide-y">
        {rows.map((s) => (
          <Link key={s.id} to={`/review/${s.id}`} className="flex flex-wrap items-center justify-between gap-3 p-3 hover:bg-slate-50">
            <div>
              <p className="font-semibold">{s.head_name} <Badge status={s.status} /></p>
              <p className="text-xs text-slate-500"><span className="font-mono">{s.household_code}</span> · {s.settlement_name} · {s.enumerator_name}</p>
            </div>
            <Flags flags={s.flags} labels={data.flagLabels} />
          </Link>
        ))}
        {rows.length === 0 && <p className="p-6 text-center text-slate-500">{tr("कुनै संकेत भएको सर्वेक्षण छैन।")}</p>}
      </div>
    </div>
  );
}

function HouseholdCell({ h }) {
  return (
    <div className="text-sm">
      <p className="font-semibold">{h.head_name}</p>
      <p className="font-mono text-xs text-slate-500">{h.household_code}</p>
      <p className="text-xs text-slate-500">{h.settlement_name} {tr("· घर")} {np(h.house_no)}/{np(h.family_no)}{h.phone ? ` · ☎ ${h.phone}` : ''}</p>
      <p className="text-xs text-slate-500">{tr("दर्ता:")} {h.created_by_name} · {h.survey_status ? STATUS_LABEL[h.survey_status] : tr("सर्वेक्षण छैन")}</p>
    </div>
  );
}

function Duplicates({ wardId }) {
  const { data, error, loading, reload } = useFetch(`/quality/duplicates${qs({ ward_id: wardId })}`);
  const [msg, setMsg] = useState(null);
  const decide = async (p, decision, duplicateId) => {
    setMsg(null);
    try {
      await api('/quality/duplicates/review', { method: 'POST', body: { household_a: p.a.id, household_b: p.b.id, decision, duplicate_id: duplicateId } });
      setMsg({ kind: 'ok', text: decision === 'duplicate' ? tr("दोहोरो चिन्ह लगाइयो — यो घरधुरी प्रतिवेदनमा गनिने छैन।") : tr("फरक परिवार भनी चिन्ह लगाइयो।") });
      reload();
    } catch (e) { setMsg({ kind: 'error', text: e.message }); }
  };
  if (loading) return <Spinner />;
  if (error) return <Alert>{error.message}</Alert>;
  return (
    <div className="space-y-3">
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <p className="text-sm text-slate-600">{tr(
        "नाम मिल्दोजुल्दो (श/ष/स, ि/ी जस्ता हिज्जे फरक समेत), उही फोन वा उही घर नम्बर भएका जोडी। जाँचेर निर्णय गर्नुहोस्।"
      )}</p>
      {data.data.map((p) => (
        <div key={`${p.a.id}:${p.b.id}`} className="card p-4">
          <p className="mb-2 text-sm font-semibold text-red-700">{p.reasons.map((r) => `${REASON_LABEL[r.code]}${r.code === 'name' ? tr(" ({0}% मिल्दो)", [np(r.score)]) : ''}`).join(' · ')}</p>
          <div className="grid gap-3 sm:grid-cols-2"><HouseholdCell h={p.a} /><HouseholdCell h={p.b} /></div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn-secondary text-sm" onClick={() => decide(p, 'not_duplicate')}><Icon name="submit" size={15} />{tr("फरक परिवार हुन्")}</button>
            <button className="btn-danger text-sm" disabled={p.a.survey_status === 'approved'} onClick={() => decide(p, 'duplicate', p.a.id)}><Icon name="warning" size={15} />{tr("पहिलो दोहोरो हो")}</button>
            <button className="btn-danger text-sm" disabled={p.b.survey_status === 'approved'} onClick={() => decide(p, 'duplicate', p.b.id)}><Icon name="warning" size={15} />{tr("दोस्रो दोहोरो हो")}</button>
          </div>
        </div>
      ))}
      {data.data.length === 0 && <p className="card p-6 text-center text-slate-500">{tr("कुनै सम्भावित दोहोरो घरधुरी छैन।")}</p>}
    </div>
  );
}
