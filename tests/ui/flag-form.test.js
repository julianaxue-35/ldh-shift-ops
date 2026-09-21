const { open } = require('./harness');
const t = require('./check')('flag-form');
(async () => {
  const { browser, page, errors, db } = await open();
  t.ok(await page.locator('#req-redflags input.req-flag').count() === 5, 'five red-flag checkboxes');
  t.ok((await page.textContent('#req-tier-preview')).startsWith('Routine — check within 24–48 h'), 'preview starts as Routine');
  t.ok((await page.textContent('#req-redflags-wrap')).includes("Emergency? Radio the vet"), 'emergency reminder shown');
  t.ok(await page.locator('#req-urgency').count() === 0, 'manual urgency dropdown removed');
  t.ok(await page.locator('#req-location option').count() === 12, 'location select filled from the shared list');
  const signOpts = await page.$$eval('#req-condition option', os => os.map(o => o.value));
  t.ok(signOpts.join() === ',cat_flu,kennel_cough,diarrhoea,vomiting,eye_condition,skin_condition,wounds_injury,other', 'flag form offers the eight reported signs (got ' + signOpts.join() + ')');
  t.ok(!(await page.textContent('#req-condition')).toLowerCase().includes('giardia'), 'no diagnoses in the sign list');

  await page.fill('#req-title', 'T100');
  await page.check('input.req-flag[value="bleeding"]');
  t.ok((await page.textContent('#req-tier-preview')).startsWith('Red flag — check within 2 h'), 'ticking a red flag switches preview to Red flag');
  await page.click('#req-submit');
  await page.waitForTimeout(200);
  let tasks = (await db()).tasks;
  t.ok(tasks.length === 1 && tasks[0].urgency === 'red_flag' && tasks[0].red_flags.join() === 'bleeding', 'saved as red_flag with the ticked flag');
  t.ok(await page.locator('input.req-flag:checked').count() === 0, 'flags reset after submit');

  await page.fill('#req-title', 'T101');
  await page.click('#req-submit');
  await page.waitForTimeout(200);
  tasks = (await db()).tasks;
  t.ok(tasks.length === 2 && tasks[1].urgency === 'routine' && tasks[1].red_flags.length === 0, 'no flags saves as routine');
  t.ok(errors.length === 0, 'no page errors: ' + errors.join('; '));
  await browser.close();
  t.done();
})();
