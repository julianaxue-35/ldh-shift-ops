import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const L = require('../lib/ldh-logic.js');
const V = require('../lib/surveillance-view.js');

const LOC = [{ name: 'Cat Room 1', grp: 'Cat rooms', cages: 30, sort: 1 }, { name: 'Pound <2>', grp: 'Pounds', cages: 26, sort: 2 }];
const now = Date.now();
const survey = L.buildSurvey([
  { title: 'A1', location: 'Cat Room 1 / 4', condition: 'cat_flu', created_at: new Date(now).toISOString() },
  { title: 'A2', location: 'Cat Room 1 / 5', condition: 'cat_flu', created_at: new Date(now).toISOString() },
  { title: 'Z9', location: 'Nowhere / 1', condition: 'other', created_at: new Date(now).toISOString() }
], LOC, new Date(now - 3 * 24 * 3600 * 1000));

test('heat map: one tile per space with rate, cage counts and leading sign; escapes names', () => {
  const h = V.heatMapHtml(survey);
  assert.match(h, /class="heat-grid"/);
  assert.match(h, /data-space="Cat Room 1"[\s\S]*6\.7%[\s\S]*2 cases · 30 cages · Cat flu \(URI\)/);
  assert.ok(h.includes('Pound &lt;2&gt;') && !h.includes('Pound <2>'), 'space names are escaped');
  assert.match(h, /data-space="Pound &lt;2&gt;"[\s\S]*0%[\s\S]*0 cases · 26 cages/);
});

test('heat map is neutral: no red, no outbreak wording', () => {
  const h = V.heatMapHtml(survey) + V.groupsHtml(survey) + V.rankedHtml(survey) + V.baselineHtml({ day: 3, of: 365, done: false, days: 3 });
  assert.ok(!/outbreak|alert|danger|critical|high risk/i.test(h), 'no alarm wording');
  assert.ok(!/rgba?\(\s*2[0-9]{2}\s*,\s*[0-9]{1,2}\s*,\s*[0-9]{1,2}/.test(h), 'no red tints');
});

test('groups and ranked tables', () => {
  const g = V.groupsHtml(survey);
  assert.match(g, /Cat rooms[\s\S]*2[\s\S]*30[\s\S]*6\.7%/, '2 cases in 30 cages');
  const r = V.rankedHtml(survey);
  assert.match(r, /Cat flu \(URI\)[\s\S]*2[\s\S]*67%/, '2 of the 3 flagged animals');
  assert.match(V.rankedHtml(L.buildSurvey([], LOC, new Date())), /No signs flagged in this period\./);
});

test('tile sub-line says cases, singular for one', () => {
  const one = L.buildSurvey([{ title: 'A1', location: 'Cat Room 1 / 4', condition: 'cat_flu', created_at: new Date(now).toISOString() }], LOC, new Date(now - 3 * 24 * 3600 * 1000));
  assert.match(V.heatMapHtml(one), /1 case · 30 cages · Cat flu/);
});

test('unmapped spaces are reported, never dropped silently', () => {
  assert.match(V.unmappedHtml(survey), /1 flagged animal had a space that isn.t in the list/);
  assert.equal(V.unmappedHtml(L.buildSurvey([], LOC, new Date())), '');
});

test('baseline banner wording and the caveat', () => {
  assert.match(V.baselineHtml({ day: 3, of: 365, done: false, days: 3 }), /Building your baseline — day 3 of 365\./);
  assert.match(V.baselineHtml({ day: 365, of: 365, done: true, days: 410 }), /Baseline year complete — this year's rates can now be compared with the same time last year\./);
  const c = V.caveatHtml();
  assert.match(c, /capacity/i); assert.match(c, /flagged/i); assert.match(c, /your own baseline/i);
  assert.match(c, /twice if two different signs/i, 'the counting rule is stated on screen');
  assert.match(c, /Requests synced from the shift tools carry no sign, so only cases flagged on the dashboard appear here until the vet-diagnosed conditions are added\./);
});
