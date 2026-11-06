import { questions } from '../questionnaire.js';
import { evalCondition, isQuestionVisible } from '../engine.js';

export const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/** Build a fully answered, valid household (first option everywhere). */
export function buildCompleteAnswers() {
  const a = {};
  for (const q of questions) {
    if (!isQuestionVisible(q, a)) continue;
    const qa = (a[q.id] = {});
    for (const f of q.fields) {
      if (f.reviewOnly || !evalCondition(f.showIf, qa, a)) continue;
      switch (f.type) {
        case 'text': qa[f.key] = f.key === 'settlement_code' ? 'S01' : 'परीक्षण'; break;
        case 'number': qa[f.key] = 1; break;
        case 'date': qa[f.key] = '२०८३-०७-१९'; break;
        case 'signature': qa[f.key] = TINY_PNG; break;
        case 'single': qa[f.key] = f.options[0].value; break;
        case 'multi': qa[f.key] = [f.options[0].value]; break;
        default: break;
      }
    }
  }
  a.q5 = { age_table: { '25_45': { female: 1, male: 1 }, lt1: { female: 1 } } };
  a.q5.family_size = 3;
  return a;
}
