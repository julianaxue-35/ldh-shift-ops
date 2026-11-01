import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const L = require('../lib/ldh-logic.js');
const SD = require('../lib/sign-differentials.js');

test('every sign group except other has 4-10 differentials', () => {
  for (const g of L.SIGN_GROUPS) {
    if (g.key === 'other') { assert.equal(SD.BY_GROUP.other, undefined); continue; }
    const list = SD.BY_GROUP[g.key];
    assert.ok(Array.isArray(list), g.key);
    assert.ok(list.length >= 4 && list.length <= 10, g.key + ' has ' + list.length);
  }
});
test('entries are short differential names only', () => {
  const bad = /treat|give|dose|mg|recommend|should|fracture|neoplasia|cancer|tumou?r|neoplas|sarcoma|lymphoma|carcinoma|surgery|antibiotic|euthan|\bmg\b/i;
  for (const [k, list] of Object.entries(SD.BY_GROUP)) {
    assert.equal(new Set(list).size, list.length, k + ' duplicates');
    for (const e of list) { assert.equal(typeof e, 'string'); assert.ok(e.length > 0 && e.length <= 60, e); assert.ok(!bad.test(e), e); }
  }
});
test('NOTE is the exact reference-only text', () => {
  assert.equal(SD.NOTE, 'For reference only. This is a list of possible causes, not a diagnosis.');
});
test('respiratory group names cat flu and kennel cough', () => {
  const r = SD.BY_GROUP.respiratory.join(' | ');
  assert.match(r, /cat flu|feline herpes|calicivirus/i);
  assert.match(r, /kennel cough|canine infectious respiratory/i);
});
