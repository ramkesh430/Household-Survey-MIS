import { tr } from '@shared/i18n/index.js';
import { useState } from 'react';
import { qs } from '../../lib/api.js';
import { useFetch } from '../../lib/useFetch.js';
import { Alert, PageHeader, Pager, Spinner } from '../../components/ui.jsx';

export default function AuditLogs() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const { data, error, loading } = useFetch(`/audit-logs${qs({ page, action })}`);
  return (
    <div>
      <PageHeader title={tr("अडिट लग")} />
      <select className="field-input mb-3 max-w-xs" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} aria-label={tr("कार्य")}>
        <option value="">{tr("सबै कार्य")}</option>
        {['auth', 'user', 'ward', 'settlement', 'household', 'survey'].map((a) => <option key={a} value={a}>{a}.*</option>)}
      </select>
      {loading && <Spinner />}
      {error && <Alert>{error.message}</Alert>}
      {data && (
        <>
          <div className="card overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100 text-left"><tr>{[tr("समय"), tr("प्रयोगकर्ता"), tr("कार्य"), tr("वस्तु"), 'IP', tr("विवरण")].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
              <tbody>
                {data.data.map((r) => (
                  <tr key={r.id} className="border-t align-top">
                    <td className="whitespace-nowrap px-3 py-2">{new Date(r.created_at).toLocaleString('ne-NP')}</td>
                    <td className="px-3 py-2">{r.username || '–'}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.action}</td>
                    <td className="px-3 py-2 text-xs">{r.entity_type ? `${r.entity_type} #${r.entity_id ?? ''}` : ''}</td>
                    <td className="px-3 py-2 text-xs">{r.ip}</td>
                    <td className="max-w-xs truncate px-3 py-2 font-mono text-xs" title={JSON.stringify(r.details)}>{r.details ? JSON.stringify(r.details) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </>
      )}
    </div>
  );
}
