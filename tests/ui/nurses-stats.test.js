// Nurses page: the team-activity card under the memo board (rings + daily averages), no targets.
const { open } = require('./harness');
const t = require('./check')('nurses-stats');
const dayKey = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

(async () => {
  const today = new Date();
  const daysAgo = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return dayKey(d); };
  const n = await open({}, 'nurses.html');
  try {
    await n.page.evaluate(({ a, b, c }) => {
      window.__nurseCounts = [
        { day: a, role: 'welfare', n: 12 }, { day: b, role: 'welfare', n: 8 }, { day: c, role: 'welfare', n: 10 },
        { day: a, role: 'processing', n: 4 }
      ];
      return loadAll();
    }, { a: daysAgo(0), b: daysAgo(1), c: daysAgo(40) });
    const order = await n.page.evaluate(() => {
      const memo = document.getElementById('memo-board').getBoundingClientRect().top;
      const st = document.getElementById('nurse-stats').getBoundingClientRect().top;
      return { memo, st, after: document.getElementById('memo-board').nextElementSibling.id };
    });
    t.ok(order.st > order.memo && order.after === 'nurse-stats', 'the card sits directly under the memo board');
    const w = (await n.page.textContent('[data-role="welfare"]')).replace(/\s+/g, ' ');
    t.ok(/Welfare nurse/.test(w) && />/.test('>') && /12/.test(await n.page.textContent('[data-role="welfare"] svg')), 'the Welfare ring shows today\'s count');
    t.ok(/This year/.test(w) && /This season/.test(w) && /This month/.test(w) && /This week/.test(w), 'week, month, season and year rows are shown');
    const yearRow = (await n.page.textContent('[data-role="welfare"] tr[data-period="year"]')).replace(/\s+/g, ' ');
    t.ok(/30/.test(yearRow) && /10/.test(yearRow), 'year: 30 tasks over 3 working days = 10 per working day: ' + yearRow);
    t.ok(/4/.test(await n.page.textContent('[data-role="processing"] svg')), 'the Processing ring is separate');
    t.ok(!/target|goal/i.test(await n.page.textContent('#nurse-stats')), 'no targets or goals are mentioned');
    t.ok(n.errors.length === 0, 'no page errors: ' + n.errors.join('; '));
  } finally { await n.browser.close(); }
  t.done();
})();
