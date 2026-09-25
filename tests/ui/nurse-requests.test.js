// Round 3: the open-requests LIST (with pick-up / +1 vaccinated / all done)
// has moved to nurses.html (Task 6). Only the raise-a-request FORM stays on
// the shelter staff page (index.html), in its own small card — staff still
// raise these. List-specific coverage belongs in nurses-page.test.js.
const { open } = require('./harness');
const t = require('./check')('nurse-requests');
(async () => {
  const { browser, page, errors, db } = await open();
  try {
    t.ok(await page.locator('#nr-list').count() === 0, 'the nurse-requests list is gone from the shelter staff page');
    t.ok(await page.isVisible('#nr-form'), 'the vaccination request form stays on the shelter staff page');
    t.ok((await page.textContent('#nurse-requests')).includes('Request nurse vaccination'), 'the form has its own small card heading');

    t.ok((await page.inputValue('#nr-location')) === 'FIR Room', 'cats default to FIR Room');
    await page.selectOption('#nr-species', 'dog');
    t.ok((await page.inputValue('#nr-location')) === 'Transport', 'dogs default to Transport');
    await page.selectOption('#nr-location', 'Pound 2');
    t.ok((await page.inputValue('#nr-location')) === 'Pound 2', 'another space can still be chosen');
    await page.selectOption('#nr-species', 'cat');
    t.ok((await page.inputValue('#nr-location')) === 'FIR Room', 'switching back to cats restores FIR Room');

    await page.fill('#nr-count', '3');
    await page.fill('#nr-arrived', '');
    await page.click('#nr-now');
    t.ok((await page.inputValue('#nr-arrived')).length === 16, '"Arrived now" fills the arrival time');
    await page.click('#nr-submit');
    await page.waitForTimeout(250);
    const reqs = (await db()).nurse_requests;
    t.ok(reqs.length === 1 && reqs[0].animal_count === 3 && reqs[0].location === 'FIR Room' && reqs[0].created_by === 'Shelter Staff', 'new request saved from the form, raised by Shelter Staff');
    t.ok(Math.abs(Date.now() - new Date(reqs[0].arrived_at).getTime()) < 120000, 'arrival time saved as ~now');

    /* ---------- Scheduled arrival (2026-09-26): log one for later, not now ---------- */
    t.ok(!(await page.isVisible('#nr-expected-wrap')), 'expected-arrival field hidden by default');
    t.ok(await page.isVisible('#nr-arrived-wrap'), 'arrived field shown by default');
    await page.check('#nr-scheduled-toggle');
    t.ok(await page.isVisible('#nr-expected-wrap'), 'checking the toggle reveals the expected-arrival field');
    t.ok(!(await page.isVisible('#nr-arrived-wrap')), 'and hides the arrived field/button');

    await page.fill('#nr-count', '5');
    await page.selectOption('#nr-species', 'dog');
    const future = new Date(Date.now() + 3 * 3600 * 1000);
    const futureLocal = future.getFullYear() + '-' + String(future.getMonth() + 1).padStart(2, '0') + '-' + String(future.getDate()).padStart(2, '0')
      + 'T' + String(future.getHours()).padStart(2, '0') + ':' + String(future.getMinutes()).padStart(2, '0');
    await page.fill('#nr-expected', futureLocal);
    await page.click('#nr-submit');
    await page.waitForTimeout(250);
    const reqs2 = (await db()).nurse_requests;
    const scheduled = reqs2.find(r => r.animal_count === 5);
    t.ok(scheduled && scheduled.arrived_at == null, 'a scheduled request saves with arrived_at null');
    t.ok(scheduled && scheduled.expected_at != null, 'and expected_at set');

    // Form resets to the non-scheduled mode after a successful submit.
    t.ok(!(await page.isVisible('#nr-expected-wrap')), 'toggle resets off after submit');
    t.ok(await page.isVisible('#nr-arrived-wrap'), 'arrived field shown again after submit');

    // Submitting scheduled mode with no expected time is blocked (no insert).
    await page.check('#nr-scheduled-toggle');
    await page.fill('#nr-expected', '');
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
