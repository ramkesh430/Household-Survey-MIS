import { translate } from '@shared/i18n/index.js';
import { tr } from '@shared/i18n/index.js';
import { toNepaliDigits as np } from '@shared/engine.js';
import { BarList, Pyramid } from '../../components/charts.jsx';

const v = (n) => (n === null ? tr("<३") : n === undefined ? '' : np(Number.isInteger(n) ? n : Math.round(n * 100) / 100));

function GridTable({ f }) {
  const groups = f.cols.some((c) => c.group);
  const spans = [];
  f.cols.forEach((c) => { const last = spans[spans.length - 1]; if (last && last.g === c.group) last.n += 1; else spans.push({ g: c.group, n: 1 }); });
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full text-sm tabular-nums">
        <thead className="bg-slate-100 text-xs">
          {groups && <tr><th />{spans.map((s, i) => <th key={i} colSpan={s.n} className="border-l border-slate-200 px-2 py-1 text-center">{s.g || ''}</th>)}</tr>}
          <tr><th className="px-2 py-1 text-left">{tr("विवरण")}</th>{f.cols.map((c) => <th key={c.key} className="border-l border-slate-200 px-2 py-1 text-right font-semibold">{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {f.rows.map((r) => (
            <tr key={r.key} className="border-t border-slate-100">
              <th scope="row" className="px-2 py-1 text-left font-medium">{r.label}</th>
              {f.cols.map((c) => <td key={c.key} className="border-l border-slate-100 px-2 py-1 text-right">{v(f.cells[r.key][c.key])}</td>)}
            </tr>
          ))}
          <tr className="border-t bg-blue-50 font-semibold"><th scope="row" className="px-2 py-1 text-left">{tr("जम्मा")}</th>{f.cols.map((c) => <td key={c.key} className="border-l border-slate-100 px-2 py-1 text-right">{c.noTotal ? '' : v(f.total[c.key])}</td>)}</tr>
        </tbody>
      </table>
    </div>
  );
}

export default function QuestionResult({ q }) {
  return (
    <section className="card p-4" id={`r-${q.id}`}>
      <div className="mb-3 flex items-start gap-3">
        {q.no && <span className="flex h-8 min-w-8 items-center justify-center rounded-full bg-slate-800 px-2 text-sm font-bold text-white">{np(q.no)}</span>}
        <div className="flex-1">
          <h3 className="font-semibold leading-relaxed">{translate(q.title)}</h3>
          <p className="text-xs text-slate-500">{tr("लागू हुने घरधुरी:")} {np(q.eligible)}/ {np(q.households)}</p>
        </div>
        {q.suppressed && <span className="shrink-0 rounded bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700" title={tr("३ भन्दा कम संख्या गोपनीयताका लागि लुकाइएको")}>{tr("संवेदनशील · <३ लुकाइएको")}</span>}
      </div>
      <div className="space-y-5">
        {q.fields.map((f) => (
          <div key={f.key}>
            {f.label && <p className="mb-2 text-sm font-semibold text-slate-700">{translate(f.label)}</p>}
            {f.counts && (
              <>
                <BarList items={f.counts.map((c) => ({ key: c.value, code: c.code, label: translate(c.label), n: c.n }))} total={f.answered} />
                <p className="mt-1 text-xs text-slate-500">{tr("उत्तर दिएका")} {np(f.answered)} {tr("घरधुरी")}{f.type === 'multi' ? tr(" (एकभन्दा बढी उत्तर सम्भव — % को जोड १०० भन्दा बढी हुन सक्छ)") : ''}</p>
              </>
            )}
            {f.cells && (
              <>
                {q.id === 'q5' && f.key === 'age_table' && <div className="mb-4"><Pyramid rows={f.rows.map((r) => ({ ...r, label: translate(r.label), ...f.cells[r.key] }))} /></div>}
                <GridTable f={{ ...f, rows: f.rows.map((r) => ({ ...r, label: translate(r.label) })), cols: f.cols.map((c) => ({ ...c, label: translate(c.label), group: c.group ? translate(c.group) : c.group })) }} />
                {Object.entries(f.otherLabels || {}).map(([rk, vals]) => vals.length > 0 && (
                  <p key={rk} className="mt-1 text-xs text-slate-600">"{f.rows.find((r) => r.key === rk)?.label}{tr("\" मा खुलाइएका:")} {vals.map((x) => `${x.value} (${np(x.n)})`).join(', ')}</p>
                ))}
              </>
            )}
            {f.sums && (
              <div className="space-y-3">
                <p className="text-sm">{tr("विवरण भएका घरधुरी:")} <b>{v(f.households)}</b> {tr("· जम्मा पंक्ति:")} <b>{v(f.rows)}</b></p>
                <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  {f.columns.filter((c) => c.type === 'number').map((c) => (
                    <div key={c.key} className="rounded border border-slate-200 px-3 py-2"><p className="text-xs text-slate-500">{c.group ? `${translate(c.group)} › ` : ''}{translate(c.label)}</p><p className="font-semibold tabular-nums">{tr("जम्मा")} {v(f.sums[c.key])}</p></div>
                  ))}
                </div>
                {Object.entries(f.selects || {}).map(([ck, counts]) => (
                  <div key={ck}><p className="mb-1 text-xs font-semibold text-slate-600">{translate(f.columns.find((c) => c.key === ck)?.label)}</p>
                    <BarList items={counts.map((c) => ({ key: c.value, label: translate(c.label), n: c.n }))} total={counts.reduce((s, c) => s + (c.n || 0), 0)} /></div>
                ))}
              </div>
            )}
            {f.groups && (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-sm tabular-nums">
                  <thead className="bg-slate-100 text-xs"><tr>{[tr("समूह"), tr("घरधुरी"), tr("क्षेत्रफल (हेक्टर)"), tr("उत्पादन"), tr("मुख्य बाली")].map((h) => <th key={h} className="px-2 py-1 text-left">{h}</th>)}</tr></thead>
                  <tbody>{Object.entries(f.groups).map(([k, g]) => (
                    <tr key={k} className="border-t"><td className="px-2 py-1">{translate(g.label)}</td><td className="px-2 py-1">{np(g.households)}</td><td className="px-2 py-1">{v(g.area_ha)}</td><td className="px-2 py-1">{v(g.production)}</td>
                      <td className="px-2 py-1 text-xs">{g.crops.map((c) => `${c.value} (${np(c.n)})`).join(', ')}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            )}
            {'sum' in f && f.type === 'number' && (
              <p className="text-sm tabular-nums">{tr("उत्तर दिएका")} {np(f.answered)} {tr("· जम्मा")} <b>{v(f.sum)}</b> {tr("· औसत")} <b>{f.mean === null ? '—' : v(f.mean)}</b> {tr("· न्यूनतम")} {v(f.min)} {tr("· अधिकतम")} {v(f.max)}</p>
            )}
            {f.top && <BarList items={f.top.map((t) => ({ key: t.value, label: t.value, n: t.n }))} total={f.answered} />}
            {f.freeText && <p className="text-sm text-slate-500">{tr("खुला पाठ —")} {np(f.answered)} {tr("उत्तर (गोपनीयताका लागि प्रतिवेदनमा देखाइँदैन)")}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}
