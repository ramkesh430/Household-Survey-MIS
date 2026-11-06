import { translateFilter } from './ReportFilters.jsx';
import { tr } from '@shared/i18n/index.js';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { qs } from '../../lib/api.js';
import { useFetch } from '../../lib/useFetch.js';
import { Alert, Badge, PageHeader, Pager, Spinner, np } from '../../components/ui.jsx';
import ReportFilters, { ReportNav, useReportFilters } from './ReportFilters.jsx';
import { ExportButtons } from './ThemeReport.jsx';

export default function HouseholdReport() {
  const [f, set, sp] = useReportFilters();
  const params = { ward_id: f.ward_id, settlement_id: f.settlement_id, status: sp.get('status') || 'any', q: sp.get('q') || '', page: sp.get('page') || 1 };
  const { data, error, loading } = useFetch(`/reports/households${qs(params)}`);
  const [q, setQ] = useState(params.q);
  return (
    <div>
      <PageHeader title={tr("प्रतिवेदन तथा तथ्यांक")} />
      <ReportNav />
      <ReportFilters showBasis={false}>
        <select className="field-input max-w-44" value={params.status} onChange={(e) => set('status', e.target.value === 'any' ? '' : e.target.value)} aria-label={tr("अवस्था")}>
          <option value="any">{tr("सबै अवस्था")}</option><option value="none">{tr("सर्वेक्षण बाँकी")}</option><option value="draft">{tr("मस्यौदा")}</option>
          <option value="submitted">{tr("समीक्षा बाँकी")}</option><option value="approved">{tr("स्वीकृत")}</option><option value="rejected">{tr("फिर्ता")}</option>
        </select>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); set('q', q); }}>
          <input className="field-input max-w-48" placeholder={tr("नाम/ID")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={tr("खोज")} />
        </form>
        <ExportButtons path="/reports/export/households" f={{ ...params, page: undefined }} print={false} />
      </ReportFilters>
      {loading && <Spinner />}
      {error && <Alert>{error.message}</Alert>}
      {data && (
        <>
          <p className="mb-2 text-sm text-slate-600">{translateFilter(data.filter)} {tr("· जम्मा")} {np(data.total)} {tr("घरधुरी")}</p>
          <div className="card overflow-x-auto">
            <table className="min-w-full text-sm tabular-nums">
              <thead className="bg-slate-100 text-left"><tr>
                {[tr("घरधुरी ID"), tr("परिवार मूली"), tr("वडा"), tr("बस्ती"), tr("परिवार संख्या"), tr("महिला"), tr("पुरुष"), tr("अवस्था"), tr("गणक"), 'GPS', ''].map((h) => <th key={h} className="whitespace-nowrap px-3 py-2">{h}</th>)}
              </tr></thead>
              <tbody>
                {data.data.map((r) => (
                  <tr key={r.household_code} className="border-t">
                    <td className="px-3 py-2 font-mono text-xs">{r.household_code}</td>
                    <td className="px-3 py-2 font-semibold">{r.head_name}</td>
                    <td className="px-3 py-2">{np(r.ward_no)}</td>
                    <td className="px-3 py-2">{r.settlement_name}</td>
                    <td className="px-3 py-2">{r.family_size != null ? np(r.family_size) : '—'}</td>
                    <td className="px-3 py-2">{r.female != null ? np(r.female) : '—'}</td>
                    <td className="px-3 py-2">{r.male != null ? np(r.male) : '—'}</td>
                    <td className="px-3 py-2"><Badge status={r.status} /></td>
                    <td className="px-3 py-2">{r.enumerator || '—'}</td>
                    <td className="px-3 py-2">{r.survey_id ? (r.has_gps ? '📍' : '—') : ''}</td>
                    <td className="px-3 py-2 text-right">{r.survey_id && <Link className="font-semibold text-blue-700 hover:underline" to={`/reports/profile/${r.survey_id}`}>{tr("विवरण")}</Link>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.data.length === 0 && <p className="p-6 text-center text-slate-500">{tr("कुनै घरधुरी फेला परेन।")}</p>}
          </div>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => set('page', String(p))} />
        </>
      )}
    </div>
  );
}
