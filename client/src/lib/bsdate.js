import { tr } from '@shared/i18n/index.js';
import NepaliDate from 'nepali-date-converter';
import { toLatinDigits, toNepaliDigits } from '@shared/engine.js';

export const BS_MONTHS = [tr("बैशाख"), tr("जेठ"), tr("असार"), tr("साउन"), tr("भदौ"), tr("असोज"), tr("कात्तिक"), tr("मंसिर"), tr("पुष"), tr("माघ"), tr("फागुन"), tr("चैत")];
export const WEEKDAYS = [tr("आइत"), tr("सोम"), tr("मंगल"), tr("बुध"), tr("बिही"), tr("शुक्र"), tr("शनि")];
export const MIN_YEAR = 2000;
export const MAX_YEAR = 2089;

const pad = (n) => String(n).padStart(2, '0');

/** Today's date in BS as {y, m (1-12), d}. */
export function todayBs(now = new Date()) {
  const n = new NepaliDate(now);
  return { y: n.getYear(), m: n.getMonth() + 1, d: n.getDate() };
}

export function formatBs({ y, m, d }, nepaliDigits = true) {
  const s = `${y}-${pad(m)}-${pad(d)}`;
  return nepaliDigits ? toNepaliDigits(s) : s;
}

export function parseBs(value) {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(toLatinDigits(String(value || '').trim()));
  return m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null;
}

export function daysInBsMonth(y, m) {
  const start = new NepaliDate(y, m - 1, 1).toJsDate();
  const next = m === 12 ? new NepaliDate(y + 1, 0, 1).toJsDate() : new NepaliDate(y, m, 1).toJsDate();
  return Math.round((next - start) / 864e5);
}

/** Weekday (0 = Sunday) of the 1st of a BS month. */
export function firstWeekday(y, m) { return new NepaliDate(y, m - 1, 1).toJsDate().getDay(); }

export function bsToAd({ y, m, d }) { return new NepaliDate(y, m - 1, d).toJsDate(); }

/** Exact validation against the real calendar. */
export function isRealBsDate(value) {
  const p = parseBs(value);
  if (!p || p.y < MIN_YEAR || p.y > MAX_YEAR || p.m < 1 || p.m > 12 || p.d < 1) return false;
  return p.d <= daysInBsMonth(p.y, p.m);
}
