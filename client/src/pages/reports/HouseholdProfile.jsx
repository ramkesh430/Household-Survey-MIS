import { localizeQuestion, translate } from '@shared/i18n/index.js';
import { tr } from '@shared/i18n/index.js';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth, STATUS_LABEL } from '../../lib/auth.jsx';
import { questions, sections } from '@shared/questionnaire.js';
import { compute, evalCondition, isQuestionVisible, toNepaliDigits as np } from '@shared/engine.js';
import { Alert, Spinner } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';

const n = (v) => (v === undefined || v === null || v === '' ? '' : np(v));

function Choice({ f, qa }) {
  const v = qa?.[f.key];
  const sel = f.type === 'multi' ? v || [] : v ? [v] : [];
  if (!sel.length) return <span className="text-slate-400">—</span>;
  return (
    <span>{sel.map((x) => { const o = f.options.find((op) => op.value === x); return o ? `${o.code}) ${o.label}` : x; }).join('; ')}
      {qa?.[`${f.key}__other`] && ` — ${qa[`${f.key}__other`]}`}</span>
  );
}

function Grid({ f, g }) {
  const rows = f.rows.filter((r) => g?.[r.key] && Object.keys(g[r.key]).length);
  if (!rows.length) return <span className="text-slate-400">{tr("— (खाली)")}</span>;
  return (
    <table className="mt-1 w-full border-collapse text-xs tabular-nums">
      <thead><tr className="bg-slate-100"><th className="border border-slate-300 px-1 py-0.5 text-left">{tr("विवरण")}</th>
        {f.cols.map((c) => <th key={c.key} className="border border-slate-300 px-1 py-0.5">{c.group ? `${c.group} › ` : ''}{c.label}</th>)}</tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}><th className="border border-slate-300 px-1 py-0.5 text-left font-medium">{r.label}{g[r.key].__label ? ` (${g[r.key].__label})` : ''}</th>
            {f.cols.map((c) => <td key={c.key} className="border border-slate-300 px-1 py-0.5 text-right">{c.type === 'check' ? (g[r.key][c.key] ? '✓' : '') : n(g[r.key][c.key])}</td>)}</tr>
        ))}
        {f.totalRow && g._total && <tr className="font-semibold"><th className="border border-slate-300 px-1 py-0.5 text-left">{tr("जम्मा")}</th>{f.cols.map((c) => <td key={c.key} className="border border-slate-300 px-1 py-0.5 text-right">{c.noTotal ? '' : n(g._total[c.key])}</td>)}</tr>}
      </tbody>
    </table>
  );
}

function Rows({ columns, rows, answers }) {
  if (!rows?.length) return <span className="text-slate-400">{tr("— (खाली)")}</span>;
  return (
    <table className="mt-1 w-full border-collapse text-xs">
      <thead><tr className="bg-slate-100"><th className="border border-slate-300 px-1">{tr("क्र.सं.")}</th>{columns.map((c) => <th key={c.key} className="border border-slate-300 px-1 py-0.5">{c.group ? `${c.group} › ` : ''}{c.label}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => (
        <tr key={i}><td className="border border-slate-300 px-1 text-center">{np(i + 1)}</td>
          {columns.map((c) => {
            if (c.showIf && !evalCondition(c.showIf, r, answers)) return <td key={c.key} className="border border-slate-300 px-1" />;
            const val = c.type === 'select' ? (c.options.find((o) => o.value === r[c.key])?.label ?? '') + (r[`${c.key}__other`] ? ` (${r[`${c.key}__other`]})` : '') : c.type === 'number' ? n(r[c.key]) : r[c.key] ?? '';
            return <td key={c.key} className="border border-slate-300 px-1 py-0.5">{val}</td>;
          })}</tr>
      ))}</tbody>
    </table>
  );
}

/** Printable household-wise report: every visible question with its answer, laid out like the paper form. */
export default function HouseholdProfile() {
  const { id } = useParams();
  const { user } = useAuth();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { api(`/surveys/${id}`).then((r) => setD(r.data)).catch(setErr); }, [id]);
  if (err) return <Alert>{err.message}</Alert>;
  if (!d) return <Spinner />;
  const a = compute(d.answers);
  return (
    <div className="mx-auto max-w-4xl bg-white text-[13px] leading-relaxed">
      <div className="no-print mb-4 flex flex-wrap gap-2">
        <button className="btn-primary" onClick={() => window.print()}><Icon name="print" size={16} />PDF / {tr("प्रिन्ट")}</button>
        <Link to="/reports/households" className="btn-secondary"><Icon name="previous" size={16} />{tr("सूचीमा फर्कनुहोस्")}</Link>
        <span className="self-center text-xs text-slate-500">{tr("प्रिन्ट संवादमा \"Save as PDF\" छान्नुहोस्।")}{user.role !== 'admin' && tr(" संवेदनशील उत्तरहरू समावेश छन् — गोप्य राख्नुहोस्।")}</span>
      </div>
      <div className="mb-4 border-b-2 border-slate-800 pb-2 text-center">
        <p className="text-xs">{tr("अनुसूची १ (दफा १० (३) ख सँग सम्बन्धित)")}</p>
        <h1 className="text-lg font-bold">{tr("घरधुरी सर्वेक्षण विवरण")}</h1>
        <p className="font-mono text-xs">{d.household_code} · {STATUS_LABEL[d.status]} {tr("· गणक:")} {d.enumerator_name}</p>
        <p className="text-xs">{tr("वडा नं.")} {np(d.ward_no)} {tr("· बस्ती:")} {d.settlement_code} {d.settlement_name} {tr("· घर क्र.सं.")} {np(d.house_no)} {tr("· परिवार क्र.सं.")} {np(d.family_no)}
          {d.gps_lat != null && ` · GPS ${np(Number(d.gps_lat).toFixed(5))}, ${np(Number(d.gps_lng).toFixed(5))}`}</p>
      </div>
      {sections.map((s) => {
        const qs = questions.filter((q) => q.section === s.id && q.id !== 'hdr' && isQuestionVisible(q, a)).map((q) => localizeQuestion(q));
        return (
          <section key={s.id} className="mb-3">
            <h2 className="mb-1 bg-slate-800 px-2 py-0.5 text-sm font-bold text-white">{translate(s.title)}</h2>
            {qs.map((q) => (
              <div key={q.id} className="border-b border-slate-200 py-1.5" style={{ breakInside: 'avoid' }}>
                <p className="font-semibold">{q.no && `${q.no}. `}{q.title}{q.sensitive && <span className="ml-1 text-[10px] font-normal text-rose-700">{tr("(संवेदनशील)")}</span>}</p>
                {q.fields.filter((f) => evalCondition(f.showIf, a[q.id], a)).map((f) => (
                  <div key={f.key} className="pl-4">
                    {f.label && q.fields.length > 1 && <span className="text-slate-600">{f.label}: </span>}
                    {['single', 'multi'].includes(f.type) && <Choice f={f} qa={a[q.id]} />}
                    {['text', 'number', 'date'].includes(f.type) && <span>{f.type === 'number' ? n(a[q.id]?.[f.key]) || '—' : a[q.id]?.[f.key] || '—'}</span>}
                    {f.type === 'grid' && <Grid f={f} g={a[q.id]?.[f.key]} />}
                    {f.type === 'repeat' && <Rows columns={f.columns} rows={a[q.id]?.[f.key]} answers={a} />}
                    {f.type === 'groupedRepeat' && <Rows columns={[{ key: 'group', label: tr("समूह"), type: 'text' }, ...f.columns]}
                      rows={f.groups.flatMap((g) => (a[q.id]?.[f.key]?.[g.key] || []).map((r) => ({ ...r, group: g.label })))} answers={a} />}
                    {f.type === 'signature' && (a[q.id]?.[f.key] ? <img src={a[q.id][f.key]} alt={f.label} className="inline-block h-12 align-middle" /> : <span className="text-slate-400">—</span>)}
                  </div>
                ))}
              </div>
            ))}
          </section>
        );
      })}
      <p className="mt-4 text-center text-[10px] text-slate-500">{tr("प्रणालीबाट तयार:")} {new Date().toLocaleString('ne-NP')}</p>
    </div>
  );
}
