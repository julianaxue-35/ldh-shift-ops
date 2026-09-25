// Round 3, Task 5: vets.html — case queue (pick up / bump / DONE), the
// medication DONE panel, "Request a treatment" (moved unchanged), "Start a
// shift" (moved unchanged), and the shared memo board.
// 2026-09-26: the passcode moved from gating each action to gating entry to
// the page itself (she found per-click prompts unhelpful — "not when i pick
// things up"). Part 0 covers the entry gate; every other part opens the page
// with the harness's default auto-clear-the-gate behaviour and then expects
// every action to run immediately, with no per-action prompt.
const { open } = require('./harness');
const t = require('./check')('vets-page');
const ago = ms => new Date(Date.now() - ms).toISOString();
const H = 3600 * 1000;

(async () => {
  /* ============================================================
     Part 0: the page itself is gated — wrong passcode blocks entry
     and keeps re-prompting; the right one reveals the app once and
     nothing on the page prompts again afterward.
     ============================================================ */
  const zero = await open({}, 'vets.html', { skipRoleGate: true });
  try {
    t.ok(await zero.page.locator('#oc-role-gate').count() === 1, 'vets.html shows the entry gate before the app');
    t.ok(!(await zero.page.isVisible('#app-root')), 'the app is not visible while the gate is up');
    t.ok((await zero.page.getAttribute('#oc-role-gate', 'data-role')) === 'vet', 'the gate is for the vet role');

    await zero.page.fill('#oc-role-gate .oc-gate-input', 'wrong-code');
    await zero.page.click('#oc-role-gate .oc-gate-submit');
    await zero.page.waitForFunction(() => document.querySelector('#oc-gate-error') && getComputedStyle(document.querySelector('#oc-gate-error')).display !== 'none');
    t.ok(await zero.page.locator('#oc-role-gate').count() === 1, 'the wrong passcode keeps the gate up');
    t.ok(!(await zero.page.isVisible('#app-root')), 'the app still is not visible');

    await zero.page.fill('#oc-role-gate .oc-gate-input', 'vet2026');
    await zero.page.click('#oc-role-gate .oc-gate-submit');
    await zero.page.waitForSelector('#oc-role-gate', { state: 'detached' });
    t.ok(await zero.page.isVisible('#app-root'), 'the right passcode reveals the app');
    t.ok((await zero.page.locator('#ops-nav a.active').textContent()) === 'Vets', 'nav populates once the gate clears');

    t.ok(zero.errors.length === 0, 'no page errors: ' + zero.errors.join('; '));
  } finally {
    await zero.browser.close();
  }

  /* ============================================================
     Part 1: pick up, bump, DONE — all immediate, no per-action
     prompt now that the page itself is gated at entry.
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

    /* ---------- Pick up: immediate, no prompt ---------- */
    await a.page.locator('.attn-item', { hasText: 'PICKUP-1' }).locator('.pick-up-btn').click();
    await a.page.waitForTimeout(250);
    t.ok(await a.page.locator('.oc-modal-overlay').count() === 0, 'pick-up runs with no passcode prompt (the page itself was already gated)');

    let tasks = (await a.db()).tasks;
    const pickedUp = tasks.find(x => x.title === 'PICKUP-1');
    t.ok(pickedUp.claimed_at != null, 'pick-up stamps claimed_at');
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

    /* ---------- Bump: immediate, no prompt ---------- */
    await a.page.locator('.attn-item', { hasText: 'BUMP-1' }).locator('.bump-btn').click();
    await a.page.waitForTimeout(200);
    t.ok(await a.page.locator('.oc-modal-overlay').count() === 0, 'bump runs with no passcode prompt');
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
     the memo board (posting and ticking both immediate now).
     ============================================================ */
  const b = await open({ memos: [{ author: 'Shelter Staff', text: 'Cage 4 latch is loose', done: false }] }, 'vets.html');
  try {
    t.ok((await b.page.textContent('#nurse-treatments')).includes('Request a treatment — vets'), 'treatment request card moved here unchanged');
    t.ok(await b.page.locator('#nt-location option').count() === 13, 'treatment form location select filled from the shared list');
    t.ok(await b.page.isVisible('#start-shift-card'), 'Start a shift card present');
    t.ok(await b.page.locator('#start-shift-card a.shift-launch').count() === 3, 'Start a shift links to all three shift tools');

    await b.page.fill('#memo-text', 'Extra towels needed in Pound 3');
    await b.page.click('#memo-submit');
    await b.page.waitForTimeout(200);
    let memos = (await b.db()).memos;
    t.ok(memos.some(m => m.text === 'Extra towels needed in Pound 3'), 'posting a memo works');

    // Ticking one off runs immediately too — no per-action prompt now that
    // the page itself is gated. (Posting the memo above triggers a realtime
    // reload that re-sorts the list newest-first, so target the original
    // memo by its text rather than by position.)
    const tick = b.page.locator('.memo', { hasText: 'Cage 4 latch is loose' }).locator('.memo-tick');
    await tick.click();
    await b.page.waitForTimeout(250);
    t.ok(await b.page.locator('.oc-modal-overlay').count() === 0, 'ticking a memo runs with no passcode prompt');
    memos = (await b.db()).memos;
    t.ok(memos.find(m => m.text === 'Cage 4 latch is loose').done === true, 'the tick took effect immediately');

    t.ok(b.errors.length === 0, 'no page errors: ' + b.errors.join('; '));
  } finally {
    await b.browser.close();
  }

  /* ============================================================
     Part 3: batch pick-up — select cases across tier columns, one
     immediate hand-off for all of them sorted by location, clear
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

    /* ---------- batch pick-up runs immediately, no prompt ---------- */
    await c.page.click('#batch-pickup-btn');
    await c.page.waitForTimeout(300);
    t.ok(await c.page.locator('.oc-modal-overlay').count() === 0, 'batch pick-up runs with no passcode prompt');

    let tasks = (await c.db()).tasks;
    const bA = tasks.find(x => x.title === 'BATCH-A'), bB = tasks.find(x => x.title === 'BATCH-B');
    t.ok(bA.claimed_at != null && bB.claimed_at != null, 'the batch pick-up stamps claimed_at on every selected case');
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

  /* ============================================================
     Part 4: pick-up TOCTOU — single pick-up loses the race to
     another vet claiming the same case first.
     ============================================================ */
  const seedD = {
    tasks: [
      { title: 'RACE-1', location: 'Pound 1', shift: 'sick_injured', type: 'shelter', urgency: 'routine', created_at: ago(1 * H) },
    ]
  };
  const d = await open(seedD, 'vets.html');
  try {
    await d.page.evaluate(() => {
      window.__openedUrls = []; window.open = (u) => window.__openedUrls.push(u);
      window.__alerts = []; window.alert = (m) => window.__alerts.push(m);
    });
    // Simulate another vet claiming RACE-1 the instant before this vet
    // submits the pick-up (bypassing this tab's stale in-memory cache).
    const seededTasks = (await d.db()).tasks;
    const raceId = seededTasks.find(x => x.title === 'RACE-1').id;
    await d.page.evaluate((id) => { window.__db.tasks.find(t => t.id === id).claimed_at = new Date().toISOString(); }, raceId);

    await d.page.locator('.attn-item', { hasText: 'RACE-1' }).locator('.pick-up-btn').click();
    await d.page.waitForTimeout(300);

    const alertsD = await d.page.evaluate(() => window.__alerts);
    t.ok(alertsD.some(m => m.includes('RACE-1') && m.includes('already picked up by someone else')),
      'single pick-up on an already-claimed-elsewhere case shows the "already picked up" message: ' + JSON.stringify(alertsD));
    t.ok((await d.page.evaluate(() => window.__openedUrls.length)) === 0, 'no hand-off tab opens when the single pick-up lost the race');

    t.ok(d.errors.length === 0, 'no page errors: ' + d.errors.join('; '));
  } finally {
    await d.browser.close();
  }

  /* ============================================================
     Part 5: pick-up TOCTOU — batch pick-up where one of two
     selected cases gets claimed elsewhere mid-flow; the other one
     still succeeds and the loser is reported.
     ============================================================ */
  const seedE = {
    tasks: [
      { title: 'RACE-A', location: 'Pound 1', shift: 'sick_injured', type: 'shelter', urgency: 'routine', created_at: ago(1 * H) },
      { title: 'RACE-B', location: 'Pound 2', shift: 'sick_injured', type: 'shelter', urgency: 'routine', created_at: ago(2 * H) },
    ]
  };
  const eTab = await open(seedE, 'vets.html');
  try {
    await eTab.page.evaluate(() => {
      window.__openedUrls = []; window.open = (u) => window.__openedUrls.push(u);
      window.__alerts = []; window.alert = (m) => window.__alerts.push(m);
    });

    await eTab.page.locator('.attn-item', { hasText: 'RACE-A' }).locator('.pickup-check').check();
    await eTab.page.locator('.attn-item', { hasText: 'RACE-B' }).locator('.pickup-check').check();

    // Simulate RACE-B getting claimed by someone else mid-flow.
    const seededE = (await eTab.db()).tasks;
    const raceBId = seededE.find(x => x.title === 'RACE-B').id;
    await eTab.page.evaluate((id) => { window.__db.tasks.find(t => t.id === id).claimed_at = new Date().toISOString(); }, raceBId);

    await eTab.page.click('#batch-pickup-btn');
    await eTab.page.waitForTimeout(300);

    const tasksAfterE = (await eTab.db()).tasks;
    t.ok(tasksAfterE.find(x => x.title === 'RACE-A').claimed_at != null, 'batch pick-up still claims the case that was actually free');

    const alertsE = await eTab.page.evaluate(() => window.__alerts);
    t.ok(alertsE.some(m => m.includes('RACE-B') && m.includes('already picked up by someone else')),
      'batch pick-up reports the case claimed elsewhere: ' + JSON.stringify(alertsE));

    const openedUrlsE = await eTab.page.evaluate(() => window.__openedUrls);
    t.ok(openedUrlsE.length === 1, 'a hand-off tab still opens for the case that succeeded');
    const itemsE = JSON.parse(new URL(openedUrlsE[0]).searchParams.get('items'));
    t.ok(itemsE.length === 1 && itemsE[0].id === 'RACE-A', 'the hand-off only includes the case that actually got claimed');

    t.ok(eTab.errors.length === 0, 'no page errors: ' + eTab.errors.join('; '));
  } finally {
    await eTab.browser.close();
  }

  /* ============================================================
     Part 6: undo on a completed medication case must clear the
     nurse's medication step (med_done_at/med_done_by) but leave
     vet_done_at intact, so the case returns to "waiting on
     medication" (nurse page) rather than back to the vet queue.
     ============================================================ */
  const seedF = {
    tasks: [
      { title: 'UNDO-MED', location: 'Pound 1', shift: 'sick_injured', type: 'medication', urgency: 'urgent',
        needs_medication: true, sm_number: 'SM4242', claimed_at: ago(2 * H), vet_done_at: ago(90 * 60 * 1000),
        med_chart_done: true, med_label: 'Metacam 0.5 mL SID x 5 days',
        med_done_by: 'AB', med_done_at: ago(30 * 60 * 1000),
        done: true, completed_by_role: 'vet_nurse', completed_at: ago(30 * 60 * 1000), created_at: ago(3 * H) },
    ]
  };
  const f = await open(seedF, 'vets.html');
  try {
    t.ok((await f.page.textContent('#completed-list')).includes('UNDO-MED'), 'the completed medication case starts in the Completed list');

    await f.page.locator('.completed-row', { hasText: 'UNDO-MED' }).locator('.undo-done').click();
    await f.page.waitForTimeout(300);
    t.ok(await f.page.locator('.oc-modal-overlay').count() === 0, 'undo runs with no passcode prompt');

    const tasksAfterF = (await f.db()).tasks;
    const undone = tasksAfterF.find(x => x.title === 'UNDO-MED');
    t.ok(undone.done === false, 'undo puts the medication case back to not-done');
    t.ok(undone.med_done_at === null && undone.med_done_by === null, 'undo clears med_done_at and med_done_by');
    t.ok(undone.vet_done_at != null, 'undo leaves vet_done_at untouched (survives)');

    const stage = await f.page.evaluate((task) => LDHLogic.stageOf(task, Date.now()), undone);
    t.ok(stage === 'waiting_medication', 'undone medication case is back to waiting_medication (not flagged): got ' + stage);

    t.ok(!(await f.page.textContent('#completed-list')).includes('UNDO-MED'), 'the case leaves the Completed list');
    const openRow = f.page.locator('.attn-item', { hasText: 'UNDO-MED' });
    t.ok((await openRow.textContent()).includes('waiting on medication'), 'the case reappears on the open board showing waiting-on-medication');
    t.ok(await openRow.locator('.done-btn').count() === 0, 'no DONE button on it — not re-completable by a bare click');
    t.ok(await openRow.locator('.pick-up-btn').count() === 0, 'no pick-up button either — it never goes back to the vet queue');

    t.ok(f.errors.length === 0, 'no page errors: ' + f.errors.join('; '));
  } finally {
    await f.browser.close();
  }

  /* ============================================================
     Part 7: Offsite detail must ride along in the hand-off's
     `problem` field — the bare `location` string has to stay
     unchanged ("Offsite") since Sick & Injured's sync-completion
     Edge Function upserts on (title, location, shift).
     ============================================================ */
  const seedG = {
    tasks: [
      { title: 'OFFSITE-PICKUP', location: 'Offsite', location_detail: 'Foster carer — J. Smith',
        shift: 'sick_injured', type: 'foster', urgency: 'routine', problem: 'mild limp', created_at: ago(1 * H) },
      { title: 'OFFSITE-NOPROBLEM', location: 'Offsite', location_detail: 'Rescue group ABC',
        shift: 'sick_injured', type: 'rescue', urgency: 'routine', created_at: ago(2 * H) },
    ]
  };
  const g = await open(seedG, 'vets.html');
  try {
    await g.page.evaluate(() => { window.__openedUrls = []; window.open = (u) => window.__openedUrls.push(u); });

    await g.page.locator('.attn-item', { hasText: 'OFFSITE-PICKUP' }).locator('.pick-up-btn').click();
    await g.page.waitForTimeout(300);

    let openedUrlsG = await g.page.evaluate(() => window.__openedUrls);
    t.ok(openedUrlsG.length === 1, 'Offsite pick-up opens exactly one hand-off tab');
    let itemsG = JSON.parse(new URL(openedUrlsG[0]).searchParams.get('items'));
    t.ok(itemsG[0].location === 'Offsite', 'the bare location field stays "Offsite" (matches the Sick & Injured upsert key)');
    t.ok(itemsG[0].problem.includes('Foster carer — J. Smith'), 'the foster/suburb detail rides along in the problem field: ' + itemsG[0].problem);
    t.ok(itemsG[0].problem.includes('mild limp'), 'the original problem text is preserved alongside the Offsite detail');

    // A second Offsite case with no free-text problem: the detail should
    // still appear, with no stray leading separator.
    await g.page.locator('.attn-item', { hasText: 'OFFSITE-NOPROBLEM' }).locator('.pick-up-btn').click();
    await g.page.waitForTimeout(300);
    openedUrlsG = await g.page.evaluate(() => window.__openedUrls);
    t.ok(openedUrlsG.length === 2, 'second Offsite pick-up opens its own hand-off tab');
    const itemsG2 = JSON.parse(new URL(openedUrlsG[1]).searchParams.get('items'));
    t.ok(itemsG2[0].problem === 'Offsite: Rescue group ABC', 'with no existing problem text, the detail stands alone with no stray separator: ' + itemsG2[0].problem);

    t.ok(g.errors.length === 0, 'no page errors: ' + g.errors.join('; '));
  } finally {
    await g.browser.close();
  }

  t.done();
})();
