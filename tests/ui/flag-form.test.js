const { open } = require('./harness');
const t = require('./check')('flag-form');
(async () => {
  const { browser, page, errors, db } = await open();
  t.ok(await page.locator('#req-redflags input.req-flag').count() === 5, 'five emergency-sign checkboxes');
  t.ok((await page.textContent('#req-tier-preview')).startsWith('Request checks — check within 24–48 h'), 'preview starts as Request checks');
  t.ok((await page.textContent('#req-redflags-wrap')).includes("High priority emergency? Radio the vet, don't wait for this board."), 'emergency reminder shown (full sentence, locked in)');
  t.ok(await page.locator('#req-urgency').count() === 0, 'manual urgency dropdown removed');
  t.ok(await page.locator('#req-location option').count() === 13, 'location select filled from the shared list (incl. Offsite)');
  const signOpts = await page.$$eval('#req-condition option', os => os.map(o => o.value));
  t.ok(signOpts.join() === ',cat_flu,kennel_cough,diarrhoea,vomiting,eye_condition,skin_condition,wounds_injury,other', 'flag form offers the eight reported signs (got ' + signOpts.join() + ')');
  t.ok(!(await page.textContent('#req-condition')).toLowerCase().includes('giardia'), 'no diagnoses in the sign list');

  await page.fill('#req-title', 'T100');
  await page.check('input.req-flag[value="bleeding_wound"]');
  t.ok((await page.textContent('#req-tier-preview')).startsWith('Emergency — check within 2 h'), 'ticking an emergency sign switches preview to Emergency');
  await page.click('#req-submit');
  await page.waitForTimeout(200);
  let tasks = (await db()).tasks;
  t.ok(tasks.length === 1 && tasks[0].urgency === 'red_flag' && tasks[0].red_flags.join() === 'bleeding_wound', 'saved as red_flag with the ticked emergency sign');
  t.ok(await page.locator('input.req-flag:checked').count() === 0, 'flags reset after submit');

  await page.fill('#req-title', 'T101');
  await page.click('#req-submit');
  await page.waitForTimeout(200);
  tasks = (await db()).tasks;
  t.ok(tasks.length === 2 && tasks[1].urgency === 'routine' && tasks[1].red_flags.length === 0, 'no signs saves as routine');

  /* ---------- Medication request type: needs_medication follows it, sm_number auto-fills from the animal ID ----------
     2026-09-26: the standalone "Needs medication" checkbox was removed — she
     found it confusing next to the existing "Medication" request type, so
     that dropdown option is now the one control that drives the medication
     hand-off. A second, separate "SM number" box was ALSO removed the same
     day — the Animal ID she types already is the SM number at LDH, so
     sm_number is auto-filled from the title with no extra typing/box. */
  t.ok(await page.locator('#req-sm-number').count() === 0, 'no separate SM number box — the Animal ID box already is the SM number');
  await page.fill('#req-title', 'T102');
  await page.selectOption('#req-type', 'medication');
  await page.click('#req-submit');
  await page.waitForTimeout(200);
  tasks = (await db()).tasks;
  t.ok(tasks.length === 3 && tasks[2].needs_medication === true && tasks[2].sm_number === 'T102' && tasks[2].type === 'medication',
    'Medication request: needs_medication true, sm_number auto-fills from the animal ID typed');

  /* ---------- Offsite hides the pen field, reveals an optional detail field ---------- */
  t.ok(await page.isVisible('#req-pen') && !(await page.isVisible('#req-location-detail')), 'pen shown, detail hidden for a normal space');
  await page.selectOption('#req-location', 'Offsite');
  t.ok(!(await page.isVisible('#req-pen')) && (await page.isVisible('#req-location-detail')), 'choosing Offsite hides the pen field and shows the detail field');
  await page.fill('#req-title', 'T103');
  await page.fill('#req-location-detail', 'Foster carer — J. Smith');
  await page.click('#req-submit');
  await page.waitForTimeout(200);
  tasks = (await db()).tasks;
  const t103 = tasks.find(x => x.title === 'T103');
  t.ok(!!t103 && t103.location === 'Offsite' && t103.location_detail === 'Foster carer — J. Smith', 'Offsite case stores location Offsite plus the free-text detail');

  await page.selectOption('#req-location', 'Pound 1');
  t.ok(await page.isVisible('#req-pen') && !(await page.isVisible('#req-location-detail')), 'switching back to a normal space restores the pen field and hides detail');

  t.ok(errors.length === 0, 'no page errors: ' + errors.join('; '));
  await browser.close();
  t.done();
})();
