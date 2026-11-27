import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const src = fs.readFileSync(path.resolve(import.meta.dirname, '../supabase/functions/sync-completion/index.ts'), 'utf8');
const block = src.split('// flag-validate-start')[1].split('// flag-validate-end')[0];
const { flagsClosedByRegister } = new Function(block + '\nreturn { flagsClosedByRegister };')();

const at = Date.parse('2026-11-28T10:00:00Z');
const row = (id, o) => Object.assign({ id, title: 'A 1', type: 'shelter', done: false, vet_done_at: null, claimed_at: null, followup: 0, created_at: '2026-11-28T09:00:00Z' }, o);
const ids = (rows) => flagsClosedByRegister(rows, 'a1', at).map((r) => r.id);

test('Register closes picked-up and unclaimed requests for that animal', () => {
  assert.deepEqual(ids([row(1, { claimed_at: '2026-11-28T09:30:00Z' }), row(2), row(3, { followup: 1, claimed_at: '2026-11-28T09:40:00Z' })]), [1, 2, 3]);
});
test('Register leaves unclaimed follow-ups, later requests, list rows, finished and nurse-held cases, and other animals', () => {
  assert.deepEqual(ids([
    row(1, { followup: 1 }),
    row(2, { created_at: '2026-11-28T10:00:01Z' }),
    row(3, { type: 'check_recheck' }),
    row(4, { done: true }),
    row(5, { vet_done_at: '2026-11-28T09:30:00Z' }),
    row(6, { title: 'A2' }),
  ]), []);
});
test('only a Sick & Injured completion that carries the Register time closes requests; failure is reported so the phone retries', () => {
  const tail = src.split('// Shape 1: single completion.')[1];
  assert.match(tail, /shift === 'sick_injured' && typeof body\.registered_ago_ms === 'number'/);
  assert.match(tail, /closeRequestsForRegister\(/);
  assert.match(tail, /status: 500/);
});
