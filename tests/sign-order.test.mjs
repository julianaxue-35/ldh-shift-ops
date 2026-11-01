import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const L = createRequire(import.meta.url)('../lib/ldh-logic.js');
const keys = arr => arr.map(g => g.key);
const DEFAULT = 'respiratory,gi,wounds_pain_swelling,urinary,skin,msk,neuro,eyes,ears,neonatal,other';

test('countSignGroups: two-group row counts under both; legacy pair folds to one gi; unknown ignored; empty = zeros', () => {
  const c = L.countSignGroups([{ conditions: ['gi', 'urinary'] }, { condition: 'vomiting', conditions: ['vomiting', 'diarrhoea'] }, { conditions: ['zzz'] }, { condition: null }]);
  assert.equal(c.gi, 2); assert.equal(c.urinary, 1); assert.equal(c.respiratory, 0);
  assert.deepEqual(Object.keys(c).sort(), L.SIGN_KEYS.slice().sort());
  assert.ok(!('zzz' in c));
  const z = L.countSignGroups([]);
  assert.ok(L.SIGN_KEYS.every(k => z[k] === 0));
});

test('SIGN_FORM_TOP is respiratory, gi, wounds', () => {
  assert.deepEqual(L.SIGN_FORM_TOP, ['respiratory', 'gi', 'wounds_pain_swelling']);
});

test('orderSignGroups: default order', () => {
  assert.equal(keys(L.orderSignGroups()).join(), DEFAULT);
  assert.equal(keys(L.orderSignGroups({})).join(), DEFAULT);
});
test('orderSignGroups: most reported follow the top 3', () => {
  assert.equal(keys(L.orderSignGroups({ ears: 9, skin: 5, urinary: 1 })).join(), 'respiratory,gi,wounds_pain_swelling,ears,skin,urinary,msk,neuro,eyes,neonatal,other');
});
test('orderSignGroups: other stays last; top 3 stay first; ties keep group order', () => {
  const o = keys(L.orderSignGroups({ other: 99, eyes: 3, neuro: 3, respiratory: 0, gi: 0, wounds_pain_swelling: 0 }));
  assert.equal(o.join(), 'respiratory,gi,wounds_pain_swelling,neuro,eyes,urinary,skin,msk,ears,neonatal,other');
  assert.equal(o.length, 11);
});
