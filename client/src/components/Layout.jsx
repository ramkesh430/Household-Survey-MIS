import LanguageToggle from './LanguageToggle.jsx';
import { tr } from '@shared/i18n/index.js';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth, ROLE_LABEL } from '../lib/auth.jsx';
import { useOffline } from '../lib/offline.jsx';
import { toNepaliDigits } from '@shared/engine.js';
import SyncBar from './SyncBar.jsx';
import Icon from './Icon.jsx';
import NepaliClock from './municipal/NepaliClock.jsx';

const NAV = [
  { to: '/', label: tr("ड्यासबोर्ड"), icon: 'dashboard', roles: ['admin', 'supervisor', 'enumerator'], end: true },
  { to: '/households', label: tr("घरधुरी"), icon: 'households', roles: ['admin', 'supervisor', 'enumerator'] },
  { to: '/surveys', label: tr("सर्वेक्षण"), icon: 'surveys', roles: ['admin', 'supervisor', 'enumerator'] },
  { to: '/review', label: tr("समीक्षा"), icon: 'review', roles: ['admin', 'supervisor'] },
  { to: '/reports', label: tr("प्रतिवेदन"), icon: 'reports', roles: ['admin', 'supervisor'] },
  { to: '/quality', label: tr("तथ्यांक गुणस्तर"), icon: 'quality', roles: ['admin', 'supervisor'] },
  { to: '/admin/users', label: tr("प्रयोगकर्ता"), icon: 'users', roles: ['admin', 'supervisor'] },
  { to: '/admin/wards', label: tr("वडा / बस्ती"), icon: 'wards', roles: ['admin'] },
  { to: '/admin/audit', label: tr("अडिट लग"), icon: 'audit', roles: ['admin'] },
  { to: '/admin/backups', label: tr("ब्याकअप"), icon: 'backup', roles: ['admin'] },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const { state } = useOffline();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  const items = NAV.filter((n) => n.roles.includes(user.role));
  const link = ({ isActive }) => `app-nav-link flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold ${isActive ? 'bg-blue-700 text-white' : 'text-slate-700 hover:bg-slate-100'} ${collapsed ? 'lg:justify-center lg:px-2' : ''}`;
  const attentionCount = (state?.pending || 0) + (state?.conflicts || 0) + (state?.errors || 0);

  const handleLogout = async () => {
    if (state?.pending > 0 && !window.confirm(tr(
      "{0} वटा कार्य सर्भरमा पठाउन बाँकी छन्। बाहिर निस्कँदा पनि ती यस उपकरणमा सुरक्षित रहन्छन् र फेरि लगइन गरेपछि पठाइन्छन्। बाहिर निस्कने?",
      [state.pending]
    ))) return;
    await logout();
    nav('/login');
  };

  return (
    <div className="min-h-screen">
      <header className="no-print sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-1.5 px-2.5 py-2 sm:gap-3 sm:px-6">
          <button className="rounded p-1.5 sm:p-2 lg:hidden" aria-label={tr("मेनु")} onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="app-navigation">
            {open ? <Icon name="close" size={22} /> : <Icon name="section" size={22} />}
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2.5">
            <img src="/municipal/nepal-government-emblem.png" alt={tr("नेपाल सरकार")} className="h-5 w-5 shrink-0 object-contain sm:h-9 sm:w-9" onError={(e) => { e.currentTarget.hidden = true; }} />
            <img src="/municipal/mayadevi-logo.png" alt={tr("मायादेवी गाउँपालिकाको आधिकारिक लोगो")} className="hidden h-10 w-10 shrink-0 rounded-full object-contain sm:block" onError={(e) => { e.currentTarget.hidden = true; }} />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold leading-tight text-[#0B2F68] sm:text-base">Smart Mayadevi</p>
              <p className="hidden truncate text-[11px] leading-tight text-slate-600 sm:block sm:text-xs">{tr("घरधुरी सर्वेक्षण प्रणाली")} · {tr("मायादेवी गाउँपालिका")}</p>
              <p className="hidden truncate text-[10px] leading-tight text-slate-500 md:block" lang="ne">{tr("बरेवा, रुपन्देही, लुम्बिनी प्रदेश, नेपाल")}</p>
            </div>
          </div>
          <div className="hidden xl:block"><NepaliClock /></div>
          {!isOnline ? (
            <NavLink to="/offline" aria-label={tr("अफलाइन — जडान तथा सिंक अवस्था खोल्नुहोस्")} className="flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900 transition hover:bg-amber-100 sm:px-2.5">
              <Icon name="offline" size={15} /><span className="hidden sm:inline">{tr("अफलाइन")}</span>
            </NavLink>
          ) : (
            <div className="hidden items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 sm:flex">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />{tr("अनलाइन")}
            </div>
          )}
          <LanguageToggle />
          <div className="relative">
            <button type="button" className="relative rounded-lg p-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-[#0B2F68] sm:p-2" aria-label={`${tr("सिंक ध्यान आवश्यक")}: ${toNepaliDigits(attentionCount)}`} aria-expanded={alertsOpen} aria-controls="sync-alerts" onClick={() => { setAlertsOpen(!alertsOpen); setProfileOpen(false); }}>
              <Icon name="bell" size={20} />
              {attentionCount > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-[#C91D36] px-1 text-center text-[10px] font-bold leading-4 text-white">{toNepaliDigits(attentionCount)}</span>}
            </button>
            {alertsOpen && <div id="sync-alerts" className="absolute right-0 z-40 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-lg" role="status">
              <p className="font-bold text-slate-900">{tr("सिंक अवस्था")}</p>
              <p className="mt-1 text-slate-600">{state ? tr("पठाउन बाँकी:") : tr("यस भूमिकामा अफलाइन सिंक आवश्यक छैन।")} {state ? state.pending : ''}</p>
              {state && (state.conflicts > 0 || state.errors > 0) && <p className="mt-1 text-amber-800">{tr("ध्यान दिनुपर्ने:")} {state.conflicts + state.errors}</p>}
              {state && <NavLink to="/sync" className="mt-2 inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline" onClick={() => setAlertsOpen(false)}><Icon name="sync" size={15} />{tr("सिंक विवरण खोल्नुहोस्")}</NavLink>}
            </div>}
          </div>
          <div className="relative">
            <button type="button" className="inline-flex max-w-44 items-center gap-2 rounded-lg px-1.5 py-1.5 text-left transition hover:bg-slate-100 sm:px-3" aria-label={tr("प्रोफाइल: {0}", [user.full_name])} aria-expanded={profileOpen} aria-haspopup="true" aria-controls="profile-menu" onClick={() => { setProfileOpen(!profileOpen); setAlertsOpen(false); }}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-[#0B2F68]" aria-hidden="true">{user.full_name?.trim()?.[0] || '•'}</span>
              <span className="hidden min-w-0 sm:block">
                <span className="block truncate text-xs font-bold text-slate-800">{user.full_name}</span>
                <span className="block text-[10px] text-slate-500">{ROLE_LABEL[user.role]}</span>
              </span>
              <Icon name="chevronDown" size={16} className="hidden sm:block" />
            </button>
            {profileOpen && <div id="profile-menu" className="absolute right-0 z-40 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-lg" onKeyDown={(e) => { if (e.key === 'Escape') setProfileOpen(false); }}>
              <div className="border-b border-slate-100 px-3 py-2 sm:hidden">
                <p className="font-semibold">{user.full_name}</p>
                <p className="text-xs text-slate-500">{ROLE_LABEL[user.role]}</p>
              </div>
              <NavLink to="/change-password" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" onClick={() => setProfileOpen(false)}><Icon name="password" size={17} />{tr("पासवर्ड परिवर्तन")}</NavLink>
              <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-red-700 hover:bg-red-50" onClick={handleLogout}><Icon name="logout" size={17} />{tr("बाहिर")}</button>
            </div>}
          </div>
        </div>
        <div className="app-compact-clock flex items-center justify-between border-t border-slate-100 px-4 py-1.5 xl:hidden">
          <span className="text-[10px] font-semibold text-slate-500">{tr("नेपाल समय · LIVE")}</span>
          <NepaliClock />
        </div>
        <SyncBar />
      </header>
      <div className="mx-auto flex max-w-[90rem] gap-3 px-3 py-4 sm:gap-5 sm:px-6">
        <nav id="app-navigation" aria-label={tr("मेनु")} className={`no-print ${open ? 'block' : 'hidden'} fixed inset-x-0 top-36 z-20 border-b bg-white p-3 shadow-lg lg:sticky lg:top-28 lg:block lg:h-[calc(100vh-8rem)] lg:shrink-0 lg:overflow-y-auto lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none ${collapsed ? 'lg:w-14' : 'lg:w-56'}`}>
          <div className="mb-2 hidden justify-end lg:flex">
            <button type="button" className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-blue-800" aria-label={collapsed ? tr("साइडबार विस्तार गर्नुहोस्") : tr("साइडबार खुम्च्याउनुहोस्")} aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}><Icon name="section" size={18} /></button>
          </div>
          <ul className="space-y-1" onClick={() => setOpen(false)}>
            {items.map((n) => <li key={n.to}><NavLink title={collapsed ? n.label : undefined} to={n.to} end={n.end} className={link}><Icon name={n.icon} size={20} /><span className={collapsed ? 'lg:hidden' : ''}>{n.label}</span></NavLink></li>)}
            {user.role !== 'supervisor' && <li><NavLink title={collapsed ? tr("सिंक") : undefined} to="/sync" className={link}><Icon name="sync" size={20} /><span className={collapsed ? 'lg:hidden' : ''}>{tr("सिंक")} {state?.pending ? `(${state.pending})` : ''}</span></NavLink></li>}
            <li><NavLink title={collapsed ? tr("पासवर्ड परिवर्तन") : undefined} to="/change-password" className={link}><Icon name="password" size={20} /><span className={collapsed ? 'lg:hidden' : ''}>{tr("पासवर्ड परिवर्तन")}</span></NavLink></li>
          </ul>
        </nav>
        <main className="min-w-0 flex-1"><Outlet /></main>
      </div>
    </div>
  );
}
