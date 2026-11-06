import { tr } from '@shared/i18n/index.js';
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, session, onSessionChange } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState(() => session.get());
  useEffect(() => onSessionChange(setState), []);

  const login = useCallback(async (username, password) => {
    const r = await api('/auth/login', { method: 'POST', body: { username, password }, retry: false });
    session.set({ user: r.user, accessToken: r.accessToken, refreshToken: r.refreshToken });
    return r.user;
  }, []);

  const logout = useCallback(async () => {
    const s = session.get();
    try { await api('/auth/logout', { method: 'POST', body: { refreshToken: s?.refreshToken }, retry: false }); } catch { /* offline */ }
    session.set(null);
  }, []);

  const setSession = useCallback((r) => session.set({ user: r.user, accessToken: r.accessToken, refreshToken: r.refreshToken }), []);

  return <AuthContext.Provider value={{ user: state?.user || null, login, logout, setSession }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

export const ROLE_LABEL = { admin: tr("प्रशासक"), supervisor: tr("सुपरभाइजर"), enumerator: tr("गणक") };
export const STATUS_LABEL = { draft: tr("मस्यौदा"), submitted: tr("पेश गरिएको"), approved: tr("स्वीकृत"), rejected: tr("फिर्ता गरिएको") };
