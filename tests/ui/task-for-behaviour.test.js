// Vets and nurses can give a task to the behaviour team from their own pages (not only from the shelter staff page), using the one request card.
const { open } = require('./harness');
const t = require('./check')('task-for-behaviour');
async function run(pageName, opener, label, inline) {
  const p = await open({}, pageName);
  const root = inline ? '#send-request' : '.sc-overlay';
  const P = root + ' .sc-panel[data-to="behaviour"] ';
  const F = f => P + '[data-f="' + f + '"]';
  try {
    await p.page.waitForSelector(opener, { timeout: 5000 });
    if (!inline) await p.page.click(opener);
    await p.page.click(root + ' .sc-tab[data-sc="behaviour"]');
    t.ok(await p.page.isVisible(P), label + ': the Behaviour tab shows the behaviour form');
    await p.page.click(P + '[data-send="behaviour"]');
    t.ok(/animal ID/i.test(await p.page.textContent(P + '[data-msg]')), label + ': asks for the animal ID');
    await p.page.fill(F('animal'), 'BEH-7'); await p.page.selectOption(F('kind'), 'behaviour_review');
    await p.page.click(P + '[data-send="behaviour"]');
    t.ok(/initials/i.test(await p.page.textContent(P + '[data-msg]')), label + ': and initials');
    await p.page.fill(root + ' [data-f="initials"]', 'rk');
    await p.page.click(P + '[data-send="behaviour"]');
    t.ok(/reason/i.test(await p.page.textContent(P + '[data-msg]')), label + ': a review needs the reason');
    t.ok((await p.db()).behaviour_tasks.length === 0, label + ': nothing written yet');
    await p.page.fill(F('note'), 'growling over food');
    await p.page.selectOption(F('room'), 'Pound 1'); await p.page.fill(F('pen'), '3');
    await p.page.selectOption(F('window'), '30_60m');
    await p.page.click(P + '[data-send="behaviour"]');
    await p.page.waitForFunction(() => window.__db.behaviour_tasks.length === 1);
    const r = (await p.db()).behaviour_tasks[0];
    t.ok(r.lane === 'incoming' && r.location === 'Pound 1 / 3' && r.flagged_by === 'RK' && r.due_window === '30_60m' && r.reason === 'growling over food', label + ': lands in Incoming with place, time frame, reason and initials');
    t.ok(p.errors.length === 0, label + ': no page errors: ' + p.errors.join('; '));
  } finally { await p.browser.close(); }
}
(async () => {
  await run('vets.html', '#send-request .sc-tab[data-sc="behaviour"]', 'vets', true);
  await run('nurses.html', '#welfare-col .send-card-open', 'nurses', false);
  t.done();
})();
