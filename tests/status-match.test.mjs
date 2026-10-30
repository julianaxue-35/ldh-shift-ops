import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const src = fs.readFileSync(path.resolve(import.meta.dirname, '../supabase/functions/sync-completion/index.ts'), 'utf8');
const block = src.split('// status-match-start')[1].split('// status-match-end')[0];
const { statusKey, doneAmong } = new Function(block + '\nreturn { statusKey, doneAmong };')();

test('read-back: same animal and pen match ignoring case, spaces and room spelling', () => {
  const rows = [{ title: 'A123456', location: 'Cat Room 1 / 30' }, { title: '1170 999', location: 'P2' }];
  const asked = [
    { title: 'a123456', location: 'CR1-30' },        // case + "Cat Room 1 / 30" vs "CR1-30"
    { title: '1170999', location: 'p2' },            // spaces inside the ID, location case
    { title: 'A123456', location: 'CR1-31' },        // same ID, different pen: not done
    { title: 'A777777', location: 'CR1-30' },        // different ID, same pen: not done
  ];
  assert.deepEqual(doneAmong(asked, rows), [asked[0], asked[1]]);
});
test('read-back: answers with the caller\'s own spelling so the tool can find its animal again', () => {
  const out = doneAmong([{ title: 'a1', location: 'cr2-5' }], [{ title: 'A1', location: 'Cat Room 2 / 5' }]);
  assert.deepEqual(out, [{ title: 'a1', location: 'cr2-5' }]);
});
test('read-back: different IDs in one pen stay separate animals', () => {
  assert.notEqual(statusKey('A1', 'CR1-30'), statusKey('A2', 'CR1-30'));
});


const rblock = src.split('// list-refresh-start')[1].split('// list-refresh-end')[0];
const { staleToRefresh } = new Function(rblock + '\nreturn { staleToRefresh };')();
const MID = '2026-10-29T13:00:00.000Z';   // Melbourne midnight 30 Oct (UTC+11)
const mk = (o) => Object.assign({ id: 'x', title: 'A1', location: 'CR1-1', type: 'check_recheck', done: false, created_at: '2026-10-30T01:00:00Z', completed_at: null }, o);
test('list refresh: only earlier-day list entries are refreshed', () => {
  const want = new Set(['A1|CR1-1']);
  assert.equal(staleToRefresh([mk({ created_at: '2026-10-28T01:00:00Z' })], want, MID).length, 1, 'open since an earlier day');
  assert.equal(staleToRefresh([mk({ done: true, created_at: '2026-10-28T01:00:00Z', completed_at: '2026-10-28T05:00:00Z' })], want, MID).length, 1, 'finished on an earlier day');
  assert.equal(staleToRefresh([mk({ done: true, created_at: '2026-10-28T01:00:00Z', completed_at: '2026-10-30T02:00:00Z' })], want, MID).length, 0, 'finished today: never undone');
  assert.equal(staleToRefresh([mk({})], want, MID).length, 0, 'created today: left alone');
  assert.equal(staleToRefresh([mk({ type: 'shelter', created_at: '2026-10-28T01:00:00Z' })], want, MID).length, 0, 'staff requests are never touched');
  assert.equal(staleToRefresh([mk({ title: 'A2', created_at: '2026-10-28T01:00:00Z' })], want, MID).length, 0, 'animals not in this list are untouched');
});
