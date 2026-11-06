import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './auth.jsx';
import { api } from './api.js';
import { getEngine } from '../offline/sync.js';

const OfflineContext = createContext({ engine: null, state: null, kick: () => {}, enabled: false });

/** Roles that collect data in the field work local-first; supervisors work online. */
export const usesOffline = (user) => !!user && user.role !== 'supervisor';

export function OfflineProvider({ children }) {
  const { user } = useAuth();
  const enabled = usesOffline(user);
  const engine = useMemo(() => (enabled ? getEngine(user, api) : null), [enabled, user]);
  const [state, setState] = useState(engine?.state || null);
  const timer = useRef(null);

  useEffect(() => {
    if (!engine) return undefined;
    const unsub = engine.subscribe(setState);
    engine.sync();
    navigator.storage?.persist?.().catch(() => {}); // ask the browser not to evict offline data
    const onOnline = () => engine.sync({ force: true });
    const onOffline = () => engine.refreshCounts().then(() => engine.emit({ status: 'offline' }));
    const onVisible = () => { if (document.visibilityState === 'visible') engine.sync(); };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);
    const interval = setInterval(() => engine.sync(), 60_000);
    return () => {
      unsub(); clearInterval(interval);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [engine]);

  /** Request a sync shortly after a local change (debounced). */
  const kick = useCallback(() => {
    if (!engine) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => engine.sync(), 1500);
    engine.refreshCounts();
  }, [engine]);

  return <OfflineContext.Provider value={{ engine, state, kick, enabled }}>{children}</OfflineContext.Provider>;
}

export const useOffline = () => useContext(OfflineContext);

/** Re-run `load` whenever a sync finishes (so lists reflect downloaded data). */
export function useAfterSync(load) {
  const { state } = useOffline();
  const key = `${state?.lastSync}|${state?.pending}|${state?.conflicts}|${state?.errors}`;
  useEffect(() => { load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
