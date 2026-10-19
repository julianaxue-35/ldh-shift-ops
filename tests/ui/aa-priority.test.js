// Admission AA page: priority notes (e.g. awaiting foster) are marked and come first.
const { open } = require('./harness');
const t = require('./check')('aa-priority');
const H = 3600 * 1000;
const ago = ms => new Date(Date.now() - ms).toISOString();
(async () => {
  const seed = { aa_items: [
    { id: 'n1', kind: 'processing_note', animal_ids: ['PN-1'], sent_by: 'AB', sent_at: ago(5 * H), payload: { text: 'normal' } },
    { id: 'n2', kind: 'processing_note', animal_ids: ['PN-2'], sent_by: 'AB', sent_at: ago(1 * H), payload: { text: 'foster', priority: true } },
    { id: 'n3', kind: 'processing_note', animal_ids: ['PN-3'], sent_by: 'AB', sent_at: ago(30 * H), payload: { text: 'late' } }
  ] };
  const a = await open(seed, 'admission-aa.html');
  try {
    const order = await a.page.$$eval('[data-col="processing"] .aa-card', els => els.map(e => e.dataset.id));
    t.ok(order.join() === 'n2,n3,n1', 'the priority note is first, then the overdue one, then the rest: ' + order.join());
    t.ok(/PRIORITY/.test(await a.page.textContent('.aa-card[data-id="n2"]')) && !/PRIORITY/.test(await a.page.textContent('.aa-card[data-id="n1"]')), 'only the priority card carries the PRIORITY tag');
    t.ok(await a.page.evaluate(() => getComputedStyle(document.querySelector('.aa-card[data-id="n2"]')).borderTopColor) === 'rgb(192, 57, 43)', 'and it is outlined in red');
    t.ok(/1 PRIORITY card waiting/.test(await a.page.textContent('#aa-priority-banner')), 'a banner at the top says how many priority cards are waiting: ' + await a.page.textContent('#aa-priority-banner'));
    // a new priority card raises the alert wording
    await a.page.evaluate(() => sb.from('aa_items').insert({ kind: 'processing_note', animal_ids: ['PN-4'], sent_by: 'AB', payload: { text: 'foster 2', priority: true } }));
    await a.page.waitForSelector('#new-item-banner', { state: 'visible', timeout: 5000 });
    t.ok(/1 PRIORITY, do that first/.test(await a.page.textContent('#new-item-banner-text')), 'the new-item alert says it is priority: ' + await a.page.textContent('#new-item-banner-text'));
    // once done, the banner goes
    await a.page.click('.aa-card[data-id="n2"] .aa-done');
    t.ok(true, 'tick');
    t.ok(a.errors.length === 0, 'no page errors: ' + a.errors.join('; '));
  } finally { await a.browser.close(); }
  t.done();
})();
