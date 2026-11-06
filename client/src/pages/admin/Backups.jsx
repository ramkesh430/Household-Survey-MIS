import { useRef, useState } from 'react';
import { tr } from '@shared/i18n/index.js';
import { api, session } from '../../lib/api.js';
import { useFetch } from '../../lib/useFetch.js';
import { downloadFile } from '../../lib/download.js';
import { Alert, PageHeader, Spinner, np } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';

const size = (b) => (b > 1e6 ? `${np((b / 1e6).toFixed(1))} MB` : `${np(Math.max(1, Math.round(b / 1e3)))} KB`);
const kind = (n) => (n.includes('-auto') ? tr('स्वचालित') : n.includes('-pre-restore') ? tr('restore अघिको') : tr('हातैले'));

export default function Backups() {
  const { data, error, loading, reload } = useFetch('/admin/backups');
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [restore, setRestore] = useState(null); // { name } | { file }
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const fileRef = useRef(null);

  const create = async () => {
    setBusy('create'); setMsg(null);
    try { const r = await api('/admin/backups', { method: 'POST' }); setMsg({ kind: 'ok', text: tr('ब्याकअप बन्यो: {0}', [r.data.name]) }); reload(); }
    catch (e) { setMsg({ kind: 'error', text: e.message }); } finally { setBusy(null); }
  };
  const remove = async (name) => {
    if (!window.confirm(tr('{0} मेटाउने?', [name]))) return;
    try { await api(`/admin/backups/${name}`, { method: 'DELETE' }); reload(); } catch (e) { setMsg({ kind: 'error', text: e.message }); }
  };
  const doRestore = async () => {
    setBusy('restore'); setMsg(null);
    try {
      let r;
      if (restore.name) r = await api(`/admin/backups/${restore.name}/restore`, { method: 'POST', body: { password: pw, confirm } });
      else {
        const res = await fetch(`${import.meta.env.VITE_API_BASE || ''}/api/admin/restore`, {
          method: 'POST', body: restore.file,
          headers: { 'Content-Type': 'application/gzip', Authorization: `Bearer ${session.get()?.accessToken}`, 'X-Admin-Password': pw, 'X-Confirm': confirm },
        });
        r = await res.json();
        if (!res.ok) throw new Error(r?.error?.message || `HTTP ${res.status}`);
      }
      setRestore(null); setPw(''); setConfirm('');
      setMsg({ kind: 'ok', text: tr('Restore सम्पन्न: {0} पंक्ति। सुरक्षाका लागि पहिलेको अवस्था {1} मा राखिएको छ। सबै प्रयोगकर्ताले फेरि लगइन गर्नुपर्नेछ।', [np(r.data.rows), r.data.safety_backup]) });
      setTimeout(() => { session.set(null); window.location.href = '/login'; }, 4000);
    } catch (e) { setMsg({ kind: 'error', text: e.message }); } finally { setBusy(null); }
  };

  return (
    <div className="max-w-4xl">
      <PageHeader title={tr('ब्याकअप तथा पुनर्स्थापना')}>
        <button className="btn-primary" disabled={!!busy} onClick={create}><Icon name="backup" size={17} />{busy === 'create' ? tr('बनाउँदै…') : tr('अहिले ब्याकअप बनाउनुहोस्')}</button>
      </PageHeader>
      {msg && <div className="mb-3"><Alert kind={msg.kind}>{msg.text}</Alert></div>}
      {data?.settings && (
        <div className="card mb-4 p-4 text-sm text-slate-700">
          <p>{data.settings.scheduled ? tr('स्वचालित ब्याकअप: हरेक दिन {0}:०० UTC मा, {1} दिनसम्म राखिन्छ।', [np(data.settings.hour_utc), np(data.settings.retention_days)]) : tr('स्वचालित ब्याकअप बन्द छ।')}</p>
          <p className="mt-1 text-xs text-slate-500">{tr('संवेदनशील उत्तरहरू ब्याकअपभित्र पनि इन्क्रिप्ट रहन्छन्। Restore गर्न उही ENCRYPTION_KEY चाहिन्छ — साँचो र ब्याकअप फाइल सर्भरबाहिर सुरक्षित ठाउँमा पनि राख्नुहोस्।')}</p>
        </div>
      )}
      {loading && <Spinner />}
      {error && <Alert>{error.message}</Alert>}
      {data && (
        <div className="card overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-left"><tr>{[tr('फाइल'), tr('प्रकार'), tr('मिति'), tr('आकार'), ''].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
            <tbody>
              {data.data.map((b) => (
                <tr key={b.name} className="border-t">
                  <td className="px-3 py-2 font-mono text-xs">{b.name}</td>
                  <td className="px-3 py-2">{kind(b.name)}</td>
                  <td className="whitespace-nowrap px-3 py-2">{new Date(b.created_at).toLocaleString()}</td>
                  <td className="px-3 py-2">{size(b.size)}</td>
                  <td className="space-x-3 whitespace-nowrap px-3 py-2 text-right">
                    <button className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline" onClick={() => downloadFile(`/admin/backups/${b.name}`).catch((e) => setMsg({ kind: 'error', text: e.message }))}><Icon name="download" size={14} />{tr('डाउनलोड')}</button>
                    <button className="inline-flex items-center gap-1 font-semibold text-amber-700 hover:underline" onClick={() => setRestore({ name: b.name })}><Icon name="reset" size={14} />{tr('Restore')}</button>
                    <button className="inline-flex items-center gap-1 font-semibold text-red-700 hover:underline" onClick={() => remove(b.name)}><Icon name="delete" size={14} />{tr('मेटाउनुहोस्')}</button>
                  </td>
                </tr>
              ))}
              {data.data.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-slate-500">{tr('अहिलेसम्म कुनै ब्याकअप छैन।')}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <div className="card mt-4 p-4">
        <h2 className="app-section-title flex items-center gap-2 font-bold"><Icon name="backup" size={18} />{tr('फाइलबाट restore')}</h2>
        <p className="mt-1 text-sm text-slate-600">{tr('अर्को सर्भर वा कम्प्युटरमा राखिएको .jsonl.gz ब्याकअप फाइल छान्नुहोस्।')}</p>
        <input ref={fileRef} type="file" accept=".gz,application/gzip" className="mt-2 text-sm" onChange={(e) => e.target.files[0] && setRestore({ file: e.target.files[0], fileName: e.target.files[0].name })} />
      </div>
      {restore && (
        <div className="card mt-4 space-y-3 border-red-300 bg-red-50 p-4" role="dialog" aria-label={tr('Restore पुष्टि')}>
          <p className="font-bold text-red-800">{tr('सावधान: हालको सबै डाटा "{0}" को डाटाले प्रतिस्थापन हुनेछ।', [restore.name || restore.fileName])}</p>
          <p className="text-sm text-red-900">{tr('ब्याकअपपछि भएका सबै परिवर्तन हराउनेछन् (गणकका उपकरणमा पठाउन बाँकी डाटा भने फेरि सिंक हुनेछ)। Restore अघि हालको अवस्थाको ब्याकअप स्वतः बनाइन्छ।')}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm"><span className="font-semibold">{tr('तपाईंको पासवर्ड')}</span>
              <input type="password" className="field-input mt-1" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" /></label>
            <label className="text-sm"><span className="font-semibold">{tr('पुष्टि गर्न RESTORE लेख्नुहोस्')}</span>
              <input className="field-input mt-1" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" /></label>
          </div>
          <div className="flex gap-2">
            <button className="btn-danger" disabled={busy === 'restore' || confirm !== 'RESTORE' || !pw} onClick={doRestore}><Icon name="reset" size={16} />{busy === 'restore' ? tr('Restore हुँदैछ…') : tr('Restore गर्नुहोस्')}</button>
            <button className="btn-secondary" onClick={() => { setRestore(null); if (fileRef.current) fileRef.current.value = ''; }}><Icon name="close" size={16} />{tr('रद्द')}</button>
          </div>
        </div>
      )}
    </div>
  );
}
