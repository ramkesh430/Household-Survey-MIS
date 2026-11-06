import { getLanguage } from '@shared/i18n/index.js';
import { switchLanguage } from '../lib/i18n.js';
import Icon from './Icon.jsx';

export default function LanguageToggle({ className = '' }) {
  const en = getLanguage() === 'en';
  return (
    <button type="button" className={`rounded-lg border border-slate-300 px-1.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 sm:px-2.5 ${className}`}
      onClick={() => switchLanguage(en ? 'ne' : 'en')} aria-label={en ? 'नेपालीमा हेर्नुहोस्' : 'View in English'}>
      <Icon name="globe" size={14} />{en ? 'नेपाली' : 'English'}
    </button>
  );
}
