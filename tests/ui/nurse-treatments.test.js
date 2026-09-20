const { open } = require('./harness');
const t = require('./check')('nurse-treatments');
(async () => {
  const { browser, page, errors, db } = await open();
  try {
    t.ok(!(await page.isVisible('#nurse-treatments')), 'hidden from Floor view');
    await page.selectOption('#role-select', 'vet_nurse');
    await page.waitForTimeout(200);
    t.ok(await page.isVisible('#nurse-treatments'), 'shown on the Vet desk');
  
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
      window.__db.nurse_treatment_doses.push({ id: 'od1', treatment_id: tr.id, day_no: 0, slot_no: 1, due_date: iso, done_by: null, done_at: null });
      return loadAll();
    });
    await page.waitForTimeout(250);
    t.ok((await page.textContent('#nt-overdue')).includes('Overdue') && (await page.textContent('#nt-overdue')).includes('1174362'), 'overdue dose listed separately');
  
    await page.locator('.nt-stop').first().click();
    await page.waitForTimeout(250);
    d = await db();
    t.ok(d.nurse_treatments[0].stopped === true, 'Stop course marks it stopped (confirm accepted)');
    t.ok(!(await page.textContent('#nt-today')).includes('1174362') && !(await page.textContent('#nt-overdue')).includes('1174362'), 'stopped course disappears from today and overdue');
    t.ok(errors.length === 0, 'no page errors: ' + errors.join('; '));
  } finally { await browser.close(); }
  t.done();
})();
