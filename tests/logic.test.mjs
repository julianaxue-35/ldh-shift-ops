import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const L = createRequire(import.meta.url)('../lib/ldh-logic.js');

const H = 3600 * 1000, M = 60 * 1000;
const NOW = new Date('2026-09-20T12:00:00').getTime();
const task = (urgency, agoMs, extra = {}) => Object.assign(
  { id: 't' + Math.random(), title: 'A1', location: 'Pound 1', urgency, created_at: new Date(NOW - agoMs).toISOString(), done: false, claimed_at: null }, extra);

test('tierFromFlags: any red flag -> red_flag, none -> routine', () => {
  assert.equal(L.tierFromFlags(['bleeding']), 'red_flag');
  assert.equal(L.tierFromFlags([]), 'routine');
  assert.equal(L.tierFromFlags(undefined), 'routine');
});

test('red_flag: ok until 30 min left, amber, then red when overdue (2 h)', () => {
  assert.equal(L.statusOf(task('red_flag', 1 * H), NOW).level, 'ok');
  assert.equal(L.statusOf(task('red_flag', 1.75 * H), NOW).level, 'amber');
  assert.equal(L.statusOf(task('red_flag', 2 * H + M), NOW).level, 'red');
  assert.match(L.statusOf(task('red_flag', 3 * H), NOW).label, /^overdue 1h/);
});

test('urgent: ok <12h, amber 12-24h, red from 24h', () => {
  assert.equal(L.statusOf(task('urgent', 11 * H), NOW).level, 'ok');
  assert.equal(L.statusOf(task('urgent', 12 * H), NOW).level, 'amber');
  assert.equal(L.statusOf(task('urgent', 24 * H), NOW).level, 'red');
});

test('routine: normal <24h, amber 24-48h (day 2), red from 48h (day 3)', () => {
  assert.equal(L.statusOf(task('routine', 23 * H), NOW).level, 'ok');
  assert.equal(L.statusOf(task('routine', 24 * H), NOW).level, 'amber');
  assert.equal(L.statusOf(task('routine', 47 * H), NOW).level, 'amber');
  assert.equal(L.statusOf(task('routine', 48 * H), NOW).level, 'red');
});

test('claimed or done tasks stop ageing (level seen); legacy soon = urgent', () => {
  assert.equal(L.statusOf(task('routine', 60 * H, { claimed_at: new Date(NOW).toISOString() }), NOW).level, 'seen');
  assert.equal(L.statusOf(task('routine', 60 * H, { done: true }), NOW).level, 'seen');
  assert.equal(L.statusOf(task('soon', 13 * H), NOW).tier, 'urgent');
});

test('sortQueue: red before amber before ok, then tier, then oldest first', () => {
  const a = task('routine', 1 * H, { title: 'ok-routine' });
  const b = task('red_flag', 3 * H, { title: 'red-redflag' });
  const c = task('routine', 50 * H, { title: 'red-routine' });
  const d = task('urgent', 13 * H, { title: 'amber-urgent' });
  const order = L.sortQueue([a, d, c, b], NOW).map(t => t.title);
  assert.deepEqual(order, ['red-redflag', 'red-routine', 'amber-urgent', 'ok-routine']);
});

test('fmtDuration', () => {
  assert.equal(L.fmtDuration(5 * M), '5m');
  assert.equal(L.fmtDuration(2 * H + 5 * M), '2h 5m');
  assert.equal(L.fmtDuration(27 * H), '1d 3h');
});

test('doseSlots: 2/day for 7 days = 14 slots with correct dates, incl. month rollover', () => {
  const s = L.doseSlots('2026-09-20', 2, 7);
  assert.equal(s.length, 14);
  assert.deepEqual(s[0], { day_no: 1, slot_no: 1, due_date: '2026-09-20' });
  assert.deepEqual(s[13], { day_no: 7, slot_no: 2, due_date: '2026-09-26' });
  assert.equal(L.addDaysISO('2026-09-30', 1), '2026-10-01');
});

test('slotLabel and doseLevel', () => {
  assert.equal(L.slotLabel(2, 1), 'AM');
  assert.equal(L.slotLabel(2, 2), 'PM');
  assert.equal(L.slotLabel(1, 1), 'Daily');
  assert.equal(L.doseLevel({ due_date: '2026-09-19', done_at: null }, '2026-09-20'), 'overdue');
  assert.equal(L.doseLevel({ due_date: '2026-09-20', done_at: null }, '2026-09-20'), 'due');
  assert.equal(L.doseLevel({ due_date: '2026-09-21', done_at: null }, '2026-09-20'), 'later');
  assert.equal(L.doseLevel({ due_date: '2026-09-19', done_at: 'x' }, '2026-09-20'), 'done');
});

test('vaccStatus: 3 h from arrival', () => {
  const req = (agoMs, done = 0) => ({ arrived_at: new Date(NOW - agoMs).toISOString(), animal_count: 8, done_count: done });
  assert.equal(L.vaccStatus(req(1 * H), NOW).level, 'ok');
  assert.equal(L.vaccStatus(req(2.67 * H), NOW).level, 'amber');
  assert.equal(L.vaccStatus(req(3 * H + M), NOW).level, 'red');
  assert.equal(L.vaccStatus(req(5 * H, 8), NOW).level, 'done');
  assert.match(L.vaccStatus(req(4 * H), NOW).label, /^overdue 1h/);
});

test('courseProgress and splitMemos', () => {
  assert.deepEqual(L.courseProgress([{ done_at: 'x' }, { done_at: null }, { done_at: null }]), { done: 1, total: 3 });
  const s = L.splitMemos([{ id: 1, done: false }, { id: 2, done: true }]);
  assert.equal(s.active.length, 1); assert.equal(s.completed.length, 1);
});

test('buildSweep and sweepText', () => {
  const overdue = task('red_flag', 3 * H, { title: 'RED1' });
  const unclaimedOk = task('routine', 1 * H, { title: 'OK1' });
  const claimed = task('routine', 60 * H, { title: 'CLAIMED', claimed_by: 'JX', claimed_at: new Date(NOW - H).toISOString() });
  const doneT = task('routine', 5 * H, { title: 'DONE', done: true, claimed_at: new Date(NOW - H).toISOString() });
  const req = { arrived_at: new Date(NOW - 4 * H).toISOString(), animal_count: 8, done_count: 2, species: 'cat', location: 'FIR Room' };
  const dose = { due_date: '2026-09-19', done_at: null, animal_id: '1174362', location: 'Cat Room 1', treatment: 'Flush site', slot_label: 'AM' };
  const sw = L.buildSweep({ tasks: [overdue, unclaimedOk, claimed, doneT], requests: [req], doses: [dose] }, NOW);
  assert.deepEqual(sw.overdueCases.map(t => t.title), ['RED1']);
  assert.deepEqual(sw.unclaimed.map(t => t.title).sort(), ['OK1', 'RED1']);
  assert.deepEqual(sw.claimedOpen.map(t => t.title), ['CLAIMED']);
  assert.equal(sw.overdueRequests.length, 1);
  assert.equal(sw.overdueDoses.length, 1);
  const txt = L.sweepText(sw, NOW);
  assert.match(txt, /Overdue cases \(1\)/);
  assert.match(txt, /RED1 — Pound 1 — Red flag, overdue 1h/);
  assert.match(txt, /Claimed, not finished \(1\)/);
  assert.match(txt, /CLAIMED — Pound 1 — Routine, claimed by JX 1h 0m ago/);
  assert.ok(!txt.includes('DONE'));
  assert.match(txt, /FIR Room — 8 cat\(s\) to vaccinate, overdue 1h/);
  assert.match(txt, /1174362 — Cat Room 1 — Flush site \(2026-09-19 AM\)/);
});

test('locations list matches the Cranbourne spaces used by the flag form', () => {
  assert.deepEqual(L.LOCATIONS, ['Cat Room 1', 'Cat Room 2', 'Cat Room 3', 'Adoption 1', 'Adoption 2', 'FIR Room', 'Cat Isolation ward', 'Pound 1', 'Pound 2', 'Pound 3', 'Pound 4', 'Transport']);
});
