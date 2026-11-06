import { translate } from '@shared/i18n/index.js';
import { tr } from '@shared/i18n/index.js';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth, STATUS_LABEL } from '../../lib/auth.jsx';
import { completion, toNepaliDigits as np } from '@shared/engine.js';
import { questions } from '@shared/questionnaire.js';
import SurveyForm from '../../survey/SurveyForm.jsx';
import { SignaturePad } from '../../survey/fields.jsx';
import { Alert, Badge, Spinner } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';
import { Flags } from './ReviewQueue.jsx';

export function History({ items }) {
  if (!items?.length) return null;
  return (
    <ol className="space-y-1 text-sm">
      {items.map((h) => (
        <li key={h.id} className="flex flex-wrap gap-x-2">
          <span className="text-slate-500">{new Date(h.created_at).toLocaleString('ne-NP')}</span>
          <span>{h.from_status ? `${STATUS_LABEL[h.from_status]} → ` : ''}<b>{STATUS_LABEL[h.to_status]}</b></span>
          <span className="text-slate-600">({h.user_name})</span>
          {h.comment && <span className="text-slate-700">“{h.comment}”</span>}
          {h.details?.notes && <span className="text-amber-700">{np(Object.keys(h.details.notes).length)} {tr("प्रश्नमा टिप्पणी")}</span>}
        </li>
      ))}
    </ol>
  );
}

export default function ReviewSurvey() {
  const { id } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const [s, setS] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [hist, setHist] = useState([]);
  const [flags, setFlags] = useState(null);
  const [err, setErr] = useState(null);
  const [notes, setNotes] = useState({});
  const [comment, setComment] = useState('');
  const [verifier, setVerifier] = useState(user.full_name);
  const [sign, setSign] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [section, setSection] = useState(undefined);

  const load = useCallback(async () => {
    try {
      const [r, h, q] = await Promise.all([api(`/surveys/${id}`), api(`/surveys/${id}/history`), api('/quality/queue').catch(() => null)]);
      setS(r.data); setWarnings(r.warnings || []); setHist(h.data);
      setNotes(r.data.review_notes || {});
      const item = q?.data.find((x) => x.id === Number(id));
      setFlags(item ? { list: item.flags, labels: q.flagLabels } : null);
    } catch (e) { setErr(e); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const onNote = useCallback((qid, text) => setNotes((n) => ({ ...n, [qid]: text })), []);
  const cleanNotes = () => Object.entries(notes).filter(([, t]) => t && t.trim()).map(([q, note]) => ({ q, note: note.trim() }));

  const decide = async (kind) => {
    setMsg(null);
    if (kind === 'reject' && comment.trim().length < 3) return setMsg({ kind: 'error', text: tr("फिर्ता पठाउने कारण लेख्नुहोस्।") });
    if (kind === 'approve' && (!verifier.trim() || !sign)) return setMsg({ kind: 'error', text: tr("प्रमाणित गर्नेको नाम र सही आवश्यक छ।") });
    if (kind === 'approve' && cleanNotes().length && !window.confirm(tr("टिप्पणीहरू छन्। टिप्पणी बेवास्ता गरी स्वीकृत गर्ने?"))) return;
    setBusy(true);
    try {
      if (kind === 'approve') await api(`/surveys/${id}/approve`, { method: 'POST', body: { version: s.version, verifier_name: verifier.trim(), verifier_sign: sign, comment: comment.trim() || undefined } });
      else await api(`/surveys/${id}/reject`, { method: 'POST', body: { version: s.version, comment: comment.trim(), notes: cleanNotes() } });
      nav('/review', { replace: true });
    } catch (e) {
      setMsg({ kind: 'error', text: e.details?.errors ? `${e.message}: ${e.details.errors.slice(0, 3).map((x) => x.message).join(', ')}` : e.message });
      if (e.status === 409) load();
    } finally { setBusy(false); }
  };

  const reopen = async () => {
    const reason = window.prompt(tr("पुनः खोल्ने कारण:"));
    if (!reason) return;
    try { await api(`/surveys/${id}/reopen`, { method: 'POST', body: { version: s.version, comment: reason } }); load(); }
    catch (e) { setMsg({ kind: 'error', text: e.message }); }
  };

  if (err) return <Alert>{err.status ? err.message : tr("सर्भरसँग जोडिन सकिएन।")}</Alert>;
  if (!s) return <Spinner />;
  const reviewing = s.status === 'submitted' && ['supervisor', 'admin'].includes(user.role) && s.enumerator_id !== user.id;
  const noteCount = cleanNotes().length;

  return (
    <div>
      <div className="card mb-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-xs text-slate-500">{s.household_code}</p>
            <h1 className="text-lg font-bold">{s.head_name}</h1>
            <p className="text-sm text-slate-600">{tr("वडा")} {np(s.ward_no)} · {s.settlement_name} {tr("· गणक:")} {s.enumerator_name}</p>
            {s.gps_lat != null ? (
              <a className="text-xs text-blue-700 underline" target="_blank" rel="noreferrer"
                href={`https://www.openstreetmap.org/?mlat=${s.gps_lat}&mlon=${s.gps_lng}#map=17/${s.gps_lat}/${s.gps_lng}`}>📍 {np(Number(s.gps_lat).toFixed(5))}, {np(Number(s.gps_lng).toFixed(5))}{s.gps_accuracy_m != null && tr(" (±{0} मि.)", [np(Math.round(s.gps_accuracy_m))])} {tr("— नक्सामा हेर्नुहोस्")}</a>
            ) : <p className="text-xs text-slate-500">{tr("GPS स्थान छैन")}</p>}
          </div>
          <div className="text-right">
            <Badge status={s.status} />
            <p className="mt-1 text-xs text-slate-500">{tr("पूर्णता")} {np(Math.round(completion(s.answers) * 100))}{tr("% · चेतावनी")} {np(warnings.length)}</p>
          </div>
        </div>
        {flags && <div className="mt-3"><Flags flags={flags.list} labels={flags.labels} /></div>}
        {warnings.length > 0 && (
          <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold text-amber-800">{tr("तथ्यांक जाँच चेतावनी (")}{np(warnings.length)})</summary>
            <ul className="mt-1 list-disc pl-5 text-amber-900">{warnings.map((w, i) => <li key={i}>{tr("प्रश्न")} {questions.find((q) => q.id === w.q)?.no}: {translate(w.message)}</li>)}</ul>
          </details>
        )}
        <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold text-slate-700">{tr("इतिहास")}</summary><div className="mt-2"><History items={hist} /></div></details>
        {user.role === 'admin' && s.status === 'approved' && <button className="btn-secondary mt-3 text-sm" onClick={reopen}><Icon name="reset" size={15} />{tr("पुनः खोल्नुहोस् (फिर्ता)")}</button>}
      </div>

      {reviewing && <p className="mb-3 text-sm text-slate-600">{tr(
        "प्रत्येक प्रश्नमा \"+ यो प्रश्नमा टिप्पणी\" थिचेर गणकलाई के सच्याउने भनेर लेख्न सकिन्छ।"
      )}</p>}
      <SurveyForm answers={s.answers} onChange={() => {}} warnings={warnings} readOnly role={user.role} section={section} onSectionChange={setSection}
        notes={reviewing ? notes : s.review_notes} onNote={reviewing ? onNote : undefined} />

      {reviewing && (
        <div className="card mt-6 space-y-4 border-blue-200 p-4">
          <h2 className="app-section-title flex items-center gap-2 text-lg font-bold"><Icon name="review" size={20} />{tr("समीक्षा निर्णय")}</h2>
          {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
          <label className="block text-sm"><span className="font-semibold">{tr("टिप्पणी / फिर्ता पठाउने कारण")}</span>
            <textarea className="field-input mt-1" rows={3} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={tr("फिर्ता पठाउँदा अनिवार्य")} />
          </label>
          {noteCount > 0 && <p className="text-sm text-amber-800">{np(noteCount)} {tr("प्रश्नमा टिप्पणी लेखिएको छ — फिर्ता पठाउँदा गणकलाई देखिन्छ।")}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm"><span className="font-semibold">{tr("प्रमाणित गर्नेको नाम *")}</span>
              <input className="field-input mt-1" value={verifier} onChange={(e) => setVerifier(e.target.value)} maxLength={150} />
            </label>
            <div className="text-sm"><span className="font-semibold">{tr("प्रमाणित गर्नेको सही *")}</span><div className="mt-1"><SignaturePad value={sign} onChange={setSign} label={tr("प्रमाणित गर्नेको सही")} /></div></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-success" disabled={busy} onClick={() => decide('approve')}><Icon name="submit" size={17} />{tr("स्वीकृत गर्नुहोस्")}</button>
            <button className="btn-danger" disabled={busy} onClick={() => decide('reject')}><Icon name="edit" size={17} />{tr("सच्याउन फिर्ता पठाउनुहोस्")}</button>
          </div>
        </div>
      )}
      <p className="mt-4 text-sm"><Link to="/review" className="text-blue-700 hover:underline">{tr("← समीक्षा सूचीमा फर्कनुहोस्")}</Link></p>
    </div>
  );
}
