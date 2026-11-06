import NepaliDate from 'nepali-date-converter';
import { toNepaliDigits } from '@shared/engine.js';

const MONTHS_NE = ['बैशाख', 'जेठ', 'असार', 'साउन', 'भदौ', 'असोज', 'कात्तिक', 'मंसिर', 'पुष', 'माघ', 'फागुन', 'चैत'];
const MONTHS_EN = ['Baisakh', 'Jestha', 'Ashadh', 'Shrawan', 'Bhadra', 'Ashwin', 'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'];
const WEEKDAYS_NE = ['आइतबार', 'सोमबार', 'मंगलबार', 'बुधबार', 'बिहीबार', 'शुक्रबार', 'शनिबार'];

function partsOf(date, options) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-US', options)
    .formatToParts(date)
    .filter(({ type }) => type !== 'literal')
    .map(({ type, value }) => [type, value]));
}

export function formatNepaliClock(now = new Date(), language = 'ne') {
  const local = partsOf(now, {
    timeZone: 'Asia/Kathmandu',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const bs = new NepaliDate(new Date(
    Number(local.year),
    Number(local.month) - 1,
    Number(local.day),
    12,
  ));
  const year = bs.getYear();
  const month = bs.getMonth();
  const day = bs.getDate();
  const english = language === 'en';
  const date = `${english ? `${year} ${MONTHS_EN[month]} ${day}` : `${year} ${MONTHS_NE[month]} ${day}`}${english ? ' B.S.' : ' वि.सं.'}`;
  const weekday = english
    ? local.weekday
    : WEEKDAYS_NE[new Date(Number(local.year), Number(local.month) - 1, Number(local.day), 12).getDay()];
  const time = `${local.hour}:${local.minute}:${local.second}`;

  return {
    date: english ? date : toNepaliDigits(date),
    weekday,
    time: english ? time : toNepaliDigits(time),
    iso: now.toISOString(),
  };
}
