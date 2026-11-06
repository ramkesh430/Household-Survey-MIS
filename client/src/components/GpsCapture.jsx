import { tr } from '@shared/i18n/index.js';
import { useState } from 'react';
import { toNepaliDigits as np } from '@shared/engine.js';
import Icon from './Icon.jsx';

const inNepal = (lat, lng) => lat >= 26 && lat <= 31 && lng >= 80 && lng <= 89;

/** Ask for location only when the enumerator presses the button (explicit consent). */
export default function GpsCapture({ value, onCapture, disabled }) {
  const [state, setState] = useState({ busy: false, error: null });
  const capture = () => {
    if (!('geolocation' in navigator)) return setState({ busy: false, error: tr("यो उपकरणमा GPS सुविधा छैन।") });
    setState({ busy: true, error: null });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        if (!inNepal(lat, lng)) { setState({ busy: false, error: tr("प्राप्त स्थान नेपालभित्र परेन। फेरि प्रयास गर्नुहोस्।") }); return; }
        onCapture({ lat: Number(lat.toFixed(7)), lng: Number(lng.toFixed(7)), accuracy: Math.round(accuracy * 10) / 10, captured_at: new Date(pos.timestamp || Date.now()).toISOString() });
        setState({ busy: false, error: null });
      },
      (err) => {
        const msg = { 1: tr(
          "स्थान अनुमति दिइएन। ब्राउजर सेटिङमा गई यो साइटलाई Location अनुमति दिनुहोस्।"
        ), 2: tr("स्थान पत्ता लागेन। खुला ठाउँमा गएर फेरि प्रयास गर्नुहोस्।"), 3: tr("समय सकियो। फेरि प्रयास गर्नुहोस्।") }[err.code] || err.message;
        setState({ busy: false, error: msg });
      },
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 60000 },
    );
  };
  return (
    <div className="text-sm">
      {value ? (
        <p className="text-slate-700">
          <Icon name="gps" size={16} /> {np(value.lat.toFixed(5))}, {np(value.lng.toFixed(5))}
          {value.accuracy != null && <span className={value.accuracy > 50 ? 'text-amber-700' : 'text-slate-500'}>{' '}(±{np(Math.round(value.accuracy))} {tr("मि.)")}</span>}
          {!disabled && <button type="button" className="ml-2 inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline" onClick={capture} disabled={state.busy}><Icon name="gps" size={14} />{tr("पुनः लिनुहोस्")}</button>}
        </p>
      ) : (
        !disabled && (
          <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={capture} disabled={state.busy}>
            <Icon name="gps" size={16} />{state.busy ? tr("स्थान खोज्दै…") : tr("घरको GPS स्थान लिनुहोस्")}
          </button>
        )
      )}
      {!value && !disabled && !state.error && <p className="mt-1 text-xs text-slate-500">{tr("घरधुरीकै ठाउँमा उभिएर थिच्नुहोस्। ब्राउजरले स्थान अनुमति माग्नेछ।")}</p>}
      {state.error && <p className="mt-1 text-xs text-red-600">{state.error}</p>}
    </div>
  );
}
