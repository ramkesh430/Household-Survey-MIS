import { useState } from 'react';
import { tr } from '@shared/i18n/index.js';
import { Alert } from '../ui.jsx';
import Icon from '../Icon.jsx';

export default function LoginForm({ onSubmit, busy, error }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const submit = (event) => {
    event.preventDefault();
    if (!username.trim() || !password) return;
    onSubmit(username.trim().toLowerCase(), password);
  };

  return (
    <form className="portal-login-form" onSubmit={submit} aria-label={tr('घरधुरी सर्वेक्षण प्रणाली')}>
      {error && <div className="portal-login-error"><Alert>{error}</Alert></div>}

      <div className="portal-form-field">
        <label htmlFor="login-username">{tr('प्रयोगकर्ता नाम')}</label>
        <div className="portal-input-wrap">
          <Icon name="users" className="portal-input-icon" size={19} />
          <input
            id="login-username"
            className="portal-input"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck="false"
            placeholder={tr('आफ्नो प्रयोगकर्ता नाम प्रविष्ट गर्नुहोस्')}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
            aria-required="true"
          />
        </div>
      </div>

      <div className="portal-form-field">
        <label htmlFor="login-password">{tr('पासवर्ड')}</label>
        <div className="portal-password-wrap">
          <Icon name="lock" className="portal-input-icon" size={19} />
          <input
            id="login-password"
            className="portal-input"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder={tr('आफ्नो पासवर्ड प्रविष्ट गर्नुहोस्')}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            aria-required="true"
          />
          <button
            type="button"
            className="portal-password-toggle"
            onClick={() => setShowPassword((visible) => !visible)}
            aria-label={showPassword ? tr('पासवर्ड लुकाउनुहोस्') : tr('पासवर्ड देखाउनुहोस्')}
            aria-pressed={showPassword}
          >
            <Icon name={showPassword ? 'eyeOff' : 'eye'} size={19} />
            <span className="portal-sr-only">{showPassword ? tr('पासवर्ड लुकाउनुहोस्') : tr('पासवर्ड देखाउनुहोस्')}</span>
          </button>
        </div>
      </div>

      <div className="portal-forgot-row">
        <button
          type="button"
          className="portal-forgot-link"
          aria-expanded={showHelp}
          onClick={() => setShowHelp((visible) => !visible)}
        >
          <Icon name="help" size={17} />
          {tr('पासवर्ड बिर्सनुभयो?')}
        </button>
      </div>
      {showHelp && <p className="portal-password-help" role="status">{tr('पासवर्ड बिर्सनुभयो भने आफ्नो वडा/कार्यालयको प्रणाली प्रशासकसँग सम्पर्क गर्नुहोस्। प्रशासकले तपाईंको खाता रिसेट गरेपछि नयाँ अस्थायी पासवर्डबाट लगइन गर्नुहोस्।')}</p>}

      <button className="portal-submit" type="submit" disabled={busy || !username.trim() || !password}>
        {busy && <span className="portal-spinner" aria-hidden="true" />}
        {!busy && <Icon name="login" size={23} />}
        <span>{busy ? tr('लगइन गर्दै…') : tr('लगइन')}</span>
      </button>
      <p className="portal-secure-note">{tr('यो सुरक्षित सरकारी प्रणाली हो। आफ्नो लगइन विवरण गोप्य राख्नुहोस्।')}</p>
    </form>
  );
}
