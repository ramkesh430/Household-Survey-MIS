import { localizeQuestion, translate } from '@shared/i18n/index.js';
import { tr } from '@shared/i18n/index.js';
import { useMemo, useState, memo } from 'react';
import { questions, sections } from '@shared/questionnaire.js';
import { compute, evalCondition, isQuestionVisible, toNepaliDigits } from '@shared/engine.js';
import BsDatePicker from '../components/BsDatePicker.jsx';
import { ChoiceField, GridField, GroupedRepeatField, NumberInput, RepeatField, SignaturePad, TextInput } from './fields.jsx';
import Icon from '../components/Icon.jsx';

const np = toNepaliDigits;

function NoteBox({ q, note, onNote }) {
  const [open, setOpen] = useState(false);
  if (!onNote) {
    if (!note) return null;
    return <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"><b>{tr("सुपरभाइजरको टिप्पणी:")}</b> {note}</div>;
  }
  return (
    <div className="mb-3">
      {!open && !note && <button type="button" className="inline-flex items-center gap-1 text-sm font-semibold text-amber-700 hover:underline" onClick={() => setOpen(true)}><Icon name="plus" size={14} />{tr("यो प्रश्नमा टिप्पणी")}</button>}
      {(open || note) && (
        <label className="block text-sm">
          <span className="font-semibold text-amber-800">{tr("प्रश्न")} {q.no || q.title} {tr("मा टिप्पणी (गणकलाई देखिन्छ)")}</span>
          <textarea className="field-input mt-1 border-amber-300 bg-amber-50" rows={2} maxLength={500} value={note || ''}
            onChange={(e) => onNote(q.id, e.target.value)} placeholder={tr("के सच्याउनुपर्छ?")} />
        </label>
      )}
    </div>
  );
}

const QuestionCard = memo(function QuestionCard({ q, qa, cqa, answers, errors, warnings, setField, readOnly, role, note, onNote }) {
  const errorPaths = errors.map((e) => e.path);
  const single = q.fields.length === 1 && !q.fields[0].label;
  return (
    <section id={`q-${q.id}`} className={`card scroll-mt-28 p-4 sm:p-5 ${errors.length ? 'border-red-300' : ''}`} aria-labelledby={`t-${q.id}`}>
      <div className="mb-3 flex items-start gap-3">
        {q.no && <span className="flex h-8 min-w-8 items-center justify-center rounded-full bg-blue-700 px-2 text-sm font-bold text-white">{q.no}</span>}
        <div className="flex-1">
          <h3 id={`t-${q.id}`} className="font-semibold leading-relaxed text-slate-900">{q.title}</h3>
          {q.note && <p className="mt-1 text-xs text-slate-500">{q.note}</p>}
        </div>
        {q.sensitive && <span title={tr("संवेदनशील जानकारी — गोप्य राख्नुहोस्")} className="inline-flex shrink-0 items-center gap-1 rounded bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700"><Icon name="lock" size={13} />{tr("संवेदनशील")}</span>}
      </div>
      <NoteBox q={q} note={note} onNote={onNote} />
      <fieldset disabled={readOnly} className="min-w-0 space-y-4">
        {q.fields.map((f) => {
          if (!evalCondition(f.showIf, qa, answers)) return null;
          const path = `${q.id}.${f.key}`;
          const ferr = errors.filter((e) => e.path === path || e.path.startsWith(`${path}.`));
          const fwarn = warnings.filter((e) => e.path === path || e.path.startsWith(`${path}.`));
          const val = qa?.[f.key];
          const set = (v) => setField(q.id, f.key, v);
          const locked = f.fromHousehold || (f.reviewOnly && role === 'enumerator');
          const computedLocked = f.computedFrom && cqa?.[f.computedFrom]?._total?.total > 0;
          const label = single ? null : f.label;
          const inputId = `in-${q.id}-${f.key}`;
          let input;
          switch (f.type) {
            case 'text':
              input = <TextInput id={inputId} value={val} onChange={set} suggest={f.suggest} invalid={ferr.length > 0} placeholder={f.placeholder} disabled={locked} aria-label={label || q.title} />;
              break;
            case 'number':
              input = <NumberInput id={inputId} value={computedLocked ? cqa[f.key] : val} onChange={set} decimal={f.decimal} invalid={ferr.length > 0}
                readOnly={locked || computedLocked} aria-label={label || q.title} />;
              break;
            case 'date':
              input = <BsDatePicker id={inputId} value={val} onChange={set} invalid={ferr.length > 0} disabled={readOnly} />;
              break;
            case 'single':
            case 'multi':
              input = <ChoiceField field={f} name={path} value={val} other={qa?.[`${f.key}__other`]} invalid={ferr.length > 0}
                onChange={set} onOther={(v) => setField(q.id, `${f.key}__other`, v)} />;
              break;
            case 'grid':
              input = <GridField field={f} value={val} computed={cqa?.[f.key]} onChange={set} errorPaths={ferr.map((e) => e.path)} path={path} />;
              break;
            case 'repeat':
              input = <RepeatField field={f} value={val} computed={cqa?.[f.key]} onChange={set} errorPaths={ferr.map((e) => e.path)} path={path} answers={answers} title={q.title} />;
              break;
            case 'groupedRepeat':
              input = <GroupedRepeatField field={f} value={val} computed={cqa?.[f.key]} onChange={set} errorPaths={ferr.map((e) => e.path)} path={path} answers={answers} />;
              break;
            case 'signature':
              input = locked ? <p className="text-sm text-slate-500">{tr("सुपरभाइजरले समीक्षा गर्दा भर्ने।")}</p>
                : readOnly ? (val ? <img src={val} alt={f.label} className="h-20 rounded border bg-white" /> : <p className="text-sm text-slate-400">–</p>)
                : <SignaturePad value={val} onChange={set} label={f.label} />;
              break;
            default:
              input = null;
          }
          return (
            <div key={f.key} className="space-y-1">
              {label && <label htmlFor={inputId} className="block text-sm font-semibold text-slate-700">{label}{f.required && !locked && <span className="text-red-600"> *</span>}</label>}
              {input}
              {f.computedFrom && <p className="text-xs text-slate-500">{tr("तालिका भरेपछि परिवार संख्या स्वतः गणना हुन्छ।")}</p>}
              {ferr.map((e, i) => <p key={i} className="text-xs font-medium text-red-600">⚠ {translate(e.message)}</p>)}
              {fwarn.map((e, i) => <p key={`w${i}`} className="text-xs font-medium text-amber-700">ℹ {translate(e.message)}</p>)}
            </div>
          );
        })}
      </fieldset>
    </section>
  );
});

/**
 * Renders the full questionnaire with section navigation.
 * `answers` is the raw (editable) answer object; totals are derived via compute().
 */
export default function SurveyForm({ answers, onChange, errors = [], warnings = [], readOnly = false, role = 'enumerator', section, onSectionChange, notes = null, onNote }) {
  const [inner, setInner] = useState(sections[0].id);
  const active = section ?? inner;
  const setActive = (id) => { setInner(id); onSectionChange?.(id); };
  const computed = useMemo(() => compute(answers), [answers]);

  const setField = (qid, key, v) => {
    onChange((prev) => {
      const qa = { ...(prev[qid] || {}) };
      if (v === undefined) delete qa[key]; else qa[key] = v;
      const next = { ...prev, [qid]: qa };
      if (!Object.keys(qa).length) delete next[qid];
      return next;
    });
  };

  const visible = useMemo(() => questions.filter((q) => isQuestionVisible(q, answers)).map((q) => localizeQuestion(q)), [answers]);
  const errCount = (sid) => errors.filter((e) => questions.find((q) => q.id === e.q)?.section === sid).length;
  const noteCount = (sid) => Object.entries(notes || {}).filter(([qid, t]) => t && questions.find((q) => q.id === qid)?.section === sid).length;
  const idx = sections.findIndex((s) => s.id === active);
  const sectionQs = visible.filter((q) => q.section === active);

  return (
    <div>
      <nav className="sticky top-[88px] z-20 -mx-3 mb-4 overflow-x-auto border-b border-slate-200 bg-slate-50/95 px-3 py-2 backdrop-blur sm:mx-0 sm:rounded-lg sm:border" aria-label={tr("खण्डहरू")}>
        <ol className="flex gap-2">
          {sections.map((s, i) => (
            <li key={s.id}>
              <button type="button" onClick={() => { setActive(s.id); window.scrollTo?.({ top: 0 }); }}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold ${active === s.id ? 'bg-blue-700 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'}`}>
                <Icon name="section" size={14} />
                {np(i + 1)}. {translate(s.title).split(',')[0]}
                {errCount(s.id) > 0 && <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-red-600 px-1.5 text-xs text-white"><Icon name="warning" size={11} />{np(errCount(s.id))}</span>}
                {noteCount(s.id) > 0 && <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-amber-500 px-1.5 text-xs text-white" title={tr("टिप्पणी")}><Icon name="edit" size={11} />{np(noteCount(s.id))}</span>}
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <h2 className="app-section-title mb-3 flex items-center gap-2 text-lg font-bold text-slate-800"><Icon name="section" size={19} />{translate(sections[idx].title)} <span className="text-sm font-normal text-slate-500">{tr("(PDF पृष्ठ")} {np(sections[idx].pages)})</span></h2>
      <div className="space-y-4">
        {sectionQs.map((q) => (
          <QuestionCard key={q.id} q={q} qa={answers[q.id]} cqa={computed[q.id]} answers={answers} role={role}
            errors={errors.filter((e) => e.q === q.id)} warnings={warnings.filter((e) => e.q === q.id)} setField={setField} readOnly={readOnly}
            note={notes?.[q.id]} onNote={onNote} />
        ))}
      </div>
      <div className="mt-6 flex justify-between">
        <button type="button" className="btn-secondary" disabled={idx === 0} onClick={() => { setActive(sections[idx - 1].id); window.scrollTo?.({ top: 0 }); }}><Icon name="previous" size={16} />{tr("अघिल्लो खण्ड")}</button>
        <button type="button" className="btn-secondary" disabled={idx === sections.length - 1} onClick={() => { setActive(sections[idx + 1].id); window.scrollTo?.({ top: 0 }); }}>{tr("अर्को खण्ड")}<Icon name="next" size={16} /></button>
      </div>
    </div>
  );
}

export function goToError(err, setSection) {
  const q = questions.find((x) => x.id === err.q);
  if (q) setSection?.(q.section);
  setTimeout(() => document.getElementById(`q-${err.q}`)?.scrollIntoView({ behavior: 'smooth' }), 50);
}
