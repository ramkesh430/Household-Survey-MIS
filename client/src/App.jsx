import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Spinner } from './components/ui.jsx';
import { useAuth } from './lib/auth.jsx';
import { OfflineProvider, usesOffline } from './lib/offline.jsx';
import Layout from './components/Layout.jsx';
import { AccessDeniedPage, AppErrorBoundary, NotFoundPage, OfflinePage } from './pages/ErrorPages.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import HouseholdsLocal from './pages/HouseholdsLocal.jsx';
const HouseholdsOnline = lazy(() => import('./pages/HouseholdsOnline.jsx'));
import HouseholdNew from './pages/HouseholdNew.jsx';
import SurveysLocal from './pages/SurveysLocal.jsx';
const SurveysOnline = lazy(() => import('./pages/SurveysOnline.jsx'));
import SurveyEditor from './pages/SurveyEditor.jsx';
const SurveyView = lazy(() => import('./pages/SurveyView.jsx'));
import SyncCenter from './pages/SyncCenter.jsx';
const ReviewQueue = lazy(() => import('./pages/review/ReviewQueue.jsx'));
const ReviewSurvey = lazy(() => import('./pages/review/ReviewSurvey.jsx'));
const Quality = lazy(() => import('./pages/quality/Quality.jsx'));
const Overview = lazy(() => import('./pages/reports/Overview.jsx'));
const ThemeReport = lazy(() => import('./pages/reports/ThemeReport.jsx'));
const HouseholdReport = lazy(() => import('./pages/reports/HouseholdReport.jsx'));
const HouseholdProfile = lazy(() => import('./pages/reports/HouseholdProfile.jsx'));
import ChangePassword from './pages/ChangePassword.jsx';
const Users = lazy(() => import('./pages/admin/Users.jsx'));
const Wards = lazy(() => import('./pages/admin/Wards.jsx'));
const AuditLogs = lazy(() => import('./pages/admin/AuditLogs.jsx'));
const Backups = lazy(() => import('./pages/admin/Backups.jsx'));

function Protected({ roles, children }) {
  const { user } = useAuth();
  const loc = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (user.must_change_password && loc.pathname !== '/change-password') return <Navigate to="/change-password" replace />;
  if (roles && !roles.includes(user.role)) return <AccessDeniedPage />;
  return children;
}

/** Field roles (enumerator, admin) work local-first; supervisors work online. */
function ByMode({ local, online }) {
  const { user } = useAuth();
  return usesOffline(user) ? local : online;
}

function ByRole({ reviewer, other }) {
  const { user } = useAuth();
  return ['admin', 'supervisor'].includes(user.role) ? reviewer : other;
}

export default function App() {
  return (
    <OfflineProvider>
      <AppErrorBoundary>
        <Suspense fallback={<Spinner />}>
        <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<Protected><Layout /></Protected>}>
          <Route index element={<Dashboard />} />
          <Route path="households" element={<ByMode local={<HouseholdsLocal />} online={<HouseholdsOnline />} />} />
          <Route path="households/new" element={<Protected roles={['admin', 'enumerator']}><HouseholdNew /></Protected>} />
          <Route path="surveys" element={<ByMode local={<SurveysLocal />} online={<SurveysOnline />} />} />
          <Route path="surveys/view/:id" element={<ByRole reviewer={<ReviewSurvey />} other={<SurveyView />} />} />
          <Route path="review" element={<Protected roles={['admin', 'supervisor']}><ReviewQueue /></Protected>} />
          <Route path="review/:id" element={<Protected roles={['admin', 'supervisor']}><ReviewSurvey /></Protected>} />
          <Route path="quality" element={<Protected roles={['admin', 'supervisor']}><Quality /></Protected>} />
          <Route path="reports" element={<Protected roles={['admin', 'supervisor']}><Overview /></Protected>} />
          <Route path="reports/theme/:id" element={<Protected roles={['admin', 'supervisor']}><ThemeReport /></Protected>} />
          <Route path="reports/households" element={<Protected roles={['admin', 'supervisor']}><HouseholdReport /></Protected>} />
          <Route path="reports/profile/:id" element={<Protected roles={['admin', 'supervisor']}><HouseholdProfile /></Protected>} />
          <Route path="s/:uuid" element={<Protected roles={['admin', 'enumerator']}><SurveyEditor /></Protected>} />
          <Route path="sync" element={<Protected roles={['admin', 'enumerator']}><SyncCenter /></Protected>} />
          <Route path="offline" element={<OfflinePage />} />
          <Route path="change-password" element={<ChangePassword />} />
          <Route path="admin/users" element={<Protected roles={['admin', 'supervisor']}><Users /></Protected>} />
          <Route path="admin/wards" element={<Protected roles={['admin']}><Wards /></Protected>} />
          <Route path="admin/audit" element={<Protected roles={['admin']}><AuditLogs /></Protected>} />
          <Route path="admin/backups" element={<Protected roles={['admin']}><Backups /></Protected>} />
        </Route>
        <Route path="*" element={<NotFoundPage standalone />} />
        </Routes>
        </Suspense>
      </AppErrorBoundary>
    </OfflineProvider>
  );
}
