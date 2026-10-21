// Vets and nurses can give a task to the behaviour team from their own pages (not only from the shelter staff page).
const { open } = require('./harness');
const t = require('./check')('task-for-behaviour');
async function run(pageName, selector, label) {
  const p = await open({}, pageName);
  try {
    await p.page.waitForSelector(selector, { timeout: 5000 });
    await p.page.click(selector);
    t.ok(await p.page.locator('.bt-overlay').count() === 1, label + ': the button opens the request window');
    await p.page.click('.bt-confirm');
    t.ok(/animal ID/i.test(await p.page.textContent('.bt-error')), label + ': asks for the animal ID');
    await p.page.fill('.bt-animal', 'BEH-7'); await p.page.selectOption('.bt-kind', 'behaviour_review');
    await p.page.click('.bt-confirm');
    t.ok(/reason/i.test(await p.page.textContent('.bt-error')), label + ': a review needs the reason');
    await p.page.fill('.bt-reason', 'growling over food');
    await p.page.click('.bt-confirm');
    t.ok(/initials/i.test(await p.page.textContent('.bt-error')), label + ': and initials');
    t.ok((await p.db()).behaviour_tasks.length === 0, label + ': nothing written without initials');
    await p.page.fill('.bt-initials', 'rk');
    await p.page.selectOption('.bt-room', 'Pound 1'); await p.page.fill('.bt-pen', '3');
    await p.page.selectOption('.bt-window', '30_60m');
    await p.page.click('.bt-confirm');
    await p.page.waitForFunction(() => window.__db.behaviour_tasks.length === 1);
    const r = (await p.db()).behaviour_tasks[0];
    t.ok(r.lane === 'incoming' && r.location === 'Pound 1 / 3' && r.flagged_by === 'RK' && r.due_window === '30_60m' && r.reason === 'growling over food', label + ': lands in Incoming with place, time frame, reason, initials');
    t.ok(await p.page.locator('.bt-overlay').count() === 0, label + ': the window closes');
    await p.page.click(selector);
    t.ok(await p.page.inputValue('.bt-initials') === 'RK', label + ': initials are remembered on this device');
    t.ok(p.errors.length === 0, label + ': no page errors: ' + p.errors.join('; '));
  } finally { await p.browser.close(); }
}
(async () => {
  await run('vets.html', '.bt-open', 'vets');
  await run('nurses.html', '#welfare-col .bt-open', 'nurses');
  t.done();
})();
