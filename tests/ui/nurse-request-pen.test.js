// 2026-11-18: the dashboard vaccination request has a Pen / Detail # box; it is saved as "room / pen".
const { open } = require('./harness');
const t = require('./check')('nurse-request-pen');
(async () => {
  const { browser, page, errors, db } = await open();
  try {
    await page.click('.sr-tab[data-sr="nurses"]');
    await page.selectOption('#nr-species', 'dog'); await page.selectOption('#nr-location', 'Pound 2');
    await page.fill('#nr-pen', '5, 6'); await page.fill('#nr-count', '2'); await page.click('#nr-now'); await page.click('#nr-submit');
    await page.waitForTimeout(300);
    const r = (await db()).nurse_requests;
    t.ok(r.length === 1 && r[0].location === 'Pound 2 / 5, 6', 'dog vaccination saved with room / pen: ' + (r[0] && r[0].location));
    t.ok((await page.inputValue('#nr-pen')) === '', 'the pen box clears after sending');
    t.ok(errors.length === 0, 'no page errors: ' + errors.join('; '));
  } finally { await browser.close(); }
  t.done();
})();
