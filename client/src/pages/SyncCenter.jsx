import { tr } from '@shared/i18n/index.js';
import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { useOffline, useAfterSync } from '../lib/offline.jsx';
import * as store from '../offline/store.js';
import { getDb } from '../offline/db.js';
import { questions } from '@shared/questionnaire.js';
import { toNepaliDigits as np } from '@shared/engine.js';
import { Alert, PageHeader } from '../components/ui.jsx';
import { NumberInput } from '../survey/fields.jsx';
import Icon from '../components/Icon.jsx';

const OP_LABEL = { 'household.create': tr("घरधुरी दर्ता"), 'survey.create': tr("सर्वेक्षण सुरु"), 'survey.save': tr("उत्तर सुरक्षित"), 'survey.submit': tr("सर्वेक्षण पेश") };

function changedQuestions(mine = {}, theirs = {}) {
  return questions.filter((q) => JSON.stringify(mine[q.id] ?? null) !== JSON.stringify(theirs[q.id] ?? null)).map((q) => q.no || q.title);
}

export default function SyncCenter() {
  const { user } = useAuth();
  const { engine, state, kick } = useOffline();
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState(null);
  const [renum, setRenum] = useState({});

  const load = useCallback(async () => {
    const db = await getDb(user.id);
    const [problems, outbox, surveys, households] = await Promise.all([store.listProblems(user.id), db.getAll('outbox'), db.getAll('surveys'), db.getAll('households')]);
    const sMap = Object.fromEntries(surveys.map((s) => [s.uuid, s]));
    const hMap = Object.fromEntries(households.map((h) => [h.uuid, h]));
    const name = (op) => (op.type.startsWith('survey') ? hMap[sMap[op.uuid]?.household_uuid]?.head_name : hMap[op.uuid]?.head_name) || '—';
    setData({ problems, outbox: outbox.map((o) => ({ ...o, name: name(o) })), hMap });
  }, [user.id]);
  useAfterSync(load);

  const act = async (fn, ok) => {
    setMsg(null);
    try { await fn(); setMsg({ kind: 'ok', text: ok }); kick(); await load(); } catch (e) { setMsg({ kind: 'error', text: e.message }); }
  };

  if (!engine) return <Alert kind="info">{tr("सुपरभाइजर खाता अनलाइन मात्र काम गर्छ।")}</Alert>;

  return (
    <div className="space-y-4">
      <PageHeader title={tr("सिंक तथा अफलाइन डाटा")}>
        <button className="btn-primary" disabled={state?.status === 'syncing'} onClick={() => engine.sync({ force: true })}><Icon name="sync" size={17} />{tr("अहिले सिंक गर्नुहोस्")}</button>
      </PageHeader>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <div className="card grid gap-2 p-4 text-sm sm:grid-cols-4">
        <p>{tr("अवस्था:")} <b>{{ idle: tr("अनलाइन"), offline: tr("अफलाइन"), syncing: tr("सिंक हुँदैछ"), auth: tr("लगइन आवश्यक"), error: tr("त्रुटि") }[state?.status]}</b></p>
        <p>{tr("पठाउन बाँकी:")} <b>{np(state?.pending ?? 0)}</b></p>
        <p>{tr("द्वन्द्व:")} <b>{np(state?.conflicts ?? 0)}</b> {tr("· त्रुटि:")} <b>{np(state?.errors ?? 0)}</b></p>
        <p>{tr("अन्तिम सिंक:")} <b>{state?.lastSync ? new Date(state.lastSync).toLocaleString('ne-NP') : '—'}</b></p>
        {state?.lastError && <p className="sm:col-span-4 text-red-700">{state.lastError}</p>}
      </div>

      {data?.problems.households.map((h) => (
        <div key={h.uuid} className="card border-orange-300 p-4">
          <p className="font-semibold">{tr("घरधुरी:")} {h.head_name} <span className="font-mono text-xs text-slate-500">({h.household_code})</span></p>
          {h.conflict?.type === 'duplicate' ? (
            <>
              <p className="mt-1 text-sm text-slate-700">{tr("यही बस्ती, घर क्र.सं.")} {np(h.house_no)} {tr("र परिवार क्र.सं.")} {np(h.family_no)} {tr("भएको घरधुरी सर्भरमा पहिले नै दर्ता छ:")}<b> {h.conflict.existing.head_name}</b> ({h.conflict.existing.household_code}){h.conflict.existing.survey_status ? tr(" — यसको सर्वेक्षण सुरु भइसकेको छ") : ''}{tr("।")}</p>
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <button className="btn-primary text-sm" disabled={!!h.conflict.existing.survey_status} onClick={() => act(() => store.resolveHouseholdConflict(user, h.uuid, 'link'), tr("सर्भरको घरधुरीसँग जोडियो"))}><Icon name="households" size={15} />{tr("उही घरधुरी हो — जोड्नुहोस्")}</button>
                <span className="text-sm text-slate-500">{tr("वा फरक नम्बर:")}</span>
                <div className="w-24"><NumberInput placeholder={tr("घर")} value={renum[h.uuid]?.house_no} onChange={(v) => setRenum({ ...renum, [h.uuid]: { ...renum[h.uuid], house_no: v } })} aria-label={tr("नयाँ घर क्र.सं.")} /></div>
                <div className="w-20"><NumberInput placeholder={tr("परिवार")} value={renum[h.uuid]?.family_no ?? h.family_no} onChange={(v) => setRenum({ ...renum, [h.uuid]: { ...renum[h.uuid], family_no: v } })} aria-label={tr("नयाँ परिवार क्र.सं.")} /></div>
                <button className="btn-secondary text-sm" onClick={() => act(() => store.resolveHouseholdConflict(user, h.uuid, 'renumber', { house_no: renum[h.uuid]?.house_no, family_no: renum[h.uuid]?.family_no ?? h.family_no }), tr("नम्बर सच्याइयो"))}><Icon name="edit" size={15} />{tr("नम्बर सच्याउनुहोस्")}</button>
                <button className="btn-danger text-sm" onClick={() => window.confirm(tr("यो घरधुरी र यसको सर्वेक्षण यस उपकरणबाट मेटिनेछ। निश्चित?")) && act(() => store.resolveHouseholdConflict(user, h.uuid, 'discard'), tr("मेटाइयो"))}><Icon name="delete" size={15} />{tr("मेटाउनुहोस्")}</button>
              </div>
            </>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-red-700">{h.sync_error}</span>
              <button className="btn-danger text-sm" onClick={() => window.confirm(tr("यस उपकरणबाट मेटाउने?")) && act(() => store.resolveHouseholdConflict(user, h.uuid, 'discard'), tr("मेटाइयो"))}><Icon name="delete" size={15} />{tr("मेटाउनुहोस्")}</button>
            </div>
          )}
        </div>
      ))}

      {data?.problems.surveys.map((s) => {
        const h = data.hMap[s.household_uuid];
        const server = s.conflict?.server;
        return (
          <div key={s.uuid} className="card border-orange-300 p-4">
            <p className="font-semibold">{tr("सर्वेक्षण:")} {h?.head_name} <span className="font-mono text-xs text-slate-500">({h?.household_code})</span></p>
            {s.sync_state === 'conflict' ? (
              <>
                <p className="mt-1 text-sm text-slate-700">{tr("तपाईंले यस उपकरणमा परिवर्तन गर्दा सर्भरमा पनि यो फारम परिवर्तन भयो")}{server ? tr(" (सर्भर अवस्था: {0})", [server.status]) : ''}{tr("।")}</p>
                {server && <p className="mt-1 text-sm">{tr("फरक परेका प्रश्न:")} <b>{changedQuestions(s.answers, server.answers).join(', ') || '—'}</b></p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="btn-primary text-sm" disabled={!server || !['draft', 'rejected'].includes(server.status)} onClick={() => act(() => store.resolveSurveyConflict(user, s.uuid, 'mine'), tr("तपाईंको संस्करण सर्भरमा पठाइँदैछ"))}><Icon name="submit" size={15} />{tr("मेरो संस्करण राख्नुहोस्")}</button>
                  <button className="btn-secondary text-sm" disabled={!server} onClick={() => window.confirm(tr("यस उपकरणका परिवर्तन हराउनेछन्। निश्चित?")) && act(() => store.resolveSurveyConflict(user, s.uuid, 'server'), tr("सर्भरको संस्करण लिइयो"))}><Icon name="sync" size={15} />{tr("सर्भरको संस्करण राख्नुहोस्")}</button>
                  <Link className="btn-secondary text-sm" to={`/s/${s.uuid}`}><Icon name="view" size={15} />{tr("फारम हेर्नुहोस्")}</Link>
                </div>
              </>
            ) : (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-red-700">{s.sync_error}</span>
                {s.server_errors?.length > 0 ? <Link className="btn-primary text-sm" to={`/s/${s.uuid}`}><Icon name="edit" size={15} />{tr("त्रुटि सच्याउनुहोस्")}</Link>
                  : <button className="btn-danger text-sm" onClick={() => window.confirm(tr("यो सर्वेक्षण यस उपकरणबाट मेटिनेछ। निश्चित?")) && act(() => store.discardSurvey(user, s.uuid), tr("मेटाइयो"))}><Icon name="delete" size={15} />{tr("यस उपकरणबाट हटाउनुहोस्")}</button>}
              </div>
            )}
          </div>
        );
      })}

      <div className="card p-4">
        <h2 className="app-section-title mb-2 flex items-center gap-2 font-bold"><Icon name="sync" size={18} />{tr("पठाउन बाँकी कार्यहरू (")}{np(data?.outbox.length ?? 0)})</h2>
        {data?.outbox.length === 0 && <p className="text-sm text-slate-500">{tr("सबै डाटा सर्भरमा पुगिसकेको छ।")}</p>}
        <ol className="divide-y text-sm">
          {data?.outbox.map((o) => (
            <li key={o.seq} className="flex flex-wrap justify-between gap-2 py-2">
              <span>{OP_LABEL[o.type] || o.type} — {o.name}</span>
              <span className="text-xs text-slate-500">
                {o.blocked ? tr("रोकिएको (माथि हेर्नुहोस्)") : o.attempts ? tr("प्रयास {0} · {1}", [np(o.attempts), o.last_error || '']) : tr("पर्खँदै")}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
