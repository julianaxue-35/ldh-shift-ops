const { open } = require('./harness');
const t = require('./check')('stats-page');
const ago = ms => new Date(Date.now() - ms).toISOString();
const D = 24 * 3600 * 1000;
(async () => {
  const done = (shift, agoMs) => ({ title: 'T-' + Math.random().toString(36).slice(2, 6), location: 'Pound 1', shift, type: 'shelter', urgency: 'routine', done: true, created_at: ago(agoMs + 3600000), completed_at: ago(agoMs) });
  const flagged = (condition, loc) => ({ title: 'F-' + Math.random().toString(36).slice(2, 6), location: loc, shift: 'sick_injured', type: 'shelter', urgency: 'routine', done: false, condition, created_at: new Date().toISOString() });
  const seed = { tasks: [done('surgery', 1 * D), done('surgery', 2 * D), done('processing', 3 * D), done('sick_injured', 1 * D),
    flagged('cat_flu', 'Cat Room 1 / 4'), flagged('cat_flu', 'Cat Room 1 / 5'), flagged('kennel_cough', 'Pound 2 / 3')] };
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
    await stats.page.waitForSelector('#surveillance-conditions');
    const cond = await stats.page.textContent('#surveillance-conditions');
    t.ok(['Cat flu (URI)', 'Kennel cough', 'Diarrhoea / GI upset', 'Wounds / injury / trauma', 'Other'].every(l => cond.includes(l)), 'every surveillance condition is listed on screen');
    const rowOf = label => stats.page.locator('#surveillance-conditions tr', { hasText: label }).first().textContent();
    t.ok(/Cat flu \(URI\)\s*2/.test(await rowOf('Cat flu (URI)')) && /Kennel cough\s*1/.test(await rowOf('Kennel cough')) && /Diarrhoea \/ GI upset\s*0/.test(await rowOf('Diarrhoea')), 'counts per condition are right (flu 2, kennel cough 1, diarrhoea 0)');
    const locs = await stats.page.textContent('#surveillance-locations');
    t.ok(locs.includes('Cat Room 1 / 4') && locs.includes('Pound 2 / 3'), 'the by-space table lists where they were flagged');
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
