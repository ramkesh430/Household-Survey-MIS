import { translateFilter } from './ReportFilters.jsx';
import { getLanguage, translate } from '@shared/i18n/index.js';
import { tr } from '@shared/i18n/index.js';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { qs } from '../../lib/api.js';
import { useFetch } from '../../lib/useFetch.js';
import { downloadFile } from '../../lib/download.js';
import { Alert, PageHeader, Spinner, np } from '../../components/ui.jsx';
import { StatTile } from '../../components/charts.jsx';
import ReportFilters, { ReportNav, useReportFilters } from './ReportFilters.jsx';
import QuestionResult from './QuestionResult.jsx';

export function ExportButtons({ path, f, print = true }) {
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const go = async (fmt) => {
    setBusy(fmt); setErr(null);
    try { await downloadFile(`${path}.${fmt}${qs({ ...f, lang: getLanguage() === 'en' ? 'en' : undefined })}`); } catch (e) { setErr(e.message); } finally { setBusy(null); }
  };
  return (
    <>
      <button className="btn-secondary px-3 py-1.5 text-sm" disabled={!!busy} onClick={() => go('xlsx')}>{busy === 'xlsx' ? '…' : '⬇ Excel'}</button>
      <button className="btn-secondary px-3 py-1.5 text-sm" disabled={!!busy} onClick={() => go('csv')}>{busy === 'csv' ? '…' : '⬇ CSV'}</button>
      {print && <button className="btn-secondary px-3 py-1.5 text-sm" onClick={() => window.print()} title={tr("प्रिन्ट संवादमा 'Save as PDF' छान्नुहोस्")}>{tr("⬇ PDF / प्रिन्ट")}</button>}
      {err && <span className="text-xs text-red-600">{err}</span>}
    </>
  );
}

export default function ThemeReport() {
  const { id } = useParams();
  const [f] = useReportFilters();
  const { data, error, loading } = useFetch(`/reports/theme/${id}${qs(f)}`);
  const r = data?.data;
  return (
    <div>
      <PageHeader title={tr("प्रतिवेदन तथा तथ्यांक")} />
      <ReportNav />
      <ReportFilters><ExportButtons path={`/reports/export/theme/${id}`} f={f} /></ReportFilters>
      {loading && <Spinner />}
      {error && <Alert>{error.status ? error.message : tr("प्रतिवेदनका लागि इन्टरनेट चाहिन्छ।")}</Alert>}
      {r && !loading && (
        <div className="space-y-4">
          <div>
            <p className="print-only text-xs text-slate-500">{tr("घरधुरी सर्वेक्षण व्यवस्थापन सूचना प्रणाली ·")} {new Date(r.generatedAt).toLocaleString('ne-NP')}</p>
            <h2 className="text-xl font-bold">{translate(r.theme.title)}</h2>
            <p className="text-sm text-slate-600">{translateFilter(r.filter)} · {np(r.households)} {tr("घरधुरी")}</p>
          </div>
          {r.households === 0 ? <Alert kind="info">{tr(
            "यो छनोटमा कुनै सर्वेक्षण छैन। \"स्वीकृत + समीक्षा बाँकी\" आधार छानेर हेर्नुहोस्।"
          )}</Alert> : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {r.indicators.map((i) => <StatTile key={i.id} label={translate(i.label)} value={i.value} unit={translate(i.unit)} hidden={i.sensitive && i.value === null}
                  note={i.share != null ? tr("जनसंख्याको {0}%", [np(i.share)]) : i.count != null ? tr("{0} घरधुरी", [np(i.count)]) : ''} />)}
              </div>
              <p className="text-xs text-slate-500">{tr("संवेदनशील प्रश्नमा")} {np(r.suppressBelow)} {tr("भन्दा कम संख्या \"<")}{np(r.suppressBelow)}{tr("\" देखाइन्छ — व्यक्ति पहिचान हुन नदिन।")}</p>
              {r.questions.map((q) => <QuestionResult key={q.id} q={q} />)}
            </>
          )}
        </div>
      )}
    </div>
  );
}
