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
    await s.page.waitForSelector('#surgery-breakdown-grid .totals-period');
    const year = (await s.page.innerText('#surgery-breakdown-grid [data-period="year"]')).replace(/\s+/g, ' ');
    t.ok(/Cats 2 routine \u00b7 0 non-routine/.test(year), 'cats: 2 routine: ' + year);
    t.ok(/Dogs 0 routine \u00b7 1 non-routine/.test(year) && /Rabbits 1 routine \u00b7 0 non-routine/.test(year), 'dogs and rabbits are separate');
    t.ok(/Other species 0 routine \u00b7 1 non-routine/.test(year), 'other species only appear when there are some');
    t.ok(/Routine \(spey \/ castrate\) 3/.test(year) && /Non-routine 2/.test(year) && /Total surgeries 5/.test(year), 'totals: 3 routine, 2 non-routine, 5 in all');
    t.ok(await s.page.isVisible('#surgery-breakdown'), 'the card is on the stats page');
    t.ok(s.errors.length === 0, 'no page errors: ' + s.errors.join('; '));
  } finally { await s.browser.close(); }
  t.done();
})();
