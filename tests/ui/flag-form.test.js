const { open } = require('./harness');
const t = require('./check')('flag-form');
(async () => {
  const { browser, page, errors, db } = await open();
  t.ok(await page.locator('#req-redflags input.req-flag').count() === 5, 'five emergency-sign checkboxes');
  t.ok((await page.textContent('#req-tier-preview')).startsWith('Request checks — check within 24–48 h'), 'preview starts as Request checks');
  t.ok((await page.textContent('#req-redflags-wrap')).includes("High priority emergency? Radio the vet, don't wait for this board."), 'emergency reminder shown (full sentence, locked in)');
  t.ok(await page.locator('#req-urgency').count() === 0, 'old urgency dropdown id not reused');
  t.ok(await page.locator('#req-urgency-pick').count() === 1 && (await page.$$eval('#req-urgency-pick option', os => os.map(o => o.value))).join() === 'routine,urgent,red_flag', 'staff can pick Request check / Urgent / Emergency');
  t.ok(await page.locator('#triage-levels').count() === 1 && /Radio the vet team now/.test(await page.textContent('#triage-levels')), 'a small section explains the levels, including radio for emergencies');
  t.ok(await page.locator('#req-location option').count() === 15, 'location select filled from the shared list (incl. Rabbit Room, Pathway, Offsite)');
  const signOpts = await page.$$eval('#req-condition option', os => os.map(o => o.value));
  t.ok(signOpts.join() === ',cat_flu,kennel_cough,diarrhoea,vomiting,eye_condition,skin_condition,wounds_injury,cat_birthing,other', 'flag form offers the eight reported signs plus the urgent cat birthing check (got ' + signOpts.join() + ')');
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


  /* ---------- 2026-10-15: urgent cat birthing check ---------- */
  t.ok(!(await page.isVisible('#req-birthing-wrap')), 'birthing reason is hidden until Cat birthing is chosen');
  await page.fill('#req-title', 'CAT-BIRTH');
  await page.selectOption('#req-condition', 'cat_birthing');
  t.ok(await page.isVisible('#req-birthing-wrap'), 'choosing Cat birthing reveals the reason dropdown');
  t.ok((await page.$$eval('#req-birthing-reason option', os => os.map(o => o.value))).join() === ',birth_neonates,birth_discharge,birth_mum_distress', 'reason dropdown lists the three birthing reasons');
  let dialogs = []; page.on('dialog', d => dialogs.push(d.message()));   // the harness already accepts it
  const before = (await db()).tasks.length;
  await page.click('#req-submit');
  await page.waitForTimeout(200);
  t.ok(dialogs.length === 1 && (await db()).tasks.length === before, 'submitting without a reason is blocked');
  await page.selectOption('#req-birthing-reason', 'birth_mum_distress');
  t.ok((await page.textContent('#req-tier-preview')).startsWith('Emergency'), 'a birthing reason switches the preview to Emergency');
  await page.click('#req-submit');
  await page.waitForTimeout(200);
  const birth = (await db()).tasks.find(x => x.title === 'CAT-BIRTH');
  t.ok(!!birth && birth.urgency === 'red_flag' && birth.red_flags.join() === 'birth_mum_distress' && birth.condition === null && birth.problem.startsWith('Cat birthing — Mum in distress'),
    'birthing case saves as red_flag with the reason, no surveillance condition, and a readable problem');
  t.ok(!(await page.isVisible('#req-birthing-wrap')), 'birthing section resets after submit');

  /* ---------- foster / rescue: optional microchip / UV requests for the nurses ---------- */
  t.ok(!(await page.isVisible('#req-nurse-extras')), 'microchip/UV options hidden for a shelter request');
  await page.selectOption('#req-type', 'foster');
  t.ok(await page.isVisible('#req-nurse-extras'), 'foster request shows the microchip/UV options');
  await page.fill('#req-title', 'FOS-1');
  t.ok((await page.$$eval('#req-x-window option', os => os.map(o => o.value))).join() === '2h,24_48h', 'needed-within choice: 2 hours or 24-48 hours');
  await page.check('#req-x-microchip'); await page.check('#req-x-uv');
  await page.selectOption('#req-x-window', '24_48h');
  await page.click('#req-submit');
  await page.waitForTimeout(300);
  const nrs = (await db()).nurse_requests.filter(r => r.animal_id === 'FOS-1');
  t.ok(nrs.length === 1 && nrs[0].kind === 'microchip_uv' && nrs[0].animal_count === 1 && nrs[0].due_window === '24_48h' && nrs[0].location === 'Pathway' && nrs[0].species === 'cat',
    'ticking microchip + UV creates ONE combined single-animal nurse request with the chosen 24-48 h window at the foster location');
  t.ok((await db()).tasks.filter(x => x.title === 'FOS-1').length === 0, 'microchip/UV foster request goes straight to the nurse: nothing on the vet board');
  t.ok(!(await page.isVisible('#req-nurse-extras')), 'extras reset after submit');
  await page.selectOption('#req-type', 'foster');
  await page.fill('#req-title', 'FOS-2');
  await page.check('#req-x-uv');
  await page.click('#req-submit');
  await page.waitForTimeout(300);
  const one = (await db()).nurse_requests.filter(r => r.animal_id === 'FOS-2');
  t.ok(one.length === 1 && one[0].kind === 'uv', 'only UV ticked still creates a plain UV request');
  t.ok((await db()).tasks.filter(x => x.title === 'FOS-2').length === 0, 'UV-only foster request is not on the vet board either');
  t.ok(/vet board/i.test(await page.evaluate(() => document.getElementById('req-nurse-extras').textContent)), 'the options box says it skips the vet board');
  await page.selectOption('#req-type', 'rescue');
  await page.fill('#req-title', 'RES-1');
  await page.click('#req-submit');
  await page.waitForTimeout(200);
  t.ok((await db()).nurse_requests.filter(r => r.animal_id === 'RES-1').length === 0, 'no boxes ticked creates no nurse requests');
  t.ok((await db()).tasks.filter(x => x.title === 'RES-1').length === 1, 'a rescue request with nothing ticked still goes to the vet board');
  /* only microchip/UV alone goes to the nurses: any emergency sign, notes or raised urgency means a vet sees it (vet board only) */
  await page.selectOption('#req-type', 'rescue');
  await page.fill('#req-title', 'RES-2');
  await page.check('#req-x-microchip');
  await page.check('input.req-flag[value="bleeding_wound"]');
  await page.click('#req-submit');
  await page.waitForTimeout(300);
  let d = await db();
  t.ok(d.nurse_requests.filter(r => r.animal_id === 'RES-2').length === 0 && d.tasks.filter(x => x.title === 'RES-2').length === 1, 'microchip + emergency sign: vet board ONLY');
  t.ok(/^Needs microchip/.test(d.tasks.find(x => x.title === 'RES-2').problem), 'the vet card says why: ' + d.tasks.find(x => x.title === 'RES-2').problem);
  await page.selectOption('#req-type', 'foster');
  await page.fill('#req-title', 'FOS-3');
  await page.check('#req-x-microchip'); await page.check('#req-x-uv');
  await page.fill('#req-problem', 'also needs a weigh-in and skin check');
  await page.click('#req-submit');
  await page.waitForTimeout(300);
  d = await db();
  t.ok(d.nurse_requests.filter(r => r.animal_id === 'FOS-3').length === 0 && d.tasks.filter(x => x.title === 'FOS-3').length === 1, 'microchip + UV with notes typed: vet board only, so the vet can reassign');
  t.ok(d.tasks.find(x => x.title === 'FOS-3').problem === 'Needs microchip + UV check — also needs a weigh-in and skin check', 'vet card shows what was asked for plus the notes: ' + d.tasks.find(x => x.title === 'FOS-3').problem);
  await page.selectOption('#req-type', 'shelter');
  await page.fill('#req-title', 'URG-1');
  await page.selectOption('#req-urgency-pick', 'urgent');
  t.ok((await page.textContent('#req-tier-preview')).startsWith('Urgent — check within 12–24 h'), 'preview follows the picked urgency');
  await page.click('#req-submit');
  await page.waitForTimeout(300);
  t.ok((await db()).tasks.find(x => x.title === 'URG-1').urgency === 'urgent', 'a case staff mark Urgent is saved as urgent');
  t.ok((await page.inputValue('#req-urgency-pick')) === 'routine', 'urgency resets after submit');
  await page.fill('#req-title', 'URG-2');
  await page.check('input.req-flag[value="bleeding_wound"]');
  await page.click('#req-submit');
  await page.waitForTimeout(300);
  t.ok((await db()).tasks.find(x => x.title === 'URG-2').urgency === 'red_flag', 'an emergency sign forces Emergency');
  await page.selectOption('#req-type', 'medication');
  await page.fill('#req-title', 'MED-1');
  await page.click('#req-submit');
  await page.waitForTimeout(300);
  t.ok((await db()).tasks.filter(x => x.title === 'MED-1').length === 1, 'medication requests are never redirected to the nurses');

  /* ---------- litters + treatment check / due ---------- */
  await page.selectOption('#req-type', 'foster');
  await page.fill('#req-title', '1170123,124,126 - 128');
  await page.check('#req-x-treatment');
  await page.click('#req-submit');
  await page.waitForTimeout(500);
  d = await db();
  const litter = ['1170123', '1170124', '1170126', '1170127', '1170128'];
  t.ok(litter.every(id => d.noga_requests.filter(r => r.animal_id === id && r.task === 'treatment').length === 1) && d.noga_requests.filter(r => r.task === 'treatment').length === 5,
    'a litter range gives each animal its own treatment task for the nurses: ' + d.noga_requests.filter(r => r.task === 'treatment').map(r => r.animal_id).join());
  t.ok(d.tasks.filter(x => litter.includes(x.title)).length === 0, 'treatment-only goes to the nurses, nothing on the vet board');
  t.ok((await page.inputValue('#req-title')) === '', 'the form is cleared after a litter');
  await page.selectOption('#req-type', 'rescue');
  await page.fill('#req-title', '1180001 - 1180002');
  await page.check('#req-x-microchip'); await page.check('#req-x-treatment');
  await page.fill('#req-problem', 'sneezing, check on the way');
  await page.click('#req-submit');
  await page.waitForTimeout(500);
  d = await db();
  t.ok(d.tasks.filter(x => ['1180001', '1180002'].includes(x.title)).length === 2 && d.nurse_requests.filter(r => ['1180001', '1180002'].includes(r.animal_id)).length === 0, 'with notes typed the litter goes to the vet board for the microchip part');
  t.ok(d.tasks.find(x => x.title === '1180001').problem === 'Needs microchip \u2014 sneezing, check on the way', 'vet card says what the vet is being asked about: ' + d.tasks.find(x => x.title === '1180001').problem);
  t.ok(d.noga_requests.filter(r => ['1180001', '1180002'].includes(r.animal_id) && r.task === 'treatment').length === 2, 'but the treatment check still goes to the nurse: it never needs a vet');
  await page.selectOption('#req-type', 'foster');
  await page.fill('#req-title', '1190010 - 1190001');
  const dlg = []; page.once('dialog', dd => dlg.push(dd.message()));
  await page.click('#req-submit');
  await page.waitForTimeout(300);
  t.ok(dlg.some(m => /backwards/.test(m)) && !(await db()).tasks.some(x => /^1190/.test(x.title)), 'a backwards range is refused with a message and nothing is created');
  await page.fill('#req-title', '');

  t.ok(errors.length === 0, 'no page errors: ' + errors.join('; '));
  await browser.close();
  t.done();
})();
