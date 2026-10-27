const { open } = require('./harness');
const t = require('./check')('fir-page');
const ago = ms => new Date(Date.now() - ms).toISOString();
const D = 24 * 3600e3;
(async () => {
  const b = await open({ fsa_cats: [
    { id: 'c5', status: 'active', updated_at: ago(1000), cage: 5, animal_id: 'FICT-5', intake_at: ago(2 * D), intake_type: 'stray', description: 'grey DSH', data: { sessions: {} } },
    { id: 'c9', status: 'active', updated_at: ago(1000), cage: 9, animal_id: 'FICT-9', intake_at: ago(6 * D), data: { sessions: { s1: { doneAt: ago(5 * D), by: 'AB' }, s2: { doneAt: ago(5 * D), by: 'AB' }, s3: { doneAt: ago(4 * D), by: 'AB' }, s4: { doneAt: ago(4 * D), by: 'AB' } } } },
    { id: 'c31', status: 'active', updated_at: ago(1000), cage: 31, animal_id: 'FICT-31', intake_at: ago(60e3), data: { sessions: {} } }
  ] }, 'behaviour.html');
  const p = b.page;
  const openSec = (k) => p.evaluate((k) => { const d = document.querySelector('#fir-drawer details.sec[data-sec="' + k + '"]'); if (!d.open) d.open = true; }, k);
  const cage = (n) => '.fir .cage[data-cage="' + n + '"]';
  try {
    // it is a tab INSIDE the Behaviour page (same passcode), not a page of its own
    await p.waitForSelector('#bh-tabbtn-fir');
    t.ok(await p.locator('#bh-tab-fir').isHidden() && await p.locator('#bh-tab-tasks').isVisible(), 'the Behaviour page opens on its tasks; the FIR tab is hidden until chosen');
    t.ok(!(await p.textContent('#ops-nav')).includes('FIR'), 'there is no separate FIR page in the navigation');
    await p.click('#bh-tabbtn-fir');
    t.ok(await p.locator('#bh-tab-fir').isVisible() && await p.locator('#bh-tab-tasks').isHidden(), 'the FIR room tab shows');
    await p.waitForSelector(cage(5));
    // reminders banner (visible on the Behaviour page itself) for overdue assessments and notes not in ShelterMate
    const bn = await p.textContent('#bh-fir-banner');
    t.ok(await p.locator('#bh-fir-banner').isVisible() && /thing/.test(bn) && /Cage 5 \u00B7 FICT-5/.test(bn) && /assessment/.test(bn), 'a banner reminds staff of overdue assessments: ' + bn.replace(/\s+/g, ' ').slice(0, 120));
    t.ok(/Cage 9 \u00B7 FICT-9 \u2014 notes are not in ShelterMate yet/.test(bn), 'and of notes still not in ShelterMate two days after the final assessment');
    t.ok((await p.getAttribute(cage(9), 'class')).includes('late'), 'those cages are outlined in red on the map');
    t.ok(await p.locator(cage(31)).getAttribute('class').then(c => !c.includes('late')), 'a cat that arrived today has nothing to pick up');
    t.ok(/Start of the day/.test(await p.textContent('#fir-whowhy')), 'the tab asks for the staff initials at the start of the day');
    await p.fill('#fir-who', 'ab'); await p.dispatchEvent('#fir-who', 'change');
    t.ok((await p.inputValue('#bh-initials')) === 'AB' && /go on the assessments/.test(await p.textContent('#fir-whowhy')), 'initials entered once on the tablet are kept for the day');
    t.ok(await p.locator('.fir .cage').count() === 32, 'the FIR room shows cages 1 to 32');
    t.ok(await p.locator('.room-main .cage').count() === 24 && await p.locator('.room-side .cage').count() === 8, '24 cages in the main block and 8 in the small block');
    t.ok((await p.$$eval('.room-main .cage', els => els.map(e => e.dataset.cage).join())) === Array.from({ length: 24 }, (_, i) => i + 1).join(), 'main block runs 1-24, three to a column');
    t.ok((await p.$$eval('.room-side .cage', els => els.map(e => e.dataset.cage).join())) === '27,26,25,28,29,32,31,30', 'small block rows: 27 26 25 / 28 29 / 32 31 30');
    t.ok(await p.locator('.cage.mark').count() === 0, 'no fixed marker: occupied cages are simply the ones with a cat in them');
    t.ok(/FICT-5/.test(await p.textContent(cage(5))) && /Day 1 AM due/.test(await p.textContent(cage(5))), 'a cat from two days ago shows its ID and "Day 1 AM due"');
    t.ok(/Day 0/.test(await p.textContent(cage(31))), 'a cat that arrived just now is Day 0');
    // add a cat
    await p.click(cage(7));
    t.ok((await p.$$eval('#fir-add-hour option', os => os.length)) === 24 && (await p.inputValue('#fir-add-hour')) === String(new Date().getHours()).padStart(2, '0') && !(await p.locator('#fir-add-desc').count()), 'the arrival time is picked to the hour (defaults to this hour) and there is no description box');
    await p.selectOption('#fir-add-hour', '14'); await p.fill('#fir-add-id', 'FICT-7'); await p.fill('#fir-add-type', 'surrender'); await p.click('#fir-add-save');
    await p.waitForFunction(() => /FICT-7/.test(document.querySelector('.fir .cage[data-cage="7"]').textContent));
    const row7 = await p.evaluate(() => window.__db.fsa_cats.find(c => c.cage === 7));
    t.ok(row7 && row7.animal_id === 'FICT-7' && row7.intake_type === 'surrender', 'adding a cat stores it against the cage');
    t.ok(new Date(row7.intake_at).getHours() === 14 && new Date(row7.intake_at).getMinutes() === 0, 'and its arrival time is on the hour (2 pm), no minutes');
    await p.click(cage(8)); await p.fill('#fir-add-id', 'fict-7'); await p.click('#fir-add-save');
    t.ok(/already in cage 7/.test(await p.textContent('#fir-add-err')), 'the same ID cannot go in two cages'); await p.click('#fir-add-cancel');

    // open cage 5: Day 1 AM is the assessment that is due
    await p.click(cage(5));
    await p.waitForSelector('#fir-drawer .stab');
    t.ok((await p.getAttribute('#fir-drawer .stab[data-sid="s1"]', 'aria-selected')) === 'true', 'the assessment that is due (Day 1 AM) opens first');
    t.ok((await p.$$eval('#fir-drawer details.sec', els => els.map(e => e.open).join())) === 'true,false,false,false', 'A to D each have a heading; A is open, the rest are collapsed');
    await openSec('B');
    t.ok(await p.locator('#fir-drawer details.sec[data-sec="B"] .tk').count() === 10, 'opening B shows its 10 behaviours');

    // initials are required to assess
    await p.evaluate(() => { document.getElementById('bh-initials').value = ''; });
    await p.locator('input[data-tick="A.all.reach"]').dispatchEvent('click');
    t.ok(!(await p.locator('input[data-tick="A.all.reach"]').isChecked()) && await p.locator('#fir-whobar.need').count() === 1, 'without initials a tick is refused and the initials box is highlighted');
    await p.click('[data-ans="a_noeat"][data-v="1"]');
    t.ok((await p.textContent('#fir-pts-total')) === '0', 'and so is a points answer');
    await p.fill('#fir-dr-init', 'ab'); await p.dispatchEvent('#fir-dr-init', 'change');
    t.ok((await p.inputValue('#bh-initials')) === 'AB', 'initials typed on the cat page are the same initials as the sidebar');

    // grey circles
    await p.check('input[data-tick="A.all.reach"]'); await p.check('input[data-tick="A.all.sniff"]');
    t.ok(/○ 2/.test(await p.textContent('[data-cnt="A"]')), 'the section heading counts the circles ticked');
    t.ok(/Full points scoring completed/.test(await p.textContent('#fir-result-wrap')) && !(await p.locator('.banner.grad').count()), '2 circles: still full points scoring');
    // points yes/no
    await p.click('[data-ans="a_noeat"][data-v="1"]'); await p.click('[data-ans="a_aff"][data-v="1"]'); await openSec('C'); await p.click('[data-ans="c_head"][data-v="1"]');
    t.ok((await p.textContent('#fir-pts-total')) === '27', 'Yes answers add 7 + 9 + 11 = 27 automatically');
    t.ok(/4 questions not answered/.test(await p.textContent('#fir-pts-warn')), 'the total warns about unanswered questions');
    // 4th circle across assessments -> early graduate
    await p.click('.stab[data-sid="s2"]'); await p.waitForSelector('#fir-drawer details.sec');
    t.ok(/No points on PM/.test(await p.textContent('.totalbar')), 'PM assessments carry no points');
    await p.check('input[data-tick="A.all.approach"]'); await openSec('C'); await p.check('input[data-tick="C.all.yawn"]');
    await p.waitForTimeout(100);
    t.ok(await p.locator('.banner.grad').count() === 1 && /Early graduation/.test(await p.textContent('#fir-result-wrap')), '4 circles across the assessments = early graduate, with a banner');
    t.ok((await p.getAttribute(cage(5), 'class')).includes('s-graduate') && /enter in SM/.test(await p.textContent(cage(5))), 'the cage turns graduate-green and says the notes still need entering in ShelterMate');
    t.ok(/Add these notes to ShelterMate and tick/.test(await p.textContent('.banner.sm')), 'staff are prompted to enter the notes in ShelterMate first');
    // undo the extra circles, then score Day 2 AM
    await p.uncheck('input[data-tick="A.all.approach"]'); await p.uncheck('input[data-tick="C.all.yawn"]');
    await p.waitForTimeout(100);
    t.ok(await p.locator('.banner.grad').count() === 0, 'unticking brings it back to full points scoring');
    await p.click('.stab[data-sid="s3"]');
    await p.click('[data-ans="a_eye"][data-v="1"]'); await openSec('B'); await p.click('[data-ans="b_alert"][data-v="1"]'); await p.click('[data-ans="b_back"][data-v="1"]');
    t.ok((await p.textContent('#fir-pts-total')) === '25', 'Day 2 AM: 7 + 9 + 9 = 25');
    t.ok(/1 – Extremely likely to be socialised/.test(await p.textContent('#fir-result-wrap')), 'Day 1 = 27 and Day 2 = 25 gives outcome 1 on the chart');
    t.ok((await p.getAttribute(cage(5), 'class')).includes('s-outcome1'), 'the cage shows FSA 1');
    // the ShelterMate note
    await p.fill('#fir-f-beh', 'Day 1 - in litter tray, flattened.\nDay 2 - on den.'); await p.selectOption('#fir-f-fas', '4'); await p.selectOption('#fir-f-plan', 'Behaviour modification');
    const tmpl = await p.textContent('#fir-tmpl');
    t.ok(/^Graduation status: Full points scoring completed\nOne and done behaviours: 0\n4 or more behaviour: 2\nDay 1 points: 27\nDay 2 points: 25\nSocialisation status: 1 – extremely likely to be socialised\nBehaviour: Day 1 - in litter tray, flattened. Day 2 - on den.\nFAS: 4\nPLAN: Behaviour modification\nAssessed by: Day 1 AM AB, Day 2 AM AB\nBehaviour notes by: AB$/.test(tmpl), 'the ShelterMate text is filled in automatically, with initials for each assessment and for the behaviour notes: ' + JSON.stringify(tmpl));
    t.ok(await p.locator('#fir-drawer details:has-text("FAS scoring reference") img').count() === 1 && !(await p.locator('#fir-drawer details:has-text("FAS scoring reference") img').isVisible()), 'the FAS chart is hidden until tapped');
    t.ok((await p.$$eval('#fir-f-fas option', os => os.map(o => o.value).join())) === ',1,2,3,4,5', 'FAS runs 1 to 5');
    t.ok((await p.$$eval('#fir-f-plan option', os => os.map(o => o.textContent).join('|'))) === '-|Behaviour modification|General population adoption|Behavioural euthanasia', 'the three plan options');
    await p.click('#fir-btn-copy'); await p.waitForFunction(() => /Copied/.test((document.getElementById('oc-toast') || {}).textContent || ''), null, { timeout: 4000 }).catch(() => {});
    t.ok(/Copied/.test(await p.textContent('#oc-toast')), 'Copy for ShelterMate confirms it copied');
    // saved to the shared database, with who did what
    await p.waitForTimeout(900);
    const saved = await p.evaluate(() => window.__db.fsa_cats.find(c => c.cage === 5));
    t.ok(saved.data.sessions.s1.ticks['A.all.reach'] && saved.data.sessions.s1.answers.c_head === true && saved.data.sessions.s3.answers.b_back === true && saved.data.fas === '4' && saved.data.plan === 'Behaviour modification', 'everything is saved to the shared record');
    t.ok(saved.data.sessions.s1.by === 'AB' && saved.data.sessions.s3.by === 'AB' && saved.data.behaviourBy === 'AB', 'each assessment and the behaviour notes carry the staff initials');
    // start on shelter stress meds: a task for the vets with the animal, location, score and behaviour notes
    t.ok(/Start on shelter stress meds/.test(await p.textContent('#fir-stress')), 'the cat has a "Start on shelter stress meds - send to vet" button');
    await p.click('#fir-stress'); await p.waitForTimeout(700);
    const vt = await p.evaluate(() => window.__db.tasks.find(x => x.title === 'FICT-5'));
    t.ok(vt && vt.location === 'FIR Room / 5' && vt.type === 'medication' && vt.needs_medication === true && vt.shift === 'sick_injured' && !vt.done, 'it creates a vet task for FICT-5 in FIR Room, cage 5 (a medication request on the vet board)');
    t.ok(/^Behaviour team request \u2014 dispense shelter stress medication/.test(vt.problem) && /FSA result: 1 \u2013 extremely likely/.test(vt.problem) && /Day 1 points 27, Day 2 points 25/.test(vt.problem) && /FAS 4/.test(vt.problem) && /Behaviour: Day 1 - in litter tray, flattened\. Day 2 - on den/.test(vt.problem) && /sent by AB/.test(vt.problem), 'the task carries the FSA result, both scores, FAS and the behaviour notes: ' + vt.problem.slice(0, 160));
    t.ok(/Sent to the vets/.test(await p.textContent('#fir-stress-wrap')) && /again/.test(await p.textContent('#fir-stress')), 'the cat shows it was sent, and who sent it');
    await p.waitForTimeout(700);
    t.ok((await p.evaluate(() => window.__db.fsa_cats.find(c => c.animal_id === 'FICT-5').data.stressSent)).by === 'AB', 'and the shared record remembers it');
    // mark done needs initials, records them
    await p.click('.stab[data-sid="s1"]'); await p.click('#fir-sess-done'); await p.waitForTimeout(900);
    t.ok(/assessment done/.test(await p.textContent('.donebar')) && /by AB/.test(await p.textContent('.donebar')), 'an assessment can be marked done with the initials');
    // the initials follow each assessment and can be changed by hand
    t.ok((await p.inputValue('#fir-by-sess')) === 'AB', 'the assessment shows who did it (the initials on the tablet)');
    await p.fill('#fir-by-sess', 'cd'); await p.dispatchEvent('#fir-by-sess', 'change'); await p.fill('#fir-by-beh', 'ef'); await p.dispatchEvent('#fir-by-beh', 'change'); await p.waitForTimeout(900);
    let tm = await p.textContent('#fir-tmpl');
    t.ok(/Assessed by: Day 1 AM CD, Day 2 AM AB\nBehaviour notes by: EF$/.test(tm), 'the person can be changed by hand for an assessment and for the behaviour notes: ' + JSON.stringify(tm.split('\n').slice(-2)));
    t.ok(await p.locator('#fir-btn-discharge, #fir-mv-sel, #fir-mv-go').count() === 0, 'there are no move or discharge buttons');
    // ticking "Entered in ShelterMate" completes it: the cage is available straight away
    await p.check('#fir-sm'); await p.waitForTimeout(1200);
    t.ok(!(await p.locator('#fir-drawer-ov.open').count()) && /Empty/.test(await p.textContent(cage(5))), 'ticking Entered in ShelterMate frees the cage straight away');
    const done5 = await p.evaluate(() => window.__db.fsa_cats.find(c => c.animal_id === 'FICT-5'));
    t.ok(done5.status === 'completed' && done5.data.smEntered.by === 'AB', 'the cat is marked completed with who entered it in ShelterMate');
    t.ok(/FICT-5/.test(await p.textContent('#fir-done-wrap')) && /was in cage 5/.test(await p.textContent('#fir-done-wrap')) && /deleted in 7 days/.test(await p.textContent('#fir-done-wrap')), 'it moves to Completed with its animal ID, kept for 7 days');
    t.ok(!/Cage 5 \u00B7 FICT-5/.test(await p.textContent('#bh-fir-banner')), 'and no longer appears in the reminders');
    // put it back within the 7 days
    await p.click('[data-putback][data-cage="5"]'); await p.waitForFunction(() => /FICT-5/.test(document.querySelector('.fir .cage[data-cage="5"]').textContent)); await p.waitForTimeout(300);
    const back5 = await p.evaluate(() => window.__db.fsa_cats.find(c => c.animal_id === 'FICT-5'));
    t.ok(back5.status === 'active' && !back5.data.smEntered && back5.data.sessions.s1.ticks['A.all.reach'], 'Put back returns it to its cage with its assessments, ready to be ticked again');
    // a cat added by mistake (nothing recorded) can be removed
    await p.click(cage(12)); await p.fill('#fir-add-id', 'FICT-OOPS'); await p.click('#fir-add-save'); await p.waitForSelector(cage(12) + ':has-text("FICT-OOPS")');
    await p.click(cage(12)); await p.waitForSelector('#fir-rm'); await p.click('#fir-rm'); await p.waitForTimeout(600);
    t.ok(/Empty/.test(await p.textContent(cage(12))), 'a cat added by mistake can be removed while nothing is recorded');
    // FAQ
    await p.click('#fir-faq-btn'); t.ok(await p.isVisible('#fir-faq') && /FIR room and the FSA/.test(await p.textContent('#fir-faq')), 'the FIR FAQ opens');
    // the Behaviour tasks are untouched
    await p.keyboard.press('Escape'); await p.click('.faq-close >> nth=0').catch(() => {}); await p.click('#bh-tabbtn-tasks');
    t.ok(await p.locator('#send-request').isVisible() && await p.locator('#incoming').isVisible(), 'back on Behaviour tasks, the request card and Incoming are still there');
    t.ok(/FICT-5/.test(await p.textContent('#waiting-list')), 'the stress-meds request shows on the Behaviour page under Requested from the vets');
    t.ok(b.errors.length === 0, 'no page errors: ' + b.errors.join('; '));
  } finally { await b.browser.close(); }
  t.done();
})();
