import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { act, render, screen } from '@testing-library/react';
import { setLanguage } from '@shared/i18n/index.js';
import NepaliClock from '../components/municipal/NepaliClock.jsx';
import { formatNepaliClock } from '../lib/nepaliClock.js';

afterEach(() => vi.useRealTimers());

describe('Nepali live clock formatting', () => {
  it('uses the Asia/Kathmandu date, Bikram Sambat calendar, weekday, and Nepali numerals', () => {
    const clock = formatNepaliClock(new Date('2026-01-01T20:00:00.000Z'), 'ne');

    expect(clock.date).toBe('२०८२ पुष १८ वि.सं.');
    expect(clock.weekday).toBe('शुक्रबार');
    expect(clock.time).toBe('०१:४५:००');
  });

  it('formats the same instant in English with Latin numerals', () => {
    const clock = formatNepaliClock(new Date('2026-01-01T20:00:00.000Z'), 'en');

    expect(clock.date).toBe('2082 Poush 18 B.S.');
    expect(clock.weekday).toBe('Friday');
    expect(clock.time).toBe('01:45:00');
  });

  it('updates the displayed time and BS date every second', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T18:14:59.000Z'));
    setLanguage('ne');
    render(createElement(NepaliClock));

    expect(screen.getByText('२३:५९:५९')).toBeInTheDocument();
    expect(screen.getByText('२०८२ पुष १७ वि.सं.')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1000));

    expect(screen.getByText('००:००:००')).toBeInTheDocument();
    expect(screen.getByText('२०८२ पुष १८ वि.सं.')).toBeInTheDocument();
  });
});
