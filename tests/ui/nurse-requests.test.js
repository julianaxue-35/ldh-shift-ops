// Round 3: the open-requests LIST (with pick-up / +1 vaccinated / all done)
// has moved to nurses.html (Task 6). Only the raise-a-request FORM stays on
// the shelter staff page (index.html), in its own small card — staff still
// raise these. List-specific coverage belongs in nurses-page.test.js.
const { open } = require('./harness');
const t = require('./check')('nurse-requests');
(async () => {
  const { browser, page, errors, db } = await open();
  try {
    await page.click('.sr-tab[data-sr="nurses"]');
    t.ok(await page.locator('#nr-list').count() === 0, 'the nurse-requests list is gone from the shelter staff page');
    t.ok(await page.isVisible('#nr-form'), 'the vaccination request form stays on the shelter staff page');
    t.ok((await page.textContent('#send-request')).includes('Send a request') && (await page.textContent('.sr-tab[data-sr="nurses"]')) === 'Nurses', 'the form is the Nurses tab of the one "Send a request" card');

    t.ok((await page.inputValue('#nr-location')) === 'FIR Room', 'cats default to FIR Room');
    await page.selectOption('#nr-species', 'dog');
    t.ok((await page.inputValue('#nr-location')) === 'Dog transport', 'dogs default to Dog transport');
    await page.selectOption('#nr-location', 'Pound 2');
    t.ok((await page.inputValue('#nr-location')) === 'Pound 2', 'another space can still be chosen');
    await page.selectOption('#nr-species', 'cat');
    t.ok((await page.inputValue('#nr-location')) === 'FIR Room', 'switching back to cats restores FIR Room');

    await page.fill('#nr-count', '3');
    await page.fill('#nr-arrived-date', '');
    await page.click('#nr-now');
    t.ok((await page.inputValue('#nr-arrived-date')).length === 10 && (await page.inputValue('#nr-arrived-hour')) === String(new Date().getHours()).padStart(2, '0'), '"Arrived now" fills today\'s date and the current hour');
    t.ok((await page.$$eval('#nr-arrived-hour option', os => os.length)) === 24 && /^12 am$/.test(await page.textContent('#nr-arrived-hour option:first-child')) && /^2 pm$/.test(await page.textContent('#nr-arrived-hour option[value="14"]')), 'the arrival time is picked to the hour (12 am to 11 pm, no minutes)');
    await page.click('#nr-submit');
    await page.waitForTimeout(250);
    const reqs = (await db()).nurse_requests;
    t.ok(reqs.length === 1 && reqs[0].animal_count === 3 && reqs[0].location === 'FIR Room' && reqs[0].created_by === 'Shelter Staff', 'new request saved from the form, raised by Shelter Staff');
    const arr0 = new Date(reqs[0].arrived_at); t.ok(arr0.getMinutes() === 0 && Date.now() - arr0.getTime() >= 0 && Date.now() - arr0.getTime() < 3600e3 + 120000, 'arrival time saved on the hour (this hour): ' + arr0.toISOString());

    /* ---------- Scheduled arrival (2026-09-26): log one for later, not now ---------- */
    t.ok(!(await page.isVisible('#nr-expected-wrap')), 'expected-arrival field hidden by default');
    t.ok(await page.isVisible('#nr-arrived-wrap'), 'arrived field shown by default');
    await page.check('#nr-scheduled-toggle');
    t.ok(await page.isVisible('#nr-expected-wrap'), 'checking the toggle reveals the expected-arrival field');
    t.ok(!(await page.isVisible('#nr-arrived-wrap')), 'and hides the arrived field/button');

    await page.fill('#nr-count', '5');
    await page.selectOption('#nr-species', 'dog');
    const future = new Date(Date.now() + 3 * 3600 * 1000);
    const futureDate = future.getFullYear() + '-' + String(future.getMonth() + 1).padStart(2, '0') + '-' + String(future.getDate()).padStart(2, '0');
    const times = await page.$$eval('#nr-expected-time option', os => os.map(o => o.value).filter(Boolean));
    t.ok(times.length === 96 && times[0] === '00:00' && times[1] === '00:15' && times[95] === '23:45' && times.every(v => ['00', '15', '30', '45'].includes(v.slice(3))), 'a scheduled arrival is picked every 15 minutes');
    await page.fill('#nr-expected-date', futureDate); await page.selectOption('#nr-expected-time', '14:45');
    await page.click('#nr-submit');
    await page.waitForTimeout(250);
    const reqs2 = (await db()).nurse_requests;
    const scheduled = reqs2.find(r => r.animal_count === 5);
    t.ok(scheduled && scheduled.arrived_at == null, 'a scheduled request saves with arrived_at null');
    t.ok(scheduled && scheduled.expected_at != null && new Date(scheduled.expected_at).getHours() === 14 && new Date(scheduled.expected_at).getMinutes() === 45, 'and expected_at set to the 15-minute time chosen');

    // Form resets to the non-scheduled mode after a successful submit.
    t.ok(!(await page.isVisible('#nr-expected-wrap')), 'toggle resets off after submit');
    t.ok(await page.isVisible('#nr-arrived-wrap'), 'arrived field shown again after submit');

    // Submitting scheduled mode with no expected time is blocked (no insert).
    await page.check('#nr-scheduled-toggle');
    await page.fill('#nr-expected-date', ''); await page.selectOption('#nr-expected-time', '');
    await page.click('#nr-submit');
    await page.waitForTimeout(200);
    t.ok((await db()).nurse_requests.length === 2, 'submit is blocked with the toggle on and no expected time entered');
    await page.uncheck('#nr-scheduled-toggle');

    t.ok(errors.length === 0, 'no page errors: ' + errors.join('; '));
  } finally {
    await browser.close();
  }
  t.done();
})();
