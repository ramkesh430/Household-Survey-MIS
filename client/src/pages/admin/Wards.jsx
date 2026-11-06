import { tr } from '@shared/i18n/index.js';
import { useState } from 'react';
import { api } from '../../lib/api.js';
import { useFetch } from '../../lib/useFetch.js';
import { Alert, PageHeader, Spinner, np } from '../../components/ui.jsx';
import { NumberInput } from '../../survey/fields.jsx';
import Icon from '../../components/Icon.jsx';

export default function Wards() {
  const { data, error, loading, reload } = useFetch('/wards');
  const [sel, setSel] = useState(null);
  const settlements = useFetch(sel ? `/wards/${sel}/settlements` : null);
  const [w, setW] = useState({ ward_no: undefined, name: '' });
  const [editingWard, setEditingWard] = useState(null);
  const [confirmingWardId, setConfirmingWardId] = useState(null);
  const [s, setS] = useState({ code: '', name: '' });
  const [msg, setMsg] = useState(null);
  const run = async (fn, ok) => { setMsg(null); try { await fn(); setMsg({ kind: 'ok', text: ok }); } catch (e) { setMsg({ kind: 'error', text: e.details?.[0]?.message || e.message }); } };
  const saveWard = async (event) => {
    event.preventDefault();
    await run(async () => {
      if (editingWard) {
        await api(`/wards/${editingWard.id}`, { method: 'PATCH', body: { ward_no: w.ward_no, name: w.name || null } });
        setEditingWard(null);
      } else {
        await api('/wards', { method: 'POST', body: { ward_no: w.ward_no, name: w.name || null } });
      }
      setW({ ward_no: undefined, name: '' });
      await reload();
    }, editingWard ? tr('वडा सच्याइयो') : tr('वडा थपियो'));
  };
  const toggleWardActive = async (ward) => {
    await run(async () => {
      await api(`/wards/${ward.id}`, { method: 'PATCH', body: { is_active: !ward.is_active } });
      setConfirmingWardId(null);
      await reload();
    }, ward.is_active ? tr('वडा निष्क्रिय गरियो') : tr('वडा पुनःसक्रिय गरियो'));
  };

  return (
    <div>
      <PageHeader title={tr("वडा तथा बस्ती व्यवस्थापन")} />
      {msg && <div className="mb-3"><Alert kind={msg.kind}>{msg.text}</Alert></div>}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h2 className="app-section-title mb-3 flex items-center gap-2 font-bold"><Icon name="wards" size={18} />{tr("वडाहरू")}</h2>
          <form className="mb-3 flex flex-wrap gap-2" onSubmit={saveWard}>
            <div className="w-24"><NumberInput value={w.ward_no} onChange={(v) => setW({ ...w, ward_no: v })} placeholder={tr("वडा नं.")} aria-label={tr("वडा नं.")} required /></div>
            <input className="field-input min-w-32 flex-1" placeholder={tr("नाम (ऐच्छिक)")} value={w.name} onChange={(e) => setW({ ...w, name: e.target.value })} />
            <button className="btn-primary"><Icon name={editingWard ? 'save' : 'plus'} size={16} />{editingWard ? tr("सुरक्षित गर्नुहोस्") : tr("थप्नुहोस्")}</button>
            {editingWard && <button type="button" className="btn-secondary" onClick={() => { setEditingWard(null); setW({ ward_no: undefined, name: '' }); }}><Icon name="close" size={16} />{tr("रद्द गर्नुहोस्")}</button>}
          </form>
          <p className="mb-3 text-xs text-slate-500">{tr("निष्क्रिय गर्दा वडा मेटिँदैन; सम्बन्धित घरधुरी, प्रयोगकर्ता र अडिट इतिहास सुरक्षित रहन्छ।")}</p>
          {loading && <Spinner />}
          {error && <Alert>{error.message}</Alert>}
          <ul className="divide-y">
            {data?.data.map((x) => (
              <li key={x.id} className={`border-b last:border-b-0 ${sel === x.id ? 'bg-blue-50' : ''} ${!x.is_active ? 'opacity-70' : ''}`}>
                <div className="flex items-center gap-1 px-2 py-2">
                  <button className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left" aria-pressed={sel === x.id} onClick={() => setSel(x.id)}>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{tr("वडा नं.")} {np(x.ward_no)} {x.name && `– ${x.name}`}</span>
                      {!x.is_active && <span className="text-xs font-semibold text-amber-700">{tr("निष्क्रिय")}</span>}
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-xs text-slate-500"><Icon name="households" size={14} />{np(x.settlement_count)} {tr("बस्ती ·")} {np(x.household_count)} {tr("घरधुरी")}<Icon name="next" size={14} /></span>
                  </button>
                  <button type="button" className="btn-secondary p-2" aria-label={`${tr("सम्पादन")}: ${tr("वडा नं.")} ${np(x.ward_no)}`} title={tr("सम्पादन")} onClick={() => { setEditingWard(x); setW({ ward_no: x.ward_no, name: x.name || '' }); setConfirmingWardId(null); }}><Icon name="edit" size={16} /></button>
                  <button type="button" className="btn-secondary p-2" aria-label={`${x.is_active ? tr("निष्क्रिय गर्नुहोस्") : tr("पुनःसक्रिय गर्नुहोस्")}: ${tr("वडा नं.")} ${np(x.ward_no)}`} title={x.is_active ? tr("निष्क्रिय गर्नुहोस्") : tr("पुनःसक्रिय गर्नुहोस्")} onClick={() => x.is_active ? setConfirmingWardId(x.id) : toggleWardActive(x)}>
                    <Icon name={x.is_active ? 'delete' : 'reset'} size={16} />
                  </button>
                </div>
                {confirmingWardId === x.id && <div className="mx-2 mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">
                  <span>{tr("यो वडालाई निष्क्रिय गर्ने? पुरानो डाटा मेटिँदैन।")}</span>
                  <span className="flex gap-2">
                    <button type="button" className="btn-secondary" onClick={() => setConfirmingWardId(null)}>{tr("रद्द गर्नुहोस्")}</button>
                    <button type="button" className="btn-danger" onClick={() => toggleWardActive(x)}>{tr("निष्क्रिय गर्नुहोस्")}</button>
                  </span>
                </div>}
              </li>
            ))}
          </ul>
        </div>
        <div className="card p-4">
          <h2 className="app-section-title mb-3 flex items-center gap-2 font-bold"><Icon name="households" size={18} />{tr("बस्तीहरू")} {sel ? '' : tr("(वडा छान्नुहोस्)")}</h2>
          {sel && (
            <>
              <form className="mb-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); run(async () => { await api('/settlements', { method: 'POST', body: { ward_id: sel, code: s.code, name: s.name } }); setS({ code: '', name: '' }); settlements.reload(); reload(); }, tr("बस्ती थपियो")); }}>
                <input className="field-input w-28" placeholder={tr("कोड (S01)")} value={s.code} onChange={(e) => setS({ ...s, code: e.target.value })} required aria-label={tr("बस्ती कोड")} />
                <input className="field-input" placeholder={tr("बस्तीको नाम")} value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} required aria-label={tr("बस्तीको नाम")} />
                <button className="btn-primary"><Icon name="plus" size={16} />{tr("थप्नुहोस्")}</button>
              </form>
              <ul className="divide-y">
                {settlements.data?.data.map((x) => (
                  <li key={x.id} className="flex justify-between px-2 py-2">
                    <span><b className="font-mono">{x.code}</b> – {x.name}</span>
                    <span className="text-xs text-slate-500">{np(x.household_count)} {tr("घरधुरी")}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
