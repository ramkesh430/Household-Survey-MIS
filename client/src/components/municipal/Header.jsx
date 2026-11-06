import { tr } from '@shared/i18n/index.js';
import LanguageSwitcher from './LanguageSwitcher.jsx';
import NepaliClock from './NepaliClock.jsx';

export default function Header() {
  return (
    <header className="portal-header">
      <div className="portal-government">
        <img
          src="/municipal/nepal-government-emblem.png"
          alt={tr('नेपाल सरकार')}
          className="portal-government-emblem"
        />
        <div className="portal-government-copy">
          <strong>{tr('नेपाल सरकार')}</strong>
          <span>{tr('संघीय लोकतान्त्रिक गणतन्त्र नेपाल')}</span>
        </div>
      </div>

      <div className="portal-identity">
        <img
          src="/municipal/mayadevi-logo.png"
          alt={tr('मायादेवी गाउँपालिकाको आधिकारिक लोगो')}
          className="portal-municipal-logo"
        />
      </div>

      <div className="portal-brand">
        <div className="portal-brand-name">Smart Mayadevi</div>
        <div className="portal-brand-municipality">{tr('Mayadevi Rural Municipality')}</div>
        <div className="portal-identity-location" lang="ne">{tr('बरेवा, रुपन्देही, लुम्बिनी प्रदेश, नेपाल')}</div>
      </div>

      <div className="portal-header-tools">
        <NepaliClock />
        <LanguageSwitcher />
      </div>
      <div className="portal-header-ribbon" aria-hidden="true" />
    </header>
  );
}
