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
    await stats.page.waitForSelector('#period-totals-grid .tc-svg');
    const tot = await stats.page.textContent('#period-totals-grid');
    t.ok(await stats.page.locator('#period-totals-grid .tc-svg').count() === 1 && /Week/.test(tot) && /Season/.test(tot) && !/Quarter/.test(tot) && /Year/.test(tot), 'the Totals chart has Week / Month / Season / Year buttons');
    t.ok(await stats.page.locator('#period-totals-grid .kpi-row').count() === 1 && /Processing/.test(tot) && /Sick & Injured/.test(tot) && /Surgery/.test(tot) && /Total checks/.test(tot), 'the Totals tiles cover Processing, Sick & Injured, Surgery and the total');
    t.ok(await stats.page.locator('#response-rate-section').count() === 1 && await stats.page.locator('#surveillance-section').count() === 1, 'response-rate and disease-export sections are on the stats page');
    t.ok((await stats.page.locator('#response-rate-chart svg').count()) >= 1, 'response-rate chart drawn');
    t.ok(await stats.page.locator('a[href="index.html"]').count() >= 1, 'link back to the dashboard');
    await stats.page.waitForSelector('#surv-dash .heat-tile');
    t.ok(await stats.page.locator('#surv-dash .surv-pane.on .heat-tile').count() === 7, 'a tile for each of the 7 cat spaces (the Cats pane)');
    const tile = name => stats.page.locator('#surv-dash .heat-tile', { hasText: name }).first().textContent();
    t.ok(/6\.7%/.test(await tile('Cat Room 1')) && /2 cases · 30 cages/.test(await tile('Cat Room 1')), 'Cat Room 1: 2 cases / 30 cages = 6.7%');
    t.ok(/Cat flu \(URI\)/.test(await stats.page.textContent('#surv-dash .rk-list')) && /2 animals/.test(await stats.page.textContent('#surv-dash .rk-list')), 'the ranking lists the most commonly reported sign (cat flu, 2 animals)');
    t.ok((await stats.page.textContent('#baseline-banner')).includes('Building your baseline — day 2 of 365'), 'baseline banner counts the 2 snapshot days out of a full year');
    t.ok(/Last snapshot: 20 .*2026/.test(await stats.page.textContent('#baseline-banner')), 'baseline banner shows the newest snapshot date');
    t.ok((await stats.page.$$eval('#surv-window option', os => os.map(o => o.textContent))).join() === 'This week,This month,This season,This year', 'the board can be set to this week / month / season / year');
    await stats.page.selectOption('#surv-window', 'week'); await stats.page.waitForTimeout(150);
    t.ok(await stats.page.locator('#surv-dash .surv-pane.on .heat-tile').count() === 7, 'switching the period redraws the board');
    t.ok((await stats.page.textContent('#heat-notes')).toLowerCase().includes('capacity'), 'the capacity / reported-rate caveat is shown');
    t.ok((await stats.page.textContent('#heat-notes')).toLowerCase().includes('two different signs'), 'the counting rule is stated');
    t.ok(!/outbreak|high risk|alert/i.test(await stats.page.textContent('#surveillance-section')), 'no alarm wording on the board');
    t.ok(!(await stats.page.textContent('#heat-notes')).includes('Showing the most recent 1000'), 'no row-cap note with a small seed');
    // a failed load shows the error, never a clean all-zero board
    await stats.page.evaluate(() => { window.__fail = { tasks: true }; });
    await stats.page.evaluate(() => loadSurveyData().then(renderSurvey));
    t.ok((await stats.page.textContent('#surv-dash')).includes('Could not load the flagged requests: boom') && await stats.page.locator('.heat-tile').count() === 0, 'a failed tasks query shows the error and no tiles');
    t.ok((await stats.page.innerHTML('#heat-notes')) === '', 'the notes are cleared on error');
    await stats.page.evaluate(() => { window.__fail = null; });
    await stats.page.evaluate(() => loadSurveyData().then(renderSurvey));
    // export report: clicking calls print, and the print layout shows only the surveillance board
    await stats.page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
    await stats.page.click('#report-export');
    t.ok((await stats.page.evaluate(() => window.__printed)) === 1, 'Export report opens the print dialog');
    try {
    await stats.page.emulateMedia({ media: 'print' });
    const vis = sel => stats.page.evaluate(s => { const e = document.querySelector(s); return !!e && e.getClientRects().length > 0; }, sel);
    t.ok(await vis('#surveillance-section') && await vis('#surv-dash .heat-grid') && await vis('#surv-dash .rk-list'), 'print layout shows the heat map and ranked signs');
    t.ok(await vis('#report-head'), 'print layout has a report title with the period and date');
    t.ok(!(await vis('aside')) && !(await vis('#surv-window')) && !(await vis('#report-export')), 'print layout hides the sidebar and the controls');
    t.ok(!(await vis('#period-totals')) && !(await vis('#response-rate-section')), 'print layout leaves out the other stats sections');
    t.ok(!(await vis('.page-head')) && !(await vis('#surveillance-section > h2')) && await vis('#report-head'), 'print layout shows only the report title, not the page heading or the section heading');
    } finally { await stats.page.emulateMedia({ media: 'screen' }); }
    t.ok(stats.errors.length === 0, 'no page errors on stats page: ' + stats.errors.join('; '));
  } finally { await stats.browser.close(); }
  // 1b. a thousand flagged requests (the API hands back 1000 at a time; the page reads them a page at a time)
  const many = await open({ tasks: Array.from({ length: 1000 }, (_, i) => Object.assign(flagged('cat_flu', 'Cat Room 1 / ' + (1 + i % 30)), { title: 'F-' + i })), locations: LOCATION_ROWS }, 'stats.html');
  try {
    await many.page.waitForSelector('#surv-dash .heat-tile');
    t.ok(/1000\s*Cases flagged|Cases flagged/.test(await many.page.textContent('#surv-dash')) && (await many.page.textContent('#surv-dash .kpi-row')).includes('1000') && !(await many.page.textContent('#heat-notes')).includes('Showing the most recent'), 'a thousand flagged requests are all read (it pages through them) and counted, with no cap warning');
  } finally { await many.browser.close(); }
  // 1b2. no snapshots yet
  const nosnap = await open({ tasks: seed.tasks, locations: LOCATION_ROWS }, 'stats.html');
  try {
    await nosnap.page.waitForSelector('#surv-dash .heat-tile');
    t.ok((await nosnap.page.textContent('#baseline-banner')).includes('No snapshot has been taken yet.'), 'no snapshots -> banner says so');
  } finally { await nosnap.browser.close(); }
  // 1c. migration 0009 not applied: only the not-set-up message
  const bare = await open({ tasks: seed.tasks }, 'stats.html');
  try {
    await bare.page.waitForSelector('#surv-dash .empty-state');
    t.ok((await bare.page.textContent('#surv-dash')).includes('run migration 0009'), 'no spaces list -> set-up message');
    t.ok((await bare.page.innerHTML('#baseline-banner')) === '' && (await bare.page.innerHTML('#heat-notes')) === '', 'banner and notes are empty without the spaces list');
  } finally { await bare.browser.close(); }
  // 2. the dashboard no longer carries them, and links to stats
  const dash = await open(seed);
  try {
    t.ok(await dash.page.locator('#response-rate-section, #surveillance-section').count() === 0, 'dashboard does not carry the response-rate or disease-surveillance sections (they live on the stats page)');
    t.ok(await dash.page.locator('aside a[href="stats.html"]').count() === 1, 'dashboard sidebar links to the stats page');
    t.ok(dash.errors.length === 0, 'no page errors on dashboard: ' + dash.errors.join('; '));
  } finally { await dash.browser.close(); }
  t.done();
})();
