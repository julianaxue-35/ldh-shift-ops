import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const src = fs.readFileSync(path.resolve(import.meta.dirname, '../supabase/functions/sync-completion/index.ts'), 'utf8');
const block = src.split('// behaviour-validate-start')[1].split('// behaviour-validate-end')[0];
const { validateBehaviourSend, behaviourResendHistory } = new Function(block + '\nreturn { validateBehaviourSend, behaviourResendHistory };')();

const ok = (over = {}) => ({ animal_id: 'beh-1', location: 'Cat Room 1 / 3', reason: 'Hissing at handling', sent_by: 'ab', window: 'today', note: 'Exam normal.\nDate: "x" 😀', ...over });

test('a good request is accepted and normalised', () => {
  const r = validateBehaviourSend(ok(), '2026-10-21');
  assert.deepEqual(r.row, { kind: 'behaviour_review', animal_id: 'BEH-1', location: 'Cat Room 1 / 3', reason: 'Hissing at handling',
    flagged_by: 'AB', species: null, due_window: 'today', attached_note: 'Exam normal.\nDate: "x" 😀', source_key: 'bh|2026-10-21|BEH-1' });
});
test('refuses missing ID, ID over 40, empty reason, empty note, bad request', () => {
  assert.match(validateBehaviourSend(ok({ animal_id: ' ' }), 'd').error, /animal/i);
  assert.match(validateBehaviourSend(ok({ animal_id: 'x'.repeat(41) }), 'd').error, /animal/i);
  assert.match(validateBehaviourSend(ok({ reason: '  ' }), 'd').error, /reason/i);
  assert.match(validateBehaviourSend(ok({ note: '  ' }), 'd').error, /note/i);
  assert.match(validateBehaviourSend(null, 'd').error, /request/i);
});
test('note limit is 20,000 characters, reason 500; errors never contain the note', () => {
  assert.equal(validateBehaviourSend(ok({ note: 'x'.repeat(20000) }), 'd').row.attached_note.length, 20000);
  const e = validateBehaviourSend(ok({ note: 'SECRETNOTE'.repeat(3000) }), 'd').error;
  assert.match(e, /too long/i); assert.doesNotMatch(e, /SECRETNOTE/);
  assert.equal(validateBehaviourSend(ok({ reason: 'r'.repeat(900) }), 'd').row.reason.length, 500);
});
test('window must be 30_60m, today or 48h; initials 1-4 letters or blank is refused', () => {
  for (const w of ['30_60m', 'today', '48h']) assert.equal(validateBehaviourSend(ok({ window: w }), 'd').row.due_window, w);
  assert.match(validateBehaviourSend(ok({ window: '1h' }), 'd').error, /time frame/i);
  assert.match(validateBehaviourSend(ok({ sent_by: '' }), 'd').error, /initials/i);
  assert.match(validateBehaviourSend(ok({ sent_by: '12' }), 'd').error, /initials/i);
});

test('species: cat and dog are kept, anything else is stored as null', () => {
  assert.equal(validateBehaviourSend(ok({ species: 'Cat' }), 'd').row.species, 'cat');
  assert.equal(validateBehaviourSend(ok({ species: 'dog' }), 'd').row.species, 'dog');
  assert.equal(validateBehaviourSend(ok({ species: 'rabbit' }), 'd').row.species, null);
});
test('a resend by another vet is recorded in the history and changes who sent it', () => {
  const h = behaviourResendHistory([{ at: 'a', by: 'AB', from: 'new', to: 'incoming' }], 'CD', '2026-10-21T01:00:00Z');
  assert.deepEqual(h[1], { at: '2026-10-21T01:00:00Z', by: 'CD', from: 'updated', to: 'note re-sent' });
  assert.equal(h.length, 2);
  assert.deepEqual(behaviourResendHistory(null, 'CD', 't').length, 1);
});
