import { tr } from '@shared/i18n/index.js';
import { useState } from 'react';
import { api } from '../../lib/api.js';
import { useFetch } from '../../lib/useFetch.js';
import { useAuth, ROLE_LABEL } from '../../lib/auth.jsx';
import { Alert, PageHeader, Spinner, np } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';

const blank = { username: '', full_name: '', role: 'enumerator', ward_id: '', phone: '', password: '' };

export default function Users() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useFetch('/users');
  const wards = useFetch('/wards');
  const [f, setF] = useState(blank);
  const [msg, setMsg] = useState(null);
  const isAdmin = user.role === 'admin';

  const create = async (e) => {
    e.preventDefault(); setMsg(null);
    try {
      await api('/users', { method: 'POST', body: { ...f, ward_id: f.role === 'admin' ? null : Number(f.ward_id) || null, phone: f.phone || null } });
      setF(blank); setMsg({ kind: 'ok', text: tr("प्रयोगकर्ता सिर्जना भयो। पहिलो लगइनमा पासवर्ड परिवर्तन गर्नुपर्नेछ।") }); reload();
    } catch (ex) { setMsg({ kind: 'error', text: ex.details?.map((d) => d.message).join(', ') || ex.message }); }
  };
  const toggle = async (u) => {
    try { await api(`/users/${u.id}`, { method: 'PATCH', body: { is_active: !u.is_active } }); reload(); } catch (ex) { setMsg({ kind: 'error', text: ex.message }); }
  };
  const reset = async (u) => {
    const pw = window.prompt(tr(
      "{0} को नयाँ अस्थायी पासवर्ड (कम्तीमा ८ अक्षर, अक्षर र अंक):",
      [u.username]
    ));
    if (!pw) return;
    try { await api(`/users/${u.id}/reset-password`, { method: 'POST', body: { password: pw } }); setMsg({ kind: 'ok', text: tr("पासवर्ड रिसेट भयो") }); } catch (ex) { setMsg({ kind: 'error', text: ex.details?.[0]?.message || ex.message }); }
  };

  return (
    <div>
      <PageHeader title={tr("प्रयोगकर्ता व्यवस्थापन")} />
      {msg && <div className="mb-3"><Alert kind={msg.kind}>{msg.text}</Alert></div>}
      {isAdmin && (
        <form onSubmit={create} className="card mb-4 grid gap-3 p-4 sm:grid-cols-3">
          <input className="field-input" placeholder={tr("प्रयोगकर्ता नाम (a-z, 0-9)")} value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} required aria-label={tr("प्रयोगकर्ता नाम")} />
          <input className="field-input" placeholder={tr("पूरा नाम")} value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} required aria-label={tr("पूरा नाम")} />
          <input className="field-input" placeholder={tr("मोबाइल")} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} aria-label={tr("मोबाइल")} />
          <select className="field-input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} aria-label={tr("भूमिका")}>
            {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select className="field-input" value={f.ward_id} disabled={f.role === 'admin'} onChange={(e) => setF({ ...f, ward_id: e.target.value })} aria-label={tr("वडा")}>
            <option value="">{tr("— वडा —")}</option>
            {wards.data?.data.map((w) => <option key={w.id} value={w.id}>{tr("वडा नं.")} {np(w.ward_no)}</option>)}
          </select>
          <input className="field-input" type="password" placeholder={tr("अस्थायी पासवर्ड")} autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required aria-label={tr("पासवर्ड")} />
          <button className="btn-primary sm:col-span-3"><Icon name="plus" size={17} />{tr("प्रयोगकर्ता थप्नुहोस्")}</button>
        </form>
      )}
      {loading && <Spinner />}
      {error && <Alert>{error.message}</Alert>}
      {data && (
        <div className="card overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-left"><tr>{[tr("प्रयोगकर्ता"), tr("नाम"), tr("भूमिका"), tr("वडा"), tr("अवस्था"), ''].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
            <tbody>
              {data.data.map((u) => (
                <tr key={u.id} className="border-t">
                  <td className="px-3 py-2 font-mono">{u.username}</td>
                  <td className="px-3 py-2">{u.full_name}</td>
                  <td className="px-3 py-2">{ROLE_LABEL[u.role]}</td>
                  <td className="px-3 py-2">{u.ward_no ? np(u.ward_no) : '–'}</td>
                  <td className="px-3 py-2">{u.is_active ? <span className="text-emerald-700">{tr("सक्रिय")}</span> : <span className="text-red-700">{tr("निष्क्रिय")}</span>}</td>
                  <td className="space-x-3 whitespace-nowrap px-3 py-2 text-right">
                    {isAdmin && u.id !== user.id && <>
                      <button className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline" onClick={() => reset(u)}><Icon name="reset" size={14} />{tr("पासवर्ड रिसेट")}</button>
                      <button className="inline-flex items-center gap-1 font-semibold text-slate-700 hover:underline" onClick={() => toggle(u)}><Icon name={u.is_active ? 'close' : 'submit'} size={14} />{u.is_active ? tr("निष्क्रिय गर्नुहोस्") : tr("सक्रिय गर्नुहोस्")}</button>
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
