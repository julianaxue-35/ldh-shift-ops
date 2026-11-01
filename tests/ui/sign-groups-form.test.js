const { open } = require('./harness');
const t = require('./check')('sign-groups-form');
const KEYS = 'respiratory,gi,urinary,skin,msk,neuro,eyes,ears,wounds_pain_swelling,neonatal,other';
(async () => {
  const { browser, page, errors, db } = await open();
  const signs = () => page.$$eval('.req-sign', os => os.map(o => o.value));
  const ticks = () => page.$$eval('.req-sign:checked', os => os.map(o => o.value));

  t.ok((await signs()).join() === KEYS, 'eleven sign groups in spec order, respiratory first (got ' + (await signs()).join() + ')');
  t.ok(await page.locator('#req-condition').count() === 0, 'old suspected-condition dropdown is gone');
  const picker = await page.textContent('#req-signs');
  t.ok(/Respiratory/.test(picker) && /Urinary/.test(picker), 'chips show the group labels');
  t.ok(await page.locator('fieldset#req-signs-wrap > legend').count() === 1 && /Signs you can see/.test(await page.textContent('fieldset#req-signs-wrap > legend')), 'sign list is a fieldset with a legend');
  t.ok(await page.locator('#req-birthing').count() === 1, 'separate cat birthing checkbox');
  t.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no horizontal scroll');

  // a ticked sign must not look like a ticked emergency sign
  await page.click('#triage-drawer summary');
  await page.check('.req-sign[value="gi"]'); await page.check('.req-flag >> nth=0');
  await page.waitForTimeout(300);
  t.ok(await page.$eval('.req-sign[value="gi"]', el => getComputedStyle(el.closest('label').querySelector('small')).opacity) === '1', 'checked sign chip example text is full opacity');
  const bg = sel => page.$eval(sel, el => getComputedStyle(el.closest('label')).backgroundColor);
  const signBg = await bg('.req-sign[value="gi"]'), flagBg = await bg('.req-flag');
  t.ok(signBg !== flagBg, 'checked sign chip colour differs from checked emergency chip (' + signBg + ' vs ' + flagBg + ')');
  await page.uncheck('.req-sign[value="gi"]'); await page.uncheck('.req-flag >> nth=0');
  await page.click('#triage-drawer summary');

  // gi + urinary
  await page.fill('#req-title', 'S1');
  await page.check('.req-sign[value="urinary"]'); await page.check('.req-sign[value="gi"]');
  await page.click('#req-submit'); await page.waitForTimeout(200);
  let s1 = (await db()).tasks.find(x => x.title === 'S1');
  t.ok(!!s1 && s1.conditions.join() === 'gi,urinary' && s1.condition === 'gi', 'gi+urinary saves conditions in order and condition gi (got ' + JSON.stringify(s1 && [s1.conditions, s1.condition]) + ')');
  t.ok((await ticks()).length === 0, 'boxes reset after submit');

  // none ticked
  await page.fill('#req-title', 'S2');
  await page.click('#req-submit'); await page.waitForTimeout(200);
  const s2 = (await db()).tasks.find(x => x.title === 'S2');
  t.ok(!!s2 && s2.condition === null && Array.isArray(s2.conditions) && s2.conditions.length === 0, 'none ticked saves null / []');

  // birthing + gi
  const dialogs = []; page.on('dialog', d => dialogs.push(d.message()));
  await page.fill('#req-title', 'S3');
  await page.check('#req-birthing'); await page.check('.req-sign[value="gi"]');
  t.ok(await page.isVisible('#req-birthing-wrap'), 'ticking birthing shows the reason');
  await page.click('#req-submit'); await page.waitForTimeout(200);
  t.ok(dialogs.length === 1 && !(await db()).tasks.find(x => x.title === 'S3'), 'birthing still requires a reason');
  await page.selectOption('#req-birthing-reason', 'birth_neonates');
  await page.click('#req-submit'); await page.waitForTimeout(200);
  const s3 = (await db()).tasks.find(x => x.title === 'S3');
  t.ok(!!s3 && s3.urgency === 'red_flag' && s3.conditions.join() === 'gi' && s3.condition === 'gi' && !s3.conditions.includes('cat_birthing') && s3.red_flags.join() === 'birth_neonates', 'birthing + gi: red_flag tier, conditions [gi], no cat_birthing');
  t.ok(!(await page.isVisible('#req-birthing-wrap')) && !(await page.isChecked('#req-birthing')), 'birthing reset after submit');

  // re-flag of an open animal adds urinary without duplicating gi
  await page.evaluate(() => {
    window.__uniqueTasks = true;
    window.__db.tasks.push({ id: 'o1', title: 'S4', location: 'Cat Room 1 / 3', shift: 'sick_injured', type: 'shelter', urgency: 'routine', done: false, created_at: new Date().toISOString(), problem: 'Vomiting', conditions: ['gi'], condition: 'gi', red_flags: [] });
  });
  await page.fill('#req-title', 'S4'); await page.selectOption('#req-location', 'Cat Room 1'); await page.fill('#req-pen', '3');
  await page.check('.req-sign[value="gi"]'); await page.check('.req-sign[value="urinary"]');
  await page.click('#req-submit'); await page.waitForTimeout(400);
  const s4 = (await db()).tasks.filter(x => x.title === 'S4');
  t.ok(s4.length === 1 && s4[0].conditions.join() === 'gi,urinary' && s4[0].condition === 'gi', 're-flag unions groups, no duplicate (got ' + JSON.stringify(s4.map(r => r.conditions)) + ')');

  t.ok(errors.length === 0, 'no page errors (' + errors.join(' | ') + ')');
  await browser.close(); t.done();
})();
