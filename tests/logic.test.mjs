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

test('sortQueue: highest tier first, then overdue before amber before ok inside a tier, then oldest', () => {
  const a = task('routine', 1 * H, { title: 'ok-routine' });
  const b = task('red_flag', 3 * H, { title: 'red-redflag' });
  const c = task('routine', 50 * H, { title: 'red-routine' });
  const d = task('urgent', 13 * H, { title: 'amber-urgent' });
  const e = task('red_flag', 1 * H, { title: 'ok-redflag' });
  const picked = task('red_flag', 5 * H, { title: 'picked-up-redflag', claimed_at: new Date(NOW).toISOString() });
  const order = L.sortQueue([a, d, c, b, e, picked], NOW).map(t => t.title);
  assert.deepEqual(order, ['red-redflag', 'ok-redflag', 'picked-up-redflag', 'amber-urgent', 'red-routine', 'ok-routine']);
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

test('CONDITION_LABELS covers every condition value the flag form can save', () => {
  assert.equal(L.CONDITION_LABELS.cat_flu, 'Cat flu (URI)');
  assert.equal(L.CONDITION_LABELS.wounds_injury, 'Wounds / injury / trauma');
  assert.equal(L.CONDITION_LABELS.none, 'None flagged');
  L.SIGN_KEYS.forEach(k => assert.ok(L.CONDITION_LABELS[k], k));
});

test('locations list matches the Cranbourne spaces used by the flag form', () => {
  assert.deepEqual(L.LOCATIONS, ['Cat Room 1', 'Cat Room 2', 'Cat Room 3', 'Adoption 1', 'Adoption 2', 'FIR Room', 'Cat Isolation ward', 'Pound 1', 'Pound 2', 'Pound 3', 'Pound 4', 'Transport']);
});

test('summariseConditions counts every condition, ignores unknown values, and groups flagged cases by space', () => {
  const rows = [
    { condition: 'cat_flu', location: 'Cat Room 1 / 4', created_at: '2026-09-02T01:00:00Z' },
    { condition: 'cat_flu', location: 'Cat Room 1 / 5', created_at: '2026-09-01T01:00:00Z' },
    { condition: 'kennel_cough', location: 'Pound 2 / 3', created_at: '2026-09-03T01:00:00Z' },
    { condition: null, location: 'Pound 1 / 1', created_at: '2026-09-03T02:00:00Z' },
    { condition: 'made_up', location: 'Pound 1 / 2', created_at: '2026-09-03T03:00:00Z' }
  ];
  const r = L.summariseConditions(rows);
  assert.equal(r.counts.cat_flu, 2); assert.equal(r.counts.kennel_cough, 1);
  assert.equal(r.counts.none, 2, 'no condition and unknown condition both count as none flagged');
  assert.equal(r.total, 5);
  assert.deepEqual(Object.keys(r.counts), [...L.SIGN_KEYS, 'none'], 'sign keys first, none flagged last');
  assert.equal(r.flaggedTotal, 4, 'flagged = has any condition value');
  assert.equal(r.byLocation['Cat Room 1 / 4'].cat_flu, 1);
  assert.deepEqual(r.flagged.map(t => t.created_at)[0], '2026-09-01T01:00:00Z', 'flagged list is oldest first');
});

test('SIGN_KEYS and CONDITION_LABELS: the eight reported signs, no diagnoses', () => {
  assert.deepEqual(L.SIGN_KEYS, ['cat_flu', 'kennel_cough', 'diarrhoea', 'vomiting', 'eye_condition', 'skin_condition', 'wounds_injury', 'other']);
  assert.equal(L.CONDITION_LABELS.vomiting, 'Vomiting');
  assert.equal(L.CONDITION_LABELS.eye_condition, 'Eye condition');
  assert.equal(L.CONDITION_LABELS.skin_condition, 'Skin condition');
  assert.equal(L.CONDITION_LABELS.giardia, undefined);
  L.SIGN_KEYS.forEach(k => assert.ok(L.CONDITION_LABELS[k], k));
});

test('spaceOf takes the text before the first slash', () => {
  assert.equal(L.spaceOf('Cat Room 1 / 4'), 'Cat Room 1');
  assert.equal(L.spaceOf('Pound 3/40'), 'Pound 3');
  assert.equal(L.spaceOf('Transport'), 'Transport');
  assert.equal(L.spaceOf(null), '');
});

test('windowStart: today, 3d, 7d, 30d, month', () => {
  const now = new Date('2026-09-21T15:30:00').getTime();
  assert.equal(L.windowStart('today', now).getTime(), new Date('2026-09-21T00:00:00').getTime());
  assert.equal(now - L.windowStart('3d', now).getTime(), 3 * 24 * H);
  assert.equal(now - L.windowStart('7d', now).getTime(), 7 * 24 * H);
  assert.equal(now - L.windowStart('30d', now).getTime(), 30 * 24 * H);
  assert.equal(L.windowStart('month', now).getTime(), new Date('2026-09-01T00:00:00').getTime());
  assert.equal(now - L.windowStart('nonsense', now).getTime(), 3 * 24 * H, 'unknown key falls back to 3 days');
});

const LOC = [
  { name: 'Cat Room 1', grp: 'Cat rooms', cages: 30, sort: 1 },
  { name: 'Cat Room 2', grp: 'Cat rooms', cages: 24, sort: 2 },
  { name: 'Pound 2', grp: 'Pounds', cages: 26, sort: 3 }
];
const trow = (title, location, condition, agoMs) => ({ title, location, condition, created_at: new Date(NOW - agoMs).toISOString() });

test('buildSurvey: cases (animal + sign), rates, leading sign, groups, ranking, unmapped', () => {
  const since = new Date(NOW - 3 * 24 * H);
  const tasks = [
    trow('A1', 'Cat Room 1 / 4', 'cat_flu', 1 * H),
    trow('A2', 'Cat Room 1 / 5', 'cat_flu', 2 * H),
    trow('A1', 'Cat Room 1 / 4', 'vomiting', 3 * H),        // same animal, a DIFFERENT sign = a second case
    trow('A2', 'Cat Room 1 / 5', 'cat_flu', 4 * H),         // repeat report of the same sign = still one case
    trow('B1', 'Pound 2 / 7', 'kennel_cough', 5 * H),
    trow('C1', 'Cat Room 2 / 1', 'cat_flu', 4 * 24 * H),    // outside the window
    trow('D1', 'Cat Room 2 / 2', null, 1 * H),               // no sign flagged
    trow('E1', 'Mystery Room / 9', 'other', 1 * H)           // space not in the list
  ];
  const r = L.buildSurvey(tasks, LOC, since);
  const s1 = r.spaces.find(s => s.name === 'Cat Room 1');
  assert.equal(s1.cases, 3, 'A1+cat_flu, A2+cat_flu, A1+vomiting');
  assert.equal(s1.rate, 10, '3 / 30 cages = 10.0%');
  assert.equal(s1.leading, 'cat_flu');
  assert.deepEqual(s1.by, { cat_flu: 2, vomiting: 1 }, 'distinct animals per sign');
  assert.equal(r.spaces.find(s => s.name === 'Cat Room 2').cases, 0, 'old flag and unflagged task are not counted');
  assert.equal(r.spaces.find(s => s.name === 'Cat Room 2').leading, null);
  assert.equal(r.spaces.find(s => s.name === 'Pound 2').rate, 3.8, '1 / 26 cages = 3.8%');
  assert.deepEqual(r.spaces.map(s => s.name), ['Cat Room 1', 'Cat Room 2', 'Pound 2'], 'ordered by sort');
  const g = r.groups.find(x => x.name === 'Cat rooms');
  assert.deepEqual([g.cases, g.cages, g.rate], [3, 54, 5.6], 'group = 3 cases / 54 cages');
  assert.equal(r.totalCases, 5, 'A1+flu, A2+flu, A1+vomiting, B1+kennel_cough and the unmapped E1+other');
  assert.equal(r.unmapped, 1);
  assert.deepEqual(r.ranked.map(x => [x.key, x.animals]), [['cat_flu', 2], ['kennel_cough', 1], ['vomiting', 1], ['other', 1]]);
  assert.equal(r.ranked[0].share, 40, '2 of 5 cases');
});

test('buildSurvey with no data gives zero rates, not errors', () => {
  const r = L.buildSurvey([], LOC, new Date(NOW - 3 * 24 * H));
  assert.equal(r.totalCases, 0);
  assert.deepEqual(r.ranked, []);
  assert.equal(r.spaces[0].rate, 0);
  assert.equal(L.buildSurvey([], [{ name: 'X', grp: 'G', cages: 0, sort: 1 }], new Date(NOW)).spaces[0].rate, null, 'zero cages -> no rate');
});

test('baselineStatus counts distinct snapshot days up to a full year (365)', () => {
  assert.deepEqual(L.baselineStatus([]), { day: 0, of: 365, done: false, days: 0 });
  assert.deepEqual(L.baselineStatus(['2026-09-01', '2026-09-01', '2026-09-02']), { day: 2, of: 365, done: false, days: 2 });
  const many = Array.from({ length: 400 }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10));
  const b = L.baselineStatus(many);
  assert.deepEqual([b.day, b.done, b.days], [365, true, 400]);
});

test('summariseConditions covers the widened sign list', () => {
  const r = L.summariseConditions([{ condition: 'vomiting', location: 'Pound 1 / 1', created_at: '2026-09-01T00:00:00Z' },
    { condition: 'skin_condition', location: 'Pound 1 / 2', created_at: '2026-09-02T00:00:00Z' }]);
  assert.equal(r.counts.vomiting, 1); assert.equal(r.counts.skin_condition, 1); assert.equal(r.counts.eye_condition, 0);
  assert.equal(r.counts.none, 0);
});
