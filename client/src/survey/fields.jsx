import { tr } from '@shared/i18n/index.js';
import { useEffect, useRef, useState, useId } from 'react';
import { parseNumber, toNepaliDigits, evalCondition, columnTotals } from '@shared/engine.js';
import { SUGGESTIONS } from './suggestions.js';
import Icon from '../components/Icon.jsx';

const np = (v) => (v === undefined || v === null ? '' : toNepaliDigits(v));
const newId = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));

/** Number input that accepts Nepali (०-९) or Latin digits; emits number | undefined. */
export function NumberInput({ value, onChange, decimal, invalid, readOnly, className = 'field-input', ...rest }) {
  const [text, setText] = useState(() => np(value));
  const [bad, setBad] = useState(false);
  useEffect(() => {
    const current = parseNumber(text);
    if (current !== (value ?? null) && !(Number.isNaN(current) && value === undefined)) setText(np(value));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  if (readOnly) {
    return <output className={`${className} block bg-slate-100! font-semibold text-slate-700`} {...rest}>{np(value) || '–'}</output>;
  }
  return (
    <input
      {...rest}
      type="text"
      inputMode={decimal ? 'decimal' : 'numeric'}
      autoComplete="off"
      className={`${className} ${invalid || bad ? 'invalid' : ''}`}
      value={text}
      aria-invalid={invalid || bad || undefined}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        const n = parseNumber(t);
        if (n === null) { setBad(false); onChange(undefined); }
        else if (Number.isNaN(n) || (!decimal && !Number.isInteger(n))) setBad(true);
        else { setBad(false); onChange(n); }
      }}
    />
  );
}

export function TextInput({ value, onChange, suggest, invalid, ...rest }) {
  const id = useId();
  return (
    <>
      <input {...rest} type="text" list={suggest ? `${id}-dl` : undefined} className={`field-input ${invalid ? 'invalid' : ''}`}
        value={value ?? ''} maxLength={500} onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)} />
      {suggest && SUGGESTIONS[suggest] && (
        <datalist id={`${id}-dl`}>{SUGGESTIONS[suggest].map((s) => <option key={s} value={s} />)}</datalist>
      )}
    </>
  );
}

/** Single / multi choice rendered as large tap targets with the original PDF codes. */
export function ChoiceField({ field, value, other, onChange, onOther, invalid, name }) {
  const multi = field.type === 'multi';
  const selected = multi ? value || [] : value ? [value] : [];
  const toggle = (op) => {
    if (!multi) return onChange(value === op.value ? undefined : op.value);
    let next = selected.includes(op.value) ? selected.filter((v) => v !== op.value) : [...selected, op.value];
    if (op.exclusive && next.includes(op.value)) next = [op.value];
    else if (!op.exclusive) next = next.filter((v) => !field.options.find((o) => o.value === v)?.exclusive);
    onChange(next.length ? next : undefined);
  };
  const needsOther = field.options.some((op) => op.specify && selected.includes(op.value));
  return (
    <div>
      {multi && <p className="mb-1 text-xs text-slate-500">{tr("एकभन्दा बढी छान्न सकिन्छ")}</p>}
      <div className={`grid gap-2 sm:grid-cols-2 ${invalid ? 'rounded-lg ring-2 ring-red-300' : ''}`} role={multi ? 'group' : 'radiogroup'}>
        {field.options.map((op) => {
          const on = selected.includes(op.value);
          return (
            <label key={op.value}
              className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2.5 text-sm transition ${on ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600' : 'border-slate-300 bg-white hover:bg-slate-50'}`}>
              <input type={multi ? 'checkbox' : 'radio'} name={name} className="mt-1 h-4 w-4 accent-blue-700"
                checked={on} onChange={() => toggle(op)} onClick={(e) => { if (!multi && on) { e.preventDefault(); toggle(op); } }} />
              <span><b className="mr-1">{op.code})</b>{op.label}</span>
            </label>
          );
        })}
      </div>
      {needsOther && (
        <div className="mt-2">
          <TextInput value={other} onChange={onOther} placeholder={tr("खुलाउनुहोस्…")} aria-label={tr("अन्य खुलाउनुहोस्")} />
        </div>
      )}
    </div>
  );
}

function headerRows(cols) {
  const hasGroups = cols.some((c) => c.group);
  if (!hasGroups) return null;
  const top = [];
  cols.forEach((c) => {
    const last = top[top.length - 1];
    if (c.group && last && last.group === c.group) last.span += 1;
    else top.push({ group: c.group, span: 1, col: c });
  });
  return top;
}

/** Fixed-row table (most PDF tables). */
export function GridField({ field, value, computed, onChange, errorPaths, path }) {
  const grid = value || {};
  const setCell = (rk, ck, v) => {
    const row = { ...(grid[rk] || {}) };
    if (v === undefined || v === '' || v === false) delete row[ck]; else row[ck] = v;
    const next = { ...grid, [rk]: row };
    if (!Object.keys(row).length) delete next[rk];
    delete next._total;
    onChange(Object.keys(next).length ? next : undefined);
  };
  const setChoice = (rk, ck) => {
    const row = { ...(grid[rk] || {}) };
    field.cols.forEach((c) => delete row[c.key]);
    if (!grid[rk]?.[ck]) row[ck] = true;
    const next = { ...grid, [rk]: row };
    if (!Object.keys(row).length) delete next[rk];
    onChange(Object.keys(next).length ? next : undefined);
  };
  const top = headerRows(field.cols);
  const hasErr = (p) => errorPaths.some((e) => e === p || e.startsWith(`${p}.`));
  return (
    <div className="-mx-1 overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full border-collapse text-sm">
        <thead className="bg-slate-100 text-slate-700">
          {top && (
            <tr>
              <th rowSpan={2} className="sticky left-0 z-10 border-b border-r border-slate-200 bg-slate-100 px-2 py-2 text-left">{tr("विवरण")}</th>
              {top.map((t, i) => t.group
                ? <th key={i} colSpan={t.span} className="border-b border-r border-slate-200 px-2 py-2 text-center font-semibold">{t.group}</th>
                : <th key={i} rowSpan={2} className="border-b border-r border-slate-200 px-2 py-2 align-bottom font-semibold">{t.col.label}</th>)}
            </tr>
          )}
          <tr>
            {!top && <th className="sticky left-0 z-10 border-b border-r border-slate-200 bg-slate-100 px-2 py-2 text-left">{tr("विवरण")}</th>}
            {field.cols.filter((c) => !top || c.group).map((c) => (
              <th key={c.key} className="min-w-[5.5rem] border-b border-r border-slate-200 px-2 py-2 align-bottom text-xs font-semibold">
                {c.label}{c.sumOf && <span className="block font-normal text-slate-500">{tr("(स्वतः)")}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {field.rows.map((r) => {
            const row = grid[r.key] || {};
            const crow = computed?.[r.key] || {};
            const rowErr = hasErr(`${path}.${r.key}`);
            return (
              <tr key={r.key} className={rowErr ? 'bg-red-50' : 'odd:bg-white even:bg-slate-50/60'}>
                <th scope="row" className="sticky left-0 z-10 min-w-[8rem] max-w-[14rem] border-b border-r border-slate-200 bg-inherit px-2 py-1.5 text-left font-medium">
                  {r.label}
                  {r.specify && (
                    <input className="cell-input mt-1 text-left" placeholder={tr("खुलाउने…")} value={row.__label ?? ''} aria-label={tr("{0} खुलाउने", [r.label])}
                      onChange={(e) => setCell(r.key, '__label', e.target.value || undefined)} />
                  )}
                </th>
                {field.cols.map((c) => {
                  const cp = `${path}.${r.key}.${c.key}`;
                  const label = `${r.label} – ${c.group ? `${c.group} – ` : ''}${c.label}`;
                  return (
                    <td key={c.key} className="border-b border-r border-slate-200 px-1 py-1 text-center">
                      {c.sumOf ? <NumberInput readOnly value={crow[c.key]} className="cell-input" aria-label={label} />
                        : c.type === 'number' ? <NumberInput value={row[c.key]} decimal={c.decimal} className="cell-input" invalid={hasErr(cp)} aria-label={label} onChange={(v) => setCell(r.key, c.key, v)} />
                        : c.type === 'text' ? <input className="cell-input min-w-[9rem] text-left" value={row[c.key] ?? ''} aria-label={label} maxLength={500} onChange={(e) => setCell(r.key, c.key, e.target.value || undefined)} />
                        : field.rowChoice ? <input type="radio" name={`${path}.${r.key}`} className="h-5 w-5 accent-blue-700" checked={!!row[c.key]} aria-label={label} onChange={() => setChoice(r.key, c.key)} onClick={(e) => { if (row[c.key]) { e.preventDefault(); setChoice(r.key, c.key); } }} />
                        : <input type="checkbox" className="h-5 w-5 accent-blue-700" checked={!!row[c.key]} aria-label={label} onChange={(e) => setCell(r.key, c.key, e.target.checked)} />}
                    </td>
                  );
                })}
              </tr>
            );
          })}
          {field.totalRow && (
            <tr className="bg-blue-50 font-semibold">
              <th scope="row" className="sticky left-0 z-10 border-r border-slate-200 bg-blue-50 px-2 py-2 text-left">{tr("जम्मा")}</th>
              {field.cols.map((c) => (
                <td key={c.key} className="border-r border-slate-200 px-2 py-2 text-right">{c.type === 'number' && !c.noTotal ? np(computed?._total?.[c.key]) || '–' : ''}</td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function RowCell({ col, row, setCell, errorPaths, path, answers }) {
  if (col.showIf && !evalCondition(col.showIf, row, answers)) return null;
  const cp = `${path}.${col.key}`;
  const invalid = errorPaths.some((e) => e === cp || e.startsWith(`${cp}`));
  const label = col.group ? `${col.group}: ${col.label}` : col.label;
  return (
    <label className="block space-y-1 text-xs">
      <span className="font-semibold text-slate-600">{label}{col.sumOf && tr(" (स्वतः)")}</span>
      {col.type === 'number' && <NumberInput value={row[col.key]} decimal={col.decimal} readOnly={!!col.sumOf} invalid={invalid} onChange={(v) => setCell(col.key, v)} />}
      {col.type === 'text' && <input className={`field-input ${invalid ? 'invalid' : ''}`} value={row[col.key] ?? ''} maxLength={500} onChange={(e) => setCell(col.key, e.target.value || undefined)} />}
      {col.type === 'select' && (
        <>
          <select className={`field-input ${invalid ? 'invalid' : ''}`} value={row[col.key] ?? ''} onChange={(e) => setCell(col.key, e.target.value || undefined)}>
            <option value="">{tr("— छान्नुहोस् —")}</option>
            {col.options.map((o) => <option key={o.value} value={o.value}>{o.code !== o.label ? `${o.code}. ` : ''}{o.label}</option>)}
          </select>
          {col.options.find((o) => o.value === row[col.key])?.specify && (
            <input className="field-input mt-1" placeholder={tr("खुलाउनुहोस्…")} value={row[`${col.key}__other`] ?? ''} onChange={(e) => setCell(`${col.key}__other`, e.target.value || undefined)} />
          )}
        </>
      )}
    </label>
  );
}

/** Variable-length table rendered as mobile-friendly cards. */
export function RepeatField({ field, value, computed, onChange, errorPaths, path, answers, title }) {
  const rows = value || [];
  const crows = computed || [];
  const max = field.maxRows || 50;
  const update = (i, key, v) => {
    const next = rows.map((r, j) => {
      if (j !== i) return r;
      const row = { ...r };
      if (v === undefined) delete row[key]; else row[key] = v;
      return row;
    });
    onChange(next);
  };
  const totals = field.totalRow ? columnTotals(field.columns, crows) : null;
  return (
    <div className="space-y-3">
      {rows.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-500">{tr("कुनै विवरण थपिएको छैन।")}</p>}
      {rows.map((row, i) => (
        <div key={row._id || i} className={`rounded-lg border p-3 ${errorPaths.some((e) => e.startsWith(`${path}.${i}.`)) ? 'border-red-300 bg-red-50/40' : 'border-slate-200 bg-slate-50'}`}>
          <div className="mb-2 flex items-center justify-between">
            <p className="font-semibold text-slate-700">{field.rowLabel || title} {np(i + 1)}</p>
            <button type="button" className="inline-flex items-center gap-1 text-sm font-semibold text-red-600 hover:underline" onClick={() => onChange(rows.filter((_, j) => j !== i))}><Icon name="delete" size={14} />{tr("हटाउनुहोस्")}</button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {field.columns.map((c) => (
              <RowCell key={c.key} col={c} row={c.sumOf ? { [c.key]: crows[i]?.[c.key] } : row}
                setCell={(k, v) => update(i, k, v)} errorPaths={errorPaths} path={`${path}.${i}`} answers={answers} />
            ))}
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-secondary" disabled={rows.length >= max} onClick={() => onChange([...rows, { _id: newId() }])}><Icon name="plus" size={16} />{field.rowLabel || tr("पंक्ति")} {tr("थप्नुहोस्")}</button>
        {totals && Object.keys(totals).length > 0 && (
          <p className="text-sm text-slate-600">
            <b>{tr("जम्मा:")}</b> {field.columns.filter((c) => totals[c.key] !== undefined && c.sumOf).map((c) => `${c.group ? c.group.split(' ')[0] : ''} ${np(totals[c.key])}`).join(' · ')}
          </p>
        )}
      </div>
    </div>
  );
}

/** Q75 – crop groups each with their own rows. */
export function GroupedRepeatField({ field, value, computed, onChange, errorPaths, path, answers }) {
  const v = value || {};
  return (
    <div className="space-y-4">
      {field.groups.map((g) => {
        const rows = v[g.key] || [];
        const setRows = (next) => {
          const out = { ...v, [g.key]: next };
          if (!next.length) delete out[g.key];
          onChange(Object.keys(out).length ? out : undefined);
        };
        return (
          <fieldset key={g.key} className="min-w-0 rounded-lg border border-slate-200 p-3">
            <legend className="px-1 text-sm font-semibold text-slate-700">{g.label}</legend>
            {rows.map((row, i) => (
              <div key={row._id || i} className="mb-2 grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2">
                {field.columns.map((c) => (
                  <RowCell key={c.key} col={c} row={row} errorPaths={errorPaths} path={`${path}.${g.key}.${i}`} answers={answers}
                    setCell={(k, val) => setRows(rows.map((r, j) => (j === i ? (val === undefined ? (({ [k]: _, ...rest }) => rest)(r) : { ...r, [k]: val }) : r)))} />
                ))}
                <button type="button" aria-label={tr("हटाउनुहोस्")} className="mb-1 rounded px-2 py-2 text-red-600 hover:bg-red-50" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Icon name="delete" size={16} /></button>
              </div>
            ))}
            {(!g.fixed || rows.length === 0) && (
              <button type="button" className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:underline" onClick={() => setRows([...rows, { _id: newId() }])}><Icon name="plus" size={14} />{tr("वाली थप्नुहोस्")}</button>
            )}
          </fieldset>
        );
      })}
    </div>
  );
}

/** Touch/mouse signature capture → PNG data URL. */
export function SignaturePad({ value, onChange, label }) {
  const canvas = useRef(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  const [editing, setEditing] = useState(!value);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !editing) return;
    const ctx = c.getContext?.('2d');
    if (!ctx) return;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.strokeStyle = '#0f172a';
  }, [editing]);

  const pos = (e) => {
    const r = canvas.current.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * canvas.current.width, ((e.clientY - r.top) / r.height) * canvas.current.height];
  };
  const start = (e) => { e.preventDefault(); drawing.current = true; canvas.current.setPointerCapture?.(e.pointerId); const ctx = canvas.current.getContext('2d'); ctx.beginPath(); ctx.moveTo(...pos(e)); };
  const move = (e) => { if (!drawing.current) return; const ctx = canvas.current.getContext('2d'); ctx.lineTo(...pos(e)); ctx.stroke(); dirty.current = true; };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (dirty.current) onChange(canvas.current.toDataURL('image/png'));
  };

  if (!editing && value) {
    return (
      <div className="flex items-center gap-3">
        <img src={value} alt={label} className="h-20 rounded border border-slate-300 bg-white" />
        <button type="button" className="btn-secondary text-sm" onClick={() => { onChange(undefined); dirty.current = false; setEditing(true); }}><Icon name="edit" size={15} />{tr("पुनः सही गर्नुहोस्")}</button>
      </div>
    );
  }
  return (
    <div>
      <canvas ref={canvas} width={600} height={180} aria-label={label}
        className="h-36 w-full max-w-xl touch-none rounded-lg border-2 border-dashed border-slate-300 bg-white"
        onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end} />
      <div className="mt-1 flex gap-3 text-sm">
        <span className="text-slate-500">{tr("यहाँ औँला वा माउसले सही गर्नुहोस्")}</span>
        <button type="button" className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline" onClick={() => {
          const c = canvas.current; const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
          dirty.current = false; onChange(undefined);
        }}><Icon name="delete" size={14} />{tr("मेटाउनुहोस्")}</button>
      </div>
    </div>
  );
}
