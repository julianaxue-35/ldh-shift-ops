// A vet who picks a case up puts their initials on it; only that vet can put it back. Fictional animals only.
const { open } = require('./harness');
const t = require('./check')('vet-claim');
const ago = ms => new Date(Date.now() - ms).toISOString();
const H = 3600 * 1000;

(async () => {
  const v = await open({ tasks: [
    { title: 'CLAIM-1', location: 'Pound 1', shift: 'sick_injured', type: 'shelter', urgency: 'urgent', created_at: ago(2 * H), claimed_at: null, done: false },
    { title: 'CLAIM-2', location: 'Pound 2', shift: 'sick_injured', type: 'shelter', urgency: 'urgent', created_at: ago(2 * H), claimed_at: ago(0.5 * H), claimed_by: 'AB', done: false }
  ] }, 'vets.html');
  try {
    t.ok(await v.page.inputValue('#vet-initials') === 'JX', 'the day\'s initials sit in one box at the top left');
    const card = n => v.page.locator('.attn-item', { hasText: n });
    t.ok(await card('CLAIM-2').locator('.pick-up-btn').count() === 0, 'a case another vet picked up cannot be picked up');
    t.ok(/by\s*AB/.test(await card('CLAIM-2').textContent()), 'the card shows who picked it up');

    await card('CLAIM-1').locator('.pick-up-btn').click();
    await v.page.waitForFunction(() => /by\s*JX/.test(document.body.textContent));
    t.ok((await v.db()).tasks.find(x => x.title === 'CLAIM-1').claimed_by === 'JX', 'picking up stamps the box initials with no prompt');

    // another vet (initials CD) cannot put AB's case back
    await v.page.fill('#vet-initials', 'cd');
    await card('CLAIM-2').locator('.put-back-btn').click();
    await v.page.waitForTimeout(300);
    let row = (await v.db()).tasks.find(x => x.title === 'CLAIM-2');
    t.ok(row.claimed_at != null && row.claimed_by === 'AB', 'another vet cannot put the case back');

    await v.page.fill('#vet-initials', 'ab');
    await card('CLAIM-2').locator('.put-back-btn').click();
    await v.page.waitForTimeout(300);
    row = (await v.db()).tasks.find(x => x.title === 'CLAIM-2');
    t.ok(row.claimed_at == null && row.claimed_by == null, 'the vet who picked it up can put it back');
    t.ok(!(await v.page.locator('#send-request [data-f="initials"]').count()), 'the request card has no second initials box');
    t.ok(v.errors.length === 0, 'no page errors: ' + JSON.stringify(v.errors));
  } finally { await v.browser.close(); }

  // no initials typed yet: nothing is picked up, and the box is pointed out
  const e = await open({ tasks: [{ title: 'CLAIM-3', location: 'Pound 3', shift: 'sick_injured', type: 'shelter', urgency: 'urgent', created_at: ago(2 * H), claimed_at: null, done: false }] }, 'vets.html', { noVetInit: true });
  try {
    t.ok(await e.page.inputValue('#vet-initials') === '', 'the box starts empty on a fresh day');
    await e.page.locator('.attn-item', { hasText: 'CLAIM-3' }).locator('.pick-up-btn').click();
    await e.page.waitForTimeout(300);
    t.ok((await e.db()).tasks.find(x => x.title === 'CLAIM-3').claimed_at == null, 'without initials the case is not picked up');
    await e.page.fill('#vet-initials', 'kl');
    await e.page.locator('.attn-item', { hasText: 'CLAIM-3' }).locator('.pick-up-btn').click();
    await e.page.waitForFunction(() => window.__db.tasks.find(x => x.title === 'CLAIM-3').claimed_by === 'KL');
    t.ok(true, 'with initials typed once, pick-up is stamped KL');
  } finally { await e.browser.close(); }
  t.done();
})();
