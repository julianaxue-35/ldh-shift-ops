import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const src = fs.readFileSync(path.resolve(import.meta.dirname, '../supabase/functions/sync-completion/index.ts'), 'utf8');
const block = src.split('// aa-validate-start')[1].split('// aa-validate-end')[0];
const { validateAaShare, aaSourceKey } = new Function(block + '\nreturn { validateAaShare, aaSourceKey };')();

const ok = (over = {}) => ({ kind: 'processing_note', animal_id: 't-100', location: 'Pound 1', sent_by: 'ab', payload: { text: 'Exam normal.' }, ...over });

test('a good processing note is accepted and normalised', () => {
  const r = validateAaShare(ok());
  assert.deepEqual(r.row, { kind: 'processing_note', animal_ids: ['T-100'], payload: { text: 'Exam normal.', location: 'Pound 1' }, sent_by: 'AB' });
});
test('docx_b64 is kept when it is base64', () => {
  assert.equal(validateAaShare(ok({ payload: { text: 'x', docx_b64: 'UEsDBBQ=' } })).row.payload.docx_b64, 'UEsDBBQ=');
});
test('refuses unknown kind, missing animal ID, missing text', () => {
  assert.match(validateAaShare(ok({ kind: 'fiv' })).error, /kind/i);
  assert.match(validateAaShare(ok({ animal_id: '  ' })).error, /animal/i);
  assert.match(validateAaShare(ok({ payload: { text: '   ' } })).error, /text/i);
  assert.match(validateAaShare(ok({ payload: null })).error, /payload|text/i);
  assert.match(validateAaShare(null).error, /request/i);
});
test('refuses oversize text, oversize or non-base64 docx', () => {
  assert.match(validateAaShare(ok({ payload: { text: 'x'.repeat(20001) } })).error, /too long/i);
  assert.match(validateAaShare(ok({ payload: { text: 'x', docx_b64: 'A'.repeat(1200001) } })).error, /too large/i);
  assert.match(validateAaShare(ok({ payload: { text: 'x', docx_b64: '<script>alert(1)</script>' } })).error, /base64/i);
});
test('med_chart needs lines instead of text', () => {
  const r = validateAaShare({ kind: 'med_chart', animal_id: 'T-100', sent_by: 'AB', payload: { lines: ['Drug A 1 tablet BID x 5 days'] } });
  assert.deepEqual(r.row.payload.lines, ['Drug A 1 tablet BID x 5 days']);
  assert.match(validateAaShare({ kind: 'med_chart', animal_id: 'T-100', payload: { lines: [] } }).error, /lines/i);
});
test('sent_by is trimmed, upper-cased and limited to 4 characters; hostile text is kept as plain data', () => {
  assert.equal(validateAaShare(ok({ sent_by: ' abcdef ' })).row.sent_by, 'ABCD');
  assert.equal(validateAaShare(ok({ payload: { text: '<script>alert(1)</script>' } })).row.payload.text, '<script>alert(1)</script>');
});
test('aaSourceKey is kind|date|ANIMAL', () => {
  assert.equal(aaSourceKey('processing_note', '2026-10-18', 'T-100'), 'processing_note|2026-10-18|T-100');
});
