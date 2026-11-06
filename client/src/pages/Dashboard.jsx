import { tr, translate } from '@shared/i18n/index.js';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFetch } from '../lib/useFetch.js';
import { qs } from '../lib/api.js';
import { useOffline, useAfterSync } from '../lib/offline.jsx';
import * as store from '../offline/store.js';
import { useAuth, ROLE_LABEL } from '../lib/auth.jsx';
import { Alert, Badge, PageHeader, Spinner, np } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';
import { DailyLines, Pyramid, StatTile, WardProgress } from '../components/charts.jsx';
import ReportFilters, { useReportFilters } from './reports/ReportFilters.jsx';

const isManager = (role) => role === 'admin' || role === 'supervisor';

function useNetworkStatus() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

function KpiCard({ label, value, icon, tone, to, note }) {
  const content = (
    <>
      <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${tone.icon}`}><Icon name={icon} size={23} /></div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-600">{label}</p>
        <p className="mt-1 text-2xl font-bold leading-tight tabular-nums text-[#0B2F68] sm:text-3xl">{value === undefined ? '—' : np(value)}</p>
        {note && <p className="mt-1 text-xs text-slate-500">{note}</p>}
      </div>
      {to && <Icon name="next" size={18} className="text-slate-400" />}
    </>
  );
  const className = `flex min-h-28 items-center gap-3 rounded-2xl border border-slate-200 border-l-4 ${tone.border} bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md`;
  return to ? <Link to={to} className={className}>{content}</Link> : <div className={className}>{content}</div>;
}

function QuickAction({ to, icon, label, detail, tone = 'blue' }) {
  const tones = {
    blue: 'bg-blue-50 text-blue-800 group-hover:bg-blue-100',
    green: 'bg-emerald-50 text-emerald-800 group-hover:bg-emerald-100',
    orange: 'bg-amber-50 text-amber-900 group-hover:bg-amber-100',
    slate: 'bg-slate-100 text-slate-800 group-hover:bg-slate-200',
  };
  return (
    <Link to={to} className="group flex min-h-20 items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 transition hover:border-blue-200 hover:shadow-sm focus-visible:outline">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition ${tones[tone]}`}><Icon name={icon} size={21} /></span>
      <span className="min-w-0">
        <span className="block font-bold text-slate-800">{label}</span>
        {detail && <span className="mt-0.5 block text-xs text-slate-500">{detail}</span>}
      </span>
      <Icon name="next" size={17} className="ml-auto shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-blue-700" />
    </Link>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { enabled, state } = useOffline();
  const online = useNetworkStatus();
  const management = isManager(user.role);
  const [filters] = useReportFilters();
  const reports = useFetch(management && online ? `/reports/overview${qs(filters)}` : null);
  const stats = useFetch(!enabled ? '/surveys/stats' : null);
  const health = useFetch(online ? '/health' : null);
  const recent = useFetch(online ? '/surveys?page=1&pageSize=5' : null);
  const [local, setLocal] = useState(null);

  const loadLocal = useCallback(async () => {
    if (!enabled) return;
    const [households, surveys] = await Promise.all([store.listHouseholds(user.id), store.listSurveys(user.id)]);
    const counts = { draft: 0, submitted: 0, approved: 0, rejected: 0 };
    surveys.forEach((survey) => { counts[survey.status] = (counts[survey.status] || 0) + 1; });
    setLocal({ households: households.length, surveys: counts, recent: surveys.slice(0, 5) });
  }, [enabled, user.id]);
  useAfterSync(loadLocal);

  const report = reports.data?.data;
  const fallback = enabled ? local : stats.data?.data;
  const reportTotals = report?.totals;
  const surveyCounts = reportTotals
    ? { draft: reportTotals.draft, submitted: reportTotals.submitted, approved: reportTotals.approved, rejected: reportTotals.rejected }
    : fallback?.surveys;
  const householdCount = reportTotals?.households ?? fallback?.households;
  const indicators = report?.demography || [];
  const indicator = (id) => indicators.find((item) => item.id === id);
  const hasApprovedData = (reportTotals?.approved || 0) > 0;
  const population = hasApprovedData ? indicator('population')?.value : undefined;
  const male = hasApprovedData ? indicator('male')?.value : undefined;
  const female = hasApprovedData ? indicator('female')?.value : undefined;
  const avgFamilySize = hasApprovedData ? indicator('avg_size')?.value : undefined;
  const completedPercent = householdCount ? Math.round(((surveyCounts?.approved || 0) / householdCount) * 100) : 0;
  const recentItems = online ? recent.data?.data || [] : local?.recent || [];
  const recentLoading = online && recent.loading;
  const recentError = online ? recent.error : null;
  const reportError = management ? reports.error : null;
  const summaryLoading = management ? reports.loading && !report : enabled ? !local : stats.loading;

  useEffect(() => {
    if (!management || !online) return undefined;
    const timer = window.setInterval(reports.reload, 60_000);
    return () => window.clearInterval(timer);
  }, [management, online, reports.reload]);

  const actions = [
    user.role !== 'supervisor' && <QuickAction key="register" to="/households/new" icon="plus" label={tr("नयाँ घरधुरी दर्ता")} detail={tr("दर्ता प्रक्रिया खोल्नुहोस्")} tone="blue" />,
    user.role !== 'supervisor' && <QuickAction key="survey" to="/households" icon="surveys" label={tr("सर्वेक्षण सुरु गर्नुहोस्")} detail={tr("दर्ता भएको घरधुरी छान्नुहोस्")} tone="green" />,
    management && <QuickAction key="review" to="/review" icon="review" label={tr("समीक्षा बाँकी")} detail={tr("सर्वेक्षण जाँच र निर्णय")} tone="orange" />,
    management && <QuickAction key="reports" to="/reports" icon="reports" label={tr("प्रतिवेदनहरू")} detail={tr("तथ्यांक र निर्यात")} tone="slate" />,
    enabled && <QuickAction key="sync" to="/sync" icon="sync" label={tr("अफलाइन डाटा सिंक")} detail={tr("पठाउन बाँकी {0}", [np(state?.pending || 0)])} tone="blue" />,
  ].filter(Boolean);

  return (
    <div className="space-y-5">
      <section className="dashboard-hero relative isolate overflow-hidden rounded-2xl bg-[#0B2F68] shadow-sm">
        <img src="/municipal/municipal-office.png" alt={tr("मायादेवी गाउँपालिकाको कार्यालय भवन")} className="absolute inset-0 -z-20 h-full w-full object-cover object-center" onError={(e) => { e.currentTarget.hidden = true; }} />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#092c63]/95 via-[#0b3974]/80 to-[#0b3974]/35" />
        <div className="flex min-h-48 flex-col justify-between gap-5 p-5 text-white sm:min-h-52 sm:flex-row sm:items-end sm:p-7">
          <div className="max-w-2xl">
            <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold tracking-wide text-white"><Icon name="mapPin" size={15} />{tr("बरेवा, रुपन्देही, लुम्बिनी प्रदेश, नेपाल")}</p>
            <p className="text-sm font-semibold text-blue-100">{tr("मायादेवी गाउँपालिका")}</p>
            <p className="mt-1 text-2xl font-bold leading-tight sm:text-3xl">{tr("नमस्ते, {0}", [user.full_name])}</p>
            <p className="mt-1 text-sm text-blue-100">{tr("घरधुरी सर्वेक्षण व्यवस्थापन सूचना प्रणाली")} · {ROLE_LABEL[user.role]}</p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <img src="/municipal/nepal-government-emblem.png" alt={tr("नेपाल सरकार")} className="hidden h-12 w-12 rounded-lg bg-white/90 p-1 object-contain sm:block" onError={(e) => { e.currentTarget.hidden = true; }} />
            <img src="/municipal/mayadevi-logo.png" alt={tr("मायादेवी गाउँपालिकाको आधिकारिक लोगो")} className="h-14 w-14 rounded-full bg-white p-1 object-contain shadow" onError={(e) => { e.currentTarget.hidden = true; }} />
            {user.role !== 'supervisor' && <Link to="/households/new" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-white px-4 py-2 font-bold text-[#0B2F68] shadow-sm transition hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"><Icon name="plus" size={20} />{tr("नयाँ घरधुरी दर्ता")}</Link>}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageHeader title={tr("ड्यासबोर्ड")} icon="dashboard" />
        <div className="flex items-center gap-2 text-xs">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-semibold ${online ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}><span className={`h-2 w-2 rounded-full ${online ? 'bg-emerald-500' : 'bg-amber-500'}`} />{online ? tr("अनलाइन") : tr("अफलाइन")}</span>
          {enabled && <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 font-semibold text-blue-800"><Icon name={state?.status === 'syncing' ? 'sync' : 'offline'} size={14} />{tr("पठाउन बाँकी:")} {np(state?.pending || 0)}</span>}
        </div>
      </div>
      {management && <ReportFilters><span className="self-center text-xs text-slate-500">{report?.generatedAt ? tr("अद्यावधिक: {0}", [new Date(report.generatedAt).toLocaleTimeString('ne-NP')]) : ''}</span></ReportFilters>}
      {summaryLoading && <Spinner />}
      {reportError && <Alert>{reportError.message}</Alert>}
      {!management && stats.error && <Alert>{stats.error.message}</Alert>}

      <section aria-label={tr("मुख्य तथ्यांक")} className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        <KpiCard label={tr("दर्ता घरधुरी")} value={householdCount} icon="house" tone={{ icon: 'bg-blue-50 text-blue-700', border: 'border-l-blue-600' }} to="/households" />
        <KpiCard label={tr("कुल जनसंख्या")} value={population} icon="usersGroup" tone={{ icon: 'bg-violet-50 text-violet-700', border: 'border-l-violet-600' }} note={population === undefined ? tr("स्वीकृत सर्वेक्षणका तथ्यांक उपलब्ध छैनन्") : tr("स्वीकृत सर्वेक्षणमा आधारित")} />
        <KpiCard label={tr("सर्वेक्षण सम्पन्न")} value={surveyCounts?.approved} icon="circleCheck" tone={{ icon: 'bg-emerald-50 text-emerald-700', border: 'border-l-emerald-600' }} to="/surveys?status=approved" />
        <KpiCard label={tr("समीक्षा बाँकी")} value={surveyCounts?.submitted} icon="clock" tone={{ icon: 'bg-amber-50 text-amber-800', border: 'border-l-amber-500' }} to={management ? '/review' : '/surveys?status=submitted'} />
        <KpiCard label={tr("फिर्ता / अस्वीकृत")} value={surveyCounts?.rejected} icon="circleX" tone={{ icon: 'bg-rose-50 text-rose-700', border: 'border-l-rose-600' }} to="/surveys?status=rejected" />
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label={tr("थप तथ्यांक")}>
        <StatTile label={tr("परिवार")} value={householdCount} unit={tr("घरधुरी")} />
        <StatTile label={tr("पुरुष")} value={male} unit={tr("जना")} />
        <StatTile label={tr("महिला")} value={female} unit={tr("जना")} />
        <StatTile label={tr("औसत परिवार आकार")} value={avgFamilySize} unit={tr("जना")} />
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-[#0B2F68]"><Icon name="activity" size={21} />{tr("छिटो पहुँच")}</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{actions}</div>
      </section>

      {management && report && (
        <>
          <section className="grid gap-4 xl:grid-cols-2">
            <div className="card min-w-0 p-4 sm:p-5">
              <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="font-bold text-slate-900">{tr("वडागत सर्वेक्षण प्रगति")}</h2><p className="mt-1 text-xs text-slate-500">{tr("घरधुरी र सर्वेक्षणको वास्तविक अवस्था")}</p></div><Icon name="wards" size={22} className="text-blue-700" /></div>
              {report.wards.length ? <WardProgress wards={report.wards} /> : <p className="rounded-lg bg-slate-50 p-5 text-center text-sm text-slate-500">{tr("घरधुरी दर्ता भएको छैन।")}</p>}
              <div className="mt-4 rounded-lg bg-blue-50 p-3">
                <div className="flex justify-between gap-3 text-sm"><span className="font-semibold text-blue-950">{tr("स्वीकृत सर्वेक्षण सम्पन्नता")}</span><b className="text-blue-950">{np(completedPercent)}%</b></div>
                <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-blue-100" role="progressbar" aria-label={tr("स्वीकृत सर्वेक्षण सम्पन्नता")} aria-valuenow={completedPercent} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${completedPercent}%` }} /></div>
              </div>
            </div>
            <div className="card min-w-0 p-4 sm:p-5">
              <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="font-bold text-slate-900">{tr("विगत ३० दिनमा घरधुरी दर्ता")}</h2><p className="mt-1 text-xs text-slate-500">{tr("दर्ता मितिअनुसारको वास्तविक संख्या")}</p></div><Icon name="house" size={22} className="text-blue-700" /></div>
              {report.totals.households ? <DailyLines days={report.householdDays || []} series={[{ key: 'registered', label: tr("दर्ता"), color: 'var(--series-1)' }]} /> : <p className="rounded-lg bg-slate-50 p-5 text-center text-sm text-slate-500">{tr("घरधुरी दर्ता भएको छैन।")}</p>}
            </div>
            <div className="card min-w-0 p-4 sm:p-5">
              <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="font-bold text-slate-900">{tr("पछिल्लो ३० दिनका सर्वेक्षण")}</h2><p className="mt-1 text-xs text-slate-500">{tr("पेश र स्वीकृति मितिअनुसारको अवस्था")}</p></div><Icon name="surveys" size={22} className="text-blue-700" /></div>
              {report.days?.length ? <DailyLines days={report.days} series={[{ key: 'submitted', label: tr("पेश"), color: 'var(--series-1)' }, { key: 'approved', label: tr("स्वीकृत"), color: 'var(--series-3)' }]} /> : <p className="rounded-lg bg-slate-50 p-5 text-center text-sm text-slate-500">{tr("सर्वेक्षण गतिविधि उपलब्ध छैन।")}</p>}
            </div>
            <div className="card min-w-0 p-4 sm:p-5">
              <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="font-bold text-slate-900">{tr("लिङ्गअनुसार जनसंख्या")}</h2><p className="mt-1 text-xs text-slate-500">{tr("स्वीकृत सर्वेक्षणका तथ्यांक")}</p></div><Icon name="usersGroup" size={22} className="text-violet-700" /></div>
              {report.totals.approved > 0 && report.pyramid ? <Pyramid rows={report.pyramid.rows.map((row) => ({ ...row, label: translate(row.label), ...report.pyramid.cells[row.key] }))} /> : <p className="rounded-lg bg-slate-50 p-5 text-center text-sm text-slate-500">{tr("जनसंख्या तथ्यांक उपलब्ध छैन।")}</p>}
            </div>
          </section>
          <section className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><Icon name="mapPin" size={23} /></span>
              <div><h2 className="font-bold text-slate-900">{tr("GIS नक्सा")}</h2><p className="mt-1 max-w-3xl text-sm text-slate-600">{tr("प्रमाणित वडा सीमारेखा GeoJSON उपलब्ध नभएकाले नक्सा देखाइएको छैन। आधिकारिक भौगोलिक डाटा जोडिएपछि मात्र नक्सा सक्षम हुनेछ।")}</p></div>
            </div>
            <Link to="/reports/households" className="btn-secondary shrink-0"><Icon name="households" size={17} />{tr("घरधुरी GPS अभिलेख")}</Link>
          </section>
        </>
      )}

      <section className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="card p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 font-bold text-slate-900"><Icon name="audit" size={20} className="text-blue-700" />{tr("हालका गतिविधिहरू")}</h2><Link to="/surveys" className="text-sm font-semibold text-blue-700 hover:underline">{tr("सबै हेर्नुहोस्")}</Link></div>
          {recentLoading && <Spinner />}
          {recentError && <Alert>{recentError.message}</Alert>}
          {!recentLoading && !recentError && recentItems.length === 0 && <p className="rounded-lg bg-slate-50 p-5 text-center text-sm text-slate-500">{tr("अहिलेसम्म कुनै सर्वेक्षण गतिविधि छैन।")}</p>}
          {recentItems.length > 0 && <ul className="divide-y divide-slate-100">
            {recentItems.map((item) => {
              const localItem = !item.id && item.uuid;
              const href = localItem ? `/s/${item.uuid}` : `/surveys/view/${item.id}`;
              const name = item.household?.head_name || item.head_name || tr("घरधुरी सर्वेक्षण");
              return <li key={item.uuid || item.id}><Link to={href} className="flex min-h-14 items-center gap-3 py-2 transition hover:bg-slate-50">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><Icon name="surveys" size={18} /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-800">{name}</span><span className="text-xs text-slate-500">{item.household?.household_code || item.household_code || ''} {item.updated_at ? `· ${new Date(item.updated_at).toLocaleString('ne-NP')}` : ''}</span></span>
                <Badge status={item.status} />
              </Link></li>;
            })}
          </ul>}
        </div>
        <div className="card p-4 sm:p-5">
          <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-900"><Icon name="activity" size={20} className="text-blue-700" />{tr("प्रणाली अवस्था")}</h2>
          <ul className="space-y-3 text-sm">
            <li className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-slate-600"><Icon name={online ? 'globe' : 'offline'} size={17} />{tr("इन्टरनेट जडान")}</span><strong className={online ? 'text-emerald-700' : 'text-amber-800'}>{online ? tr("अनलाइन") : tr("अफलाइन")}</strong></li>
            <li className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-slate-600"><Icon name="database" size={17} />{tr("API तथा डाटाबेस")}</span><strong className={health.data?.db === 'ok' ? 'text-emerald-700' : health.error ? 'text-red-700' : 'text-slate-500'}>{!online ? tr("अफलाइन") : health.loading ? tr("जाँच हुँदैछ…") : health.data?.db === 'ok' ? tr("सञ्चालनमा") : tr("उपलब्ध छैन")}</strong></li>
            {enabled && <li className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-slate-600"><Icon name="sync" size={17} />{tr("सिंक")}</span><strong className={state?.status === 'error' || state?.status === 'auth' ? 'text-red-700' : 'text-slate-700'}>{state?.status === 'syncing' ? tr("सिंक हुँदैछ…") : tr("पठाउन बाँकी: {0}", [np(state?.pending || 0)])}</strong></li>}
          </ul>
          {management && <Link to="/reports" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:underline">{tr("विस्तृत प्रतिवेदन खोल्नुहोस्")}<Icon name="next" size={15} /></Link>}
        </div>
      </section>
      {management && report?.wards?.length > 0 && <p className="text-xs text-slate-500">{tr("स्वीकृत सर्वेक्षण सम्पन्नता")} · {np(completedPercent)}% · {tr("आधार: स्वीकृत सर्वेक्षण")}</p>}
    </div>
  );
}
