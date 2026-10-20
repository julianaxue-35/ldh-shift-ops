import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const src = fs.readFileSync(path.resolve(import.meta.dirname, '../supabase/functions/sync-completion/index.ts'), 'utf8');
const block = src.split('// aa-validate-start')[1].split('// aa-validate-end')[0];
const { validateNurseLabel } = new Function(block + '\nreturn { validateNurseLabel };')();
const ok = (over = {}) => ({ animal_id: ' a-100 ', location: 'Pound 1 / 3', sent_by: 'jx', labels: [{ key: 'c1|0', text: ' Meloxicam, give 1 tablet orally with food for 5 days ' }], ...over });

test('a good request is accepted and tidied', () => {
  const r = validateNurseLabel(ok());
  assert.equal(r.id, 'a-100'); assert.equal(r.location, 'Pound 1 / 3'); assert.equal(r.sentBy, 'JX');
  assert.deepEqual(r.labels, [{ key: 'c1|0', text: 'Meloxicam, give 1 tablet orally with food for 5 days' }]);
});
test('refuses a missing ID, location or labels, empty text, and too many labels', () => {
  assert.match(validateNurseLabel(ok({ animal_id: '  ' })).error, /animal/i);
  assert.match(validateNurseLabel(ok({ location: '' })).error, /location/i);
  assert.match(validateNurseLabel(ok({ labels: [] })).error, /label/i);
  assert.match(validateNurseLabel(ok({ labels: [{ key: 'k', text: '  ' }] })).error, /label/i);
  assert.match(validateNurseLabel(ok({ labels: Array.from({ length: 11 }, (_, i) => ({ key: 'k' + i, text: 't' })) })).error, /between 1 and 10/);
  assert.match(validateNurseLabel(null).error, /request/i);
});
test('initials are letters only, up to 4; the label text is capped', () => {
  assert.equal(validateNurseLabel(ok({ sent_by: 'a1b2c3d4e' })).sentBy, 'ABCD');
  assert.equal(validateNurseLabel(ok({ sent_by: undefined })).sentBy, '');
  assert.equal(validateNurseLabel(ok({ labels: [{ key: 'k', text: 'x'.repeat(5000) }] })).labels[0].text.length, 1000);
});
