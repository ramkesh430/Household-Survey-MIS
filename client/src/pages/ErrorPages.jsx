import { Component, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { getLanguage, tr } from '@shared/i18n/index.js';
import { toNepaliDigits } from '@shared/engine.js';
import Icon from '../components/Icon.jsx';
import { useOffline } from '../lib/offline.jsx';
import { api } from '../lib/api.js';

function ErrorBrand() {
  return (
    <div className="error-brand">
      <img src="/municipal/nepal-government-emblem.png" alt={tr('नेपाल सरकार')} />
      <img src="/municipal/mayadevi-logo.png" alt={tr('मायादेवी गाउँपालिकाको आधिकारिक लोगो')} />
      <div>
        <strong>Smart Mayadevi</strong>
        <span>{tr('मायादेवी गाउँपालिका')} · {tr('बरेवा, रुपन्देही, लुम्बिनी प्रदेश, नेपाल')}</span>
      </div>
    </div>
  );
}

function ErrorActions({ onRetry, retrying = false, retryLabel, showBack = true }) {
  const navigate = useNavigate();
  const location = useLocation();
  const goBack = () => navigate(location.key === 'default' ? '/' : -1);

  return (
    <div className="error-actions">
      {onRetry && (
        <button type="button" className="error-button error-button--primary" onClick={onRetry} disabled={retrying}>
          <Icon name={retrying ? 'sync' : 'reset'} size={18} className={retrying ? 'error-retrying' : ''} />
          {retrying ? tr('पुनः प्रयास हुँदैछ…') : retryLabel}
        </button>
      )}
      {showBack && (
        <button type="button" className="error-button error-button--secondary" onClick={goBack}>
          <Icon name="back" size={18} />{tr('पछाडि जानुहोस्')}
        </button>
      )}
      <Link to="/" className="error-button error-button--secondary">
        <Icon name="home" size={18} />{tr('ड्यासबोर्ड')}
      </Link>
    </div>
  );
}

function ErrorScreen({ kind, title, description, children, standalone = false, actions }) {
  return (
    <section lang={getLanguage()} className={`error-stage${standalone ? ' error-stage--standalone' : ''}`} aria-labelledby={`error-title-${kind}`}>
      <article className="error-card">
        <ErrorBrand />
        <div className={`error-illustration error-illustration--${kind}`} aria-hidden="true">
          {kind === 'not-found' && <Icon name="search" size={46} />}
          {kind === 'denied' && (
            <>
              <Icon name="shield" size={54} />
              <span className="error-lock"><Icon name="lock" size={24} /></span>
            </>
          )}
          {kind === 'server' && (
            <>
              <Icon name="server" size={48} />
              <span className="error-warning"><Icon name="warning" size={20} /></span>
            </>
          )}
          {kind === 'offline' && <Icon name="offline" size={48} />}
        </div>
        <p className="error-code">{kind === 'not-found' ? '404' : kind === 'denied' ? '403' : kind === 'server' ? '500' : tr('जडान अवस्था')}</p>
        <h1 id={`error-title-${kind}`} className="error-title">{title}</h1>
        <p className="error-description">{description}</p>
        {children}
        {actions}
        <p className="error-footer">{tr('घरधुरी सर्वेक्षण प्रणाली')} · Smart Mayadevi</p>
      </article>
    </section>
  );
}

export function NotFoundPage({ standalone = false }) {
  return (
    <ErrorScreen
      kind="not-found"
      title={tr('पृष्ठ भेटिएन')}
      description={tr('तपाईंले खोज्नुभएको पृष्ठ उपलब्ध छैन वा ठेगाना परिवर्तन भएको हुन सक्छ।')}
      standalone={standalone}
      actions={<ErrorActions />}
    />
  );
}

export function AccessDeniedPage() {
  return (
    <ErrorScreen
      kind="denied"
      title={tr('पहुँच अस्वीकृत')}
      description={tr('यो पृष्ठ खोल्ने अनुमति तपाईंको खातामा छैन। आवश्यक भूमिका भए प्रणाली प्रशासकसँग सम्पर्क गर्नुहोस्।')}
      actions={<ErrorActions />}
    />
  );
}

export function ServerErrorPage({ standalone = false, retrying = false, onRetry }) {
  return (
    <ErrorScreen
      kind="server"
      title={tr('प्रणालीमा अस्थायी समस्या')}
      description={tr('पृष्ठ लोड गर्दा अप्रत्याशित त्रुटि भयो। कृपया पुनः प्रयास गर्नुहोस्।')}
      standalone={standalone}
      actions={<ErrorActions onRetry={onRetry} retrying={retrying} retryLabel={tr('पुनः प्रयास गर्नुहोस्')} />}
    />
  );
}

export function OfflinePage() {
  const { engine, state, enabled } = useOffline();
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [retrying, setRetrying] = useState(false);
  const [serverReachable, setServerReachable] = useState(null);
  const [connectionMessage, setConnectionMessage] = useState('');

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  const reconnect = async () => {
    setRetrying(true);
    setConnectionMessage('');
    try {
      if (!navigator.onLine) {
        setServerReachable(false);
        setConnectionMessage(tr('इन्टरनेट जडान उपलब्ध छैन। जडान भएपछि पुनः प्रयास गर्नुहोस्।'));
        return;
      }
      if (enabled && engine) {
        const result = await engine.sync({ force: true });
        setServerReachable(!result.offline);
        setConnectionMessage(result.ok
          ? tr('जडान सफल भयो। बाँकी अभिलेखहरू सिंक गरिएका छन्।')
          : result.offline
            ? tr('सर्भरसँग जडान हुन सकेन। तपाईंका अभिलेखहरू उपकरणमै सुरक्षित छन्।')
            : tr('सिंक पूरा भएन। विवरण र बाँकी अभिलेखहरू जाँच गर्नुहोस्.'));
      } else {
        await api('/health', { retry: false });
        setServerReachable(true);
        setConnectionMessage(tr('सर्भरसँग जडान सफल भयो।'));
      }
    } catch (error) {
      setServerReachable(false);
      setConnectionMessage(error.message || tr('सर्भरसँग जडान हुन सकेन।'));
    } finally {
      setRetrying(false);
    }
  };

  const serverDown = serverReachable === false || state?.status === 'offline';
  const status = !isOnline ? tr('अफलाइन') : serverDown ? tr('सर्भरमा जडान हुन सकेन')
    : state?.status === 'syncing' ? tr('सिंक हुँदैछ…') : tr('अनलाइन');
  const pending = state?.pending ?? 0;
  const isSyncing = enabled && state?.status === 'syncing';

  return (
    <ErrorScreen
      kind="offline"
      title={tr('जडान तथा सिंक अवस्था')}
      description={!isOnline
        ? tr('तपाईं हाल अफलाइन हुनुहुन्छ। नयाँ अभिलेखहरू उपकरणमै सुरक्षित रहनेछन् र जडान फर्केपछि सिंक गर्न सकिन्छ।')
        : tr('इन्टरनेट र सर्भरको जडान जाँच गर्नुहोस्। अफलाइनमा सुरक्षित अभिलेखहरू सिंक अवस्था यहाँ देखिन्छ।')}
      actions={(
        <div className="error-actions">
          <button type="button" className="error-button error-button--primary" onClick={reconnect} disabled={retrying || isSyncing}>
            <Icon name={retrying || isSyncing ? 'sync' : 'wifi'} size={18} className={retrying || isSyncing ? 'error-retrying' : ''} />
            {retrying ? tr('जडान जाँच हुँदैछ…') : isSyncing ? tr('सिंक हुँदैछ…') : tr('पुनः जडान गर्नुहोस्')}
          </button>
          <Link to="/" className="error-button error-button--secondary"><Icon name="home" size={18} />{tr('ड्यासबोर्ड')}</Link>
        </div>
      )}
    >
      <div className="error-connection" role="status" aria-live="polite">
        <div className="error-connection-row">
          <span className={`error-status-dot${isOnline && !serverDown ? ' is-connected' : ''}${retrying || isSyncing ? ' is-checking' : ''}`} />
          <strong>{tr('इन्टरनेट जडान')}: {status}</strong>
        </div>
        {enabled && (
          <>
            <div className="error-connection-row">
              <Icon name="sync" size={17} className={isSyncing ? 'error-retrying' : ''} />
              <span>{tr('पठाउन बाँकी:')} <strong>{toNepaliDigits(pending)}</strong></span>
              {state?.lastSync && <span className="error-last-sync">{tr('अन्तिम सिंक:')} {new Date(state.lastSync).toLocaleString('ne-NP')}</span>}
            </div>
            {isSyncing && <div className="error-progress is-active" role="progressbar" aria-label={tr('सिंक प्रगति')} aria-valuetext={tr('सिंक हुँदैछ…')}>
              <span />
            </div>}
          </>
        )}
        {connectionMessage && <p className={`error-connection-message${serverReachable === false ? ' is-error' : ''}`}>{connectionMessage}</p>}
      </div>
    </ErrorScreen>
  );
}

export class AppErrorBoundary extends Component {
  state = { error: null, retrying: false };

  componentDidCatch(error, info) {
    console.error('Unhandled application rendering error:', error, info);
  }

  componentWillUnmount() {
    clearTimeout(this.retryTimer);
  }

  retry = () => {
    this.setState({ retrying: true });
    this.retryTimer = setTimeout(() => window.location.reload(), 350);
  };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return <ServerErrorPage standalone retrying={this.state.retrying} onRetry={this.retry} />;
    }
    return this.props.children;
  }
}
