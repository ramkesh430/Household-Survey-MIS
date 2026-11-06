import { tr } from '@shared/i18n/index.js';
import { Link, useSearchParams } from 'react-router-dom';
import { qs } from '../lib/api.js';
import { useFetch } from '../lib/useFetch.js';
import { Alert, Badge, PageHeader, Pager, Spinner, np } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';

export default function SurveysOnline() {
  const [sp, setSp] = useSearchParams();
  const params = { status: sp.get('status'), q: sp.get('q'), page: sp.get('page') || 1 };
  const { data, error, loading } = useFetch(`/surveys${qs(params)}`);
  const set = (k, v) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); if (k !== 'page') n.delete('page'); setSp(n); };
  return (
    <div>
      <PageHeader title={tr("सर्वेक्षणहरू")} />
      <div className="mb-4 flex flex-wrap gap-2">
        {[['', tr("सबै"), 'section'], ['draft', tr("मस्यौदा"), 'edit'], ['submitted', tr("पेश गरिएको"), 'sync'], ['approved', tr("स्वीकृत"), 'submit'], ['rejected', tr("फिर्ता"), 'close']].map(([v, l, icon]) => (
          <button key={v} onClick={() => set('status', v)} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${(params.status || '') === v ? 'bg-blue-700 text-white' : 'bg-white ring-1 ring-slate-200'}`}><Icon name={icon} size={14} />{l}</button>
        ))}
      </div>
      {loading && <Spinner />}
      {error && <Alert>{error.message}</Alert>}
      {data && (
        <>
          <div className="card divide-y">
            {data.data.map((s) => (
              <Link key={s.id} to={`/surveys/view/${s.id}`} className="flex flex-wrap items-center justify-between gap-2 p-3 hover:bg-slate-50">
                <div>
                  <p className="font-semibold">{s.head_name}</p>
                  <p className="text-xs text-slate-500"><span className="font-mono">{s.household_code}</span> {tr("· वडा")} {np(s.ward_no)} · {s.settlement_name} · {s.enumerator_name}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500">{np(Math.round(s.completion))}%</span>
                  {s.warning_count > 0 && <span className="text-xs text-amber-700">⚠ {np(s.warning_count)}</span>}
                  <Badge status={s.status} />
                </div>
              </Link>
            ))}
            {data.data.length === 0 && <p className="p-6 text-center text-slate-500">{tr("कुनै सर्वेक्षण छैन।")}</p>}
          </div>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => set('page', String(p))} />
        </>
      )}
    </div>
  );
}
