import { tr } from '@shared/i18n/index.js';
import { useCallback, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { useAfterSync } from '../lib/offline.jsx';
import * as store from '../offline/store.js';
import { Badge, PageHeader, np } from '../components/ui.jsx';
import { SyncDot } from './HouseholdsLocal.jsx';
import SurveysOnline from './SurveysOnline.jsx';
import Icon from '../components/Icon.jsx';

export default function SurveysLocal() {
  const { user } = useAuth();
  const [sp, setSp] = useSearchParams();
  const status = sp.get('status') || '';
  const tab = sp.get('tab') || 'mine';
  const [rows, setRows] = useState(null);
  const load = useCallback(async () => setRows(await store.listSurveys(user.id)), [user.id]);
  useAfterSync(load);
  const set = (k, v) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); setSp(n); };

  return (
    <div>
      {user.role === 'admin' && (
        <div className="mb-4 flex gap-2">
          <button className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold ${tab === 'mine' ? 'bg-slate-800 text-white' : 'bg-white ring-1 ring-slate-200'}`} onClick={() => set('tab', '')}><Icon name="offline" size={15} />{tr("मेरो (यस उपकरणमा)")}</button>
          <button className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold ${tab === 'all' ? 'bg-slate-800 text-white' : 'bg-white ring-1 ring-slate-200'}`} onClick={() => set('tab', 'all')}><Icon name="globe" size={15} />{tr("सर्भरका सबै (अनलाइन)")}</button>
        </div>
      )}
      {tab === 'all' && user.role === 'admin' ? <SurveysOnline /> : (
        <>
          <PageHeader title={tr("मेरा सर्वेक्षणहरू")} />
          <div className="mb-4 flex flex-wrap gap-2">
            {[['', tr("सबै"), 'section'], ['draft', tr("मस्यौदा"), 'edit'], ['submitted', tr("पेश गरिएको"), 'sync'], ['approved', tr("स्वीकृत"), 'submit'], ['rejected', tr("फिर्ता"), 'close']].map(([v, l, icon]) => (
              <button key={v} onClick={() => set('status', v)} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${status === v ? 'bg-blue-700 text-white' : 'bg-white ring-1 ring-slate-200'}`}><Icon name={icon} size={14} />{l}</button>
            ))}
          </div>
          <div className="card divide-y">
            {rows?.filter((s) => !status || s.status === status).map((s) => (
              <Link key={s.uuid} to={`/s/${s.uuid}`} className="flex flex-wrap items-center justify-between gap-2 p-3 hover:bg-slate-50">
                <div>
                  <p className="font-semibold">{s.household?.head_name || '—'} <SyncDot state={s.sync_state} /></p>
                  <p className="text-xs text-slate-500"><span className="font-mono">{s.household?.household_code}</span> {tr("· वडा")} {np(s.household?.ward_no)} · {s.household?.settlement_name}</p>
                </div>
                <div className="flex items-center gap-3">
                  {s.gps && <span title={tr("GPS लिइएको")} className="text-xs">📍</span>}
                  <span className="text-xs text-slate-500">{np(s.completion ?? 0)}%</span>
                  <Badge status={s.status} />
                </div>
              </Link>
            ))}
            {rows && rows.length === 0 && <p className="p-6 text-center text-slate-500">{tr("यस उपकरणमा कुनै सर्वेक्षण छैन। घरधुरी सूचीबाट सुरु गर्नुहोस्।")}</p>}
          </div>
        </>
      )}
    </div>
  );
}
