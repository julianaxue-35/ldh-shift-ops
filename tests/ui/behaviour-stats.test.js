// Behaviour page: a ring and totals for finished cases (counts only), like the nurses and Admission AA pages.
const { open } = require('./harness');
const t = require('./check')('behaviour-stats');
const dayKey = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
(async () => {
  const today = new Date();
  const daysAgo = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return dayKey(d); };
  const b = await open({}, 'behaviour.html');
  try {
    await b.page.waitForSelector('#bh-stats');
    t.ok(/latest database update/.test(await b.page.textContent('#bh-stats-body')) === false, 'with no counts yet it shows zeros, not an error (the function exists)');
    await b.page.evaluate(({ a, c, d }) => {
      window.__behaviourCounts = [
        { day: a, cat: 'courthold', n: 2 }, { day: a, cat: 'behaviour_review', n: 1 },
        { day: c, cat: 'incident_review', n: 3 }, { day: d, cat: 'courthold', n: 4 }
      ];
      return loadAll();
    }, { a: daysAgo(0), c: daysAgo(1), d: daysAgo(40) });
    t.ok(/3/.test(await b.page.textContent('#bh-stats svg')) && /CASES TODAY/.test(await b.page.textContent('#bh-stats svg')), 'the ring shows today\'s cases (2 courthold + 1 review = 3)');
    const year = (await b.page.textContent('#bh-stats tr[data-period="year"]')).replace(/\s+/g, ' ');
    t.ok(/10/.test(year), 'year: 10 cases: ' + year);
    const avg = await b.page.$$eval('#bh-stats tr[data-period="year"] td', tds => tds.map(x => x.textContent.trim()));
    t.ok(avg[1] === '10' && avg[2] === '3.3' && avg[3] === '6' && avg[4] === '3', 'year row: cases 10, 3.3 per working day (3 days), courthold 6, incident reviews 3: ' + avg);
    for (const p of ['week', 'month', 'quarter', 'year']) t.ok(await b.page.locator('#bh-stats tr[data-period="' + p + '"]').count() === 1, p + ' row is shown');
    t.ok(!/target|goal/i.test(await b.page.textContent('#bh-stats')), 'no targets or goals');
    t.ok(b.errors.length === 0, 'no page errors: ' + b.errors.join('; '));
  } finally { await b.browser.close(); }
  t.done();
})();
