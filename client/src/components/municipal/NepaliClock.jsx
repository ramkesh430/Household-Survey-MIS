import { useEffect, useState } from 'react';
import { getLanguage } from '@shared/i18n/index.js';
import { formatNepaliClock } from '../../lib/nepaliClock.js';

export default function NepaliClock() {
  const [now, setNow] = useState(() => new Date());
  const language = getLanguage();

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const clock = formatNepaliClock(now, language);
  return (
    <time className="portal-clock" dateTime={clock.iso} aria-label={`${clock.date}, ${clock.weekday}, ${clock.time}`}>
      <span className="portal-clock-label"><i aria-hidden="true" /> LIVE · {language === 'en' ? 'NEPAL STANDARD TIME' : 'नेपाल समय'}</span>
      <span className="portal-clock-date">{clock.date}</span>
      <span className="portal-clock-bottom">
        <span>{clock.weekday}</span>
        <span className="portal-clock-time">{clock.time}</span>
      </span>
    </time>
  );
}
