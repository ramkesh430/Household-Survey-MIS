/**
 * Fuzzy matching of Nepali (Devanagari) and Latin personal names for duplicate detection.
 * Normalises common spelling variants so that e.g. "राम बहादुर श्रेष्ठ" ≈ "रामबहादुर श्रेस्ठ".
 */
const VARIANTS = [
  [/[ंँ]/g, ''],          // anusvara / chandrabindu
  [/़/g, ''],             // nukta
  [/्/g, ''],             // halant (conjunct spelling differences)
  [/ी/g, 'ि'], [/ू/g, 'ु'], // long → short vowels
  [/ई/g, 'इ'], [/ऊ/g, 'उ'],
  [/[शष]/g, 'स'],         // sibilants
  [/व/g, 'ब'],
  [/ण/g, 'न'],
  [/ङ|ञ/g, 'न'],
  [/ऐ/g, 'ए'], [/ौ/g, 'ो'], [/ै/g, 'े'],
];

export function normalizeName(name) {
  let s = String(name || '').normalize('NFC').toLowerCase();
  s = s.replace(/[\s.,'"()\-_/।]+/g, '');
  for (const [re, to] of VARIANTS) s = s.replace(re, to);
  return s;
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** 0..1 similarity of two names after normalisation. */
export function nameSimilarity(a, b) {
  const x = normalizeName(a); const y = normalizeName(b);
  if (!x || !y) return 0;
  const max = Math.max(x.length, y.length);
  return 1 - levenshtein(x, y) / max;
}

export const NAME_MATCH_THRESHOLD = 0.8;
const digits = (p) => String(p || '').replace(/\D/g, '').slice(-10);

/**
 * Reasons two household records may be the same family.
 * Returns [] when they look different.
 */
export function duplicateReasons(a, b) {
  const reasons = [];
  if (a.uuid && a.uuid === b.uuid) return reasons;
  const sim = nameSimilarity(a.head_name, b.head_name);
  const sameSettlement = a.settlement_id === b.settlement_id;
  if (sameSettlement && sim >= NAME_MATCH_THRESHOLD) reasons.push({ code: 'name', score: Math.round(sim * 100) });
  else if (!sameSettlement && a.ward_id === b.ward_id && sim === 1) reasons.push({ code: 'name_other_settlement', score: 100 });
  const pa = digits(a.phone); const pb = digits(b.phone);
  if (pa.length >= 7 && pa === pb) reasons.push({ code: 'phone', score: 100 });
  if (sameSettlement && a.house_no === b.house_no && a.family_no !== b.family_no && sim >= 0.6) reasons.push({ code: 'same_house', score: Math.round(sim * 100) });
  return reasons;
}

export const REASON_LABEL = {
  name: 'उही बस्तीमा मिल्दोजुल्दो परिवार मूलीको नाम',
  name_other_settlement: 'उही वडाको अर्को बस्तीमा उही नाम',
  phone: 'उही फोन नम्बर',
  same_house: 'उही घर क्र.सं. र मिल्दो नाम',
};

/** All candidate pairs within a list (grouped by ward to keep it fast). */
export function findDuplicatePairs(households, { exclude = new Set() } = {}) {
  const byWard = new Map();
  for (const h of households) {
    if (!byWard.has(h.ward_id)) byWard.set(h.ward_id, []);
    byWard.get(h.ward_id).push(h);
  }
  const pairs = [];
  for (const list of byWard.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const [a, b] = list[i].id < list[j].id ? [list[i], list[j]] : [list[j], list[i]];
        if (exclude.has(`${a.id}:${b.id}`)) continue;
        const reasons = duplicateReasons(a, b);
        if (reasons.length) pairs.push({ a, b, reasons, score: Math.max(...reasons.map((r) => r.score)) });
      }
    }
  }
  return pairs.sort((x, y) => y.score - x.score);
}
