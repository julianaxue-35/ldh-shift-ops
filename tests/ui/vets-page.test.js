// Round 3, Task 5: vets.html — case queue (pick up / bump / DONE), the
// medication DONE panel, "Request a treatment" (moved unchanged), "Start a
// shift" (moved unchanged), and the shared memo board (post ungated,
// tick/delete gated).
const { open } = require('./harness');
const t = require('./check')('vets-page');
const ago = ms => new Date(Date.now() - ms).toISOString();
const H = 3600 * 1000;

(async () => {
  /* ============================================================
     Part 1: passcode gate on pick-up, then bump/DONE reuse the
     same tab-session unlock (no re-prompt).
     ============================================================ */
  const seedA = {
    tasks: [
      { title: 'PICKUP-1', location: 'Pound 1', shift: 'sick_injured', type: 'shelter', urgency: 'routine',
        problem: 'limping front-left leg', red_flags: ['bleeding_wound'], condition: 'wounds_injury', created_at: ago(1 * H) },
      { title: 'BUMP-1', location: 'Pound 2', shift: 'sick_injured', type: 'shelter', urgency: 'routine', created_at: ago(2 * H) },
      { title: 'DONE-NM', location: 'Pound 3', shift: 'sick_injured', type: 'shelter', urgency: 'urgent', created_at: ago(3 * H) },
      { title: 'DONE-MED', location: 'Pound 4', shift: 'sick_injured', type: 'medication', urgency: 'urgent',
        needs_medication: true, sm_number: 'SM9001', created_at: ago(4 * H) },
    ]
  };
  const a = await open(seedA, 'vets.html');
  try {
    // No NO-GA list on this page.
    t.ok(await a.page.locator('[id*="noga" i]').count() === 0, 'no NO-GA list on the vets page');

    // Nav marks Vets active.
    t.ok((await a.page.locator('#ops-nav a.active').textContent()) === 'Vets', 'sidebar nav marks Vets as current');

    // Column headings use the new tier labels + targets.
    t.ok((await a.page.textContent('#col-red-h')) === 'Emergency · within 2 h', 'Emergency column heading');
    t.ok((await a.page.textContent('#col-urgent-h')) === 'Urgent · within 12–24 h', 'Urgent column heading');
    t.ok((await a.page.textContent('#col-routine-h')) === 'Request checks · within 24–48 h', 'Request checks column heading');

    // Type filter chips present per the brief's list.
    const chips = await a.page.$$eval('#type-filter-bar .filter-chip', els => els.map(e => e.textContent.trim()));
    t.ok(chips.join(',') === 'All,Shelter,Foster,Rescue,Medication,Check-recheck', 'type filter chips: ' + chips.join(','));

    // Capture window.open calls instead of really navigating (the shift-tool
    // origin is aborted by the harness anyway, but this lets us inspect the
    // exact hand-off URL).
    await a.page.evaluate(() => { window.__openedUrls = []; window.open = (u) => { window.__openedUrls.push(u); }; });

    /* ---------- Pick up: cancel blocks it ---------- */
    const pickupBtn = a.page.locator('.pick-up-btn', { hasText: 'Pick up' }).first();
    await a.page.locator('.attn-item', { hasText: 'PICKUP-1' }).locator('.pick-up-btn').click();
    await a.page.waitForSelector('.oc-modal-overlay');
    t.ok((await a.page.textContent('.oc-modal-text')) === 'Enter the vet passcode to pick up cases.', 'pick-up modal names the exact reason');
    await a.page.click('.oc-modal-cancel');
    await a.page.waitForTimeout(150);
    let tasks = (await a.db()).tasks;
    t.ok(tasks.find(x => x.title === 'PICKUP-1').claimed_at == null, 'cancelling the passcode leaves the case unclaimed');
    t.ok((await a.page.evaluate(() => window.__openedUrls.length)) === 0, 'no hand-off tab opened on cancel');

    /* ---------- Pick up: wrong code rejected, right code unlocks ---------- */
    await a.page.locator('.attn-item', { hasText: 'PICKUP-1' }).locator('.pick-up-btn').click();
    await a.page.waitForSelector('.oc-modal-overlay');
    await a.page.fill('.oc-modal-input', 'wrong-code');
    await a.page.click('.oc-modal-submit');
    await a.page.waitForFunction(() => document.querySelector('.oc-modal-error') && getComputedStyle(document.querySelector('.oc-modal-error')).display !== 'none');
    t.ok(await a.page.locator('.oc-modal-overlay').count() === 1, 'wrong code keeps the modal open');
    await a.page.fill('.oc-modal-input', 'vet2026');
    await a.page.click('.oc-modal-submit');
    await a.page.waitForFunction(() => document.querySelectorAll('.oc-modal-overlay').length === 0);
    await a.page.waitForTimeout(250);

    tasks = (await a.db()).tasks;
    const pickedUp = tasks.find(x => x.title === 'PICKUP-1');
    t.ok(pickedUp.claimed_at != null, 'correct code stamps claimed_at');
    t.ok(pickedUp.claimed_by === null, 'claimed_by stays null (no initials for vets)');

    const openedUrls = await a.page.evaluate(() => window.__openedUrls);
    t.ok(openedUrls.length === 1, 'the hand-off tab was opened exactly once');
    const handOffUrl = new URL(openedUrls[0]);
    t.ok(handOffUrl.origin + handOffUrl.pathname === 'https://julianaxue-35.github.io/ldh-shift-tools/sick-injured.html', 'hand-off goes to sick-injured.html');
    const items = JSON.parse(handOffUrl.searchParams.get('items'));
    t.ok(items.length === 1 && items[0].id === 'PICKUP-1' && items[0].location === 'Pound 1' && items[0].problem === 'limping front-left leg',
      'hand-off payload carries id/location/problem');
    t.ok(items[0].redFlags.join() === "Bleeding wound (large cut / can't stop the bleeding)", 'hand-off redFlags use signLabel() text');
    t.ok(items[0].condition === 'Wounds / injury / trauma', 'hand-off condition uses the label, not the raw key');

    /* ---------- Bump: no re-prompt (vet already unlocked this tab) ---------- */
    await a.page.locator('.attn-item', { hasText: 'BUMP-1' }).locator('.bump-btn').click();
    await a.page.waitForTimeout(200);
    t.ok(await a.page.locator('.oc-modal-overlay').count() === 0, 'bump does not re-prompt once vet is unlocked');
    tasks = (await a.db()).tasks;
    t.ok(tasks.find(x => x.title === 'BUMP-1').urgency === 'urgent', 'bump moved Request-checks case to Urgent');
    await a.page.waitForTimeout(150);
    const urgentColText = await a.page.textContent('#board-urgent');
    t.ok(urgentColText.includes('BUMP-1'), 'bumped case now renders in the Urgent column');
    const routineColText = await a.page.textContent('#board-routine');
    t.ok(!routineColText.includes('BUMP-1'), 'bumped case no longer renders in the Request-checks column');

    /* ---------- DONE (non-medication): confirm completes it ---------- */
    await a.page.locator('.attn-item', { hasText: 'DONE-NM' }).locator('.done-btn').click();
    await a.page.waitForSelector('.done-modal-overlay');
    t.ok(await a.page.locator('.done-modal-overlay .done-medlabel').count() === 0, 'no medication fields for a non-medication case');
    await a.page.click('.done-confirm');
    await a.page.waitForTimeout(250);
    tasks = (await a.db()).tasks;
    const doneNm = tasks.find(x => x.title === 'DONE-NM');
    t.ok(doneNm.done === true && doneNm.completed_by_role === 'vet_nurse' && !!doneNm.completed_at, 'non-medication DONE completes the case as vet_nurse');
    t.ok((await a.page.textContent('#completed-list')).includes('DONE-NM'), 'completed case shows in the Completed (last 24h) group');

    /* ---------- DONE (medication): label required, chlorsig quick-insert, then waiting-on-medication ---------- */
    await a.page.locator('.attn-item', { hasText: 'DONE-MED' }).locator('.done-btn').click();
    await a.page.waitForSelector('.done-modal-overlay');
    t.ok(await a.page.locator('.done-modal-overlay .done-medchart').count() === 1, 'medication case shows the Med chart completed checkbox');
    await a.page.click('.done-confirm');
    t.ok(await a.page.isVisible('.done-modal-overlay .done-medlabel-error'), 'confirming with an empty label is blocked and shows an inline error');
    tasks = (await a.db()).tasks;
    t.ok(!tasks.find(x => x.title === 'DONE-MED').done, 'still not done after the blocked confirm');

    const chlorsigBtn = a.page.locator('.done-modal-overlay .chlorsig-btn', { hasText: 'Chlorsig — left eye (L)' });
    await chlorsigBtn.click();
    t.ok((await a.page.inputValue('.done-modal-overlay .done-medlabel')) === 'Chlorsig — left eye (L)', 'quick-insert appends the exact option label text');
    await a.page.check('.done-modal-overlay .done-medchart');
    await a.page.click('.done-confirm');
    await a.page.waitForTimeout(250);
    t.ok(await a.page.locator('.done-modal-overlay').count() === 0, 'modal closes after a valid confirm');

    tasks = (await a.db()).tasks;
    const doneMed = tasks.find(x => x.title === 'DONE-MED');
    t.ok(doneMed.done === false, 'medication hold keeps the case not-done (mirrors the 0010 trigger)');
    t.ok(doneMed.vet_done_at != null, 'vet_done_at stamped');
    t.ok(doneMed.med_chart_done === true && doneMed.med_label === 'Chlorsig — left eye (L)', 'chart flag and label saved');

    const medRowText = await a.page.locator('.attn-item', { hasText: 'DONE-MED' }).textContent();
    t.ok(medRowText.includes('waiting on medication'), 'the case now shows the waiting-on-medication stage');
    t.ok(await a.page.locator('.attn-item', { hasText: 'DONE-MED' }).locator('.done-btn').count() === 0, 'DONE button no longer shown once the vet has handed it to the nurse');

    t.ok(a.errors.length === 0, 'no page errors: ' + a.errors.join('; '));
  } finally {
    await a.browser.close();
  }

  /* ============================================================
     Part 2: "Request a treatment" + courses, "Start a shift", and
     the memo board (post ungated; tick/delete gated).
     ============================================================ */
  const b = await open({ memos: [{ author: 'Shelter Staff', text: 'Cage 4 latch is loose', done: false }] }, 'vets.html');
  try {
    t.ok((await b.page.textContent('#nurse-treatments')).includes('Request a treatment — vets'), 'treatment request card moved here unchanged');
    t.ok(await b.page.locator('#nt-location option').count() === 13, 'treatment form location select filled from the shared list');
    t.ok(await b.page.isVisible('#start-shift-card'), 'Start a shift card present');
    t.ok(await b.page.locator('#start-shift-card a.shift-launch').count() === 3, 'Start a shift links to all three shift tools');

    // Posting a memo needs no passcode.
    await b.page.fill('#memo-text', 'Extra towels needed in Pound 3');
    await b.page.click('#memo-submit');
    await b.page.waitForTimeout(200);
    let memos = (await b.db()).memos;
    t.ok(memos.some(m => m.text === 'Extra towels needed in Pound 3'), 'posting a memo is not gated');

    // Ticking one off IS gated. (Posting the memo above triggers a realtime
    // reload that re-sorts the list newest-first, so target the original
    // memo by its text rather than by position.)
    const tick = b.page.locator('.memo', { hasText: 'Cage 4 latch is loose' }).locator('.memo-tick');
    await tick.click();
    await b.page.waitForSelector('.oc-modal-overlay');
    t.ok((await b.page.textContent('.oc-modal-text')) === 'Enter the vet passcode to tick off a memo.', 'memo tick names the reason');
    await b.page.click('.oc-modal-cancel');
    await b.page.waitForTimeout(150);
    memos = (await b.db()).memos;
    t.ok(memos.every(m => !m.done), 'cancelling the passcode leaves the memo untouched');
    t.ok(!(await tick.isChecked()), 'the checkbox visually reverts when the passcode is cancelled');

    await tick.click();
    await b.page.waitForSelector('.oc-modal-overlay');
    await b.page.fill('.oc-modal-input', 'vet2026');
    await b.page.click('.oc-modal-submit');
    await b.page.waitForTimeout(250);
    memos = (await b.db()).memos;
    t.ok(memos.find(m => m.text === 'Cage 4 latch is loose').done === true, 'the right code allows the tick');

    t.ok(b.errors.length === 0, 'no page errors: ' + b.errors.join('; '));
  } finally {
    await b.browser.close();
  }

  /* ============================================================
     Part 3: batch pick-up — select cases across tier columns, one
     gated hand-off for all of them sorted by location, clear
     selection.
     ============================================================ */
  const seedC = {
    tasks: [
      { title: 'BATCH-A', location: 'Pound 9', shift: 'sick_injured', type: 'shelter', urgency: 'red_flag', created_at: ago(1 * H) },
      { title: 'BATCH-B', location: 'Pound 1', shift: 'sick_injured', type: 'shelter', urgency: 'urgent', created_at: ago(2 * H) },
      { title: 'BATCH-C', location: 'Pound 5', shift: 'sick_injured', type: 'shelter', urgency: 'routine', created_at: ago(3 * H) },
    ]
  };
  const c = await open(seedC, 'vets.html');
  try {
    await c.page.evaluate(() => { window.__openedUrls = []; window.open = (u) => { window.__openedUrls.push(u); }; });

    t.ok(await c.page.isVisible('#batch-pickup-bar') === false, 'batch bar hidden with nothing selected');

    // Select BATCH-A (Emergency column) and BATCH-B (Urgent column).
    await c.page.locator('.attn-item', { hasText: 'BATCH-A' }).locator('.pickup-check').check();
    await c.page.locator('.attn-item', { hasText: 'BATCH-B' }).locator('.pickup-check').check();
    t.ok(await c.page.isVisible('#batch-pickup-bar'), 'batch bar appears once >=1 case is selected');
    t.ok((await c.page.textContent('#batch-pickup-count')) === '2', 'selected count shows 2 across different tier columns');
    t.ok((await c.page.textContent('#batch-pickup-bar')).includes('2 selected, sorted by location'), 'bar wording: "N selected, sorted by location"');

    /* ---------- batch pick-up is gated; cancelling leaves selection + cases untouched ---------- */
    await c.page.click('#batch-pickup-btn');
    await c.page.waitForSelector('.oc-modal-overlay');
    t.ok((await c.page.textContent('.oc-modal-text')) === 'Enter the vet passcode to pick up cases.', 'batch pick-up uses the same gate/reason as single pick-up');
    await c.page.click('.oc-modal-cancel');
    await c.page.waitForTimeout(150);
    let tasks = (await c.db()).tasks;
    t.ok(tasks.find(x => x.title === 'BATCH-A').claimed_at == null && tasks.find(x => x.title === 'BATCH-B').claimed_at == null,
      'cancelling the batch passcode leaves both cases unclaimed');
    t.ok(await c.page.isVisible('#batch-pickup-bar'), 'selection survives a cancelled passcode attempt');

    /* ---------- right code: one prompt for the whole batch, one combined hand-off ---------- */
    await c.page.click('#batch-pickup-btn');
    await c.page.waitForSelector('.oc-modal-overlay');
    await c.page.fill('.oc-modal-input', 'vet2026');
    await c.page.click('.oc-modal-submit');
    await c.page.waitForFunction(() => document.querySelectorAll('.oc-modal-overlay').length === 0);
    await c.page.waitForTimeout(300);

    tasks = (await c.db()).tasks;
    const bA = tasks.find(x => x.title === 'BATCH-A'), bB = tasks.find(x => x.title === 'BATCH-B');
    t.ok(bA.claimed_at != null && bB.claimed_at != null, 'the right code stamps claimed_at on every selected case');
    t.ok(bA.claimed_by === null && bB.claimed_by === null, 'claimed_by stays null for both (no initials)');

    const openedUrls = await c.page.evaluate(() => window.__openedUrls);
    t.ok(openedUrls.length === 1, 'exactly one combined hand-off tab is opened for the whole batch');
    const batchUrl = new URL(openedUrls[0]);
    const batchItems = JSON.parse(batchUrl.searchParams.get('items'));
    t.ok(batchItems.length === 2, 'the hand-off carries both selected cases');
    t.ok(batchItems[0].id === 'BATCH-B' && batchItems[1].id === 'BATCH-A', 'items are sorted by location (Pound 1 before Pound 9)');

    t.ok(!(await c.page.isVisible('#batch-pickup-bar')), 'batch bar hides again once the pick-up completes (selection cleared)');

    /* ---------- clear selection ---------- */
    await c.page.locator('.attn-item', { hasText: 'BATCH-C' }).locator('.pickup-check').check();
    t.ok(await c.page.isVisible('#batch-pickup-bar'), 'bar reappears for a fresh selection');
    await c.page.click('#batch-pickup-clear');
    await c.page.waitForTimeout(150);
    t.ok(!(await c.page.isVisible('#batch-pickup-bar')), 'Clear selection empties the bar');
    t.ok(!(await c.page.locator('.attn-item', { hasText: 'BATCH-C' }).locator('.pickup-check').isChecked()), 'Clear selection unchecks the box');
    tasks = (await c.db()).tasks;
    t.ok(tasks.find(x => x.title === 'BATCH-C').claimed_at == null, 'Clear selection does not pick anything up');

    t.ok(c.errors.length === 0, 'no page errors: ' + c.errors.join('; '));
  } finally {
    await c.browser.close();
  }

  t.done();
})();
