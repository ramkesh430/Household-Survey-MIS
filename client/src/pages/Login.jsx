import { tr } from '@shared/i18n/index.js';
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import packageInfo from '../../package.json';
import { useAuth } from '../lib/auth.jsx';
import Header from '../components/municipal/Header.jsx';
import LoginForm from '../components/municipal/LoginForm.jsx';
import Footer from '../components/municipal/Footer.jsx';
import Icon from '../components/Icon.jsx';

const portalFeatures = [
  { key: 'households', label: 'घरधुरी दर्ता', icon: 'households' },
  { key: 'surveys', label: 'तथ्याङ्क व्यवस्थापन', icon: 'surveys' },
  { key: 'reports', label: 'प्रतिवेदन', icon: 'reports' },
  { key: 'review', label: 'समीक्षा तथा गुणस्तर', icon: 'review' },
  { key: 'offline', label: 'अफलाइन सिंक', icon: 'sync' },
];

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (username, password) => {
    setBusy(true);
    setErr(null);
    try {
      const user = await login(username, password);
      nav(user.must_change_password ? '/change-password' : loc.state?.from || '/', { replace: true });
    } catch (ex) {
      setErr(ex.status ? ex.message : tr('सर्भरसँग जोडिन सकिएन। इन्टरनेट जाँच गर्नुहोस्।'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="portal-page">
      <Header />
      <main className="portal-main">
        <section className="portal-visual" aria-label={tr('मायादेवी गाउँपालिकाको कार्यालय')}>
          <img
            className="portal-office-image"
            src="/municipal/municipal-office.png"
            alt={tr('मायादेवी गाउँपालिकाको कार्यालय भवन')}
            onError={(event) => {
              event.currentTarget.hidden = true;
              event.currentTarget.parentElement?.classList.add('portal-visual-fallback');
            }}
          />
          <div className="portal-visual-overlay" />
        </section>

        <section className="portal-login-side">
          <div className="portal-login-card">
            <img className="portal-login-emblem" src="/municipal/household-survey-icon.png" alt="" />
            <h1>{tr('घरधुरी सर्वेक्षण प्रणाली')}</h1>
            <p className="portal-card-subtitle">(Household Survey MIS)</p>
            <div className="portal-card-accent" />
            <LoginForm onSubmit={submit} busy={busy} error={err} />
          </div>
        </section>

        <section className="portal-feature-row" aria-label={tr('प्रणालीका सुविधा')}>
          {portalFeatures.map(({ key, label, icon }) => (
            <div className="portal-feature" key={key}>
              <Icon name={icon} size={31} />
              <span>{tr(label)}</span>
            </div>
          ))}
        </section>
      </main>
      <Footer version={packageInfo.version} />
    </div>
  );
}
