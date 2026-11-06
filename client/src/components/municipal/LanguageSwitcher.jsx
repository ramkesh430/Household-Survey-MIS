import { getLanguage } from '@shared/i18n/index.js';
import { switchLanguage } from '../../lib/i18n.js';
import Icon from '../Icon.jsx';

export default function LanguageSwitcher() {
  const english = getLanguage() === 'en';

  return (
    <button
      type="button"
      className="portal-language-switcher"
      onClick={() => switchLanguage(english ? 'ne' : 'en')}
      aria-label={english ? 'नेपालीमा हेर्नुहोस्' : 'View in English'}
      aria-pressed={english}
    >
      <Icon name="globe" size={15} />नेपाली <span aria-hidden="true">/</span> English
    </button>
  );
}
