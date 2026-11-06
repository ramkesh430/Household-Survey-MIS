import { tr } from '@shared/i18n/index.js';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { Alert, PageHeader } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';

export default function ChangePassword() {
  const { user, setSession } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [msg, setMsg] = useState(null);
  const submit = async (e) => {
    e.preventDefault(); setMsg(null);
    if (f.newPassword !== f.confirm) return setMsg({ kind: 'error', text: tr("नयाँ पासवर्ड मिलेन") });
    try {
      const r = await api('/auth/change-password', { method: 'POST', body: { currentPassword: f.currentPassword, newPassword: f.newPassword } });
      setSession(r);
      setMsg({ kind: 'ok', text: tr("पासवर्ड परिवर्तन भयो") });
      setTimeout(() => nav('/'), 800);
    } catch (ex) { setMsg({ kind: 'error', text: ex.details?.[0]?.message || ex.message }); }
  };
  return (
    <div className="max-w-md">
      <PageHeader title={tr("पासवर्ड परिवर्तन")} />
      {user.must_change_password && <div className="mb-3"><Alert kind="warn">{tr("सुरक्षाका लागि पहिलो लगइनमा पासवर्ड परिवर्तन गर्नुपर्छ।")}</Alert></div>}
      <form onSubmit={submit} className="card space-y-3 p-5">
        {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
        {[['currentPassword', tr("हालको पासवर्ड"), 'current-password'], ['newPassword', tr("नयाँ पासवर्ड (कम्तीमा ८ अक्षर, अक्षर र अंक सहित)"), 'new-password'], ['confirm', tr("नयाँ पासवर्ड पुनः"), 'new-password']].map(([k, l, ac]) => (
          <div key={k} className="space-y-1">
            <label htmlFor={k} className="text-sm font-semibold">{l}</label>
            <input id={k} type="password" autoComplete={ac} className="field-input" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} required />
          </div>
        ))}
        <button className="btn-primary"><Icon name="password" size={16} />{tr("परिवर्तन गर्नुहोस्")}</button>
      </form>
    </div>
  );
}
