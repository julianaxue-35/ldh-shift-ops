const { open } = require('./harness');
const t = require('./check')('faq-phase-b');
// Every page with behaviour in it explains it in its FAQ; the three pages that had no FAQ now have one.
const PAGES = [
  ['behaviour.html', /Medical note from vets/, /Done/],
  ['admission-aa.html', /Entered in ShelterMate/, /PRIORITY/],
  ['shelter-board.html', /Waiting for vet/, /Behaviour team found/],
  ['index.html', /Behaviour task/, /Send straight to the Behaviour TL/],
  ['vets.html', /Task for behaviour/, /Send to Behaviour/],
  ['nurses.html', /Task for behaviour/, /initials/]
];
(async () => {
  for (const [file, a, b] of PAGES) {
    const p = await open({}, file);
    try {
      await p.page.waitForSelector('#faq-btn');
      t.ok(!(await p.page.isVisible('#faq-panel')), file + ': FAQ starts closed');
      await p.page.click('#faq-btn');
      await p.page.waitForSelector('#faq-panel.open');
      const text = await p.page.textContent('#faq');
      t.ok(a.test(text) && b.test(text), file + ': FAQ covers ' + a + ' and ' + b);
      await p.page.keyboard.press('Escape');
      t.ok(!(await p.page.isVisible('#faq-panel')), file + ': Escape closes it');
      t.ok(p.errors.length === 0, file + ': no page errors: ' + p.errors.join('|'));
    } finally { await p.browser.close(); }
  }
  t.done();
})();
