import { tr } from '@shared/i18n/index.js';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth, STATUS_LABEL } from '../lib/auth.jsx';
import { completion, toNepaliDigits as np } from '@shared/engine.js';
import SurveyForm from '../survey/SurveyForm.jsx';
import { Alert, Badge, Spinner } from '../components/ui.jsx';

/** Online, read-only view of any survey in the user's scope (supervisors, admins). */
export default function SurveyView() {
  const { id } = useParams();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { api(`/surveys/${id}`).then(setData).catch(setErr); }, [id]);
  if (err) return <Alert>{err.status ? err.message : tr("सर्भरसँग जोडिन सकिएन — यो पृष्ठ हेर्न इन्टरनेट चाहिन्छ।")}</Alert>;
  if (!data) return <Spinner />;
  const s = data.data;
  return (
    <div>
      <div className="card mb-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-xs text-slate-500">{s.household_code}</p>
            <h1 className="text-lg font-bold">{s.head_name}</h1>
            <p className="text-sm text-slate-600">{tr("वडा")} {np(s.ward_no)} · {s.settlement_name} {tr("· गणक:")} {s.enumerator_name}</p>
            {s.gps_lat != null && <p className="text-xs text-slate-500">📍 {np(Number(s.gps_lat).toFixed(5))}, {np(Number(s.gps_lng).toFixed(5))}</p>}
          </div>
          <div className="text-right">
            <Badge status={s.status} />
            <p className="mt-1 text-xs text-slate-500">{tr("पूर्णता")} {np(Math.round(completion(s.answers) * 100))}% · {STATUS_LABEL[s.status]}</p>
          </div>
        </div>
        {s.enumerator_id === user.id && <p className="mt-2 text-sm"><Link className="font-semibold text-blue-700 underline" to={`/s/${s.uuid}`}>{tr("मेरो उपकरणमा खोल्नुहोस्")}</Link></p>}
      </div>
      <SurveyForm answers={s.answers} onChange={() => {}} warnings={data.warnings || []} readOnly role={user.role} />
      <p className="mt-4 text-sm"><Link to="/surveys" className="text-blue-700 hover:underline">{tr("← सर्वेक्षण सूचीमा फर्कनुहोस्")}</Link></p>
    </div>
  );
}
