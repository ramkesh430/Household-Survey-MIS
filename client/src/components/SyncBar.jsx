import { tr } from '@shared/i18n/index.js';
import { Link } from 'react-router-dom';
import { useOffline } from '../lib/offline.jsx';
import { toNepaliDigits as np } from '@shared/engine.js';
import Icon from './Icon.jsx';

const ago = (iso) => {
  if (!iso) return tr("कहिल्यै होइन");
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return tr("भर्खरै");
  if (m < 60) return tr("{0} मिनेट अघि", [np(m)]);
  const h = Math.round(m / 60);
  return h < 48 ? tr("{0} घण्टा अघि", [np(h)]) : tr("{0} दिन अघि", [np(Math.round(h / 24))]);
};

export default function SyncBar() {
  const { engine, state, enabled } = useOffline();
  if (!enabled || !state) return null;
  const { status, pending, conflicts, errors, lastSync } = state;
  const tone = status === 'offline' ? 'bg-amber-50 text-amber-900 border-amber-200'
    : status === 'auth' || status === 'error' ? 'bg-red-50 text-red-800 border-red-200'
    : conflicts || errors ? 'bg-orange-50 text-orange-900 border-orange-200' : 'bg-emerald-50 text-emerald-900 border-emerald-200';
  const label = {
    offline: tr("अफलाइन — काम यस उपकरणमा सुरक्षित हुँदैछ"),
    syncing: tr("सिंक हुँदैछ…"),
    auth: tr("सत्र सकियो — सिंक गर्न पुनः लगइन गर्नुहोस्"),
    error: tr("सिंक त्रुटि: {0}", [state.lastError || '']),
    idle: tr("अनलाइन"),
  }[status] || status;
  const statusIcon = { offline: 'offline', syncing: 'sync', auth: 'lock', error: 'warning', idle: 'globe' }[status] || 'info';
  return (
    <div className={`border-b px-3 py-1.5 text-xs sm:text-sm ${tone}`} role="status" aria-live="polite">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-1 sm:px-3">
        <span className="flex items-center gap-1.5 font-semibold"><Icon name={statusIcon} size={15} />{label}</span>
        <span>{tr("पठाउन बाँकी:")} <b>{np(pending)}</b></span>
        <span className="hidden sm:inline">{tr("अन्तिम सिंक:")} {ago(lastSync)}</span>
        {(conflicts > 0 || errors > 0) && (
          <Link to="/sync" className="inline-flex items-center gap-1 font-semibold underline"><Icon name="warning" size={14} />{tr("ध्यान दिनुपर्ने:")} {np(conflicts + errors)}</Link>
        )}
        <span className="ml-auto flex gap-3">
          {status === 'auth' && <Link to="/login" className="inline-flex items-center gap-1 font-semibold underline"><Icon name="lock" size={14} />{tr("लगइन")}</Link>}
          <Link to="/sync" className="inline-flex items-center gap-1 underline"><Icon name="view" size={14} />{tr("विवरण")}</Link>
          <button type="button" className="inline-flex items-center gap-1 font-semibold underline disabled:opacity-50" disabled={status === 'syncing'} onClick={() => engine.sync({ force: true })}><Icon name="sync" size={14} />{tr("अहिले सिंक")}</button>
        </span>
      </div>
    </div>
  );
}
