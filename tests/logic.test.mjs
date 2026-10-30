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

test('nurseRequestStatus: 2 h from arrival', () => {
  const req = (agoMs, done = 0) => ({ arrived_at: new Date(NOW - agoMs).toISOString(), animal_count: 8, done_count: done });
  assert.equal(L.nurseRequestStatus(req(1 * H), NOW).level, 'ok');
  assert.equal(L.nurseRequestStatus(req(1.75 * H), NOW).level, 'amber');
  assert.equal(L.nurseRequestStatus(req(2 * H + M), NOW).level, 'red');
  assert.equal(L.nurseRequestStatus(req(5 * H, 8), NOW).level, 'done');
  assert.match(L.nurseRequestStatus(req(3 * H), NOW).label, /^overdue 1h/);
});

test('arrivalStatus: countdown to a scheduled (not-yet-arrived) request, then overdue', () => {
  const sched = (inMs) => ({ arrived_at: null, expected_at: new Date(NOW + inMs).toISOString() });
  assert.equal(L.arrivalStatus({ arrived_at: new Date(NOW).toISOString(), expected_at: null }, NOW), null,
    'null once arrived_at is set — nurseRequestStatus takes over, not arrivalStatus');
  assert.equal(L.arrivalStatus(sched(45 * M), NOW).level, 'ok');
  assert.equal(L.arrivalStatus(sched(10 * M), NOW).level, 'amber', 'within the 15-minute warning window');
  assert.match(L.arrivalStatus(sched(10 * M), NOW).label, /^arriving in/);
  const overdue = L.arrivalStatus(sched(-20 * M), NOW);
  assert.equal(overdue.level, 'red');
  assert.equal(overdue.overdue, true);
  assert.match(overdue.label, /^overdue arrival by 20m/);
});

test('needsArrivalWarning: true only strictly inside the 15-minute window, never after arrival or once overdue', () => {
  const sched = (inMs) => ({ arrived_at: null, expected_at: new Date(NOW + inMs).toISOString() });
  assert.equal(L.needsArrivalWarning(sched(20 * M), NOW), false, 'not yet within the window');
  assert.equal(L.needsArrivalWarning(sched(15 * M), NOW), true, 'exactly at the 15-minute boundary');
  assert.equal(L.needsArrivalWarning(sched(1 * M), NOW), true);
  assert.equal(L.needsArrivalWarning(sched(-5 * M), NOW), false, 'already overdue — the warning window has passed, not a repeating alert');
  assert.equal(L.needsArrivalWarning({ arrived_at: new Date(NOW).toISOString(), expected_at: new Date(NOW + 5 * M).toISOString() }, NOW), false,
    'already arrived — no warning needed regardless of expected_at');
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
  assert.deepEqual(L.LOCATIONS, ['Cat Room 1', 'Cat Room 2', 'Cat Room 3', 'Adoption 1', 'Adoption 2', 'FIR Room', 'Cat Isolation ward', 'Pound 1', 'Pound 2', 'Pound 3', 'Pound 4', 'Dog transport', 'Cat transport', 'Rabbit Room', 'Pathway', 'Offsite', 'Vet clinic', 'Office']);
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

test('buildSurvey: each space lists every condition reported (with animal IDs) and its top 3', () => {
  const since = new Date(NOW - 3 * 24 * H);
  const tasks = [
    trow('A1', 'Cat Room 1 / 4', 'cat_flu', 1 * H), trow('A2', 'Cat Room 1 / 5', 'cat_flu', 2 * H),
    trow('A3', 'Cat Room 1 / 6', 'diarrhoea', 2 * H), trow('A4', 'Cat Room 1 / 7', 'vomiting', 2 * H),
    trow('A5', 'Cat Room 1 / 8', 'eye_condition', 2 * H), trow('A6', 'Cat Room 1 / 9', 'diarrhoea', 3 * H)
  ];
  const s1 = L.buildSurvey(tasks, LOC, since).spaces.find(s => s.name === 'Cat Room 1');
  assert.deepEqual(s1.conditions.map(c => [c.key, c.animals]), [['cat_flu', 2], ['diarrhoea', 2], ['vomiting', 1], ['eye_condition', 1]]);
  assert.deepEqual(s1.conditions[0].ids, ['A1', 'A2']);
  assert.deepEqual(s1.top3.map(c => c.key), ['cat_flu', 'diarrhoea', 'vomiting'], 'top 3 only; ties keep the usual sign order');
  assert.deepEqual(L.buildSurvey([], LOC, since).spaces[0].top3, []);
});
test('buildSurvey: per-condition top 3 spaces and the space where each is most prevalent', () => {
  const since = new Date(NOW - 3 * 24 * H);
  const tasks = [
    trow('A1', 'Cat Room 1 / 4', 'cat_flu', 1 * H), trow('A2', 'Cat Room 1 / 5', 'cat_flu', 1 * H),
    trow('B1', 'Cat Room 2 / 1', 'cat_flu', 1 * H), trow('B2', 'Cat Room 2 / 2', 'cat_flu', 1 * H), trow('B3', 'Cat Room 2 / 3', 'cat_flu', 1 * H),
    trow('C1', 'Pound 2 / 7', 'cat_flu', 1 * H), trow('D1', 'Pound 2 / 8', 'vomiting', 1 * H)
  ];
  const r = L.buildSurvey(tasks, LOC, since);
  const flu = r.byCondition.find(c => c.key === 'cat_flu');
  assert.deepEqual(flu.top3.map(s => [s.name, s.animals]), [['Cat Room 2', 3], ['Cat Room 1', 2], ['Pound 2', 1]]);
  assert.equal(flu.peak.name, 'Cat Room 2', 'most animals per cage');
  assert.equal(r.byCondition.find(c => c.key === 'vomiting').peak.name, 'Pound 2');
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

test('EMERGENCY_SIGNS: Juliana\'s verbatim labels; RED_FLAGS is an alias; tierFromFlags still works', () => {
  assert.deepEqual(L.EMERGENCY_SIGNS, [
    { key: 'not_eating_48h', label: 'Not eating > 48 hours' },
    { key: 'not_urinating_36h', label: 'Not urinating > 36 hours' },
    { key: 'bleeding_wound', label: "Bleeding wound (large cut / can't stop the bleeding)" },
    { key: 'not_defecated_72h', label: 'Not defecated > 72 hours' },
    { key: 'vomited_multiple', label: 'Vomited multiple piles' }]);
  assert.equal(L.RED_FLAGS, L.EMERGENCY_SIGNS);
  assert.equal(L.tierFromFlags(['not_eating_48h']), 'red_flag');
});

test('signLabel resolves new keys, legacy keys, and returns unknown keys raw', () => {
  assert.equal(L.signLabel('not_urinating_36h'), 'Not urinating > 36 hours');
  assert.equal(L.signLabel('not_eating'), 'Not eating');
  assert.equal(L.signLabel('laboured_breathing'), 'Laboured breathing');
  assert.equal(L.signLabel('bleeding'), 'Bleeding');
  assert.equal(L.signLabel('cant_stand'), "Can't stand / collapsed");
  assert.equal(L.signLabel('repeated_vomiting'), 'Repeated vomiting');
  assert.equal(L.signLabel('mystery'), 'mystery');
});

test('TIER_LABELS use the new wording; stored values unchanged', () => {
  assert.deepEqual(L.TIER_LABELS, { red_flag: 'Emergency', urgent: 'Urgent', routine: 'Request checks' });
  assert.equal(L.normTier('soon'), 'urgent');
  assert.equal(L.normTier('red_flag'), 'red_flag');
});

test('Offsite: unmapped space, but never counted as an unmapped-space warning', () => {
  assert.equal(L.LOCATIONS[L.LOCATIONS.length - 1], 'Office');
  assert.deepEqual(L.OFFSITE_NAMES, ['Offsite', 'Pathway', 'Vet clinic', 'Office']);
  const since = new Date(NOW - 3 * 24 * H);
  const r = L.buildSurvey([trow('O1', 'Offsite', 'cat_flu', 1 * H), trow('O2', 'Offsite — foster home', 'cat_flu', 1 * H), trow('V1', 'Vet clinic — ward 2', 'cat_flu', 1 * H),
    trow('E1', 'Mystery Room / 9', 'other', 1 * H)], LOC, since);
  assert.equal(r.unmapped, 1, 'only the genuinely unknown space is reported');
  r.spaces.forEach(s => assert.equal(s.cases, 0));
});

test('stageOf: flagged, picked_up, waiting_medication, completed', () => {
  const t = (extra) => task('urgent', 1 * H, extra);
  assert.equal(L.stageOf(t({}), NOW), 'flagged');
  assert.equal(L.stageOf(t({ claimed_at: new Date(NOW).toISOString() }), NOW), 'picked_up');
  assert.equal(L.stageOf(t({ needs_medication: true, vet_done_at: new Date(NOW).toISOString() }), NOW), 'waiting_medication');
  assert.equal(L.stageOf(t({ needs_medication: true, claimed_at: new Date(NOW).toISOString() }), NOW), 'picked_up');
  assert.equal(L.stageOf(t({ needs_medication: true, vet_done_at: 'x', done: true }), NOW), 'completed');
  assert.equal(L.stageOf(t({ done: true }), NOW), 'completed');
  assert.equal(L.stageOf(t({ vet_done_at: 'x' }), NOW), 'flagged', 'vet_done_at only matters for medication tasks');
});

test('caseList: open sorted by sortQueue; completed within 24 h, newest first; done without completed_at uses created_at', () => {
  const iso = (ms) => new Date(NOW - ms).toISOString();
  const o1 = task('routine', 1 * H, { title: 'o-routine' }), o2 = task('red_flag', 1 * H, { title: 'o-emerg' });
  const c1 = task('urgent', 30 * H, { title: 'c-old-inside', done: true, completed_at: iso(23 * H) });
  const c2 = task('urgent', 30 * H, { title: 'c-new', done: true, completed_at: iso(1 * H) });
  const c3 = task('urgent', 30 * H, { title: 'c-outside', done: true, completed_at: iso(24 * H + M) });
  const c4 = task('urgent', 5 * H, { title: 'c-nostamp', done: true });
  const c5 = task('urgent', 30 * H, { title: 'c-nostamp-old', done: true });
  const r = L.caseList([o1, c1, c3, o2, c2, c4, c5], NOW);
  assert.deepEqual(r.open.map(t => t.title), ['o-emerg', 'o-routine']);
  assert.deepEqual(r.completed.map(t => t.title), ['c-new', 'c-nostamp', 'c-old-inside']);
});

test('caseList/isRequest: a synced-but-never-flagged animal (type check_recheck) never appears in the queue', () => {
  // 2026-09-26: every animal on today's offline-tool list is synced to `tasks`
  // so the completion donut can show "X of Y done" (see sync-completion's
  // batch-list shape) — that sync never sets `type`, so it keeps the column
  // default 'check_recheck'. The flag form always sends shelter/foster/
  // rescue/medication. Only the latter belong in the Cases queue.
  const synced = task('routine', 1 * H, { title: 'synced-only', type: 'check_recheck' });
  const flagged = task('routine', 1 * H, { title: 'real-request', type: 'shelter' });
  const syncedDone = task('urgent', 1 * H, { title: 'synced-done', type: 'check_recheck', done: true, completed_at: new Date(NOW - 1 * H).toISOString() });
  const flaggedDone = task('urgent', 1 * H, { title: 'real-done', type: 'foster', done: true, completed_at: new Date(NOW - 1 * H).toISOString() });
  assert.equal(L.isRequest(synced), false);
  assert.equal(L.isRequest(flagged), true);
  const r = L.caseList([synced, flagged, syncedDone, flaggedDone], NOW);
  assert.deepEqual(r.open.map(t => t.title), ['real-request']);
  assert.deepEqual(r.completed.map(t => t.title), ['real-done']);
});

test('medCopyText: SM number, location, offsite detail, label', () => {
  const base = { title: 'Bella', sm_number: '12345', location: 'Cat Room 1 / 4', med_label: 'Meloxicam 0.1 mg SID' };
  assert.equal(L.medCopyText(base), 'Bella | SM 12345 | Cat Room 1 / 4\nMeloxicam 0.1 mg SID');
  assert.equal(L.medCopyText({ ...base, location: 'Offsite', location_detail: 'foster Sam' }), 'Bella | SM 12345 | Offsite — foster Sam\nMeloxicam 0.1 mg SID');
  assert.equal(L.medCopyText({ ...base, location: 'Offsite' }), 'Bella | SM 12345 | Offsite\nMeloxicam 0.1 mg SID');
  assert.equal(L.medCopyText({ title: 'Bella', location: 'Pound 1' }), 'Bella | SM — | Pound 1\n');
});

test('the vet Done box no longer offers Chlorsig quick-insert options', () => {
  assert.equal(L.CHLORSIG_OPTIONS, undefined);
});

test('boardRoomOf reads every spelling of a room + pen, and files unknowns under OTHER', () => {
  const cases = [
    ['Cat Room 1 / 12', 'CR1', '12'], ['CR1-30', 'CR1', '30'], ['CR2/43', 'CR2', '43'], ['cr 2 - 49', 'CR2', '49'],
    ['Adoption 2 / 3', 'CA2', '3'], ['CA1-3', 'CA1', '3'], ['FIR Room / 21', 'FIR', '21'], ['Pound 3 / 41', 'P3', '41'],
    ['P4-2', 'P4', '2'], ['Transport', 'TRANSPORT', ''], ['Rabbit Room - 1', 'RABBIT', '1'], ['RR-1', 'RABBIT', '1'],
    ['rr 4', 'RABBIT', '4'], ['Rabbit Room / 7', 'RABBIT', '7'], ['Pathway', 'PATHWAY', ''], ['Cat Isolation ward / 2', 'ISO', '2'],
    ['Cat Room 3', 'CR3', ''], ['Offsite — Smith', 'OTHER', 'Offsite — Smith'], ['', 'OTHER', ''], ['Mystery 9', 'OTHER', 'Mystery 9']
  ];
  cases.forEach(([loc, code, pen]) => assert.deepEqual(L.boardRoomOf(loc), { code, pen }, loc));
});

test('board rooms are in the walking order the shelter asked for, and every flag-form room has a board room', () => {
  const order = L.BOARD_ROOMS.map(r => r.code);
  assert.deepEqual(order.slice(0, 6), ['CR1', 'CR2', 'CA1', 'CA2', 'FIR', 'CR3']);
  assert.deepEqual(order.slice(order.indexOf('TRANSPORT'), order.indexOf('TRANSPORT') + 5), ['TRANSPORT', 'P1', 'P2', 'P3', 'P4']);
  assert.ok(order.indexOf('RABBIT') > order.indexOf('P4'));
  L.LOCATIONS.filter(n => n !== 'Offsite').forEach(n => assert.ok(L.BOARD_ROOMS.some(r => r.db === n), n + ' has a board room'));
});

test('boardStage gives staff four stages', () => {
  const now = Date.now(), t = (o) => Object.assign({ done: false, needs_medication: false, claimed_at: null, vet_done_at: null }, o);
  assert.equal(L.boardStage(t({}), now), 'wait');
  assert.equal(L.boardStage(t({ claimed_at: 'x' }), now), 'seen');
  assert.equal(L.boardStage(t({ needs_medication: true, vet_done_at: 'x', claimed_at: 'x' }), now), 'meds');
  assert.equal(L.boardStage(t({ done: true }), now), 'done');
});

test('flagsBefore: only EARLIER flags of the same animal in the last 3 months, newest first; flagHistoryText is reason-only', () => {
  const now = Date.parse('2026-10-09T10:00:00Z'), day = 86400000, at = d => new Date(now - d * day).toISOString();
  const task = { title: 'A1', created_at: at(0) };
  const hist = [
    { title: 'A1', flagged_at: at(0), reason: 'Now' },                              // this flag itself
    { title: 'A1', flagged_at: at(10), reason: 'Vomiting' },
    { title: 'A1', flagged_at: at(40), reason: '', condition: 'cat_flu' },
    { title: 'A1', flagged_at: at(100), reason: 'too old' },
    { title: 'B2', flagged_at: at(5), reason: 'someone else' }
  ];
  const before = L.flagsBefore(hist, task, now);
  assert.deepEqual(before.map(h => L.flagReason(h)), ['Vomiting', 'Cat flu (URI)']);
  const txt = L.flagHistoryText(before);
  assert.match(txt, /^Flagged before 2× — .*Vomiting.* · .*Cat flu \(URI\)$/);
  assert.equal(L.flagHistoryText([]), '');
  const many = [1, 2, 3, 4, 5].map(n => ({ title: 'A1', flagged_at: at(n * 3), reason: 'r' + n }));
  assert.match(L.flagHistoryText(L.flagsBefore(many, task, now)), /5× — .*r1.*r2.*r3 · \+2 more$/);
});

test('birthing reasons are Red-flag signs with readable labels; misc task labels cover the nurse task kinds', () => {
  assert.deepEqual(L.BIRTHING_SIGNS.map(b => b.key), ['birth_neonates', 'birth_discharge', 'birth_mum_distress']);
  L.BIRTHING_SIGNS.forEach(b => { assert.equal(L.signLabel(b.key), b.label); assert.equal(L.tierFromFlags([b.key]), 'red_flag'); });
  assert.ok(!L.EMERGENCY_SIGNS.some(s => s.key.startsWith('birth_')), 'birthing reasons are not general tick-boxes');
  assert.deepEqual(Object.keys(L.MISC_TASK_LABELS).sort(), ['blood', 'dispense', 'ear_swab', 'fiv_test', 'ivft', 'med_label', 'microchip', 'other', 'tail_bandage', 'treatment', 'triple_test', 'urine_collection', 'uv']);
});

test('todayTasks: only today\'s checks — old open rows are carried over, duplicates count once per animal per shift', () => {
  const now = new Date(2026, 9, 16, 15, 0, 0).getTime();                 // 16 Oct 2026, 3pm local
  const at = (d, h) => new Date(2026, 9, d, h, 0, 0).toISOString();
  const tasks = [
    { title: 'A1', location: 'Cat Room 1 / 3', shift: 'sick_injured', done: true, completed_at: at(16, 10), created_at: at(16, 8) },
    { title: 'a1 ', location: 'CR1 3', shift: 'sick_injured', done: false, created_at: at(16, 9) },        // same animal, other spelling/location, still open
    { title: 'A 1', location: 'Cat Room 2', shift: 'processing', done: false, created_at: at(16, 9) },      // same animal, DIFFERENT shift: counts there
    { title: 'B2', location: 'Pound 1', shift: 'sick_injured', done: false, created_at: at(16, 11) },       // opened today
    { title: 'C3', location: 'Pound 2', shift: 'sick_injured', done: true, completed_at: at(15, 14), created_at: at(15, 9) },   // finished yesterday
    { title: 'D4', location: 'Pound 3', shift: 'sick_injured', done: false, created_at: at(14, 9) },       // never finished, from 2 days ago
    { title: 'E5', location: 'Pound 4', shift: 'sick_injured', done: true, completed_at: at(16, 12), created_at: at(14, 9) }, // old row finished today
  ];
  const today = L.todayTasks(tasks, now);
  const si = today.filter(t => t.shift === 'sick_injured');
  assert.deepEqual(si.map(t => t.title.trim()).sort(), ['A1', 'B2', 'E5'], 'S&I today = A1 (once), B2, E5');
  assert.equal(si.filter(t => t.done).length, 2, 'A1 counts as done (finished row wins over its open duplicate) and E5 is done');
  assert.equal(today.filter(t => t.shift === 'processing').length, 1, 'the same animal in another shift counts in that shift');
  const older = L.carriedOver(tasks, now);
  assert.deepEqual(older.map(t => t.title), ['D4'], 'only the never-finished older row is carried over');
});

/* ---------- 2026-10-16: nurse sends a result back to the vets as a shelter request ---------- */
test('returnedResultTask: 2 h window -> red_flag shelter request carrying result + vet action', () => {
  const row = L.returnedResultTask({ animalId: 'A123', location: 'Cat Room 1 / 12', taskLabel: 'FIV test',
    result: 'FIV neg, FeLV neg', action: 'upload', window: '2h' });
  assert.equal(row.title, 'A123');
  assert.equal(row.location, 'Cat Room 1 / 12');
  assert.equal(row.type, 'shelter');
  assert.equal(row.shift, 'sick_injured');
  assert.equal(row.urgency, 'red_flag');
  assert.equal(row.done, false);
  assert.match(row.problem, /FIV test/);
  assert.match(row.problem, /FIV neg, FeLV neg/);
  assert.match(row.problem, /ShelterMate/);
});
test('returnedResultTask: 12-24 h window -> urgent; unknown window falls back to urgent', () => {
  const a = L.returnedResultTask({ animalId: 'A1', location: 'Pound 1', taskLabel: 'Blood test', result: 'ran', action: 'interpret', window: '12_24h' });
  assert.equal(a.urgency, 'urgent');
  assert.match(a.problem, /[Ii]nterpret/);
  const b = L.returnedResultTask({ animalId: 'A1', location: 'Pound 1', taskLabel: 'Blood test', result: 'ran', action: 'interpret', window: 'whenever' });
  assert.equal(b.urgency, 'urgent');
});
test('BACK_ACTIONS has interpret / upload / other', () => {
  assert.deepEqual(Object.keys(L.BACK_ACTIONS), ['interpret', 'upload', 'other']);
});
test('stageOf: a put-back case (claim cleared) is flagged again', () => {
  assert.equal(L.stageOf({ done: false, claimed_at: null, put_back_at: '2026-10-16T03:00:00Z' }, NOW), 'flagged');
});

test('returnedResultCount: counts nurse results on a shelter request, 0 otherwise', () => {
  const row = L.returnedResultTask({ animalId: 'A1', location: 'Pound 1', taskLabel: 'FIV test', result: 'neg', action: 'upload', window: '2h' });
  assert.equal(L.returnedResultCount(row), 1);
  assert.equal(L.returnedResultCount({ type: 'shelter', problem: row.problem + ' — ' + row.problem }), 2);
  assert.equal(L.returnedResultCount({ type: 'shelter', problem: 'limping' }), 0);
  assert.equal(L.returnedResultCount({ type: 'check_recheck', problem: row.problem }), 0);
  assert.equal(L.returnedResultCount({ type: 'shelter' }), 0);
});

/* ---------- 2026-10-17: animal history lookup (last 3 months) ---------- */
test('normId ignores case and spaces', () => {
  assert.equal(L.normId(' a 123 '), 'a123');
  assert.equal(L.normId(undefined), '');
});
test('animalHistory: matches ignoring case/spaces, 3-month cutoff, newest first, flags only, care fields carried', () => {
  const day = n => new Date(NOW - n * 24 * H).toISOString();
  const rows = [
    { id: 'a', title: 'A123', type: 'shelter', created_at: day(3), done: true, completed_at: day(2), location: 'Pound 1 / 4', condition: 'cat_flu', problem: 'sneezing', treatment: 'doxy', plan: 'recheck Fri', note: 'eating well' },
    { id: 'b', title: 'a 123', type: 'foster', created_at: day(40), done: false, claimed_at: null, location: 'Pathway', problem: 'limp' },
    { id: 'c', title: 'A123', type: 'check_recheck', created_at: day(1), done: false },          // routine list entry: not a flag
    { id: 'd', title: 'A123', type: 'shelter', created_at: day(120), done: true, problem: 'too old' },
    { id: 'e', title: 'B999', type: 'shelter', created_at: day(2), done: false, problem: 'other animal' }
  ];
  const h = L.animalHistory(rows, [], 'A 123', NOW);
  assert.deepEqual(h.map(x => x.id), ['a', 'b']);
  assert.equal(h[0].treatment, 'doxy'); assert.equal(h[0].plan, 'recheck Fri'); assert.equal(h[0].note, 'eating well');
  assert.equal(h[0].stage, 'completed'); assert.equal(h[1].stage, 'flagged');
});
test('animalHistory: falls back to the flag log for flags whose case row is gone; no double counting', () => {
  const day = n => new Date(NOW - n * 24 * H).toISOString();
  const rows = [{ id: 'a', title: 'A1', type: 'shelter', created_at: day(5), done: true, problem: 'vomiting' }];
  const log = [
    { task_id: 'a', title: 'A1', flagged_at: day(5), location: 'Pound 1', reason: 'vomiting' },     // same flag as the row
    { task_id: 'gone', title: 'A1', flagged_at: day(30), location: 'Pound 2', reason: 'cough', condition: 'kennel_cough' }
  ];
  const h = L.animalHistory(rows, log, 'a1', NOW);
  assert.equal(h.length, 2);
  assert.equal(h[1].fromLogOnly, true); assert.equal(h[1].problem, 'cough'); assert.equal(h[1].treatment, undefined);
});
test('animalHistory: empty or too-short query returns nothing', () => {
  assert.deepEqual(L.animalHistory([{ id: 'a', title: 'A1', type: 'shelter', created_at: new Date(NOW).toISOString() }], [], ' ', NOW), []);
});

/* ---------- Admission AA (2026-10-17) ---------- */
test('parseAnimalIds: messy separators -> clean, upper-cased, de-duplicated, order kept', () => {
  assert.deepEqual(L.parseAnimalIds('a1, A2  a3\nA4;; a1,'), ['A1', 'A2', 'A3', 'A4']);
  assert.deepEqual(L.parseAnimalIds('   '), []);
  assert.deepEqual(L.parseAnimalIds(undefined), []);
});

test('aaBuildItem: vaccination takes many IDs, needs a vaccine and initials', () => {
  const r = L.aaBuildItem({ kind: 'vaccination', idsText: 'a1, a2', vaccine: 'F3', vaccDate: '2026-10-17', initials: 'ab' });
  assert.deepEqual(r.row, { kind: 'vaccination', animal_ids: ['A1', 'A2'], payload: { vaccine: 'F3', date: '2026-10-17' }, sent_by: 'AB' });
  assert.match(L.aaBuildItem({ kind: 'vaccination', idsText: '', vaccine: 'F3', initials: 'AB' }).error, /animal ID/i);
  assert.match(L.aaBuildItem({ kind: 'vaccination', idsText: 'A1', vaccine: ' ', initials: 'AB' }).error, /vaccine/i);
  assert.match(L.aaBuildItem({ kind: 'vaccination', idsText: 'A1', vaccine: 'F3', initials: '' }).error, /initials/i);
});

test('aaBuildItem: FIV / microchip take exactly one animal ID (UV may list several, see below)', () => {
  assert.match(L.aaBuildItem({ kind: 'fiv', idsText: 'A1 A2', result: 'Negative', initials: 'AB' }).error, /one animal/i);
  assert.match(L.aaBuildItem({ kind: 'microchip', idsText: 'A1 A2', chipNumber: '985112000123456', initials: 'AB' }).error, /one animal/i);
  assert.deepEqual(L.aaBuildItem({ kind: 'fiv', idsText: 'a1', result: ' FIV negative ', initials: 'ab' }).row.payload, { result: 'FIV negative' });
  assert.match(L.aaBuildItem({ kind: 'fiv', idsText: 'A1', result: '', initials: 'AB' }).error, /result/i);
});

test('aaBuildItem: microchip number is stored as digits only; 9-15 digits required', () => {
  const ok = L.aaBuildItem({ kind: 'microchip', idsText: 'A1', chipNumber: '985 112-000 123 456', initials: 'ab' });
  assert.equal(ok.row.payload.chip_number, '985112000123456');
  assert.equal(ok.row.payload.implanter, 'AB');
  assert.match(L.aaBuildItem({ kind: 'microchip', idsText: 'A1', chipNumber: '98511A000123456', initials: 'AB' }).error, /digits/i);
  assert.match(L.aaBuildItem({ kind: 'microchip', idsText: 'A1', chipNumber: '12345678', initials: 'AB' }).error, /digits/i);
  assert.match(L.aaBuildItem({ kind: 'microchip', idsText: 'A1', chipNumber: '1234567890123456', initials: 'AB' }).error, /digits/i);
});

test('aaBuildItem: Microchip + UV carries chip number, implanter and UV result together', () => {
  const r = L.aaBuildItem({ kind: 'microchip_uv', idsText: 'A1', chipNumber: '985112000123456', uvResult: 'No fluorescence', initials: 'ab' });
  assert.deepEqual(r.row.payload, { chip_number: '985112000123456', implanter: 'AB', uv_result: 'No fluorescence' });
  assert.match(L.aaBuildItem({ kind: 'microchip_uv', idsText: 'A1', chipNumber: '985112000123456', uvResult: '', initials: 'AB' }).error, /UV/i);
});

test('aaBuildItem: unknown kind is refused', () => {
  assert.match(L.aaBuildItem({ kind: 'bogus', idsText: 'A1', initials: 'AB' }).error, /type/i);
});

test('aaSummary: one readable line per kind', () => {
  assert.equal(L.aaSummary({ kind: 'fiv', animal_ids: ['A1'], payload: { result: 'FIV negative' } }), 'FIV negative');
  assert.equal(L.aaSummary({ kind: 'uv', animal_ids: ['A1'], payload: { result: 'Clear' } }), 'UV: Clear');
  assert.equal(L.aaSummary({ kind: 'microchip', animal_ids: ['A1'], payload: { chip_number: '985112000123456', implanter: 'AB' } }), 'Chip 985112000123456 · implanted by AB');
  assert.equal(L.aaSummary({ kind: 'microchip_uv', animal_ids: ['A1'], payload: { chip_number: '985112000123456', implanter: 'AB', uv_result: 'Clear' } }), 'Chip 985112000123456 · implanted by AB · UV: Clear');
  assert.equal(L.aaSummary({ kind: 'vaccination', animal_ids: ['A1', 'A2', 'A3'], payload: { vaccine: 'F3', date: '2026-10-17' } }), 'F3 given 2026-10-17 · 3 animals');
  assert.equal(L.aaSummary({ kind: 'vaccination', animal_ids: ['A1'], payload: { vaccine: 'F3', date: '' } }), 'F3 given · 1 animal');
  assert.equal(L.aaSummary({ kind: 'weird', animal_ids: [], payload: null }), '');
});

test('aaCountdown: counts down 24 h, goes amber in the last 4 h, red and overdue after', () => {
  const at = ms => ({ sent_at: new Date(NOW - ms).toISOString() });
  const fresh = L.aaCountdown(at(1 * H), NOW);
  assert.equal(fresh.level, 'ok'); assert.equal(fresh.overdue, false); assert.equal(fresh.label, '23h 0m left');
  const soon = L.aaCountdown(at(21 * H + 30 * M), NOW);
  assert.equal(soon.level, 'amber'); assert.equal(soon.label, '2h 30m left');
  const justUnder = L.aaCountdown(at(24 * H - M), NOW);
  assert.equal(justUnder.overdue, false); assert.equal(justUnder.label, '0h 1m left');
  const exactly = L.aaCountdown(at(24 * H), NOW);
  assert.equal(exactly.overdue, true); assert.equal(exactly.level, 'red'); assert.equal(exactly.label, 'Overdue by 0h 0m');
  const late = L.aaCountdown(at(27 * H + 5 * M), NOW);
  assert.equal(late.label, 'Overdue by 3h 5m'); assert.equal(late.overdueMs, 3 * H + 5 * M);
});

test('aaCountdown: a sent_at in the future (clock skew) reads as a full 24 h, never negative or NaN', () => {
  const r = L.aaCountdown({ sent_at: new Date(NOW + 5 * M).toISOString() }, NOW);
  assert.equal(r.label, '24h 0m left');
  assert.equal(L.aaCountdown({ sent_at: 'not a date' }, NOW).label, '24h 0m left');
});

test('aaSortItems: overdue first (most overdue first), then oldest first', () => {
  const mk = (id, agoH) => ({ id, sent_at: new Date(NOW - agoH * H).toISOString() });
  const out = L.aaSortItems([mk('new', 1), mk('late', 26), mk('old', 10), mk('later', 30)], NOW).map(i => i.id);
  assert.deepEqual(out, ['later', 'late', 'old', 'new']);
});

test('AA_KINDS and aaSummary cover the note and chart cards', () => {
  assert.equal(L.AA_KINDS.processing_note, 'Processing notes');
  assert.equal(L.AA_KINDS.si_note, 'Sick & injured notes');
  assert.equal(L.AA_KINDS.med_chart, 'Medication chart');
  assert.equal(L.aaSummary({ kind: 'processing_note', animal_ids: ['T-100'], payload: { text: 'Line one\nLine two' } }), 'Notes to enter in ShelterMate (2 lines)');
  assert.equal(L.aaSummary({ kind: 'si_note', animal_ids: ['T-100'], payload: { text: 'One line' } }), 'Notes to enter in ShelterMate (1 line)');
  assert.equal(L.aaSummary({ kind: 'med_chart', animal_ids: ['T-100'], payload: { lines: ['a', 'b'] } }), 'Medication chart (2 medications)');
  assert.equal(L.aaSummary({ kind: 'processing_note', animal_ids: ['T-100'], payload: null }), 'Notes to enter in ShelterMate (0 lines)');
});
test('aaChangeKey changes when a card is updated', () => {
  assert.notEqual(L.aaChangeKey({ id: 'a', updated_at: null }), L.aaChangeKey({ id: 'a', updated_at: '2026-10-18T01:00:00Z' }));
  assert.equal(L.aaChangeKey({ id: 'a' }), L.aaChangeKey({ id: 'a', updated_at: null }));
});

test('pickTier: staff choice, raised (never lowered) by emergency signs', () => {
  const pick = L.pickTier;
  assert.equal(pick('routine', []), 'routine');
  assert.equal(pick('urgent', []), 'urgent');
  assert.equal(pick('red_flag', []), 'red_flag');
  assert.equal(pick('routine', ['collapse']), 'red_flag');
  assert.equal(pick('urgent', ['collapse']), 'red_flag');
  assert.equal(pick('garbage', []), 'routine');
});

test('aaBuildItem: a UV result may list several animals; FIV and microchip still one at a time', () => {
  const uv = L.aaBuildItem({ kind: 'uv', idsText: 'a1, a2, a3', result: 'UV negative', initials: 'cd' });
  assert.deepEqual(uv.row.animal_ids, ['A1', 'A2', 'A3']);
  assert.equal(uv.row.payload.result, 'UV negative');
  assert.match(L.aaBuildItem({ kind: 'fiv', idsText: 'a1, a2', result: 'neg', initials: 'cd' }).error, /one animal at a time/i);
  assert.match(L.aaBuildItem({ kind: 'microchip', idsText: 'a1, a2', chipNumber: '985112000123456', initials: 'cd' }).error, /one animal at a time/i);
});

test('reasonsOf lists the first reason then each extra; mergeReason adds one, unions signs and only raises urgency', () => {
  const task = { created_at: '2026-10-19T08:00:00Z', urgency: 'routine', condition: 'vomiting', problem: 'twice since breakfast', red_flags: [], extra_reasons: [] };
  const r1 = L.reasonsOf(task);
  assert.equal(r1.length, 1);
  assert.equal(r1[0].text, 'Vomiting — twice since breakfast');
  assert.equal(r1[0].extra, false);
  const patch = L.mergeReason(task, { at: '2026-10-19T09:00:00Z', by: 'Shelter Staff', condition: 'diarrhoea', problem: 'watery', red_flags: ['collapse'], urgency: 'routine' });
  assert.equal(patch.extra_reasons.length, 1);
  assert.deepEqual(patch.red_flags, ['collapse']);
  assert.equal(patch.urgency, 'red_flag');
  const merged = Object.assign({}, task, patch);
  const r2 = L.reasonsOf(merged);
  assert.equal(r2.length, 2);
  assert.match(r2[1].text, /Diarrhoea/i);
  assert.equal(r2[1].extra, true);
  const p2 = L.mergeReason({ urgency: 'urgent', red_flags: [], extra_reasons: [{ at: 'x' }] }, { condition: 'other', urgency: 'routine', red_flags: [] });
  assert.equal(p2.urgency, 'urgent', 'a later routine comment never lowers an urgent case');
  assert.equal(p2.extra_reasons.length, 2);
  assert.equal(L.reasonsOf({ created_at: 'x' })[0].text, '');
});

test('nurseStats: per-role totals and the average per working day for week / month / quarter / year', () => {
  const NOW2 = new Date('2026-11-18T12:00:00').getTime();   // a Wednesday
  const rows = [
    { day: '2026-11-18', role: 'welfare', n: 10 },
    { day: '2026-11-17', role: 'welfare', n: 20 },
    { day: '2026-11-16', role: 'welfare', n: 30 },     // Monday: still this week
    { day: '2026-11-15', role: 'welfare', n: 40 },     // Sunday: last week, still this month
    { day: '2026-10-05', role: 'welfare', n: 60 },     // last month, same quarter (Q4)
    { day: '2026-07-01', role: 'welfare', n: 100 },    // Q3: this year only
    { day: '2026-11-18', role: 'processing', n: 6 },
    { day: '2026-11-17', role: 'processing', n: 0 },   // a zero day is not a working day
    { day: '2026-11-19', role: 'processing', n: 99 }   // the future is ignored
  ];
  const s = L.nurseStats(rows, NOW2);
  assert.equal(s.welfare.today, 10);
  assert.deepEqual(s.welfare.week, { total: 60, days: 3, avg: 20 });
  assert.deepEqual(s.welfare.month, { total: 100, days: 4, avg: 25 });
  assert.deepEqual(s.welfare.quarter, { total: 160, days: 5, avg: 32 });
  assert.deepEqual(s.welfare.year, { total: 260, days: 6, avg: 43.3 });
  assert.equal(s.processing.today, 6);
  assert.deepEqual(s.processing.week, { total: 6, days: 1, avg: 6 });
  assert.deepEqual(L.nurseStats([], NOW2).welfare.week, { total: 0, days: 0, avg: 0 });
});

test('surgeryBreakdown: species x routine / non-routine across the periods', () => {
  const NOW2 = new Date('2026-11-18T12:00:00').getTime();
  const at = (s) => new Date(s).toISOString();
  const rows = [
    { done_at: at('2026-11-18T09:00:00'), species: 'cat', routine: true },
    { done_at: at('2026-11-17T09:00:00'), species: 'dog', routine: true },
    { done_at: at('2026-11-17T10:00:00'), species: 'dog', routine: false },
    { done_at: at('2026-11-02T09:00:00'), species: 'rabbit', routine: true },   // this month, not this week
    { done_at: at('2026-10-10T09:00:00'), species: 'cat', routine: false },     // this quarter, not this month
    { done_at: at('2026-02-10T09:00:00'), species: 'cat', routine: true },      // this year only
    { done_at: at('2026-11-18T09:30:00'), species: 'guinea pig', routine: false }
  ];
  const b = L.surgeryBreakdown(rows, NOW2);
  assert.deepEqual(b.week.cat, { routine: 1, other: 0 });
  assert.deepEqual(b.week.dog, { routine: 1, other: 1 });
  assert.deepEqual(b.week.other, { routine: 0, other: 1 });
  assert.equal(b.week.total, 4);
  assert.equal(b.month.rabbit.routine, 1);
  assert.equal(b.month.total, 5);
  assert.equal(b.quarter.cat.other, 1);
  assert.equal(b.quarter.total, 6);
  assert.equal(b.year.cat.routine, 2);
  assert.equal(b.year.total, 7);
  assert.equal(b.year.routine, 4);
  assert.equal(b.year.nonRoutine, 3);
});

test('expandAnimalIds: litter ranges and shorthand', () => {
  assert.deepEqual(L.expandAnimalIds('1170123 - 1170130').ids, ['1170123', '1170124', '1170125', '1170126', '1170127', '1170128', '1170129', '1170130']);
  assert.deepEqual(L.expandAnimalIds('1170123,124,126 - 130').ids, ['1170123', '1170124', '1170126', '1170127', '1170128', '1170129', '1170130']);
  assert.deepEqual(L.expandAnimalIds('1170123-130').ids, ['1170123', '1170124', '1170125', '1170126', '1170127', '1170128', '1170129', '1170130']);
  assert.deepEqual(L.expandAnimalIds('1170123 1170125').ids, ['1170123', '1170125'], 'two full numbers are just two animals');
  assert.deepEqual(L.expandAnimalIds('1170123, 1170123, 1170124').ids, ['1170123', '1170124'], 'duplicates collapse');
  assert.deepEqual(L.expandAnimalIds('T-100').ids, ['T-100'], 'a hyphenated ID is one ID, not a range');
  assert.deepEqual(L.expandAnimalIds('t-100, a2 a3').ids, ['T-100', 'A2', 'A3']);
  assert.deepEqual(L.expandAnimalIds('A98-101').ids, ['A98', 'A99', 'A100', 'A101'], 'a range may cross a digit boundary');
  assert.deepEqual(L.expandAnimalIds('1170129-1170132').ids, ['1170129', '1170130', '1170131', '1170132']);
  assert.match(L.expandAnimalIds('1170130 - 1170123').error, /backwards/);
  assert.match(L.expandAnimalIds('1170123 - 1179999').error, /more than 40/);
  assert.deepEqual(L.expandAnimalIds('').ids, []);
  assert.deepEqual(L.parseAnimalIds('1170123 - 1170125'), ['1170123', '1170124', '1170125'], 'the AA / nurse forms understand litters too');
  assert.match(L.aaBuildItem({ kind: 'vaccination', idsText: '1170130 - 1170123', vaccine: 'F3', initials: 'ab' }).error, /backwards/);
});

test('requestRing: only staff requests count; completed today + open raised today; older open reported separately', () => {
  const NOW2 = new Date('2026-11-18T12:00:00').getTime();
  const iso = (s) => new Date(s).toISOString();
  const tasks = [
    { id: 1, title: 'A1', shift: 'sick_injured', type: 'shelter', done: true, created_at: iso('2026-11-18T08:00:00'), completed_at: iso('2026-11-18T09:00:00') },
    { id: 2, title: 'A2', shift: 'sick_injured', type: 'foster', done: true, created_at: iso('2026-11-17T08:00:00'), completed_at: iso('2026-11-18T10:00:00') },
    { id: 3, title: 'A3', shift: 'sick_injured', type: 'rescue', done: false, created_at: iso('2026-11-18T11:00:00') },
    { id: 4, title: 'A4', shift: 'sick_injured', type: 'shelter', done: false, created_at: iso('2026-11-15T11:00:00') },
    { id: 5, title: 'A5', shift: 'processing', type: 'check_recheck', done: true, created_at: iso('2026-11-18T08:00:00'), completed_at: iso('2026-11-18T09:00:00') },
    { id: 6, title: 'A6', shift: 'sick_injured', type: 'medication', done: false, created_at: iso('2026-11-18T11:30:00') }
  ];
  assert.deepEqual(L.requestRing(tasks, NOW2), { done: 2, total: 4, older: 1 });
  assert.deepEqual(L.requestRing([], NOW2), { done: 0, total: 0, older: 0 });
});

test('aaStats: notes / charts / nurse tasks completed, with the average per working day', () => {
  const NOW2 = new Date('2026-11-18T12:00:00').getTime();   // a Wednesday
  const rows = [
    { day: '2026-11-18', cat: 'notes', n: 8 }, { day: '2026-11-17', cat: 'notes', n: 12 }, { day: '2026-11-16', cat: 'notes', n: 10 },
    { day: '2026-11-15', cat: 'notes', n: 30 },            // Sunday: last week, this month
    { day: '2026-10-05', cat: 'notes', n: 20 },            // last month, this quarter
    { day: '2026-02-01', cat: 'notes', n: 50 },            // this year only
    { day: '2026-11-18', cat: 'charts', n: 3 }, { day: '2026-11-17', cat: 'tasks', n: 7 },
    { day: '2026-11-19', cat: 'notes', n: 99 }             // the future is ignored
  ];
  const s = L.aaStats(rows, NOW2);
  assert.equal(s.notes.today, 8);
  assert.deepEqual(s.notes.week, { total: 30, days: 3, avg: 10 });
  assert.deepEqual(s.notes.month, { total: 60, days: 4, avg: 15 });
  assert.deepEqual(s.notes.quarter, { total: 80, days: 5, avg: 16 });
  assert.deepEqual(s.notes.year, { total: 130, days: 6, avg: 21.7 });
  assert.equal(s.charts.today, 3); assert.equal(s.tasks.week.total, 7);
  assert.deepEqual(L.aaStats([], NOW2).notes.week, { total: 0, days: 0, avg: 0 });
});

test('aaSortItems: priority cards come first, then overdue, then oldest', () => {
  const now = Date.parse('2026-11-18T12:00:00Z'), H2 = 3600e3;
  const mk = (id, hoursAgo, priority) => ({ id, sent_at: new Date(now - hoursAgo * H2).toISOString(), payload: priority ? { priority: true } : {} });
  const order = L.aaSortItems([mk('old', 30), mk('new', 1), mk('pri-new', 0.5, true), mk('pri-old', 2, true), mk('mid', 5)], now).map(i => i.id);
  assert.deepEqual(order, ['pri-old', 'pri-new', 'old', 'mid', 'new']);
  assert.equal(L.aaIsPriority({ payload: { priority: true } }), true);
  assert.equal(L.aaIsPriority({ payload: { priority: 'yes' } }), false);
  assert.equal(L.aaIsPriority(null), false);
});

test('timeBuckets / bucketCounts: days for week, month and quarter; months for the year; running total', () => {
  const now = new Date('2026-10-28T10:00:00').getTime();
  const w = L.timeBuckets('week', now);
  assert.deepEqual(w.keys, ['2026-10-26', '2026-10-27', '2026-10-28']);
  assert.deepEqual(L.bucketCounts(['2026-10-26T09:00:00', '2026-10-26T11:00:00', '2026-10-27T01:00:00', '2026-09-01T01:00:00'], w), [2, 1, 0], 'dates outside the window are ignored');
  assert.deepEqual(L.bucketCounts(['2026-10-26T09:00:00', '2026-10-27T01:00:00'], w, true), [1, 2, 2]);
  assert.equal(L.timeBuckets('month', now).keys.length, 28);
  const y = L.timeBuckets('year', now);
  assert.equal(y.unit, 'month'); assert.equal(y.labels.length, 10); assert.equal(y.labels[0], 'Jan');
  assert.deepEqual(L.bucketCounts(['2026-03-05T09:00:00', '2026-03-20T09:00:00', '2026-10-01T09:00:00'], y).slice(2, 3), [2]);
});

test('dailyAverage: per working day (S&I every day, Processing Mon-Fri, Surgery Mon-Fri without public holidays); today counts once something is done', () => {
  const wed = new Date('2026-10-28T10:00:00').getTime();   // Mon 26, Tue 27, Wed 28
  const d = ['2026-10-26T09:00:00', '2026-10-26T10:00:00', '2026-10-27T09:00:00'];
  assert.deepEqual(L.dailyAverage(d, 'week', wed, 'weekdays'), { avg: 1.5, days: 2, total: 3 }, 'today is not counted until something is done');
  assert.equal(L.dailyAverage(d.concat(['2026-10-28T08:00:00']), 'week', wed, 'weekdays').days, 3);
  const sun = new Date('2026-11-01T12:00:00').getTime();
  assert.equal(L.dailyAverage(['2026-10-31T09:00:00'], 'week', sun, 'weekdays').days, 5, 'Mon-Fri only: the weekend is not a working day');
  assert.equal(L.dailyAverage(['2026-10-31T09:00:00'], 'week', sun, 'every').days, 6, 'Sick & Injured counts Saturday; Sunday (today) only once something is done');
  const wedNov = new Date('2026-11-04T12:00:00').getTime();   // Tue 3 Nov 2026 is the Melbourne Cup public holiday
  assert.equal(L.dailyAverage(['2026-11-04T09:00:00'], 'month', wedNov, 'weekdays_no_holidays').days, 2, 'Mon 2 and Wed 4; the Cup day is skipped');
  assert.equal(L.dailyAverage(['2026-11-04T09:00:00'], 'month', wedNov, 'weekdays').days, 3);
  assert.equal(L.dailyAverage([], 'week', new Date('2026-10-26T06:00:00').getTime(), 'weekdays').avg, null, 'Monday morning, nothing done yet: no average yet');
});

test('isStaffRequest: staff-form requests only (not checks, nurse tasks / results or Behaviour requests)', () => {
  assert.equal(L.isStaffRequest({ type: 'shelter', problem: 'Sneezing and eye discharge' }), true);
  assert.equal(L.isStaffRequest({ type: 'foster', problem: null }), true);
  assert.equal(L.isStaffRequest({ type: 'check_recheck', problem: 'x' }), false);
  assert.equal(L.isStaffRequest({ type: 'shelter', problem: 'Task for vets from nurse \u2014 check the eye.' }), false);
  assert.equal(L.isStaffRequest({ type: 'shelter', problem: 'Result back from nurse \u2014 FIV test: negative.' }), false);
  assert.equal(L.isStaffRequest({ type: 'shelter', problem: 'Behaviour team request \u2014 dispense shelter stress medication' }), false);
});

test('TEST animals (TEST1, test 2, TEST-3) are never counted', () => {
  for (const id of ['TEST1', 'test 2', ' TEST-3 ', 'Test_14']) assert.equal(L.isTestAnimal(id), true, id);
  for (const id of ['TESTY1', 'TEST', 'A123456', '', null, 'TEST1A']) assert.equal(L.isTestAnimal(id), false, String(id));
  const now = Date.now(), iso = new Date(now).toISOString();
  const rows = ['TEST1', 'A100'].map(title => ({ title, shift: 'processing', done: true, created_at: iso, completed_at: iso, location: 'X' }));
  assert.equal(L.todayTasks(rows, now).length, 1);
  const open = [{ title: 'TEST2', shift: 'processing', done: false, created_at: new Date(now - 2 * 86400000).toISOString(), location: 'X' }];
  assert.equal(L.carriedOver(open, now).length, 0);
  assert.equal(L.periodTotals(rows, now).year.total, 1);
});

test('seasons follow Australia: Summer Dec-Feb, Autumn Mar-May, Winter Jun-Aug, Spring Sep-Nov', () => {
  const at = (d) => new Date(d + 'T12:00:00').getTime();
  for (const [d, start, name] of [['2026-01-15', '2025-12-01', 'Summer'], ['2026-02-28', '2025-12-01', 'Summer'], ['2026-03-01', '2026-03-01', 'Autumn'], ['2026-06-10', '2026-06-01', 'Winter'], ['2026-10-28', '2026-09-01', 'Spring'], ['2026-12-02', '2026-12-01', 'Summer']]) {
    assert.equal(L.localDayKey(L.windowStart('season', at(d))), start, d);
    assert.equal(L.seasonName(at(d)), name, d);
  }
});

test('the "quarter" window is the season, and statsSince reaches back to last December in summer', () => {
  const at = (d) => new Date(d + 'T12:00:00').getTime();
  assert.equal(L.localDayKey(L.windowStart('quarter', at('2026-10-28'))), '2026-09-01');
  assert.equal(L.localDayKey(L.statsSince(at('2026-01-20'))), '2025-12-01');
  assert.equal(L.localDayKey(L.statsSince(at('2026-07-20'))), '2026-01-01');
});

test('rings: a staff request and a list check for the same animal and pen are two logs, each in its own ring', () => {
  const now = Date.now(), iso = new Date(now - 3600e3).toISOString();
  const row = (o) => Object.assign({ title: 'A1', location: 'CR1-30', shift: 'sick_injured', done: false, created_at: iso, completed_at: null, type: 'check_recheck' }, o);
  const rows = [row({}), row({ type: 'shelter', done: true, completed_at: iso }), row({ title: 'A2' }), row({ title: 'A3', done: true, completed_at: iso })];
  const checks = L.todayTasks(L.listChecks(rows), now);
  assert.equal(checks.length, 3, 'list: A1, A2, A3 (different IDs in one pen stay separate)');
  assert.equal(checks.filter(t => t.done).length, 1, 'only A3 finished: the finished request does not tick A1');
  const ring = L.requestRing(rows, now);
  assert.equal(ring.total, 1); assert.equal(ring.done, 1, 'the request counts in the flagged ring');
  assert.equal(L.todayTasks(rows, now).length, 4, 'even mixed together, the request and the list check are not merged');
});
