const { open } = require('./harness');
const t = require('./check')('vet-board');
const ago = ms => new Date(Date.now() - ms).toISOString();
const H = 3600 * 1000, M = 60 * 1000;
(async () => {
  const mk = (title, urgency, agoMs, extra = {}) => Object.assign({ title, location: 'Pound 1', shift: 'sick_injured', type: 'shelter', urgency, created_at: ago(agoMs) }, extra);
  const { browser, page, errors, db } = await open({ tasks: [
    mk('A-AMBER', 'red_flag', 1.75 * H), mk('B-RED', 'red_flag', 3 * H, { problem: 'limping front-left leg', red_flags: ['bleeding', 'not_eating'], condition: 'wounds_injury' }),
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
    t.ok(await page.locator('.claim-btn, .unclaim-btn').count() === 0, 'no "I\'ve got this" / Release buttons any more');
    t.ok((await row('B-RED').textContent()).includes('Flagged'), 'case card shows when it was flagged');
    await row('D-R25').locator('.pick-up').click();
    await page.waitForTimeout(250);
    const d25 = (await db()).tasks.find(x => x.title === 'D-R25');
    t.ok(!!d25.claimed_at && !d25.claimed_by, 'Pick up stamps claimed_at with no initials');
    t.ok((await row('D-R25').textContent()).includes('Picked up'), 'picked-up chip shown');
    t.ok(await row('D-R25').locator('.lvl-amber').count() === 0, 'picked-up case no longer ages');

    // the hand-off link carries red flags and suspected condition to the shift tool
    const href = await row('B-RED').locator('.pick-up').getAttribute('href');
    const handoff = JSON.parse(new URL(href).searchParams.get('items'))[0];
    t.ok(handoff.problem === 'limping front-left leg' && handoff.redFlags.join() === 'Bleeding,Not eating' && handoff.condition === 'Wounds / injury / trauma', 'hand-off carries problem, red-flag labels and suspected condition (' + JSON.stringify(handoff) + ')');

    t.ok(await row('C-URG').locator('.bump-btn').count() === 0, 'bump only offered on routine cases');
    await row('F-NEW').locator('.bump-btn').click();
    await page.waitForTimeout(200);
    t.ok((await col('board-urgent')).includes('F-NEW'), 'bumped case moves to the urgent column');
    t.ok((await db()).tasks.find(x => x.title === 'F-NEW').urgency === 'urgent', 'urgency saved as urgent');

    await page.selectOption('#role-select', 'attendant');
    await page.waitForTimeout(200);
    const firstRow = await page.textContent('#queue-tbody tr');
    t.ok(firstRow.includes('B-RED') && firstRow.includes('Red flag'), 'Floor table lists the most overdue first with its tier');
    const heads = await page.textContent('.queue-table thead');
    t.ok(heads.includes('Flagged') && heads.includes('Time left'), 'Floor table has Flagged and Time left columns');
    t.ok(/overdue/.test(firstRow) && /\d{1,2}:\d{2}/.test(firstRow), 'first row shows when it was flagged and that it is overdue');
    const pillColor = cls => page.evaluate(c => { const e = document.querySelector('#queue-tbody .status-pill.' + c); return e ? getComputedStyle(e).color : null; }, cls);
    const urgC = await pillColor('urgent'), rfC = await pillColor('red_flag');
    t.ok(urgC && rfC && urgC !== rfC, 'Urgent pill colour differs from Red flag pill (' + urgC + ' vs ' + rfC + ')');
    t.ok(errors.length === 0, 'no page errors: ' + errors.join('; '));
  } finally {
    await browser.close();
  }
  t.done();
})();
