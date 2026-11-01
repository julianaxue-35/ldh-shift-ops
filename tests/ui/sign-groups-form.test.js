const { open } = require('./harness');
const t = require('./check')('sign-groups-form');
const KEYS = 'respiratory,gi,wounds_pain_swelling,urinary,skin,msk,neuro,eyes,ears,neonatal,other';
(async () => {
  const { browser, page, errors, db } = await open();
  const signs = () => page.$$eval('.req-sign', os => os.map(o => o.value));
  const tick = async v => { await page.evaluate(() => { document.getElementById('req-signs-dd').open = true; }); await page.check('.req-sign[value="' + v + '"]'); };
  const untick = async v => { await page.evaluate(() => { document.getElementById('req-signs-dd').open = true; }); await page.uncheck('.req-sign[value="' + v + '"]'); };
  const ticks = () => page.$$eval('.req-sign:checked', os => os.map(o => o.value));

  t.ok((await signs()).join() === KEYS, 'eleven sign groups in default display order, respiratory / GI / wounds first (got ' + (await signs()).join() + ')');
  t.ok(await page.locator('#req-condition').count() === 0, 'old suspected-condition dropdown is gone');
  const picker = await page.textContent('#req-signs');
  t.ok(/Respiratory/.test(picker) && /Urinary/.test(picker), 'chips show the group labels');
  t.ok(await page.locator('fieldset#req-signs-wrap > legend').count() === 1 && /Signs you can see/.test(await page.textContent('fieldset#req-signs-wrap > legend')), 'sign list is a fieldset with a legend');
  t.ok(await page.locator('details#req-signs-dd').count() === 1 && !(await page.$eval('#req-signs-dd', d => d.open)), 'signs are a collapsed dropdown');
  t.ok(/Select signs/.test(await page.textContent('#req-signs-label')), 'dropdown shows placeholder when nothing ticked');
  t.ok(/^Symptoms/.test((await page.textContent('#req-problem'.replace('#req-problem','label.sr-wide:has(#req-problem)'))).trim()) && !/clinical notes/i.test(await page.textContent('#req-signs-wrap ~ label.sr-wide')), 'notes box is labelled Symptoms, not clinical notes');
  const pos = () => page.$eval('#req-submit', b => getComputedStyle(b).position);
  const vp0 = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 }); t.ok(await pos() !== 'sticky', 'phone: Send to vets does not float');
  await page.setViewportSize({ width: 820, height: 1180 }); t.ok(await pos() !== 'sticky', 'tablet: Send to vets does not float');
  await page.setViewportSize({ width: 1280, height: 900 }); t.ok(await pos() === 'sticky', 'desktop: Send to vets floats');
  await page.setViewportSize(vp0);
  t.ok(await page.locator('#req-birthing').count() === 1, 'separate cat birthing checkbox');
  t.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no horizontal scroll');

  // a ticked sign must not look like a ticked emergency sign
  await page.click('#triage-drawer summary');
  await tick('gi'); await page.check('.req-flag >> nth=0');
  await page.waitForTimeout(300);
  t.ok(await page.$eval('.req-sign[value="gi"]', el => getComputedStyle(el.closest('label').querySelector('small')).opacity) === '1', 'checked sign chip example text is full opacity');
  const bg = sel => page.$eval(sel, el => getComputedStyle(el.closest('label')).backgroundColor);
  const signBg = await bg('.req-sign[value="gi"]'), flagBg = await bg('.req-flag');
  t.ok(signBg !== flagBg, 'checked sign chip colour differs from checked emergency chip (' + signBg + ' vs ' + flagBg + ')');
  await untick('gi'); await page.uncheck('.req-flag >> nth=0');
  await page.click('#triage-drawer summary');

  // summary lists the ticked signs
  await tick('gi'); await tick('urinary');
  t.ok(/GI/.test(await page.textContent('#req-signs-label')) && /Urinary/.test(await page.textContent('#req-signs-label')), 'summary names the ticked signs');
  await untick('gi'); await untick('urinary');
  // gi + urinary
  await page.fill('#req-title', 'S1');
  await tick('urinary'); await tick('gi');
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
  await page.check('#req-birthing'); await tick('gi');
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
  await tick('gi'); await tick('urinary');
  await page.click('#req-submit'); await page.waitForTimeout(400);
  const s4 = (await db()).tasks.filter(x => x.title === 'S4');
  t.ok(s4.length === 1 && s4[0].conditions.join() === 'gi,urinary' && s4[0].condition === 'gi', 're-flag unions groups, no duplicate (got ' + JSON.stringify(s4.map(r => r.conditions)) + ')');

  // ---- display order: top 3 fixed, rest by reported frequency (computed once a day, applied at the NEXT page load) ----
  {
    const ago = d => new Date(Date.now() - d * 86400000).toISOString();
    const rows = [];
    for (let i = 0; i < 4; i++) rows.push({ title: 'U' + i, flagged_at: ago(3), conditions: ['urinary'], condition: 'urinary' });
    rows.push({ title: 'E1', flagged_at: ago(2), conditions: ['eyes'], condition: 'eyes' });
    rows.push({ title: 'TEST1', flagged_at: ago(2), conditions: ['ears', 'ears'], condition: 'ears' });
    rows.push({ title: 'OLD', flagged_at: ago(200), conditions: ['neuro'], condition: 'neuro' });
    const a = await open({ flag_history: rows });
    const first = (await a.page.$$eval('.req-sign', os => os.map(o => o.value))).join();
    t.ok(first === KEYS, 'first load renders the default order, not re-ordered in place (got ' + first + ')');
    await a.page.waitForTimeout(800);
    t.ok((await a.page.$$eval('.req-sign', os => os.map(o => o.value))).join() === KEYS, 'chips do not move after the background compute');
    const stored = await a.page.evaluate(() => JSON.parse(localStorage.getItem('ldh:signOrder:v1')));
    t.ok(stored && stored.order[3] === 'urinary' && stored.order[4] === 'eyes' && stored.order.length === 11, 'order stored once computed (got ' + JSON.stringify(stored) + ')');
    t.ok(stored.order[5] !== 'ears' || stored.order.indexOf('ears') > stored.order.indexOf('eyes'), 'test animals and rows older than 90 days are not counted');
    const sels = await a.page.evaluate(() => window.__fhSelects || []);
    t.ok(sels.length > 0 && sels.every(c => c === '*'), 'ordering adds no flag_history query of its own (only the existing select * ran: ' + sels.join(' | ') + ')');
    const b = await a.page.context().newPage();
    await b.goto(a.page.url()); await b.waitForTimeout(700);
    const second = await b.$$eval('.req-sign', os => os.map(o => o.value));
    t.ok(second[3] === 'urinary' && second[4] === 'eyes' && second.slice(0, 3).join() === 'respiratory,gi,wounds_pain_swelling' && second[10] === 'other', 'second load shows urinary 4th (got ' + second.join() + ')');

    // repair: missing group + unknown key
    await b.evaluate(() => localStorage.setItem('ldh:signOrder:v1', JSON.stringify({ day: '2000-01-01', order: ['zzz', 'ears', 'gi'] })));
    await b.reload(); await b.waitForTimeout(500);
    const rep = await b.$$eval('.req-sign', os => os.map(o => o.value));
    t.ok(rep.length === 11 && new Set(rep).size === 11 && !rep.includes('zzz') && rep[0] === 'respiratory' && rep.slice(0, 3).join() === 'respiratory,gi,wounds_pain_swelling', 'partial / unknown stored order is repaired to all 11 (got ' + rep.join() + ')');
    // corrupt value
    await b.evaluate(() => localStorage.setItem('ldh:signOrder:v1', '{not json'));
    await b.reload(); await b.waitForTimeout(500);
    t.ok((await b.$$eval('.req-sign', os => os.map(o => o.value))).length === 11, 'corrupt localStorage falls back to a complete 11-chip list');
    await a.browser.close();
  }

  t.ok(errors.length === 0, 'no page errors (' + errors.join(' | ') + ')');
  await browser.close(); t.done();
})();
