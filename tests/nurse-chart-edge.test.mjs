import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const src = fs.readFileSync(path.resolve(import.meta.dirname, '../supabase/functions/sync-completion/index.ts'), 'utf8');
const block = src.split('// aa-validate-start')[1].split('// aa-validate-end')[0];
const { validateNurseChart } = new Function(block + '\nreturn { validateNurseChart };')();
const ok = (over = {}) => ({ animal_id: ' a-100 ', location: 'Pound 1 / 3', sent_by: 'jx', key: 'c1', lines: ['Meloxicam 1 tablet SID 5 days', ' Gabapentin 100mg BID '], xlsx_b64: 'UEsDBBQAAAAI', ...over });

test('a good chart is accepted and tidied', () => {
  const r = validateNurseChart(ok());
  assert.equal(r.id, 'a-100'); assert.equal(r.sentBy, 'JX'); assert.equal(r.key, 'chart|c1');
  assert.equal(r.note, 'Meloxicam 1 tablet SID 5 days\nGabapentin 100mg BID'); assert.equal(r.b64, 'UEsDBBQAAAAI');
});
test('refuses a missing ID, location, key, lines, or a missing / oversized / non-base64 file', () => {
  assert.match(validateNurseChart(ok({ animal_id: ' ' })).error, /animal/i);
  assert.match(validateNurseChart(ok({ location: '' })).error, /location/i);
  assert.match(validateNurseChart(ok({ key: '' })).error, /key/i);
  assert.match(validateNurseChart(ok({ lines: [] })).error, /between 1 and 10/);
  assert.match(validateNurseChart(ok({ lines: Array.from({ length: 11 }, () => 'x') })).error, /between 1 and 10/);
  assert.match(validateNurseChart(ok({ xlsx_b64: '' })).error, /file/i);
  assert.match(validateNurseChart(ok({ xlsx_b64: 'not base64!!' })).error, /file/i);
  assert.match(validateNurseChart(ok({ xlsx_b64: 'A'.repeat(3000001) })).error, /file/i);
  assert.match(validateNurseChart(null).error, /request/i);
});
