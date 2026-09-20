const { open } = require('./harness');
const t = require('./check')('vet-board');
const ago = ms => new Date(Date.now() - ms).toISOString();
const H = 3600 * 1000, M = 60 * 1000;
(async () => {
  const mk = (title, urgency, agoMs) => ({ title, location: 'Pound 1', shift: 'sick_injured', type: 'shelter', urgency, created_at: ago(agoMs) });
  const { browser, page, errors, db } = await open({ tasks: [
    mk('A-AMBER', 'red_flag', 1.75 * H), mk('B-RED', 'red_flag', 3 * H),
    mk('C-URG', 'urgent', 13 * H), mk('D-R25', 'routine', 25 * H),
    mk('E-R50', 'routine', 50 * H), mk('F-NEW', 'routine', 10 * M)] });
  try {
    await page.selectOption('#role-select', 'vet_nurse');
    await page.waitForTimeout(200);
    const col = id => page.textContent('#' + id);
    const rf = await col('board-redflag'), ur = await col('board-urgent'), ro = await col('board-routine');
    t.ok(rf.indexOf('B-RED') > -1 && rf.indexOf('B-RED') < rf.indexOf('A-AMBER'), 'red-flag column: overdue first');
    t.ok(ur.includes('C-URG'), 'urgent column has the urgent case');
    t.ok(ro.indexOf('E-R50') < ro.indexOf('D-R25') && ro.indexOf('D-R25') < ro.indexOf('F-NEW'), 'routine column ordered red, amber, ok');
    t.ok(await page.locator('#board-redflag .lvl-red').count() === 1 && await page.locator('#board-redflag .lvl-amber').count() === 1, 'red-flag chips: one red, one amber');
    t.ok(await page.locator('#board-routine .lvl-red').count() === 1 && await page.locator('#board-routine .lvl-amber').count() === 1 && await page.locator('#board-routine .lvl-ok').count() === 1, 'routine chips: day 3 red, day 2 amber, new ok');
    t.ok((await col('board-routine')).includes('overdue'), 'overdue label shown');

    const row = title => page.locator('.attn-item', { hasText: title });
    await row('D-R25').locator('.claim-btn').click();
    await page.waitForTimeout(200);
    t.ok((await db()).tasks.find(x => x.title === 'D-R25').claimed_by === 'JX', 'claim stores initials');
    t.ok((await row('D-R25').textContent()).includes('Claimed by JX'), 'claimed chip shown');
    t.ok(await row('D-R25').locator('.lvl-amber').count() === 0, 'claimed case no longer ages');

    t.ok(await row('C-URG').locator('.bump-btn').count() === 0, 'bump only offered on routine cases');
    await row('F-NEW').locator('.bump-btn').click();
    await page.waitForTimeout(200);
    t.ok((await col('board-urgent')).includes('F-NEW'), 'bumped case moves to the urgent column');
    t.ok((await db()).tasks.find(x => x.title === 'F-NEW').urgency === 'urgent', 'urgency saved as urgent');

    await page.selectOption('#role-select', 'attendant');
    await page.waitForTimeout(200);
    const firstRow = await page.textContent('#queue-tbody tr');
    t.ok(firstRow.includes('B-RED') && firstRow.includes('Red flag'), 'Floor table lists the most overdue first with its tier');
    const pillColor = cls => page.evaluate(c => { const e = document.querySelector('#queue-tbody .status-pill.' + c); return e ? getComputedStyle(e).color : null; }, cls);
    const urgC = await pillColor('urgent'), rfC = await pillColor('red_flag');
    t.ok(urgC && rfC && urgC !== rfC, 'Urgent pill colour differs from Red flag pill (' + urgC + ' vs ' + rfC + ')');
    t.ok(errors.length === 0, 'no page errors: ' + errors.join('; '));
  } finally {
    await browser.close();
  }
  t.done();
})();
