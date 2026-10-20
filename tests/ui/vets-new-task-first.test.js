// Vets page: the "New task" form for a nurse task sits above the list of tasks already requested.
const { open } = require('./harness');
const t = require('./check')('vets-new-task-first');
(async () => {
  const v = await open({ noga_requests: [{ animal_id: 'OLD-1', location: 'Pound 1', task: 'other', note: 'earlier', added_by: 'Vet team', done: false }] }, 'vets.html');
  try {
    await v.page.waitForSelector('#misc-list .attn-item');
    const y = sel => v.page.$eval(sel, e => Math.round(e.getBoundingClientRect().top));
    t.ok(await y('#mt-animal') < await y('#misc-list'), 'the new-task form is above the list of earlier tasks');
    t.ok(/OLD-1/.test(await v.page.textContent('#misc-list')), 'the earlier task is still listed');
    await v.page.fill('#mt-animal', 'NEW-1'); await v.page.click('#mt-submit');
    await v.page.waitForFunction(() => window.__db.noga_requests.length === 2);
    await v.page.waitForFunction(() => /NEW-1/.test(document.getElementById('misc-list').textContent));
    const rows = await v.page.$$eval('#misc-list .attn-item', rs => rs.map(r => r.textContent));
    t.ok(/NEW-1/.test(rows[0]) && /OLD-1/.test(rows[1]), 'a task just requested appears at the top of the list');
    t.ok(v.errors.length === 0, 'no page errors: ' + v.errors.join('; '));
  } finally { await v.browser.close(); }
  t.done();
})();
