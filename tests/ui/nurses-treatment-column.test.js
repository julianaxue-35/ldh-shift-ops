// A treatment check / due task is for the Processing nurse (same visit as microchip / UV), with the Processing initials.
const { open } = require('./harness');
const t = require('./check')('nurses-treatment-column');
(async () => {
  const n = await open({ noga_requests: [{ animal_id: 'TR-1', location: 'Pathway', task: 'treatment', done: false }, { animal_id: 'BL-1', location: 'Cat Room 1 / 2', task: 'blood', done: false }] }, 'nurses.html');
  try {
    t.ok(/TR-1/.test(await n.page.textContent('#processing-col #proc-misc-list')) && !/TR-1/.test(await n.page.textContent('#welfare-col')), 'the treatment check is in the Processing column, not the Welfare one');
    t.ok(/BL-1/.test(await n.page.textContent('#welfare-col #noga-list')), 'other misc tasks stay with the Welfare nurse');
    await n.page.fill('#initials-processing', 'cd'); await n.page.fill('#initials-welfare', 'ab');
    await n.page.locator('#proc-misc-list .noga-item', { hasText: 'TR-1' }).locator('.noga-done').click();
    await n.page.waitForTimeout(300);
    const r = (await n.db()).noga_requests.find(x => x.animal_id === 'TR-1');
    t.ok(r.done && r.done_by === 'CD', 'done is stamped with the Processing initials: ' + r.done_by);
    t.ok(/Treatment check/.test(await n.page.textContent('#processing-col')), 'it is labelled Treatment check / due');
    t.ok(n.errors.length === 0, 'no page errors: ' + n.errors.join('; '));
  } finally { await n.browser.close(); }
  t.done();
})();
