const { open } = require('./harness');
const t = require('./check')('memos');
(async () => {
  const { browser, page, errors, db } = await open({ memos: [
    { author: 'Vet team', text: 'Active one', done: false },
    { author: 'Vet team', text: 'Active two', done: false },
    { author: 'Vet team', text: 'Old done', done: true, done_at: new Date().toISOString() }] });
  try {
    await page.selectOption('#role-select', 'vet_nurse');
    await page.waitForTimeout(200);
    t.ok(await page.locator('#memo-list .memo').count() === 2, 'two active memos shown');
    t.ok((await page.textContent('#memo-completed-toggle')).includes('Show completed (1)'), 'completed toggle shows the count');

    await page.locator('.memo', { hasText: 'Active one' }).locator('.memo-tick').click();
    await page.waitForTimeout(250);
    t.ok(await page.locator('#memo-list .memo').count() === 1, 'ticked memo leaves the active list');
    const m = (await db()).memos.find(x => x.text === 'Active one');
    t.ok(m.done === true && !!m.done_at, 'memo kept with done + done_at');

    await page.click('#memo-completed-toggle');
    t.ok(await page.locator('#memo-completed-list .memo').count() === 2, 'completed list shows both ticked memos');

    await page.locator('#memo-completed-list .memo', { hasText: 'Old done' }).locator('.memo-del').click();
    await page.waitForTimeout(250);
    t.ok((await db()).memos.length === 2, 'delete removes the memo (confirm accepted)');

    await page.locator('#memo-completed-list .memo', { hasText: 'Active one' }).locator('.memo-tick').click();
    await page.waitForTimeout(250);
    t.ok(await page.locator('#memo-list .memo').count() === 2, 'un-ticking returns it to the active list');
    t.ok(errors.length === 0, 'no page errors: ' + errors.join('; '));
  } finally {
    await browser.close();
  }
  t.done();
})();
