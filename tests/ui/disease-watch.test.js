const { open } = require('./harness');
const { LOCATION_ROWS } = require('./fixtures');
const t = require('./check')('disease-watch');
const ago = ms => new Date(Date.now() - ms).toISOString();
const H = 3600 * 1000, D = 24 * H;
(async () => {
  const flag = (title, location, condition, agoMs) => ({ title, location, shift: 'sick_injured', type: 'shelter', urgency: 'routine', done: false, condition, created_at: ago(agoMs) });
  const seed = { locations: LOCATION_ROWS, tasks: [flag('A1', 'Cat Room 1 / 4', 'cat_flu', 1 * H), flag('A1', 'Cat Room 1 / 7', 'vomiting', 1 * H), flag('M1', 'Mystery Room / 1', 'other', 1 * H), flag('A2', 'Cat Room 1 / 5', 'kennel_cough', 2 * H), flag('B1', 'Pound 3 / 9', 'vomiting', 5 * D), flag('C1', 'Pound 1 / 2', null, 1 * H)] };
  const a = await open(seed);
  try {
    t.ok(await a.page.isVisible('#disease-watch'), 'card visible to shelter staff');
    const tile = name => a.page.locator('#disease-watch-map .heat-tile', { hasText: name }).first().textContent();
    t.ok(await a.page.locator('#disease-watch-map .heat-tile').count() === 12, 'a tile for every space');
    t.ok(/\b10(\.0)?%/.test(await tile('Cat Room 1')) && /3 cases · 30 cages/.test(await tile('Cat Room 1')), 'Cat Room 1: 3 cases in 30 cages = 10% (last 3 days; A1 has two different signs)');
    t.ok(/0%/.test(await tile('Pound 3')) && /0 cases · 60 cages/.test(await tile('Pound 3')), 'a 5-day-old flag is outside the 3-day window');
    t.ok((await a.page.textContent('#disease-watch')).includes("1 flagged animal had a space that isn't in the list"), 'an unknown space is reported in the card, not dropped');
    t.ok(!/outbreak|alert|high risk/i.test(await a.page.textContent('#disease-watch')), 'no alarm wording');
    t.ok(await a.page.locator('#disease-watch a[href="stats.html"]').count() === 1, 'links to the full board on the stats page');
    await a.page.selectOption('#role-select', 'vet_nurse');
    await a.page.waitForTimeout(200);
    t.ok(await a.page.isVisible('#disease-watch'), 'card also visible to vets and nurses');
    t.ok(a.errors.length === 0, 'no page errors: ' + a.errors.join('; '));
  } finally { await a.browser.close(); }
  // before migration 0009: no spaces list -> the card stays hidden instead of showing an empty board
  const b = await open({ tasks: seed.tasks });
  try {
    t.ok(!(await b.page.isVisible('#disease-watch')), 'card hidden when the spaces list does not exist yet');
    t.ok(b.errors.length === 0, 'no page errors without locations: ' + b.errors.join('; '));
  } finally { await b.browser.close(); }
  t.done();
})();
