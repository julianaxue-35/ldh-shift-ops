import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const F = createRequire(import.meta.url)('../lib/fsa.js');

const tick = (...ids) => Object.fromEntries(ids.map(i => [i, true]));
const cat = (sessions, extra) => Object.assign({ intake_at: '2026-10-20T10:00:00', data: { sessions } }, extra);

test('the sheet\'s boxes: A has 6 white + 4 grey, C has 7 white + 8 grey, D has 3 groups', () => {
  const count = (k) => { const s = F.SECTIONS.find(x => x.key === k); const all = s.groups.flatMap(g => g.items); return [all.filter(i => i.kind === 'white').length, all.filter(i => i.kind === 'gray').length]; };
  assert.deepEqual(count('A'), [6, 4]); assert.deepEqual(count('B'), [6, 4]); assert.deepEqual(count('C'), [7, 8]);
  assert.deepEqual(F.SECTIONS.find(x => x.key === 'D').groups.map(g => g.key), ['any', 'stroking', 'pressing']);
});

test('points questions add up to the sheet totals (50 for Day 1 AM, 51 for Day 2 AM)', () => {
  const sum = (set) => F.QUESTIONS[set].reduce((n, q) => n + q.points, 0);
  assert.equal(sum('d1'), 50); assert.equal(sum('d2'), 51);
  assert.deepEqual(F.QUESTIONS.d2.map(q => q.points), [7, 9, 9, 9, 5, 7, 5]);
});

test('yes adds the points, no and unanswered add nothing, unanswered is reported', () => {
  const s = { answers: { a_eye: true, b_alert: true, b_back: true, c_aff: false } };
  const p = F.sessionPoints(s, 'd2');
  assert.equal(p.total, 25); assert.equal(p.answered, 4); assert.equal(p.unanswered, 3); assert.equal(p.max, 51);
  assert.equal(F.sessionPoints({ answers: Object.fromEntries(F.QUESTIONS.d2.map(q => [q.id, true])) }, 'd2').total, 51);
});

test('one white box at any time = early graduate; four grey circles across sessions = early graduate; otherwise full points scoring', () => {
  const A = (sec, item) => F.tickId('A', 'all', item);
  assert.equal(F.graduation({}).status, 'Full points scoring completed');
  assert.equal(F.graduation({ s1: { ticks: tick(A('A', 'rub')) } }).status, 'Early graduation');
  // 3 grey in session 1 + 1 grey in session 3 = 4 across the assessments
  const g = F.graduation({ s1: { ticks: tick(F.tickId('A', 'all', 'reach'), F.tickId('A', 'all', 'sniff'), F.tickId('B', 'all', 'approach')) }, s3: { ticks: tick(F.tickId('C', 'all', 'yawn')) } });
  assert.equal(g.early, true); assert.equal(g.byGray, true); assert.equal(g.byWhite, false); assert.equal(g.gray, 4);
  assert.equal(F.graduation({ s1: { ticks: tick(F.tickId('A', 'all', 'reach'), F.tickId('A', 'all', 'sniff'), F.tickId('B', 'all', 'approach')) } }).early, false);
});

test('cumulative check-marks count squares and circles per session and in total', () => {
  const c = F.cumulative({ s1: { ticks: tick(F.tickId('A', 'all', 'play'), F.tickId('A', 'all', 'reach')) }, s2: { ticks: tick(F.tickId('D', 'pressing', 'sniff')) } });
  assert.deepEqual(c.rows.map(r => [r.white, r.gray]), [[1, 1], [0, 1], [0, 0], [0, 0]]); assert.equal(c.white, 1); assert.equal(c.gray, 2);
});

test('the Day 1 x Day 2 matrix gives the outcome 1-4 (every cell of the chart)', () => {
  const d1 = [10, 17, 25, 40], d2 = [5, 15, 20, 40];   // one value in each band
  const want = [[4, 4, 2, 1], [4, 3, 2, 1], [2, 2, 1, 1], [1, 1, 1, 1]];
  d1.forEach((a, i) => d2.forEach((b, j) => assert.equal(F.outcome(a, b).n, want[i][j], a + ' / ' + b)));
});

test('band edges: Day 1 <15 | 15-19 | 20-31 | >31 and Day 2 <12 | 12-17 | 18-26 | >26', () => {
  assert.deepEqual([14, 15, 19, 20, 31, 32].map(F.band1), [0, 1, 1, 2, 2, 3]);
  assert.deepEqual([11, 12, 17, 18, 26, 27].map(F.band2), [0, 1, 1, 2, 2, 3]);
});

test('Juliana\'s example: Day 1 AM 15-19 and Day 2 AM 28 = outcome 1; Day 1 23 and Day 2 19 = outcome 1; Day 1 only is provisional', () => {
  assert.equal(F.outcome(15, 28).n, 1); assert.equal(F.outcome(23, 19).n, 1); assert.equal(F.outcome(23, 19).label, 'Extremely likely to be socialised');
  const p = F.outcome(12, null); assert.equal(p.provisional, true); assert.equal(p.n, 4);
  assert.equal(F.outcome(null, null), null);
});

test('summary + template text: early graduate, and a full-points cat', () => {
  const c = cat({ s1: { answers: { a_noeat: true, a_aff: true, c_head: true }, doneAt: 'x' }, s3: { answers: { a_eye: true, b_alert: true, b_back: true } } }, {});
  c.data.behaviour = 'Day 1 - in litter tray\nDay 2 - on den'; c.data.behaviourBy = 'CD'; c.data.sessions.s1.doneBy = 'AB'; c.data.fas = '4'; c.data.plan = 'Behaviour modification';
  const s = F.summary(c);
  assert.equal(s.day1.total, 27); assert.equal(s.day2.total, 25); assert.equal(s.outcome.n, 1);   // Day 1 = 27 (20-31 row) x Day 2 = 25 (18-26 column) = 1
  const t = F.templateText(c).split('\n');
  assert.equal(t[0], 'Graduation status: Full points scoring completed'); assert.equal(t[1], 'One and done behaviours: 0'); assert.equal(t[2], '4 or more behaviour: 0');
  assert.equal(t[3], 'Day 1 points: 27'); assert.equal(t[4], 'Day 2 points: 25'); assert.match(t[5], /^Socialisation status: 1 – extremely likely to be socialised$/);
  assert.equal(t[6], 'Behaviour: Day 1 - in litter tray Day 2 - on den'); assert.equal(t[7], 'FAS: 4'); assert.equal(t[8], 'PLAN: Behaviour modification');
  const g = cat({ s1: { ticks: tick(F.tickId('B', 'all', 'rub')) } });
  assert.match(F.templateText(g), /Graduation status: Early graduation\nOne and done behaviours: 1/); assert.match(F.templateText(g), /Socialisation status: Early FSA graduate/);
});

test('days and what is due: Day 0 nothing; Day 1 morning -> Day 1 AM; Day 1 afternoon -> + Day 1 PM; Day 2 morning -> + Day 2 AM', () => {
  const c = cat({}); const at = (d) => new Date(d);
  assert.equal(F.dueSessions(c, at('2026-10-20T15:00:00')).length, 0);
  assert.deepEqual(F.dueSessions(c, at('2026-10-21T08:00:00')).map(s => s.label), ['Day 1 AM']);
  assert.deepEqual(F.dueSessions(c, at('2026-10-21T14:00:00')).map(s => s.label), ['Day 1 AM', 'Day 1 PM']);
  assert.deepEqual(F.dueSessions(c, at('2026-10-22T09:00:00')).map(s => s.label), ['Day 1 AM', 'Day 1 PM', 'Day 2 AM']);
  assert.equal(F.nextDue(c, at('2026-10-21T14:00:00')).label, 'Day 1 AM');
  const done = cat({ s1: { doneAt: 'x' } }); assert.equal(F.nextDue(done, at('2026-10-21T14:00:00')).label, 'Day 1 PM');
  assert.equal(F.dayInfo('2026-10-20T23:30:00', at('2026-10-21T00:10:00')).day, 1);
});

test('cage tile states', () => {
  const now = new Date('2026-10-21T08:00:00');
  assert.equal(F.tileState(cat({}), new Date('2026-10-20T15:00:00')).key, 'day0');
  assert.deepEqual(F.tileState(cat({}), now), { key: 'due', label: 'Day 1 AM due' });
  assert.equal(F.tileState(cat({ s1: { ticks: tick(F.tickId('A', 'all', 'play')) } }), now).key, 'graduate');
  assert.match(F.tileState(cat({ s1: { ticks: tick(F.tickId('A', 'all', 'play')) } }), now).label, /enter in SM/);
  const ent = cat({ s1: { ticks: tick(F.tickId('A', 'all', 'play')) } }); ent.data.smEntered = { at: 'x', by: 'AB' };
  assert.match(F.tileState(ent, now).label, /in SM \u2713/);
});

test('a cage can only be emptied once the notes are ticked as entered in ShelterMate (unless nothing was recorded)', () => {
  assert.equal(F.canDischarge(cat({})), true);   // added by mistake: nothing recorded
  const c = cat({ s1: { ticks: tick(F.tickId('A', 'all', 'play')) } });
  assert.equal(F.canDischarge(c), false);
  c.data.smEntered = { at: '2026-10-22T10:00:00', by: 'AB' };
  assert.equal(F.canDischarge(c), true);
  assert.equal(F.canDischarge(cat({}, {})), true);
  const typed = cat({}); typed.data.behaviour = 'hissing'; assert.equal(F.canDischarge(typed), false);
});

test('reminders: an assessment is overdue once the next slot has begun; notes are overdue 2 days after the final assessment', () => {
  const at = (d) => new Date(d), c = cat({});   // arrived 20 Oct 10:00
  assert.equal(F.reminders([c], at('2026-10-21T08:00:00')).length, 0);                 // Day 1 AM is due, not yet overdue
  let r = F.reminders([c], at('2026-10-21T13:00:00')); assert.equal(r.length, 1); assert.match(r[0].text, /^Day 1 AM assessment is not done/);
  const done1 = cat({ s1: { doneAt: 'x' } }); assert.equal(F.reminders([done1], at('2026-10-21T13:00:00')).length, 0);
  r = F.reminders([c], at('2026-10-22T09:00:00')); assert.match(r[0].text, /Day 1 AM, Day 1 PM assessments are not done/);
  assert.equal(F.reminders([c], at('2026-10-22T13:00:00')).filter(x => x.kind === 'assessment')[0].text.startsWith('Day 1 AM, Day 1 PM, Day 2 AM'), true);
  // notes: final assessment day is Day 2 (22 Oct), so overdue from 24 Oct
  const all = cat({ s1: { doneAt: 'x' }, s2: { doneAt: 'x' }, s3: { doneAt: 'x' }, s4: { doneAt: 'x' } });
  assert.equal(F.reminders([all], at('2026-10-23T20:00:00')).length, 0);
  r = F.reminders([all], at('2026-10-24T08:00:00')); assert.equal(r.length, 1); assert.equal(r[0].kind, 'sm'); assert.match(r[0].text, /not in ShelterMate/);
  all.data.smEntered = { at: 'x', by: 'AB' }; assert.equal(F.reminders([all], at('2026-10-30T08:00:00')).length, 0);
  // early graduate: assessments never nag; notes due 2 days after the day it graduated
  const g = cat({ s1: { ticks: tick(F.tickId('A', 'all', 'rub')) } }); g.data.gradAt = '2026-10-21T09:00:00';
  assert.equal(F.reminders([g], at('2026-10-22T20:00:00')).length, 0);
  assert.equal(F.reminders([g], at('2026-10-23T08:00:00')).length, 1);
  assert.equal(F.reminders([Object.assign(cat({}), { status: 'completed' })], at('2026-10-30T08:00:00')).length, 0);
});

test('vet note carries the cage, FSA result, points, FAS and behaviour notes on one line', () => {
  const c = cat({ s1: { answers: { a_noeat: true, a_aff: true, c_head: true } }, s3: { answers: { a_eye: true, b_alert: true, b_back: true } } }, { cage: 12 });
  c.data.fas = '4'; c.data.behaviour = 'Day 1 - hiding.\nDay 2 - on den.';
  const n = F.vetNote(c);
  assert.ok(!/\n/.test(n)); assert.match(n, /^FIR room cage 12\. FSA result: 1 \u2013 extremely likely to be socialised\./);
  assert.match(n, /Day 1 points 27, Day 2 points 25\. FAS 4\. Behaviour: Day 1 - hiding\. Day 2 - on den\.$/);
  assert.match(F.vetNote(cat({}, { cage: 3 })), /Day 1 points not scored.*Behaviour: no notes yet$/);
});
