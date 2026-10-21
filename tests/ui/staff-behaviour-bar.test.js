const { open } = require('./harness');
const t = require('./check')('staff-behaviour-bar');
(async () => {
  const s = await open({}, 'index.html');
  try {
    await s.page.waitForSelector('#bk-submit', { timeout: 5000 });
    const bar = await s.page.evaluate(() => { const nr = document.getElementById('nurse-requests'), bh = document.getElementById('bh-bar'); return !!(nr.compareDocumentPosition(bh) & Node.DOCUMENT_POSITION_FOLLOWING); });
    t.ok(bar, 'the behaviour bar sits below the nurse request bar');
    t.ok((await s.page.$$eval('#bk-kind option', os => os.map(o => o.value))).join() === 'courthold,surrender_history,incident_review,behaviour_review,other', 'task kinds');
    t.ok((await s.page.$$eval('#bk-window option', os => os.map(o => o.value))).join() === '30_60m,today,48h', 'time frames');
    await s.page.click('#bk-submit');
    t.ok(/animal ID/i.test(await s.page.textContent('#bk-error')), 'asks for the animal ID');
    await s.page.fill('#bk-animal', 'BEH-1'); await s.page.selectOption('#bk-kind', 'behaviour_review');
    await s.page.click('#bk-submit');
    t.ok(/reason/i.test(await s.page.textContent('#bk-error')), 'behaviour review needs the reason');
    await s.page.fill('#bk-reason', 'bit a volunteer');
    await s.page.click('#bk-submit');
    t.ok(/initials/i.test(await s.page.textContent('#bk-error')), 'and initials');
    t.ok((await s.db()).behaviour_tasks.length === 0, 'nothing written yet');
    await s.page.fill('#bk-initials', 'ab'); await s.page.dispatchEvent('#bk-initials', 'change');
    await s.page.selectOption('#bk-room', 'Pound 2'); await s.page.fill('#bk-pen', '4');
    await s.page.selectOption('#bk-window', '30_60m');
    await s.page.click('#bk-submit');
    await s.page.waitForFunction(() => window.__db.behaviour_tasks.length === 1);
    const r = (await s.db()).behaviour_tasks[0];
    t.ok(r.lane === 'incoming' && r.location === 'Pound 2 / 4' && r.due_window === '30_60m' && r.flagged_by === 'AB' && r.reason === 'bit a volunteer', 'lands in Incoming with place, time frame, reason, initials');
    await s.page.fill('#bk-animal', 'BEH-2'); await s.page.selectOption('#bk-kind', 'courthold'); await s.page.fill('#bk-reason', '');
    await s.page.check('#bk-tl'); await s.page.click('#bk-submit');
    await s.page.waitForFunction(() => window.__db.behaviour_tasks.length === 2);
    const c = (await s.db()).behaviour_tasks[1];
    t.ok(c.lane === 'tl' && c.courthold === true && c.kind === 'courthold', 'courthold reassessment sent straight to TL');
    await s.page.fill('#bk-animal', 'BEH-3'); await s.page.selectOption('#bk-kind', 'other'); await s.page.uncheck('#bk-tl'); await s.page.click('#bk-submit');
    t.ok(/describe/i.test(await s.page.textContent('#bk-error')), '"Other" needs a description');
    t.ok(s.errors.length === 0, 'no page errors: ' + s.errors.join('; '));
  } finally { await s.browser.close(); }
  t.done();
})();
