import { tr } from '@shared/i18n/index.js';
import { useState } from 'react';
import { BS_MONTHS, WEEKDAYS, MIN_YEAR, MAX_YEAR, todayBs, formatBs, parseBs, daysInBsMonth, firstWeekday, isRealBsDate } from '../lib/bsdate.js';
import { toNepaliDigits as np } from '@shared/engine.js';
import Icon from './Icon.jsx';

/** Bikram Sambat date input: type it (Nepali or Latin digits) or pick from a BS calendar. */
export default function BsDatePicker({ value, onChange, id, invalid, disabled, maxToday = true }) {
  const today = todayBs();
  const sel = parseBs(value);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => (sel && isRealBsDate(value) ? { y: sel.y, m: sel.m } : { y: today.y, m: today.m }));
  const bad = value && !isRealBsDate(value);
  const shift = (delta) => {
    let m = view.m + delta; let y = view.y;
    if (m < 1) { m = 12; y -= 1; } if (m > 12) { m = 1; y += 1; }
    if (y >= MIN_YEAR && y <= MAX_YEAR) setView({ y, m });
  };
  const days = daysInBsMonth(view.y, view.m);
  const lead = firstWeekday(view.y, view.m);
  const isFuture = (d) => maxToday && (view.y > today.y || (view.y === today.y && (view.m > today.m || (view.m === today.m && d > today.d))));

  return (
    <div className="relative">
      <div className="flex gap-2">
        <input id={id} className={`field-input ${invalid || bad ? 'invalid' : ''}`} placeholder="२०८३-०७-१९" inputMode="numeric" disabled={disabled}
          value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)} aria-describedby={id ? `${id}-help` : undefined} />
        <button type="button" className="btn-secondary px-3" disabled={disabled} onClick={() => setOpen(!open)} aria-expanded={open} aria-label={tr("पात्रो खोल्नुहोस्")}><Icon name="calendar" size={17} /></button>
        <button type="button" className="btn-secondary whitespace-nowrap px-3" disabled={disabled} onClick={() => { onChange(formatBs(today)); setOpen(false); }}><Icon name="calendar" size={15} />{tr("आज")}</button>
      </div>
      {bad && <p className="mt-1 text-xs text-red-600">{tr("यो मिति वि.सं. पात्रोमा छैन")}</p>}
      {open && (
        <div className="absolute z-30 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-xl" role="dialog" aria-label={tr("वि.सं. पात्रो")}>
          <div className="mb-2 flex items-center justify-between gap-1">
            <button type="button" className="rounded px-2 py-1 hover:bg-slate-100" onClick={() => shift(-1)} aria-label={tr("अघिल्लो महिना")}><Icon name="previous" size={16} /></button>
            <select className="rounded border px-1 py-1 text-sm" value={view.m} onChange={(e) => setView({ ...view, m: Number(e.target.value) })} aria-label={tr("महिना")}>
              {BS_MONTHS.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}
            </select>
            <select className="rounded border px-1 py-1 text-sm" value={view.y} onChange={(e) => setView({ ...view, y: Number(e.target.value) })} aria-label={tr("वर्ष")}>
              {Array.from({ length: MAX_YEAR - MIN_YEAR + 1 }, (_, i) => MAX_YEAR - i).map((y) => <option key={y} value={y}>{np(y)}</option>)}
            </select>
            <button type="button" className="rounded px-2 py-1 hover:bg-slate-100" onClick={() => shift(1)} aria-label={tr("अर्को महिना")}><Icon name="next" size={16} /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {WEEKDAYS.map((w) => <span key={w} className="py-1 font-semibold text-slate-500">{w}</span>)}
            {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
            {Array.from({ length: days }, (_, i) => i + 1).map((d) => {
              const active = sel && sel.y === view.y && sel.m === view.m && sel.d === d;
              const isToday = today.y === view.y && today.m === view.m && today.d === d;
              return (
                <button type="button" key={d} disabled={isFuture(d)}
                  className={`rounded py-1.5 text-sm ${active ? 'bg-blue-700 text-white' : isToday ? 'ring-1 ring-blue-600' : 'hover:bg-slate-100'} disabled:text-slate-300`}
                  onClick={() => { onChange(formatBs({ y: view.y, m: view.m, d })); setOpen(false); }}>{np(d)}</button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
