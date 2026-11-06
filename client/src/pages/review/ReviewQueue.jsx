import { translate } from '@shared/i18n/index.js';
import { tr } from '@shared/i18n/index.js';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFetch } from '../../lib/useFetch.js';
import { useAuth } from '../../lib/auth.jsx';
import { qs } from '../../lib/api.js';
import { Alert, PageHeader, Spinner, np } from '../../components/ui.jsx';

export const FLAG_STYLE = {
  warnings: 'bg-amber-100 text-amber-800', no_gps: 'bg-slate-200 text-slate-700', gps_poor: 'bg-slate-200 text-slate-700',
  gps_outlier: 'bg-orange-100 text-orange-800', resubmitted: 'bg-blue-100 text-blue-800', duplicate_suspect: 'bg-red-100 text-red-800',
  low_completion: 'bg-red-100 text-red-800',
};

export function Flags({ flags, labels }) {
  if (!flags?.length) return <span className="text-xs text-emerald-700">{tr("✓ कुनै संकेत छैन")}</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {flags.map((f) => <span key={f} className={`rounded px-1.5 py-0.5 text-xs font-semibold ${FLAG_STYLE[f] || 'bg-slate-100'}`}>{translate(labels?.[f] || f)}</span>)}
    </span>
  );
}

export default function ReviewQueue() {
  const { user } = useAuth();
  const [wardId, setWardId] = useState('');
  const [enumerator, setEnumerator] = useState('');
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const wards = useFetch(user.role === 'admin' ? '/wards' : null);
  const { data, error, loading } = useFetch(`/quality/queue${qs({ ward_id: wardId })}`);
  const enumerators = useMemo(() => [...new Map((data?.data || []).map((s) => [s.enumerator_id, s.enumerator_name])).entries()], [data]);
  const rows = (data?.data || []).filter((s) => (!enumerator || String(s.enumerator_id) === enumerator) && (!onlyFlagged || s.flags.length));

  return (
    <div>
      <PageHeader title={tr("समीक्षा पर्खिरहेका सर्वेक्षण")} />
      <div className="card mb-4 flex flex-wrap items-center gap-3 p-3">
        {user.role === 'admin' && (
          <select className="field-input max-w-48" value={wardId} onChange={(e) => setWardId(e.target.value)} aria-label={tr("वडा")}>
            <option value="">{tr("सबै वडा")}</option>
            {wards.data?.data.map((w) => <option key={w.id} value={w.id}>{tr("वडा नं.")} {np(w.ward_no)}</option>)}
          </select>
        )}
        <select className="field-input max-w-56" value={enumerator} onChange={(e) => setEnumerator(e.target.value)} aria-label={tr("गणक")}>
          <option value="">{tr("सबै गणक")}</option>
          {enumerators.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} /> {tr("संकेत भएका मात्र")}</label>
        <span className="ml-auto text-sm text-slate-600">{tr("जम्मा")} {np(rows.length)}</span>
      </div>
      {loading && <Spinner />}
      {error && <Alert>{error.status ? error.message : tr("समीक्षाका लागि इन्टरनेट चाहिन्छ।")}</Alert>}
      <div className="card divide-y">
        {rows.map((s) => (
          <Link key={s.id} to={`/review/${s.id}`} className="flex flex-wrap items-center justify-between gap-3 p-3 hover:bg-slate-50">
            <div className="min-w-0">
              <p className="font-semibold">{s.head_name}</p>
              <p className="text-xs text-slate-500"><span className="font-mono">{s.household_code}</span> {tr("· वडा")} {np(s.ward_no)} · {s.settlement_name} · {s.enumerator_name}</p>
              <p className="text-xs text-slate-500">{tr("पेश:")} {s.submitted_at ? new Date(s.submitted_at).toLocaleString('ne-NP') : '—'}{s.reject_count > 0 && tr(" · पहिले {0} पटक फिर्ता", [np(s.reject_count)])}</p>
            </div>
            <Flags flags={s.flags} labels={data.flagLabels} />
          </Link>
        ))}
        {data && rows.length === 0 && <p className="p-6 text-center text-slate-500">{tr("समीक्षा गर्न बाँकी कुनै सर्वेक्षण छैन। 🎉")}</p>}
      </div>
    </div>
  );
}
