// Asking the nurses for several tasks on one animal at once (bloods + FIV test). Fictional animals only.
const { open } = require('./harness');
const t = require('./check')('nurse-multi-task');

(async () => {
  const v = await open({}, 'vets.html');
  try {
    const P = '#send-request .sc-panel[data-to="nurses"] ';
    await v.page.click('#send-request .sc-tab[data-sc="nurses"]');
    await v.page.fill('#vet-initials', 'jx');

    t.ok(await v.page.locator(P + '[data-more="dispense"], ' + P + '[data-more="other"]').count() === 0, 'Dispense and Other are not offered as extras (they need their own note)');
    await v.page.fill(P + '[data-f="animal"]', 'MULTI-1');
    await v.page.selectOption(P + '[data-f="kind"]', 'blood');
    t.ok(!(await v.page.locator(P + '[data-more-wrap="blood"]').isVisible()), 'the chosen task is not offered again');
    await v.page.check(P + '[data-more="fiv_test"]');
    await v.page.fill(P + '[data-f="note"]', 'pre-op');
    await v.page.click(P + '.sc-send');
    await v.page.waitForFunction(() => window.__db.noga_requests.length === 2);
    const rows = (await v.db()).noga_requests.filter(r => r.animal_id === 'MULTI-1');
    t.ok(rows.map(r => r.task).sort().join() === 'blood,fiv_test', 'one request per task: ' + rows.map(r => r.task));
    t.ok(rows.every(r => r.note === 'pre-op' && r.added_by === 'JX'), 'each carries the note and the initials');
    t.ok(!(await v.page.locator(P + '[data-more="fiv_test"]').isChecked()), 'extras are cleared after sending');

    // a treatment course hides the extras
    await v.page.selectOption(P + '[data-f="kind"]', 'course');
    t.ok(!(await v.page.locator(P + '.sc-more').isVisible()), 'extras are hidden for a treatment course');

    // single task still sends one request
    await v.page.selectOption(P + '[data-f="kind"]', 'ear_swab');
    await v.page.fill(P + '[data-f="animal"]', 'MULTI-2');
    await v.page.click(P + '.sc-send');
    await v.page.waitForFunction(() => window.__db.noga_requests.length === 3);
    t.ok((await v.db()).noga_requests.filter(r => r.animal_id === 'MULTI-2').length === 1, 'a single task sends a single request');
    t.ok(v.errors.length === 0, 'no page errors: ' + JSON.stringify(v.errors));
  } finally { await v.browser.close(); }
  t.done();
})();
