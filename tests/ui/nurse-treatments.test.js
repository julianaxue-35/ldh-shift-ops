const { open } = require('./harness');
const t = require('./check')('nurse-treatments');
(async () => {
  const { browser, page, errors, db } = await open();
  try {
    t.ok(!(await page.isVisible('#nurse-treatments')) && !(await page.isVisible('#nurse-doses')), 'both treatment cards hidden from Floor view');
    await page.selectOption('#role-select', 'vet_nurse');
    await page.waitForTimeout(200);
    t.ok(await page.isVisible('#nurse-treatments'), 'vets\' request card shown on the Vet desk');
    t.ok(await page.isVisible('#nurse-doses'), 'nurses\' treatments-due card shown on the Vet desk');
    t.ok((await page.locator('#nurse-treatments #nt-submit').count()) === 1 && (await page.locator('#nurse-doses #nt-submit').count()) === 0, 'the request form lives in the vets card, not the nurses card');
  
    await page.fill('#nt-animal', '1174362');
    await page.selectOption('#nt-location', 'Cat Room 1');
    await page.fill('#nt-treatment', 'Flush dental extraction site');
    await page.selectOption('#nt-times', '2');
    await page.fill('#nt-days', '7');
    await page.click('#nt-submit');
    await page.waitForTimeout(300);
    let d = await db();
    t.ok(d.nurse_treatments.length === 1 && d.nurse_treatments[0].requested_by === 'JX', 'course saved with requester initials');
    t.ok(d.nurse_treatment_doses.length === 14, '2 a day for 7 days creates 14 dose slots');
    t.ok((await page.locator('#nurse-doses #nt-today').count()) === 1 && (await page.locator('#nurse-treatments #nt-courses').count()) === 1, "today's doses are in the nurses card; courses are in the vets card");
    const today = await page.textContent('#nt-today');
    t.ok(today.includes('1174362') && today.includes('AM') && today.includes('PM') && today.includes('Cat Room 1'), "today's doses grouped by space with AM and PM");
    t.ok((await page.textContent('#nt-courses')).includes('0 of 14 done'), 'course progress shown');
  
    await page.locator('.attn-item', { hasText: 'AM' }).locator('.nt-tick').check();
    await page.waitForTimeout(250);
    d = await db();
    const ticked = d.nurse_treatment_doses.filter(x => x.done_at);
    t.ok(ticked.length === 1 && ticked[0].done_by === 'JX', 'ticking a dose records initials and time');
    t.ok((await page.textContent('#nt-courses')).includes('1 of 14 done'), 'progress updates');
  
    // an overdue dose (yesterday, not ticked) appears in its own section
    await page.evaluate(() => {
      const tr = window.__db.nurse_treatments[0];
      const y = new Date(); y.setDate(y.getDate() - 1);
      const iso = y.getFullYear() + '-' + String(y.getMonth() + 1).padStart(2, '0') + '-' + String(y.getDate()).padStart(2, '0');
      const o = new Date(); o.setDate(o.getDate() - 40);
      const oiso = o.getFullYear() + '-' + String(o.getMonth() + 1).padStart(2, '0') + '-' + String(o.getDate()).padStart(2, '0');
      window.__db.nurse_treatment_doses.push({ id: 'old40', treatment_id: tr.id, day_no: 0, slot_no: 2, due_date: oiso, done_by: null, done_at: null });
      window.__oldISO = oiso;
      window.__db.nurse_treatment_doses.push({ id: 'od1', treatment_id: tr.id, day_no: 0, slot_no: 1, due_date: iso, done_by: null, done_at: null });
      return loadAll();
    });
    await page.waitForTimeout(250);
    t.ok((await page.textContent('#nt-overdue')).includes('Overdue') && (await page.textContent('#nt-overdue')).includes('1174362'), 'overdue dose listed separately');
  
    const oldISO = await page.evaluate(() => window.__oldISO);
    t.ok(oldISO && !(await page.textContent('#nt-overdue')).includes(oldISO), 'dose older than the 31-day window is not fetched');
    await page.locator('.nt-stop').first().click();
    await page.waitForTimeout(250);
    d = await db();
    t.ok(d.nurse_treatments[0].stopped === true, 'Stop course marks it stopped (confirm accepted)');
    t.ok(!(await page.textContent('#nt-today')).includes('1174362') && !(await page.textContent('#nt-overdue')).includes('1174362'), 'stopped course disappears from today and overdue');
    t.ok(errors.length === 0, 'no page errors: ' + errors.join('; '));
  } finally { await browser.close(); }
  t.done();
})();
