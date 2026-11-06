import { forbidden } from '../middleware/errors.js';

/**
 * Data-access scope by role:
 *  admin       – everything
 *  supervisor  – households & surveys in assigned ward
 *  enumerator  – households in assigned ward; only own surveys
 */
export function wardScope(user) {
  if (user.role === 'admin') return null;
  if (!user.ward_id) throw forbidden('तपाईंलाई कुनै वडा तोकिएको छैन');
  return user.ward_id;
}

export function assertWardAccess(user, wardId) {
  const w = wardScope(user);
  if (w !== null && Number(w) !== Number(wardId)) throw forbidden('यो वडाको डाटा हेर्ने अनुमति छैन');
}

export function assertSurveyAccess(user, survey) {
  assertWardAccess(user, survey.ward_id);
  if (user.role === 'enumerator' && survey.enumerator_id !== user.id) throw forbidden('यो सर्वेक्षण तपाईंको होइन');
}
