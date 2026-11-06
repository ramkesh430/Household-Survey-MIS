import { tr } from '@shared/i18n/index.js';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { useOffline } from '../lib/offline.jsx';
import * as store from '../offline/store.js';
import { Alert, PageHeader, np } from '../components/ui.jsx';
import { NumberInput } from '../survey/fields.jsx';
import { duplicateReasons, REASON_LABEL } from '@shared/similarity.js';
import Icon from '../components/Icon.jsx';
import { api } from '../lib/api.js';

export default function HouseholdNew() {
  const { user } = useAuth();
  const { kick } = useOffline();
  const nav = useNavigate();
  const [wards, setWards] = useState([]);
  const [wardId, setWardId] = useState(user.ward_id || '');
  const [settlements, setSettlements] = useState([]);
  const [f, setF] = useState({ settlement_id: '', house_no: undefined, family_no: 1, head_name: '', head_gender: '', phone: '' });
  const [err, setErr] = useState(null);
  const [dup, setDup] = useState(null);
  const [busy, setBusy] = useState(false);
  const [similar, setSimilar] = useState(null); // fuzzy matches awaiting confirmation
  const [addingSettlement, setAddingSettlement] = useState(false);
  const [settlementName, setSettlementName] = useState('');
  const [settlementBusy, setSettlementBusy] = useState(false);
  const [settlementNotice, setSettlementNotice] = useState(null);
  const [referenceError, setReferenceError] = useState(null);
  const [wardsLoading, setWardsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const loadWards = async () => {
      setWardsLoading(true);
      try {
        const cached = await store.listWards(user.id);
        if (!active) return;
        setWards(cached);
        if (navigator.onLine) {
          try {
            const result = await api('/wards');
            await store.cacheWards(user.id, result.data);
            if (active) {
              setWards(result.data);
              setReferenceError(null);
            }
          } catch (e) {
            if (active && cached.length === 0) setReferenceError(e.status ? e.message : tr('अनलाइन वडा सूची ल्याउन सकिएन।'));
          }
        }
      } catch (e) {
        if (active) setReferenceError(e.message);
      } finally {
        if (active) setWardsLoading(false);
      }
    };
    loadWards();
    return () => { active = false; };
  }, [user.id]);

  useEffect(() => {
    let active = true;
    setF((x) => ({ ...x, settlement_id: '' }));
    const loadSettlements = async () => {
      try {
        const cached = wardId ? await store.listSettlements(user.id, wardId) : [];
        if (!active) return;
        setSettlements(cached);
        if (wardId && navigator.onLine) {
          try {
            const result = await api(`/wards/${wardId}/settlements`);
            await store.cacheSettlements(user.id, result.data);
            if (active) {
              setSettlements(await store.listSettlements(user.id, wardId));
              setReferenceError(null);
            }
          } catch (e) {
            if (active && cached.length === 0) setReferenceError(e.status ? e.message : tr('अनलाइन बस्ती सूची ल्याउन सकिएन।'));
          }
        }
      } catch (e) {
        if (active) setReferenceError(e.message);
      }
    };
    loadSettlements();
    return () => { active = false; };
  }, [wardId, user.id]);

  const addSettlement = async (event) => {
    event.preventDefault();
    const name = settlementName.trim();
    if (!name || !wardId) return;
    setErr(null);
    setSettlementNotice(null);
    setSettlementBusy(true);
    try {
      const result = await api('/settlements', {
        method: 'POST',
        body: { ...(user.role === 'admin' ? { ward_id: Number(wardId) } : {}), name },
      });
      await store.cacheSettlement(user.id, result.data);
      setSettlements(await store.listSettlements(user.id, wardId));
      setF((current) => ({ ...current, settlement_id: String(result.data.id) }));
      setSettlementName('');
      setAddingSettlement(false);
      setSettlementNotice(`${tr('बस्ती थपियो')} (${result.data.code})`);
    } catch (e) {
      setErr(e.status ? e.message : tr('बस्ती थप्न इन्टरनेट जडान आवश्यक छ।'));
    } finally {
      setSettlementBusy(false);
    }
  };

  const submit = async (startSurvey) => {
    setErr(null); setDup(null);
    if (!f.settlement_id || !f.house_no || !f.family_no || f.head_name.trim().length < 2) return setErr(tr("कृपया सबै आवश्यक (*) विवरण भर्नुहोस्।"));
    if (f.phone && !/^[0-9+\- ]{0,20}$/.test(f.phone)) return setErr(tr("फोन नम्बर अंकमा मात्र लेख्नुहोस्।"));
    setBusy(true);
    try {
      if (!similar?.confirmed) {
        const st = settlements.find((x) => x.id === Number(f.settlement_id));
        const candidate = { ward_id: st?.ward_id, settlement_id: Number(f.settlement_id), house_no: f.house_no, family_no: f.family_no, head_name: f.head_name, phone: f.phone };
        const others = await store.listHouseholds(user.id, { ward_id: st?.ward_id });
        const matches = others.map((h) => ({ h, reasons: duplicateReasons(candidate, h) })).filter((m) => m.reasons.length).slice(0, 5);
        if (matches.length) { setSimilar({ matches, confirmed: false, startSurvey }); setBusy(false); return; }
      }
      const h = await store.createHousehold(user, { ...f, settlement_id: Number(f.settlement_id) });
      if (startSurvey) {
        const s = await store.startSurvey(user, h.uuid);
        kick();
        nav(`/s/${s.uuid}`);
      } else { kick(); nav('/households'); }
    } catch (e) {
      if (e.code === 'DUPLICATE') setDup(e.details.existing); else setErr(e.message);
    } finally { setBusy(false); }
  };

  return (
    <div className="max-w-2xl">
      <PageHeader title={tr("नयाँ घरधुरी दर्ता")} />
      <p className="mb-3 text-sm text-slate-600">{tr("इन्टरनेट नभए पनि दर्ता गर्न सकिन्छ — जोडिएपछि स्वतः सर्भरमा पठाइन्छ।")}</p>
      <div className="card space-y-4 p-5">
        {err && <Alert>{err}</Alert>}
        {referenceError && <Alert kind="warn">{referenceError}</Alert>}
        {settlementNotice && <Alert kind="ok">{settlementNotice}</Alert>}
        {wards.length === 0 && !wardsLoading && !referenceError && <Alert kind="warn">{tr(
          "वडा/बस्तीको सूची यस उपकरणमा छैन। एक पटक इन्टरनेटमा जोडिएर सिंक गर्नुहोस्।"
        )}</Alert>}
        {dup && (
          <Alert kind="warn">{tr("यो घरधुरी पहिले नै दर्ता छ:")} <b>{dup.household_code}</b>({dup.head_name}).{' '}
            <Link className="font-semibold underline" to={`/households?q=${encodeURIComponent(dup.household_code)}`}>{tr("सूचीमा हेर्नुहोस्")}</Link>
          </Alert>
        )}
        {similar && !similar.confirmed && (
          <Alert kind="warn">
            <p className="font-semibold">{tr("यस्तै घरधुरी पहिले नै दर्ता भएको हुन सक्छ:")}</p>
            <ul className="mt-1 list-disc pl-5">
              {similar.matches.map(({ h, reasons }) => (
                <li key={h.uuid}><b>{h.head_name}</b> — {h.household_code} ({h.settlement_name}) · {reasons.map((r) => REASON_LABEL[r.code]).join(', ')}
                  {h.survey_uuid && h.mine ? <> · <Link className="underline" to={`/s/${h.survey_uuid}`}>{tr("सर्वेक्षण खोल्नुहोस्")}</Link></> : null}</li>
              ))}
            </ul>
            <div className="mt-2 flex flex-wrap gap-2">
              <button className="btn-secondary text-sm" onClick={() => setSimilar(null)}><Icon name="edit" size={15} />{tr("विवरण सच्याउँछु")}</button>
              <button className="btn-primary text-sm" onClick={() => { setSimilar({ ...similar, confirmed: true }); setTimeout(() => document.getElementById(similar.startSurvey ? 'btn-start' : 'btn-only')?.click(), 0); }}><Icon name="submit" size={15} />{tr("फरक परिवार हो — तैपनि दर्ता गर्नुहोस्")}</button>
            </div>
          </Alert>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm font-semibold" htmlFor="ward">{tr("वडा नं. *")}</label>
            <select id="ward" className="field-input" value={wardId} disabled={user.role !== 'admin'} onChange={(e) => setWardId(e.target.value)}>
              <option value="">{tr("— छान्नुहोस् —")}</option>
              {wards.filter((w) => w.is_active).map((w) => <option key={w.id} value={w.id}>{tr("वडा नं.")} {np(w.ward_no)} {w.name ? `(${w.name})` : ''}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-semibold" htmlFor="st">{tr("बस्ती कोड / नाम *")}</label>
            <select id="st" className="field-input" value={f.settlement_id} onChange={(e) => setF({ ...f, settlement_id: e.target.value })} disabled={!wardId}>
              <option value="">{tr("— छान्नुहोस् —")}</option>
              {settlements.filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.code} – {s.name}</option>)}
            </select>
            {wardId && <button type="button" className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:underline" onClick={() => { setAddingSettlement((open) => !open); setErr(null); }}>
              <Icon name={addingSettlement ? 'close' : 'plus'} size={15} />{addingSettlement ? tr('रद्द गर्नुहोस्') : tr('बस्ती थप्नुहोस्')}
            </button>}
            {addingSettlement && <form className="mt-2 flex gap-2" onSubmit={addSettlement}>
              <input className="field-input min-w-0" value={settlementName} onChange={(event) => setSettlementName(event.target.value)} placeholder={tr('नयाँ बस्तीको नाम')} aria-label={tr('नयाँ बस्तीको नाम')} maxLength={150} required />
              <button type="submit" className="btn-primary shrink-0" disabled={settlementBusy || !settlementName.trim()}>
                {settlementBusy ? <span className="portal-spinner" aria-hidden="true" /> : <Icon name="plus" size={16} />}
                {tr('थप्नुहोस्')}
              </button>
            </form>}
          </div>
          <div className="space-y-1">
            <label className="text-sm font-semibold" htmlFor="hn">{tr("घर क्र.सं. *")}</label>
            <NumberInput id="hn" value={f.house_no} onChange={(v) => setF({ ...f, house_no: v })} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-semibold" htmlFor="fn">{tr("परिवार क्र.सं. *")}</label>
            <NumberInput id="fn" value={f.family_no} onChange={(v) => setF({ ...f, family_no: v })} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className="text-sm font-semibold" htmlFor="hd">{tr("परिवार मूलीको नाम *")}</label>
            <input id="hd" className="field-input" value={f.head_name} onChange={(e) => { setSimilar(null); setF({ ...f, head_name: e.target.value }); }} maxLength={150} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-semibold" htmlFor="g">{tr("लिङ्ग")}</label>
            <select id="g" className="field-input" value={f.head_gender} onChange={(e) => setF({ ...f, head_gender: e.target.value })}>
              <option value="">—</option><option value="१">{tr("१ महिला")}</option><option value="२">{tr("२ पुरुष")}</option><option value="३">{tr("३ तेस्रो लिङ्गी")}</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-semibold" htmlFor="ph">{tr("सम्पर्क फोन (ऐच्छिक)")}</label>
            <input id="ph" className="field-input" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} maxLength={20} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <button id="btn-start" className="btn-primary" disabled={busy} onClick={() => submit(true)}><Icon name="plus" size={17} />{tr("दर्ता गरी सर्वेक्षण सुरु गर्नुहोस्")}</button>
          <button id="btn-only" className="btn-secondary" disabled={busy} onClick={() => submit(false)}><Icon name="save" size={16} />{tr("दर्ता मात्र")}</button>
        </div>
      </div>
    </div>
  );
}
