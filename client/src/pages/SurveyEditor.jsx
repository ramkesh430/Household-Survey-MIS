import { translate } from '@shared/i18n/index.js';
import { tr } from '@shared/i18n/index.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth, STATUS_LABEL } from '../lib/auth.jsx';
import { useOffline } from '../lib/offline.jsx';
import * as store from '../offline/store.js';
import { validate, completion, toNepaliDigits as np } from '@shared/engine.js';
import { questions } from '@shared/questionnaire.js';
import SurveyForm from '../survey/SurveyForm.jsx';
import GpsCapture from '../components/GpsCapture.jsx';
import { Alert, Badge, Spinner } from '../components/ui.jsx';
import { isRealBsDate } from '../lib/bsdate.js';
import Icon from '../components/Icon.jsx';

const LOCAL_SAVE_MS = 600;

/** Local-first survey editor: every change is written to this device, then synced. */
export default function SurveyEditor() {
  const { uuid } = useParams();
  const { user } = useAuth();
  const { kick, state: syncState } = useOffline();
  const [survey, setSurvey] = useState(null);
  const [answers, setAnswers] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState('saved'); // dirty | saved
  const [errors, setErrors] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [msg, setMsg] = useState(null);
  const [section, setSection] = useState(undefined);
  const latest = useRef(null);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const s = await store.getSurvey(user.id, uuid);
    if (!s) { setNotFound(true); return; }
    setSurvey(s);
    // only replace the answers on screen if there are no unsaved keystrokes
    if (seq.current === 0 || saving === 'saved') { setAnswers(s.answers); latest.current = s.answers; }
    if (s.server_errors?.length && s.sync_state === 'error') setErrors(s.server_errors);
    if (s.warnings) setWarnings(s.warnings);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, uuid]);

  useEffect(() => { reload(); }, [reload]);
  // refresh status badges after each sync cycle
  useEffect(() => {
    if (!survey) return;
    store.getSurvey(user.id, uuid).then((s) => {
      if (!s) return;
      setSurvey(s);
      if (s.sync_state === 'error' && s.server_errors?.length) setErrors(s.server_errors);
      if (saving === 'saved' && s.sync_state === 'synced') { setAnswers(s.answers); latest.current = s.answers; }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncState?.lastSync, syncState?.pending, syncState?.conflicts]);

  const editable = survey && ['draft', 'rejected'].includes(survey.status) && survey.sync_state !== 'conflict';

  const onChange = useCallback((updater) => {
    setAnswers((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      latest.current = next;
      return next;
    });
    seq.current += 1;
    setSaving('dirty');
  }, []);

  // write to IndexedDB shortly after typing stops
  useEffect(() => {
    if (saving !== 'dirty' || !editable) return undefined;
    const mySeq = seq.current;
    const t = setTimeout(async () => {
      try {
        const s = await store.saveSurvey(user, uuid, latest.current);
        setSurvey((cur) => ({ ...cur, ...s, household: cur.household }));
        if (seq.current === mySeq) setSaving('saved');
        kick();
      } catch (e) { setMsg({ kind: 'error', text: e.message }); }
    }, LOCAL_SAVE_MS);
    return () => clearTimeout(t);
  }, [answers, saving, editable, user, uuid, kick]);

  // flush pending edits when leaving the page
  useEffect(() => () => {
    if (seq.current > 0 && latest.current) store.saveSurvey(user, uuid, latest.current).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setGps = async (gps) => {
    try {
      const s = await store.saveSurvey(user, uuid, latest.current, { gps });
      setSurvey((cur) => ({ ...cur, ...s, household: cur.household }));
      kick();
    } catch (e) { setMsg({ kind: 'error', text: e.message }); }
  };

  const submit = async () => {
    setMsg(null);
    const v = validate(answers, { mode: 'submit', role: user.role === 'admin' ? 'admin' : 'enumerator' });
    const dateVal = answers?.verify?.date_bs;
    if (dateVal && !isRealBsDate(dateVal)) v.errors.push({ q: 'verify', field: 'date_bs', path: 'verify.date_bs', message: tr("यो मिति वि.सं. पात्रोमा छैन") });
    setErrors(v.errors); setWarnings(v.warnings);
    if (v.errors.length) {
      setMsg({ kind: 'error', text: tr("पेश गर्नु अघि {0} वटा त्रुटि सच्याउनुहोस्।", [np(v.errors.length)]) });
      return;
    }
    if (!survey.gps && !window.confirm(tr("घरको GPS स्थान लिइएको छैन। GPS बिना पेश गर्ने?"))) return;
    if (v.warnings.length && !window.confirm(tr(
      "{0} वटा चेतावनी छन्। के तपाईं पेश गर्न चाहनुहुन्छ?",
      [np(v.warnings.length)]
    ))) return;
    if (!window.confirm(tr("पेश गरेपछि सम्पादन गर्न मिल्दैन। पेश गर्ने?"))) return;
    try {
      const s = await store.submitSurvey(user, uuid, answers);
      seq.current = 0; setSaving('saved');
      setSurvey((cur) => ({ ...cur, ...s, household: cur.household }));
      kick();
      setMsg({ kind: 'ok', text: navigator.onLine ? tr("पेश गरियो। सर्भरमा पठाइँदैछ…") : tr("पेश गरियो। इन्टरनेट जोडिएपछि स्वतः सर्भरमा पठाइनेछ।") });
    } catch (e) { setMsg({ kind: 'error', text: e.message }); }
  };

  if (notFound) return <Alert>{tr("यो सर्वेक्षण यस उपकरणमा छैन।")} <Link className="underline" to="/surveys">{tr("सूचीमा फर्कनुहोस्")}</Link></Alert>;
  if (!survey || !answers) return <Spinner />;

  const h = survey.household;
  const pct = Math.round(completion(answers) * 100);
  const goTo = (e) => {
    const q = questions.find((x) => x.id === e.q);
    if (q) setSection(q.section);
    setTimeout(() => document.getElementById(`q-${e.q}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };
  const syncLabel = saving === 'dirty' ? tr("सुरक्षित हुँदैछ…")
    : survey.sync_state === 'synced' ? tr("✓ सर्भरमा सिंक भयो")
    : survey.sync_state === 'conflict' ? tr("⚠ द्वन्द्व — समाधान आवश्यक")
    : survey.sync_state === 'error' ? tr("⚠ सर्भरले अस्वीकार गर्‍यो")
    : tr("✓ यस उपकरणमा सुरक्षित · सर्भरमा पठाउन बाँकी");

  return (
    <div>
      <div className="card mb-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-xs text-slate-500">{h?.household_code}</p>
            <h1 className="text-lg font-bold">{h?.head_name}</h1>
            <p className="text-sm text-slate-600">{tr("वडा")} {np(h?.ward_no)} · {h?.settlement_name} {tr("· घर")} {np(h?.house_no)} {tr("/ परिवार")} {np(h?.family_no)}</p>
          </div>
          <div className="text-right">
            <Badge status={survey.status} />
            <p className="mt-1 text-xs text-slate-500">{syncLabel}</p>
          </div>
        </div>
        <div className="mt-3">
          <div className="flex justify-between text-xs text-slate-600"><span>{tr("पूर्णता")}</span><span>{np(pct)}%</span></div>
          <div className="mt-1 h-2 rounded-full bg-slate-200"><div className="h-2 rounded-full bg-blue-700 transition-all" style={{ width: `${pct}%` }} /></div>
        </div>
        <div className="mt-3"><GpsCapture value={survey.gps} onCapture={setGps} disabled={!editable} /></div>
        {survey.status === 'rejected' && (
          <div className="mt-3"><Alert kind="warn">
            <b>{tr("सुपरभाइजरले फिर्ता पठाउनुभयो:")}</b> {survey.review_comment}
            {survey.review_notes && Object.keys(survey.review_notes).length > 0 && (
              <ul className="mt-1 list-disc pl-5">
                {Object.entries(survey.review_notes).map(([qid, t]) => {
                  const q = questions.find((x) => x.id === qid);
                  return <li key={qid}><button className="text-left underline" onClick={() => goTo({ q: qid })}>{tr("प्रश्न")} {q?.no ? np(q.no) : translate(q?.title)}</button>: {t}</li>;
                })}
              </ul>
            )}
            <p className="mt-1">{tr("सच्याएर फेरि \"पेश गर्नुहोस्\" थिच्नुहोस्।")}</p>
          </Alert></div>
        )}
        {survey.sync_state === 'conflict' && <div className="mt-3"><Alert kind="warn">{tr("यो फारम अर्को उपकरण/सुपरभाइजरबाट परिवर्तन भएको छ।")} <Link to="/sync" className="font-semibold underline">{tr("द्वन्द्व समाधान गर्नुहोस्")}</Link></Alert></div>}
        {survey.taken && <div className="mt-3"><Alert>{survey.sync_error} <Link to="/sync" className="font-semibold underline">{tr("विवरण")}</Link></Alert></div>}
        {!editable && survey.sync_state !== 'conflict' && <p className="mt-3 text-sm text-slate-600">{tr("यो सर्वेक्षण \"")}{STATUS_LABEL[survey.status]}{tr("\" अवस्थामा छ — हेर्न मात्र मिल्छ।")}</p>}
      </div>

      {msg && <div className="mb-4"><Alert kind={msg.kind}>{msg.text}</Alert></div>}

      {errors.length > 0 && (
        <details className="card mb-4 border-red-200 p-3" open>
          <summary className="cursor-pointer font-semibold text-red-700">{tr("त्रुटिहरू (")}{np(errors.length)}){survey.sync_state === 'error' && survey.server_errors?.length ? tr(" — सर्भरको जाँचबाट") : ''}
          </summary>
          <ul className="mt-2 max-h-56 space-y-1 overflow-auto text-sm">
            {errors.map((e, i) => {
              const q = questions.find((x) => x.id === e.q);
              const f = q?.fields.find((x) => x.key === e.field);
              return <li key={i}><button className="text-left text-red-700 hover:underline" onClick={() => goTo(e)}>{tr("प्रश्न")} {q?.no ? np(q.no) : translate(q?.title)}{f?.label && q.fields.length > 1 ? ` (${translate(f.label)})` : ''}: {translate(e.message)}</button></li>;
            })}
          </ul>
        </details>
      )}

      <SurveyForm answers={answers} onChange={onChange} errors={errors} warnings={warnings} readOnly={!editable} role={user.role}
        section={section} onSectionChange={setSection} notes={survey.status === 'rejected' ? survey.review_notes : null} />

      {editable && (
        <div className="sticky bottom-0 z-20 -mx-3 mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-white/95 px-3 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border">
          <span className="mr-auto text-xs text-slate-600 sm:text-sm">{syncLabel}</span>
          <button className="btn-success" disabled={saving === 'dirty'} onClick={submit}><Icon name="submit" size={17} />{tr("पेश गर्नुहोस्")}</button>
        </div>
      )}
      <p className="mt-4 text-sm"><Link to="/surveys" className="text-blue-700 hover:underline">{tr("← सर्वेक्षण सूचीमा फर्कनुहोस्")}</Link></p>
    </div>
  );
}
