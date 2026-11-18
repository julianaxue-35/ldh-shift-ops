// 2026-11-18: the initials box is in the same place on every dashboard page that asks for initials:
// the top bar on a desktop, the sidebar (under the menu) on a phone. It is ONE element that moves, so its value never changes.
const { open } = require('./harness');
const t = require('./check')('initials-same-place');
(async () => {
  const pages = { 'index.html': ['sr-initials'], 'vets.html': ['vet-initials'], 'behaviour.html': ['bh-initials'], 'admission-aa.html': ['aa-my-initials'], 'nurses.html': ['initials-welfare', 'initials-processing'] };
  for (const [file, ids] of Object.entries(pages)) {
    const p = await open({}, file);
    try {
      await p.page.setViewportSize({ width: 1200, height: 900 });
      await p.page.waitForTimeout(150);
      let top = true;
      for (const id of ids) top = top && await p.page.locator('main .page-head #' + id).count() === 1 && await p.page.isVisible('#' + id);
      t.ok(top, file + ': desktop: initials in the top bar (' + ids.join(', ') + ')');
      await p.page.fill('#' + ids[0], 'jx'); await p.page.dispatchEvent('#' + ids[0], 'change');
      await p.page.setViewportSize({ width: 390, height: 800 }); await p.page.waitForTimeout(150);
      let side = true;
      for (const id of ids) side = side && await p.page.locator('aside #' + id).count() === 1 && await p.page.isVisible('#' + id);
      t.ok(side, file + ': phone: the same box is in the sidebar under the menu');
      t.ok((await p.page.inputValue('#' + ids[0])).toUpperCase() === 'JX', file + ': and it still holds what was typed');
      t.ok(/initials/i.test(await p.page.$eval('aside', a => a.textContent)), file + ': sidebar wording says initials');
      await p.page.setViewportSize({ width: 1200, height: 900 }); await p.page.waitForTimeout(150);
      t.ok(await p.page.locator('main .page-head #' + ids[0]).count() === 1, file + ': back in the top bar on desktop');
      t.ok(p.errors.length === 0, file + ': no page errors ' + p.errors.join('; '));
    } finally { await p.browser.close(); }
  }
  t.done();
})();
