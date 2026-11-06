import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeName, nameSimilarity, duplicateReasons, findDuplicatePairs } from '../similarity.js';

test('normalises common Nepali spelling variants', () => {
  assert.equal(normalizeName('राम बहादुर श्रेष्ठ'), normalizeName('रामबहादुर श्रेस्ठ'));
  assert.equal(normalizeName('गीता'), normalizeName('गिता'));
  assert.equal(normalizeName('विष्णु'), normalizeName('बिस्नु'));
  assert.equal(normalizeName('Ram  Bahadur'), 'rambahadur');
});

test('similar names score high, different names low', () => {
  assert.ok(nameSimilarity('हरि प्रसाद पौडेल', 'हरिप्रसाद पौडेल') === 1);
  assert.ok(nameSimilarity('सीता कुमारी थापा', 'सिता कुमारि थापा') === 1);
  assert.ok(nameSimilarity('हरि प्रसाद पौडेल', 'हरी प्रसाद पोडेल') >= 0.8);
  assert.ok(nameSimilarity('राम थापा', 'श्याम गुरुङ') < 0.5);
});

test('duplicate reasons: same settlement name, phone, same house', () => {
  const base = { id: 1, ward_id: 1, settlement_id: 1, house_no: 5, family_no: 1, head_name: 'राम बहादुर थापा', phone: '9841000001' };
  assert.deepEqual(duplicateReasons(base, { ...base, id: 2, family_no: 2, head_name: 'रामबहादुर थापा', phone: null }).map((r) => r.code), ['name', 'same_house']);
  assert.deepEqual(duplicateReasons(base, { ...base, id: 3, settlement_id: 2, house_no: 9, head_name: 'अरु नै', phone: '+977-9841000001' }).map((r) => r.code), ['phone']);
  assert.deepEqual(duplicateReasons(base, { ...base, id: 4, house_no: 9, head_name: 'श्याम गुरुङ', phone: null }), []);
});

test('findDuplicatePairs respects exclusions', () => {
  const list = [
    { id: 1, ward_id: 1, settlement_id: 1, house_no: 1, family_no: 1, head_name: 'गोपाल श्रेष्ठ' },
    { id: 2, ward_id: 1, settlement_id: 1, house_no: 2, family_no: 1, head_name: 'गोपाल श्रेस्ठ' },
    { id: 3, ward_id: 2, settlement_id: 9, house_no: 2, family_no: 1, head_name: 'गोपाल श्रेष्ठ' },
  ];
  assert.equal(findDuplicatePairs(list).length, 1);
  assert.equal(findDuplicatePairs(list, { exclude: new Set(['1:2']) }).length, 0);
});
