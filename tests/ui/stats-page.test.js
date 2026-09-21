const { open } = require('./harness');
const { LOCATION_ROWS } = require('./fixtures');
const t = require('./check')('stats-page');
const ago = ms => new Date(Date.now() - ms).toISOString();
const D = 24 * 3600 * 1000;
(async () => {
  const done = (shift, agoMs) => ({ title: 'T-' + Math.random().toString(36).slice(2, 6), location: 'Pound 1', shift, type: 'shelter', urgency: 'routine', done: true, created_at: ago(agoMs + 3600000), completed_at: ago(agoMs) });
  const flagged = (condition, loc) => ({ title: 'F-' + Math.random().toString(36).slice(2, 6), location: loc, shift: 'sick_injured', type: 'shelter', urgency: 'routine', done: false, condition, created_at: new Date().toISOString() });
  const seed = { tasks: [done('surgery', 1 * D), done('surgery', 2 * D), done('processing', 3 * D), done('sick_injured', 1 * D),
    flagged('cat_flu', 'Cat Room 1 / 4'), flagged('cat_flu', 'Cat Room 1 / 5'), flagged('vomiting', 'Pound 2 / 3'),
    Object.assign(flagged('cat_flu', 'Pound 2 / 9'), { created_at: ago(20 * D) })],
    locations: LOCATION_ROWS,
    surveillance_snapshots: [{ snapshot_date: '2026-09-19', space: 'Cat Room 1', condition: 'any', animals: 1, cages: 30 }, { snapshot_date: '2026-09-20', space: 'Cat Room 1', condition: 'any', animals: 2, cages: 30 }] };
  // 1. the stats page
  const stats = await open(seed, 'stats.html');
  try {
    const cards = await stats.page.locator('#trend-grid .trend-card').count();
    t.ok(cards === 4, 'stats page shows the four trend cards (got ' + cards + ')');
    const txt = await stats.page.textContent('#trend-grid');
    t.ok(txt.includes('Surgeries') && txt.includes('Examinations (Processing)') && txt.includes('Sick & Injured attended'), 'trend cards cover Surgery, Processing and Sick & Injured');
    t.ok(await stats.page.locator('#response-rate-section').count() === 1 && await stats.page.locator('#surveillance-section').count() === 1, 'response-rate and disease-export sections are on the stats page');
    t.ok((await stats.page.locator('#response-rate-chart svg').count()) >= 1, 'response-rate chart drawn');
    t.ok(await stats.page.locator('a[href="index.html"]').count() >= 1, 'link back to the dashboard');
    await stats.page.waitForSelector('#heat-map .heat-tile');
    t.ok(await stats.page.locator('#heat-map .heat-tile').count() === 12, 'a tile for each of the 12 spaces');
    const tile = name => stats.page.locator('#heat-map .heat-tile', { hasText: name }).first().textContent();
    t.ok(/6\.7%/.test(await tile('Cat Room 1')) && /2 of 30 cages/.test(await tile('Cat Room 1')), 'Cat Room 1: 2 cases / 30 cages = 6.7%');
    t.ok(/1 of 26 cages/.test(await tile('Pound 2')), 'Pound 2 counts only the recent flag (the 20-day-old one is outside 3 days)');
    t.ok((await stats.page.textContent('#heat-groups')).includes('Cat rooms') && (await stats.page.textContent('#heat-groups')).includes('Pounds'), 'group summary');
    const ranked = await stats.page.textContent('#heat-ranked');
    t.ok(ranked.indexOf('Cat flu (URI)') < ranked.indexOf('Vomiting'), 'most commonly reported first (flu 2, vomiting 1)');
    t.ok((await stats.page.textContent('#baseline-banner')).includes('Building your baseline — day 2 of 365'), 'baseline banner counts the 2 snapshot days out of a full year');
    await stats.page.selectOption('#surv-window', '30d');
    await stats.page.waitForTimeout(150);
    t.ok(/2 of 26 cages/.test(await tile('Pound 2')), 'switching to 30 days includes the older flag');
    t.ok((await stats.page.textContent('#heat-notes')).toLowerCase().includes('capacity'), 'the capacity / reported-rate caveat is shown');
    t.ok((await stats.page.textContent('#heat-notes')).toLowerCase().includes('two different signs'), 'the counting rule is stated');
    t.ok(!/outbreak|high risk|alert/i.test(await stats.page.textContent('#surveillance-section')), 'no alarm wording on the board');
    t.ok(stats.errors.length === 0, 'no page errors on stats page: ' + stats.errors.join('; '));
  } finally { await stats.browser.close(); }
  // 2. the dashboard no longer carries them, and links to stats
  const dash = await open(seed);
  try {
    t.ok(await dash.page.locator('#trends-section, #response-rate-section, #surveillance-section').count() === 0, 'dashboard no longer has the stats sections');
    t.ok(await dash.page.locator('aside a[href="stats.html"]').count() === 1, 'dashboard sidebar links to the stats page');
    t.ok(dash.errors.length === 0, 'no page errors on dashboard: ' + dash.errors.join('; '));
  } finally { await dash.browser.close(); }
  t.done();
})();
