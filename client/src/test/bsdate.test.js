import { describe, it, expect } from 'vitest';
import { todayBs, daysInBsMonth, isRealBsDate, formatBs, parseBs, bsToAd, firstWeekday } from '../lib/bsdate.js';

describe('Bikram Sambat calendar helpers', () => {
  it('matches known New Year (बैशाख १) dates', () => {
    expect(formatBs(todayBs(new Date('2023-04-14T12:00:00')), false)).toBe('2080-01-01');
    expect(formatBs(todayBs(new Date('2024-04-13T12:00:00')), false)).toBe('2081-01-01');
    expect(formatBs(todayBs(new Date('2025-04-14T12:00:00')), false)).toBe('2082-01-01');
    expect(bsToAd({ y: 2083, m: 1, d: 1 }).toDateString()).toBe('Tue Apr 14 2026');
  });
  it('every year has 365 or 366 days and months 29–32 days', () => {
    for (let y = 2070; y <= 2089; y++) {
      let total = 0;
      for (let m = 1; m <= 12; m++) {
        const d = daysInBsMonth(y, m);
        expect(d).toBeGreaterThanOrEqual(29); expect(d).toBeLessThanOrEqual(32);
        total += d;
      }
      expect([365, 366]).toContain(total);
    }
  });
  it('validates against the real calendar and accepts Nepali digits', () => {
    expect(isRealBsDate('२०८३-०७-१९')).toBe(true);
    expect(isRealBsDate('2083-07-35')).toBe(false);
    expect(isRealBsDate(`2083-01-${daysInBsMonth(2083, 1) + 1}`)).toBe(false);
    expect(isRealBsDate('hello')).toBe(false);
    expect(parseBs('२०८३-७-५')).toEqual({ y: 2083, m: 7, d: 5 });
    expect(formatBs({ y: 2083, m: 7, d: 5 })).toBe('२०८३-०७-०५');
    expect(firstWeekday(2083, 1)).toBe(2); // 14 Apr 2026 is a Tuesday
  });
});
