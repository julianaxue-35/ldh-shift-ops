// Vets page: the one request card sits above the lists of tasks and courses already requested.
const { open } = require('./harness');
const t = require('./check')('vets-new-task-first');
(async () => {
  const v = await open({ noga_requests: [{ animal_id: 'OLD-1', location: 'Pound 1', task: 'other', note: 'earlier', added_by: 'Vet team', done: false }] }, 'vets.html');
  try {
    await v.page.waitForSelector('#misc-list .attn-item');
    const F = f => '#send-request .sc-panel[data-to="nurses"] [data-f="' + f + '"]';
    const y = sel => v.page.$eval(sel, e => Math.round(e.getBoundingClientRect().top));
    t.ok(await y(F('animal')) < await y('#misc-list'), 'the request card is above the list of earlier tasks');
    t.ok(/OLD-1/.test(await v.page.textContent('#misc-list')), 'the earlier task is still listed');
    await v.page.fill(F('animal'), 'NEW-1'); await v.page.fill('#send-request [data-f="initials"]', 'jx'); await v.page.selectOption(F('kind'), 'blood'); await v.page.click('[data-send="nurses"]');
    await v.page.waitForFunction(() => window.__db.noga_requests.length === 2);
    await v.page.waitForFunction(() => /NEW-1/.test(document.getElementById('misc-list').textContent));
    const rows = await v.page.$$eval('#misc-list .attn-item', rs => rs.map(r => r.textContent));
    t.ok(/NEW-1/.test(rows[0]) && /OLD-1/.test(rows[1]), 'a task just requested appears at the top of the list');
    await v.page.selectOption(F('kind'), 'course');
    await v.page.fill(F('animal'), 'TRT-1'); await v.page.fill(F('treatment'), 'flush site'); await v.page.click('[data-send="nurses"]');
    await v.page.waitForFunction(() => window.__db.nurse_treatments.length === 1);
    await v.page.waitForFunction(() => /TRT-1/.test(document.getElementById('nt-courses').textContent));
    t.ok(await y(F('animal')) < await y('#nt-courses'), 'the card is above the courses in progress');
    t.ok(v.errors.length === 0, 'no page errors: ' + v.errors.join('; '));
  } finally { await v.browser.close(); }
  t.done();
})();
