// Stats page: surgery breakdown by species, routine vs non-routine, for the week / month / quarter / year.
const { open } = require('./harness');
const t = require('./check')('surgery-stats');
(async () => {
  const now = Date.now();
  const at = (d) => new Date(now - d * 86400000).toISOString();
  const seed = { surgery_log: [
    { id: 's1', done_at: at(0), species: 'cat', procedure: 'spey', routine: true },
    { id: 's2', done_at: at(0), species: 'cat', procedure: 'castrate', routine: true },
    { id: 's3', done_at: at(0), species: 'dog', procedure: 'dental', routine: false },
    { id: 's4', done_at: at(0), species: 'rabbit', procedure: 'spey', routine: true },
    { id: 's5', done_at: at(0), species: 'other', procedure: 'other', routine: false }
  ] };
  const s = await open(seed, 'stats.html');
  try {
    await s.page.waitForSelector('#surgery-breakdown-grid .kpi-row');
    const G = '#surgery-breakdown-grid ';
    const text = async () => (await s.page.innerText(G + '.kpi-row')).replace(/\s+/g, ' ');
    const chart = async () => (await s.page.innerText(G)).replace(/\s+/g, ' ');
    await s.page.click(G + '[data-seg="sur-period"] [data-v="year"]');
    t.ok(/5 TOTAL SURGERIES/i.test(await text()) && /3 ROUTINE/i.test(await text()) && /2 NON-ROUTINE/i.test(await text()), 'totals: 3 routine, 2 non-routine, 5 in all: ' + await text());
    t.ok(/Cats/.test(await chart()) && /Dogs/.test(await chart()) && /Rabbits/.test(await chart()) && /Other species/.test(await chart()), 'cats, dogs, rabbits and other species each have a line');
    await s.page.click(G + '[data-seg="sur-kind"] [data-v="routine"]');
    t.ok(await s.page.locator(G + '[data-seg="sur-kind"] [data-v="routine"].on').count() === 1, 'the Routine filter can be chosen');
    await s.page.click(G + '[data-seg="sur-kind"] [data-v="other"]');
    t.ok(await s.page.locator(G + '[data-seg="sur-kind"] [data-v="other"].on').count() === 1 && /5 TOTAL SURGERIES/i.test(await text()), 'the Non-routine filter can be chosen');
    t.ok(await s.page.isVisible('#surgery-breakdown'), 'the card is on the stats page');
    t.ok(s.errors.length === 0, 'no page errors: ' + s.errors.join('; '));
  } finally { await s.browser.close(); }
  t.done();
})();
