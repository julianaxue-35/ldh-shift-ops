const { open } = require('./harness');
const t = require('./check')('behaviour-mobile');
(async () => {
  for (const [name, w, h] of [['phone', 390, 800], ['tablet', 820, 1100]]) {
    for (const pg of ['behaviour.html', 'index.html']) {
      const b = await open({ behaviour_tasks: [{ animal_id: 'BEH-1', kind: 'behaviour_review', location: 'Cat Room 1 / 3', lane: 'tl', due_window: 'today', reason: 'x', status: 'open', history: [] }] }, pg, { contextOptions: { viewport: { width: w, height: h } } });
      try {
        await b.page.waitForTimeout(300);
        const over = await b.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        t.ok(over <= 1, `${name} ${pg}: no sideways scroll (${over}px)`);
        if (pg === 'behaviour.html' && name === 'phone') {
          const tops = await b.page.evaluate(() => ['lane-tl', 'lane-cat', 'lane-dog'].map(i => document.getElementById(i).getBoundingClientRect().top));
          t.ok(tops[0] < tops[1] && tops[1] < tops[2], 'phone: TL, Cat assist, Dog assist stack in one column');
        }
      } finally { await b.browser.close(); }
    }
  }
  t.done();
})();
