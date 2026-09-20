const { open } = require('./harness');
const t = require('./check')('nurse-requests');
const ago = ms => new Date(Date.now() - ms).toISOString();
const H = 3600 * 1000, M = 60 * 1000;
(async () => {
  const { browser, page, errors, db } = await open({ nurse_requests: [
    { location: 'FIR Room', species: 'cat', animal_count: 8, done_count: 0, arrived_at: ago(2 * H + 40 * M) },
    { location: 'Transport', species: 'dog', animal_count: 1, done_count: 0, arrived_at: ago(4 * H) }] });
  try {
    t.ok(await page.locator('#nr-list .nr-item').count() === 2, 'two open requests listed (Floor view)');
    t.ok((await page.textContent('#nr-list')).includes('FIR Room — 8 cats to vaccinate'), 'group wording');
    t.ok(await page.locator('.nr-item', { hasText: 'FIR Room' }).locator('.lvl-amber').count() === 1, 'FIR request amber with 20 minutes left');
    t.ok(await page.locator('.nr-item', { hasText: 'Transport' }).locator('.lvl-red').count() === 1, 'Transport request red (overdue)');
    t.ok(await page.locator('.nr-plus').count() === 0, 'Floor cannot record vaccinations');
    t.ok(await page.isVisible('#nr-form'), 'the request form is in the shelter staff (Floor) view');

    await page.selectOption('#nr-location', 'FIR Room');
    await page.selectOption('#nr-species', 'cat');
    await page.fill('#nr-count', '3');
    await page.fill('#nr-arrived', '');
    await page.click('#nr-now');
    t.ok((await page.inputValue('#nr-arrived')).length === 16, '"Arrived now" fills the arrival time');
    await page.click('#nr-submit');
    await page.waitForTimeout(250);
    const reqs = (await db()).nurse_requests;
    t.ok(reqs.length === 3 && reqs[2].animal_count === 3 && Math.abs(Date.now() - new Date(reqs[2].arrived_at).getTime()) < 120000, 'new request saved with arrival time ~now');

    await page.selectOption('#role-select', 'vet_nurse');
    await page.waitForTimeout(200);
    t.ok(!(await page.isVisible('#nr-form')), 'the request form is hidden in the vet/nurse view (staff raise these)');
    t.ok((await page.locator('.nr-item .nr-claim').first().textContent()) === 'Pick up', 'nurses get a "Pick up" button');
    const fir = () => page.locator('.nr-item', { hasText: 'FIR Room' }).first();
    await fir().locator('.nr-plus').click();
    await page.waitForTimeout(250);
    t.ok((await fir().textContent()).includes('1 of 8 vaccinated'), '+1 vaccinated updates progress');
    await fir().locator('.nr-claim').click();
    await page.waitForTimeout(250);
    t.ok((await fir().textContent()).includes('claimed by JX'), 'claim shows initials');
    await page.locator('.nr-item', { hasText: 'Transport' }).locator('.nr-all').click();
    await page.waitForTimeout(250);
    t.ok(await page.locator('.nr-item', { hasText: 'Transport' }).count() === 0, 'completed request leaves the open list');
    t.ok(!!(await db()).nurse_requests.find(r => r.location === 'Transport').completed_at, 'completed_at recorded');
    t.ok(errors.length === 0, 'no page errors: ' + errors.join('; '));
  } finally {
    await browser.close();
  }
  t.done();
})();
