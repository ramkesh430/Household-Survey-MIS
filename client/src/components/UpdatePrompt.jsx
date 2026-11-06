import { tr } from '@shared/i18n/index.js';
import { useRegisterSW } from 'virtual:pwa-register/react';
import Icon from './Icon.jsx';

/** Shows a banner when a new app version is ready; never reloads in the middle of data entry by itself. */
export default function UpdatePrompt() {
  const { needRefresh: [needRefresh, setNeedRefresh], offlineReady: [offlineReady, setOfflineReady], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, reg) { if (reg) setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000); },
  });
  if (!needRefresh && !offlineReady) return null;
  return (
    <div role="status" className="fixed inset-x-3 bottom-20 z-50 mx-auto max-w-md rounded-xl bg-slate-900 p-4 text-sm text-white shadow-2xl sm:bottom-6">
      {needRefresh ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex flex-1 items-center gap-2"><Icon name="info" size={17} />{tr("नयाँ संस्करण उपलब्ध छ। तपाईंको काम सुरक्षित छ।")}</span>
          <button className="inline-flex items-center gap-1.5 rounded bg-white px-3 py-1.5 font-semibold text-slate-900" onClick={() => updateServiceWorker(true)}><Icon name="sync" size={15} />{tr("अपडेट गर्नुहोस्")}</button>
          <button className="inline-flex items-center gap-1 underline" onClick={() => setNeedRefresh(false)}><Icon name="close" size={14} />{tr("पछि")}</button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <span className="flex flex-1 items-center gap-2"><Icon name="submit" size={17} />{tr("अब यो एप इन्टरनेट बिना पनि खुल्छ।")}</span>
          <button className="inline-flex items-center gap-1 underline" onClick={() => setOfflineReady(false)}><Icon name="submit" size={14} />{tr("ठिक छ")}</button>
        </div>
      )}
    </div>
  );
}
