// 2026-11-18: the initials box is in the same place on every dashboard page that asks for initials: the sidebar, under the menu.
const { open } = require('./harness');
const t = require('./check')('initials-same-place');
(async () => {
  const pages = { 'index.html': ['sr-initials'], 'vets.html': ['vet-initials'], 'behaviour.html': ['bh-initials'], 'admission-aa.html': ['aa-my-initials'], 'nurses.html': ['initials-welfare', 'initials-processing'] };
  for (const [file, ids] of Object.entries(pages)) {
    const p = await open({}, file);
    try {
      await p.page.setViewportSize({ width: 1200, height: 900 });
      const nav = await p.page.$eval('#ops-nav', e => e.getBoundingClientRect().bottom);
      let prev = nav, ok = true;
      for (const id of ids) {
        const inAside = await p.page.locator('aside #' + id).count() === 1;
        const y = await p.page.$eval('#' + id, e => e.getBoundingClientRect().top);
        if (!inAside || y < prev - 1 || y - nav > 200) ok = false; prev = y;
      }
      t.ok(ok, file + ': initials in the sidebar straight under the menu (' + ids.join(', ') + ')');
      const label = await p.page.$eval('aside', a => a.textContent);
      t.ok(/initials \(kept on this device today\)/i.test(label), file + ': same wording, "initials (kept on this device today)"');
      t.ok(p.errors.length === 0, file + ': no page errors ' + p.errors.join('; '));
    } finally { await p.browser.close(); }
  }
  t.done();
})();
