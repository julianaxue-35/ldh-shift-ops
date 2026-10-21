import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const L = createRequire(import.meta.url)('../lib/ldh-logic.js');

test('behaviourSpecies: cat rooms/adoptions are cat, pounds are dog, the rest either', () => {
  for (const loc of ['Cat Room 1 / 12', 'Cat Room 3', 'Adoption 2 / 4', 'FIR Room', 'Cat Isolation ward / 2']) assert.equal(L.behaviourSpecies(loc), 'cat', loc);
  for (const loc of ['Pound 1 / 3', 'Pound 4']) assert.equal(L.behaviourSpecies(loc), 'dog', loc);
  for (const loc of ['Transport', 'Rabbit Room / 2', 'Pathway', 'Offsite', '', null, 'Nowhere 9']) assert.equal(L.behaviourSpecies(loc), 'either', String(loc));
});

test('behaviourLaneChoices: dogs and cats never cross', () => {
  assert.deepEqual(L.behaviourLaneChoices('Cat Room 2 / 1'), ['tl', 'cat']);
  assert.deepEqual(L.behaviourLaneChoices('Pound 2 / 4'), ['tl', 'dog']);
  assert.deepEqual(L.behaviourLaneChoices('Transport'), ['tl', 'cat', 'dog']);
});

test('behaviourValidate: reason required for review kinds, text required for other', () => {
  const ok = { kind: 'courthold', animalId: 'BEH-1', location: 'Pound 1', reason: '' };
  assert.equal(L.behaviourValidate(ok), '');
  assert.match(L.behaviourValidate({ ...ok, animalId: ' ' }), /animal ID/i);
  assert.match(L.behaviourValidate({ ...ok, location: '' }), /space/i);
  assert.match(L.behaviourValidate({ ...ok, kind: 'behaviour_review' }), /reason/i);
  assert.match(L.behaviourValidate({ ...ok, kind: 'incident_review' }), /reason/i);
  assert.match(L.behaviourValidate({ ...ok, kind: 'other' }), /describe/i);
  assert.equal(L.behaviourValidate({ ...ok, kind: 'behaviour_review', reason: 'lunging at staff' }), '');
});

test('behaviourDue / behaviourCountdown', () => {
  const t0 = new Date('2026-10-21T10:00:00').getTime();
  const mk = w => ({ created_at: new Date(t0).toISOString(), due_window: w });
  assert.equal(L.behaviourDue(mk('30_60m')), t0 + 60 * 60000);
  assert.equal(L.behaviourDue(mk('48h')), t0 + 48 * 3600000);
  assert.equal(L.behaviourDue(mk('today')), new Date('2026-10-21T23:59:59.999').getTime());
  assert.equal(L.behaviourCountdown(mk('30_60m'), t0 + 20 * 60000).overdue, false);
  const late = L.behaviourCountdown(mk('30_60m'), t0 + 90 * 60000);
  assert.equal(late.overdue, true); assert.match(late.text, /overdue/i);
});

test('behaviourVetRequest: medication types wait on the nurse label; courthold and initials shown', () => {
  const base = { animalId: 'BEH-1', location: 'Cat Room 1 / 3', courthold: true, note: 'x', initials: 'AB' };
  const med = L.behaviourVetRequest({ ...base, type: 'shelter_stress_med' });
  assert.equal(med.type, 'medication'); assert.equal(med.needs_medication, true); assert.equal(med.sm_number, 'BEH-1');
  assert.equal(med.shift, 'sick_injured'); assert.equal(med.title, 'BEH-1'); assert.equal(med.location, 'Cat Room 1 / 3');
  assert.match(med.problem, /Behaviour team request/); assert.match(med.problem, /shelter stress medication/i);
  assert.match(med.problem, /COURTHOLD/); assert.match(med.problem, /sent by AB/);
  const pack = L.behaviourVetRequest({ ...base, type: 'post_adoption_pack', courthold: false });
  assert.match(pack.problem, /post adoption med pack/i); assert.doesNotMatch(pack.problem, /COURTHOLD/);
  const other = L.behaviourVetRequest({ ...base, type: 'other' });
  assert.equal(other.type, 'shelter'); assert.equal(other.needs_medication, false);
});

test('behaviourForAnimal: open tasks plus the latest done within 24h, matched ignoring spaces/case', () => {
  const now = new Date('2026-10-21T12:00:00').getTime();
  const rows = [
    { animal_id: 'beh 1', status: 'open', kind: 'behaviour_review' },
    { animal_id: 'BEH-1', status: 'done', done_at: new Date(now - 3600e3).toISOString(), done_note: 'a' },
    { animal_id: 'BEH-1', status: 'done', done_at: new Date(now - 2 * 3600e3).toISOString(), done_note: 'older' },
    { animal_id: 'BEH-1', status: 'done', done_at: new Date(now - 30 * 3600e3).toISOString(), done_note: 'too old' },
    { animal_id: 'OTHER', status: 'open' }
  ];
  const r = L.behaviourForAnimal(rows, 'BEH-1', now);
  assert.equal(r.open.length, 0, 'beh 1 vs BEH-1 differ by the hyphen, so only exact-ignoring-space matches count');
  assert.equal(r.done.done_note, 'a');
  assert.equal(L.behaviourForAnimal(rows, 'BEH 1', now).open.length, 1);
  assert.equal(L.behaviourForAnimal(rows, 'NONE', now).done, null);
});

test('behaviourSpecies: a free-text pen never turns a dog or cat into "either"', () => {
  for (const loc of ['Pound 2 / Run 4', 'Pound 1 / 10 (outside)']) assert.equal(L.behaviourSpecies(loc), 'dog', loc);
  for (const loc of ['Cat Room 1 / 12-13', 'Cat Room 2 / A12', 'Adoption 1 / 3 top']) assert.equal(L.behaviourSpecies(loc), 'cat', loc);
  assert.deepEqual(L.behaviourLaneChoices('Pound 2 / Run 4'), ['tl', 'dog']);
  assert.equal(L.behaviourSpecies('Transport / van 2'), 'either');
});

test('behaviourSpecies: an unrecognised location uses the animal\'s own species so a cat is never offered Dog assist', () => {
  for (const loc of ['Unknown', '', 'T', null]) {
    assert.equal(L.behaviourSpecies(loc, 'cat'), 'cat', String(loc)); assert.equal(L.behaviourSpecies(loc, 'dog'), 'dog', String(loc));
    assert.deepEqual(L.behaviourLaneChoices(loc, 'cat'), ['tl', 'cat']); assert.deepEqual(L.behaviourLaneChoices(loc, 'dog'), ['tl', 'dog']);
  }
  assert.equal(L.behaviourSpecies('Unknown', 'rabbit'), 'either'); assert.equal(L.behaviourSpecies('Unknown'), 'either');
  assert.equal(L.behaviourSpecies('Pound 2 / 4', 'cat'), 'dog');   // a recognised room wins
});

test('behaviourStats: today, period totals, per-working-day average and per-kind totals', () => {
  const now = new Date('2026-10-22T10:00:00').getTime();   // a Thursday
  const rows = [
    { day: '2026-10-22', cat: 'courthold', n: 2 }, { day: '2026-10-22', cat: 'behaviour_review', n: 1 },
    { day: '2026-10-21', cat: 'incident_review', n: 3 }, { day: '2026-03-01', cat: 'courthold', n: 4 },
    { day: '2026-10-23', cat: 'courthold', n: 9 }   // a future day is ignored
  ];
  const s = L.behaviourStats(rows, now);
  assert.equal(s.cases.today, 3);
  assert.deepEqual(s.cases.week, { total: 6, days: 2, avg: 3 });
  assert.equal(s.cases.year.total, 10);
  assert.equal(s.courthold.year.total, 6);
  assert.equal(s.incident_review.week.total, 3);
  assert.equal(L.behaviourStats([], now).cases.year.avg, 0);
});
