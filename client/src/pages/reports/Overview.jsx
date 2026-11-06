import { translateFilter } from './ReportFilters.jsx';
import { translate } from '@shared/i18n/index.js';
import { tr } from '@shared/i18n/index.js';
import { useEffect } from 'react';
import { qs } from '../../lib/api.js';
import { useFetch } from '../../lib/useFetch.js';
import { Alert, PageHeader, Spinner, np } from '../../components/ui.jsx';
import { DailyLines, Pyramid, StatTile, WardProgress } from '../../components/charts.jsx';
import ReportFilters, { ReportNav, useReportFilters } from './ReportFilters.jsx';

/** Live management dashboard (refreshes every minute). */
export default function Overview({ embedded = false }) {
  const [f] = useReportFilters();
  const { data, error, loading, reload } = useFetch(`/reports/overview${qs(f)}`);
  useEffect(() => { const t = setInterval(reload, 60_000); return () => clearInterval(t); }, [reload]);
  const d = data?.data;
  const ind = (id) => d?.demography.find((i) => i.id === id);
  const t = d?.totals || {};
  return (
    <div>
      {!embedded && <PageHeader title={tr("प्रतिवेदन तथा तथ्यांक")} />}
      {!embedded && <ReportNav />}
      <ReportFilters>
        <span className="self-center text-xs text-slate-500">{d ? tr(
          "अद्यावधिक: {0} · हरेक मिनेट",
          [new Date(d.generatedAt).toLocaleTimeString('ne-NP')]
        ) : ''}</span>
      </ReportFilters>
      {loading && !d && <Spinner />}
      {error && <Alert>{error.status ? error.message : tr("प्रतिवेदनका लागि इन्टरनेट चाहिन्छ।")}</Alert>}
      {d && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">{translateFilter(d.filter)}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatTile label={tr("दर्ता घरधुरी")} value={t.households} />
            <StatTile label={tr("सर्वेक्षण सुरु")} value={t.started} note={t.households ? `${np(Math.round((t.started / t.households) * 100))}%` : ''} />
            <StatTile label={tr("समीक्षा बाँकी")} value={t.submitted} />
            <StatTile label={tr("स्वीकृत")} value={t.approved} note={t.households ? tr("{0}% घरधुरी", [np(Math.round((t.approved / t.households) * 100))]) : ''} />
            <StatTile label={tr("जनसंख्या (गणना भएका)")} value={ind('population')?.value} unit="जना" />
            <StatTile label={tr("औसत परिवार संख्या")} value={ind('avg_size')?.value} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="card p-4">
              <h2 className="mb-3 font-bold">{tr("वडागत प्रगति")}</h2>
              {d.wards.length ? <WardProgress wards={d.wards} /> : <p className="text-sm text-slate-500">{tr("घरधुरी दर्ता भएको छैन।")}</p>}
            </section>
            <section className="card p-4">
              <h2 className="mb-3 font-bold">{tr("पछिल्लो ३० दिन: दैनिक सर्वेक्षण")}</h2>
              <DailyLines days={d.days} series={[{ key: 'submitted', label: tr("पेश"), color: 'var(--series-1)' }, { key: 'approved', label: tr("स्वीकृत"), color: 'var(--series-2)' }]} />
            </section>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="card p-4">
              <h2 className="mb-1 font-bold">{tr("उमेर र लिङ्ग अनुसार जनसंख्या")}</h2>
              <p className="mb-3 text-xs text-slate-500">{tr("महिला")} {np(ind('female')?.value ?? 0)} {tr("· पुरुष")} {np(ind('male')?.value ?? 0)} {tr("· तेस्रो लिङ्गी")} {np(ind('third')?.value ?? 0)}</p>
              {d.pyramid && <Pyramid rows={d.pyramid.rows.map((r) => ({ ...r, label: translate(r.label), ...d.pyramid.cells[r.key] }))} />}
            </section>
            <section className="card p-4">
              <h2 className="mb-3 font-bold">{tr("मुख्य जनसांख्यिकीय सूचक")}</h2>
              <div className="grid grid-cols-2 gap-3">
                {d.demography.filter((i) => !['households', 'population', 'avg_size'].includes(i.id)).map((i) => (
                  <StatTile key={i.id} label={translate(i.label)} value={i.value} unit={translate(i.unit)} note={i.share != null ? tr("जनसंख्याको {0}%", [np(i.share)]) : ''} />
                ))}
              </div>
            </section>
          </div>
          <section className="card overflow-x-auto">
            <table className="min-w-full text-sm">
              <caption className="p-3 text-left font-bold">{tr("वडागत तालिका")}</caption>
              <thead className="bg-slate-100 text-left"><tr>{[tr("वडा"), tr("घरधुरी"), tr("सुरु नभएको"), tr("मस्यौदा"), tr("समीक्षा बाँकी"), tr("फिर्ता"), tr("स्वीकृत"), tr("जनसंख्या")].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
              <tbody>
                {d.wards.map((w) => (
                  <tr key={w.ward_id} className="border-t tabular-nums">
                    <td className="px-3 py-2 font-semibold">{np(w.ward_no)}</td>
                    {[w.households, w.households - w.started, w.draft, w.submitted, w.rejected, w.approved, w.population].map((v, i) => <td key={i} className="px-3 py-2">{np(v)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}
    </div>
  );
}
