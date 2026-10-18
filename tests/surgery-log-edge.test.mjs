import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const src = fs.readFileSync(path.resolve(import.meta.dirname, '../supabase/functions/sync-completion/index.ts'), 'utf8');
const block = src.split('// surgery-validate-start')[1].split('// surgery-validate-end')[0];
const { validateSurgeryLog } = new Function(block + '\nreturn { validateSurgeryLog };')();
const ok = (o = {}) => Object.assign({ source_id: 'abc123', species: 'cat', surg_type: 'spey' }, o);

test('spey and castrate (any species, incl. pregnant spey, flank spey, cryptorchid) are routine', () => {
  ['spey', 'spey-flank', 'preg1', 'preg2', 'preg3', 'castrate', 'cryptorchid'].forEach(t =>
    assert.equal(validateSurgeryLog(ok({ surg_type: t })).row.routine, true, t));
});
test('everything else is non-routine (pyometra, dental, other / amputation ...)', () => {
  ['pyometra', 'dental', 'other', 'amputation'].forEach(t => assert.equal(validateSurgeryLog(ok({ surg_type: t })).row.routine, false, t));
});
test('a routine desex plus a second non-routine procedure counts as non-routine; two routine ones stay routine', () => {
  assert.equal(validateSurgeryLog(ok({ surg_type: 'spey', surg_type2: 'dental' })).row.routine, false);
  assert.equal(validateSurgeryLog(ok({ surg_type: 'castrate', surg_type2: 'cryptorchid' })).row.routine, true);
});
test('species is cat / dog / rabbit, anything else is other; no animal ID is accepted or kept', () => {
  assert.equal(validateSurgeryLog(ok({ species: 'DOG' })).row.species, 'dog');
  assert.equal(validateSurgeryLog(ok({ species: 'rabbit' })).row.species, 'rabbit');
  assert.equal(validateSurgeryLog(ok({ species: 'guinea pig' })).row.species, 'other');
  assert.deepEqual(Object.keys(validateSurgeryLog(ok({ animal_id: 'A123', name: 'Rex' })).row).sort(), ['id', 'procedure', 'procedure2', 'routine', 'species']);
});
test('un-registering removes the row; junk is refused', () => {
  assert.deepEqual(validateSurgeryLog({ source_id: 'abc', registered: false }), { remove: 'abc' });
  assert.match(validateSurgeryLog({ species: 'cat', surg_type: 'spey' }).error, /source id/i);
  assert.match(validateSurgeryLog({ source_id: 'x', species: 'cat' }).error, /type/i);
  assert.match(validateSurgeryLog(null).error, /Bad request/);
});
