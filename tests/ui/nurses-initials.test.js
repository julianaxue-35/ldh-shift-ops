// Nurses page: initials per column, remembered for the day and put on every tick automatically; AA form sits above the memo board.
const { open } = require('./harness');
const t = require('./check')('nurses-initials');
const H = 3600 * 1000;
const ago = ms => new Date(Date.now() - ms).toISOString();

(async () => {
  const seed = {
    noga_requests: [{ animal_id: 'FIV-1', location: 'Cat Room 1 / 4', task: 'fiv_test', done: false }, { animal_id: 'CH-1', location: 'Pathway', task: 'microchip', done: false }],
    nurse_requests: [{ kind: 'vaccination', location: 'Cat Room 2', species: 'cat', animal_count: 3, done_count: 0, arrived_at: ago(1 * H) }]
  };
  const a = await open(seed, 'nurses.html');
  try {
    const prompts = [];
    await a.page.evaluate(() => { window.__prompts = []; window.prompt = (m) => { window.__prompts.push(m); return null; }; });
    t.ok(await a.page.locator('#initials-box').count() === 0, 'the old shared sidebar initials box is gone');
    t.ok(await a.page.locator('#welfare-col #initials-welfare').count() === 1 && await a.page.locator('#processing-col #initials-processing').count() === 1, 'each column has its own initials box');

    /* each column stamps its own nurse, with no prompt */
    await a.page.fill('#initials-welfare', 'ab');
    await a.page.fill('#initials-processing', 'cd');
    await a.page.locator('.noga-item', { hasText: 'FIV-1' }).locator('.noga-done').click();
    await a.page.waitForTimeout(250);
    await a.page.locator('.attn-item.nr-item', { hasText: 'Cat Room 2' }).locator('.nr-claim').click();
    await a.page.waitForTimeout(250);
    await a.page.locator('#proc-misc-list .noga-item', { hasText: 'CH-1' }).locator('.noga-done').click();
    await a.page.waitForTimeout(250);
    const db = await a.db();
    t.ok(db.noga_requests.find(r => r.animal_id === 'FIV-1').done_by === 'AB', 'a welfare misc task is stamped with the Welfare initials');
    t.ok(db.nurse_requests[0].claimed_by === 'CD', 'a processing request is stamped with the Processing initials');
    t.ok(db.noga_requests.find(r => r.animal_id === 'CH-1').done_by === 'CD', 'a microchip task (processing column) is stamped with the Processing initials');
    t.ok((await a.page.evaluate(() => window.__prompts.length)) === 0, 'no initials prompt appeared: they are set once for the day');

    /* shared with the Admission AA page: who is on today */
    await a.page.waitForTimeout(900);
    const duty = (await a.db()).nurse_on_duty;
    t.ok(duty.length === 2 && duty.find(r => r.role === 'welfare').initials === 'AB' && duty.find(r => r.role === 'processing').initials === 'CD', 'the two initials are shared for the AA page: ' + JSON.stringify(duty.map(r => r.role + ':' + r.initials)));
    await a.page.fill('#initials-processing', '');
    await a.page.waitForTimeout(900);
    t.ok(!(await a.db()).nurse_on_duty.some(r => r.role === 'processing'), 'clearing a box removes it from the AA page');
    await a.page.fill('#initials-processing', 'cd');
    await a.page.waitForTimeout(900);

    /* remembered for the day */
    await a.page.reload();
    await a.page.waitForSelector('#initials-welfare');
    t.ok((await a.page.inputValue('#initials-welfare')) === 'AB' && (await a.page.inputValue('#initials-processing')) === 'CD', 'initials are still there after a reload the same day');

    /* ...but not the next day */
    await a.page.evaluate(() => { const o = JSON.parse(localStorage.getItem('ldh_nurse_initials_v1')); o.day = '2000-01-01'; localStorage.setItem('ldh_nurse_initials_v1', JSON.stringify(o)); });
    await a.page.reload();
    await a.page.waitForSelector('#initials-welfare');
    t.ok((await a.page.inputValue('#initials-welfare')) === '' && (await a.page.inputValue('#initials-processing')) === '', 'yesterday\'s initials are cleared');

    t.ok(a.errors.length === 0, 'no page errors: ' + a.errors.join('; '));
  } finally { await a.browser.close(); }
  t.done();
})();
