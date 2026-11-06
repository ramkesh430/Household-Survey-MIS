import { tr } from '@shared/i18n/index.js';
import { useRef, useState } from 'react';
import { toNepaliDigits as np } from '@shared/engine.js';
import Icon from './Icon.jsx';

const fmt = (v, digits = 1) => (v === null || v === undefined ? '—' : np(Number.isInteger(v) ? v : Number(v).toFixed(digits)));

/** Horizontal bars for one measure (single hue). Values and % are always printed (no color-only reading). */
export function BarList({ items, total, unit = '', max }) {
  const top = max ?? Math.max(1, ...items.map((i) => i.n ?? 0));
  return (
    <ul className="viz-root space-y-2" role="list">
      {items.map((i) => {
        const hidden = i.n === null;
        const w = hidden ? 0 : ((i.n || 0) / top) * 100;
        const p = !hidden && total ? Math.round(((i.n || 0) / total) * 1000) / 10 : null;
        return (
          <li key={i.key ?? i.label} className="group">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 text-[color:var(--text-primary)]">{i.code && <b className="mr-1">{i.code})</b>}{i.label}</span>
              <span className="shrink-0 tabular-nums text-[color:var(--text-secondary)]">
                {hidden ? tr("<३") : `${fmt(i.n, 2)}${unit}`}{p !== null && <span className="ml-2 font-semibold text-[color:var(--text-primary)]">{fmt(p)}%</span>}
              </span>
            </div>
            <div className="mt-1 h-2.5 rounded-full bg-[color:var(--track)]" title={`${i.label}: ${hidden ? tr("संख्या लुकाइएको") : fmt(i.n, 2)}${p !== null ? ` (${fmt(p)}%)` : ''}`}>
              <div className="h-2.5 rounded-full bg-[color:var(--series-1)] transition-[width] group-hover:bg-[color:var(--seq-450)]" style={{ width: `${w}%`, minWidth: w > 0 ? 4 : 0 }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Population pyramid: female (slot 1) left, male (slot 2) right; numbers on every bar, legend above. */
export function Pyramid({ rows }) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.female || 0, r.male || 0]));
  const [hover, setHover] = useState(null);
  return (
    <div className="viz-root">
      <div className="mb-2 flex justify-center gap-5 text-xs text-[color:var(--text-secondary)]" aria-hidden="true">
        <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-[color:var(--series-1)]" />{tr("महिला")}</span>
        <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-[color:var(--series-2)]" />{tr("पुरुष")}</span>
      </div>
      <div className="space-y-1" role="img" aria-label={tr("उमेर र लिङ्ग अनुसार जनसंख्या")}>
        {rows.slice().reverse().map((r) => (
          <div key={r.key} className={`grid grid-cols-[1fr_7.5rem_1fr] items-center gap-2 rounded text-xs ${hover === r.key ? 'bg-slate-100' : ''}`}
            onMouseEnter={() => setHover(r.key)} onMouseLeave={() => setHover(null)}>
            <div className="flex items-center justify-end gap-1.5">
              <span className="tabular-nums text-[color:var(--text-secondary)]">{fmt(r.female || 0)}</span>
              <div className="h-3 rounded-l-sm rounded-r-[4px] bg-[color:var(--series-1)]" style={{ width: `${((r.female || 0) / max) * 100}%`, minWidth: r.female ? 3 : 0, borderTopLeftRadius: 4, borderBottomLeftRadius: 4 }} />
            </div>
            <span className="text-center text-[color:var(--text-primary)]">{r.label.replace(tr("वर्षसम्म"), '')}</span>
            <div className="flex items-center gap-1.5">
              <div className="h-3 bg-[color:var(--series-2)]" style={{ width: `${((r.male || 0) / max) * 100}%`, minWidth: r.male ? 3 : 0, borderTopRightRadius: 4, borderBottomRightRadius: 4 }} />
              <span className="tabular-nums text-[color:var(--text-secondary)]">{fmt(r.male || 0)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Daily counts for two series with crosshair + tooltip. One y-axis, 2px lines. */
export function DailyLines({ days, series }) {
  const ref = useRef(null);
  const [idx, setIdx] = useState(null);
  const W = 640; const H = 180; const P = { l: 28, r: 10, t: 10, b: 22 };
  const max = Math.max(1, ...days.flatMap((d) => series.map((s) => d[s.key])));
  const x = (i) => P.l + (i / Math.max(1, days.length - 1)) * (W - P.l - P.r);
  const y = (v) => H - P.b - (v / max) * (H - P.t - P.b);
  const ticks = [0, Math.round(max / 2), max].filter((v, i, a) => a.indexOf(v) === i);
  const onMove = (e) => {
    const r = ref.current.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    setIdx(Math.max(0, Math.min(days.length - 1, Math.round(((px - P.l) / (W - P.l - P.r)) * (days.length - 1)))));
  };
  const d = idx !== null ? days[idx] : null;
  return (
    <div className="viz-root relative">
      <div className="mb-1 flex gap-4 text-xs text-[color:var(--text-secondary)]">
        {series.map((s) => <span key={s.key} className="flex items-center gap-1.5"><i className="inline-block h-0.5 w-4" style={{ background: s.color }} />{s.label}</span>)}
      </div>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="h-auto w-full touch-none" onMouseMove={onMove} onMouseLeave={() => setIdx(null)} onPointerDown={onMove}
        role="img" aria-label={tr("पछिल्लो {0} दिनको दैनिक संख्या", [days.length])}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth="1" />
            <text x={P.l - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="var(--text-secondary)">{np(t)}</text>
          </g>
        ))}
        {[0, Math.floor(days.length / 2), days.length - 1].map((i) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--text-secondary)">{np(days[i].day.slice(5))}</text>
        ))}
        {series.map((s) => (
          <polyline key={s.key} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
            points={days.map((dd, i) => `${x(i)},${y(dd[s.key])}`).join(' ')} />
        ))}
        {d && (
          <g>
            <line x1={x(idx)} x2={x(idx)} y1={P.t} y2={H - P.b} stroke="var(--text-secondary)" strokeWidth="1" strokeDasharray="3 3" />
            {series.map((s) => <circle key={s.key} cx={x(idx)} cy={y(d[s.key])} r="4" fill={s.color} stroke="var(--surface-1)" strokeWidth="2" />)}
          </g>
        )}
      </svg>
      {d && (
        <div className="pointer-events-none absolute top-6 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs shadow"
          style={{ left: `${Math.min(80, (x(idx) / W) * 100)}%` }}>
          <p className="font-semibold">{np(d.day)}</p>
          {series.map((s) => <p key={s.key}>{s.label}: <b>{np(d[s.key])}</b></p>)}
        </div>
      )}
    </div>
  );
}

const STACK = [
  { key: 'approved', label: tr("स्वीकृत"), color: 'var(--series-1)' },
  { key: 'submitted', label: tr("समीक्षा बाँकी"), color: 'var(--series-2)' },
  { key: 'draft', label: tr("मस्यौदा"), color: 'var(--series-3)' },
  { key: 'rejected', label: tr("फिर्ता"), color: 'var(--series-4)' },
];

/** Per-ward progress: stacked status segments over a neutral "not started" track; counts printed beside. */
export function WardProgress({ wards }) {
  const [hover, setHover] = useState(null);
  return (
    <div className="viz-root">
      <div className="mb-2 flex flex-wrap gap-4 text-xs text-[color:var(--text-secondary)]">
        {STACK.map((s) => <span key={s.key} className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />{s.label}</span>)}
        <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-[color:var(--track)] ring-1 ring-slate-300" />{tr("सुरु नभएको")}</span>
      </div>
      <ul className="space-y-2.5">
        {wards.map((w) => (
          <li key={w.ward_id} onMouseEnter={() => setHover(w.ward_id)} onMouseLeave={() => setHover(null)}>
            <div className="flex justify-between text-sm"><span className="font-semibold">{tr("वडा")} {np(w.ward_no)}</span>
              <span className="tabular-nums text-[color:var(--text-secondary)]">{tr("स्वीकृत")} {np(w.approved)}/ {np(w.households)} {tr("घरधुरी")}</span></div>
            <div className="mt-1 flex h-3 gap-[2px] overflow-hidden rounded-[4px] bg-[color:var(--track)]">
              {STACK.map((s) => w[s.key] > 0 && (
                <div key={s.key} style={{ width: `${(w[s.key] / Math.max(1, w.households)) * 100}%`, background: s.color }} title={`${s.label}: ${np(w[s.key])}`} />
              ))}
            </div>
            {hover === w.ward_id && (
              <p className="mt-1 text-xs text-[color:var(--text-secondary)]">
                {STACK.map((s) => `${s.label} ${np(w[s.key])}`).join(' · ')} {tr("· सुरु नभएको")} {np(w.households - w.started)}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Headline number tile. */
export function StatTile({ label, value, unit, note, hidden }) {
  const labelText = String(label).toLowerCase();
  const icon = /घरधुरी|household|परिवार|famil/.test(labelText) ? 'households'
    : /सर्वेक्षण|survey|पेश|स्वीकृत|review/.test(labelText) ? 'surveys'
      : /जनसंख्या|population|व्यक्ति|पुरुष|महिला|male|female|men|women/.test(labelText) ? 'users'
        : /रकम|आम्दानी|income|रु\./.test(labelText) ? 'reports' : 'dashboard';
  return (
    <div className="card p-3">
      <div className="flex items-start gap-2">
        <Icon name={icon} size={16} className="mt-0.5 shrink-0 text-blue-700" />
        <div className="min-w-0">
          <p className="text-xs leading-snug text-slate-600">{label}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
        {hidden ? tr("<३") : value === null || value === undefined ? '—' : (unit === 'रु.' || unit === 'Rs.') ? tr("रु. {0}", [np(Math.round(value).toLocaleString('en-IN'))]) : `${fmt(value)}${unit === '%' ? '%' : ''}`}
        {unit && !['%', tr("रु.")].includes(unit) && value !== null && <> <span className="text-sm font-normal text-slate-500">{unit}</span></>}
          </p>
          {note && <p className="mt-0.5 text-xs text-slate-500">{note}</p>}
        </div>
      </div>
    </div>
  );
}
