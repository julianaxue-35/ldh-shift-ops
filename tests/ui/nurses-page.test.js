// Round 3, Task 6: nurses.html — medication labels (Copy/Done), vaccination
// pick-up, treatment dose ticks, the NO-GA required list, and the shared
// memo board (post ungated, tick/delete gated).
const { open } = require('./harness');
const t = require('./check')('nurses-page');
const LDHLogic = require('../../lib/ldh-logic');
const ago = ms => new Date(Date.now() - ms).toISOString();
const H = 3600 * 1000;
const todayISO = LDHLogic.localISO(new Date());

async function waitPasscodeError(page) {
  await page.waitForFunction(() => document.querySelector('.oc-modal-error') && getComputedStyle(document.querySelector('.oc-modal-error')).display !== 'none');
}
async function waitPasscodeClosed(page) {
  await page.waitForFunction(() => document.querySelectorAll('.oc-modal-overlay').length === 0);
}

(async () => {
  /* ============================================================
     Tab A: medication labels, vaccination pick-up, dose tick — all
     gated by the SAME per-tab nurse-passcode unlock (like vets.html).
     ============================================================ */
  const seedA = {
    tasks: [
      { title: 'MED-1', location: 'Pound 1', shift: 'sick_injured', type: 'medication', urgency: 'urgent',
        needs_medication: true, vet_done_at: ago(1 * H), med_chart_done: true, med_label: 'Give 1 tablet twice daily x 5 days',
        sm_number: 'SM1234', created_at: ago(2 * H) },
      { title: 'MED-NOT-VET-DONE', location: 'Pound 2', shift: 'sick_injured', type: 'medication', urgency: 'urgent',
        needs_medication: true, vet_done_at: null, sm_number: 'SM5555', created_at: ago(1 * H) },
      { title: 'MED-OFFSITE', location: 'Offsite', location_detail: 'Foster carer Amy', shift: 'sick_injured', type: 'medication', urgency: 'routine',
        needs_medication: true, vet_done_at: ago(30 * 60 * 1000), sm_number: 'SM7777', med_label: 'Eye drops BID', created_at: ago(1 * H) }
    ],
    nurse_requests: [
      { location: 'Cat Room 1', species: 'kitten', animal_count: 3, done_count: 1, arrived_at: ago(30 * 60 * 1000) }
    ],
    nurse_treatments: [
      { id: 'trt1', animal_id: 'DOG-9', location: 'Pound 3', treatment: 'Metronidazole', times_per_day: 2, stopped: false }
    ],
    nurse_treatment_doses: [
      { id: 'dose1', treatment_id: 'trt1', slot_no: 1, due_date: todayISO, done_at: null, done_by: null }
    ]
  };
  const a = await open(seedA, 'nurses.html');
  try {
    /* ---------- Nav ---------- */
    t.ok((await a.page.locator('#ops-nav a.active').textContent()) === 'Nurses', 'sidebar nav marks Nurses as current');

    /* ---------- Medication labels: only appear once vet_done_at is set ---------- */
    let cardsText = await a.page.textContent('#med-labels-list');
    t.ok(cardsText.includes('MED-1'), 'MED-1 (vet done) appears in the medication-labels list');
    t.ok(!cardsText.includes('MED-NOT-VET-DONE'), 'MED-NOT-VET-DONE (no vet_done_at) does NOT appear');
    t.ok(cardsText.includes('SM1234'), 'SM number shown');
    t.ok(cardsText.includes('Chart printed by admission'), 'chart status shown for a med_chart_done card');
    t.ok(cardsText.includes('Give 1 tablet twice daily x 5 days'), 'label text shown');
    t.ok(cardsText.includes('Offsite — Foster carer Amy'), 'Offsite location renders with the em-dash detail rule');
    t.ok(cardsText.includes('No chart'), 'chart status shown for a card with no chart printed');

    /* ---------- Copy button: exact medCopyText() content, ungated ---------- */
    let dbTasks = (await a.db()).tasks;
    const med1 = dbTasks.find(x => x.title === 'MED-1');
    const expectedCopy = LDHLogic.medCopyText(med1);
    await a.page.evaluate(() => { window.__clip = null; navigator.clipboard.writeText = (text) => { window.__clip = text; return Promise.resolve(); }; });
    const med1Card = a.page.locator('.med-label-card', { hasText: 'MED-1' });
    await med1Card.locator('.med-copy-btn').click();
    const clip = await a.page.evaluate(() => window.__clip);
    t.ok(clip === expectedCopy, 'Copy writes the exact medCopyText() string to the clipboard: ' + JSON.stringify(clip));
    t.ok((await med1Card.locator('.med-copy-btn').textContent()) === 'Copied', 'Copy button shows "Copied" feedback');

    /* ---------- Done: cancelling the passcode leaves it untouched ---------- */
    await med1Card.locator('.med-done-btn').click();
    await a.page.waitForSelector('.oc-modal-overlay');
    await a.page.click('.oc-modal-cancel');
    await a.page.waitForTimeout(150);
    dbTasks = (await a.db()).tasks;
    t.ok(!dbTasks.find(x => x.title === 'MED-1').done, 'cancelling the passcode leaves the medication case untouched');

    /* ---------- Done: wrong passcode rejected ---------- */
    await med1Card.locator('.med-done-btn').click();
    await a.page.waitForSelector('.oc-modal-overlay');
    await a.page.fill('.oc-modal-input', 'wrong-code');
    await a.page.click('.oc-modal-submit');
    await waitPasscodeError(a.page);
    t.ok(await a.page.locator('.oc-modal-overlay').count() === 1, 'wrong passcode keeps the modal open');

    /* ---------- Done: right passcode, but empty initials blocks it ---------- */
    // Initials box starts empty and is NOT remembered between visits. myInitials()
    // falls back to window.prompt() when empty; override it to simulate the nurse
    // leaving that prompt blank/cancelled (Playwright's own dialog auto-accept, set
    // up by the harness, only covers native dialogs we don't override — alert() below
    // still goes through it undisturbed).
    await a.page.evaluate(() => { window.prompt = () => null; });
    t.ok((await a.page.inputValue('#initials-input')) === '', 'initials box starts empty');
    await a.page.fill('.oc-modal-input', 'nurse');
    await a.page.click('.oc-modal-submit');
    await waitPasscodeClosed(a.page);
    await a.page.waitForTimeout(200);
    dbTasks = (await a.db()).tasks;
    t.ok(!dbTasks.find(x => x.title === 'MED-1').done, 'Done is blocked with no initials, even with the right passcode');
    t.ok(await a.page.locator('.med-label-card', { hasText: 'MED-1' }).count() === 1, 'MED-1 still on the medication-labels list');

    /* ---------- Done: with initials typed in, completes the case (passcode already unlocked, no re-prompt) ---------- */
    await a.page.fill('#initials-input', 'jx');
    t.ok((await a.page.inputValue('#initials-input')) === 'JX', 'initials are cleaned/uppercased');
    await med1Card.locator('.med-done-btn').click();
    await a.page.waitForTimeout(150);
    t.ok(await a.page.locator('.oc-modal-overlay').count() === 0, 'no re-prompt: nurse already unlocked this tab');
    dbTasks = (await a.db()).tasks;
    const doneMed1 = dbTasks.find(x => x.title === 'MED-1');
    t.ok(doneMed1.done === true, 'Done completes the case');
    t.ok(doneMed1.med_done_by === 'JX', 'med_done_by records initials');
    t.ok(doneMed1.med_done_at != null, 'med_done_at stamped');
    t.ok(doneMed1.completed_by_role === 'vet_nurse', 'completed_by_role set to vet_nurse');
    cardsText = await a.page.textContent('#med-labels-list');
    t.ok(!cardsText.includes('MED-1'), 'MED-1 disappears from the medication-labels list after Done');

    /* ---------- Vaccination requests: pick-up claims, +1 increments ---------- */
    const nrItem = a.page.locator('.attn-item.nr-item', { hasText: 'Cat Room 1' });
    t.ok((await nrItem.textContent()).includes('1 of 3 vaccinated'), 'vaccination request shows progress');
    await nrItem.locator('.nr-claim').click();
    await a.page.waitForTimeout(200);
    let nurseRequests = (await a.db()).nurse_requests;
    t.ok(nurseRequests[0].claimed_by === 'JX', 'pick-up claims with the current initials (already-unlocked tab)');
    await a.page.locator('.attn-item.nr-item', { hasText: 'Cat Room 1' }).locator('.nr-plus').click();
    await a.page.waitForTimeout(200);
    nurseRequests = (await a.db()).nurse_requests;
    t.ok(nurseRequests[0].done_count === 2, '+1 vaccinated increments done_count');

    /* ---------- Treatments due: dose tick records done_by ---------- */
    const doseCheckbox = a.page.locator('.nt-tick').first();
    await doseCheckbox.check();
    await a.page.waitForTimeout(200);
    t.ok(await a.page.locator('.oc-modal-overlay').count() === 0, 'dose tick does not re-prompt (already unlocked)');
    const dose = (await a.db()).nurse_treatment_doses.find(d => d.id === 'dose1');
    t.ok(dose.done_at != null, 'dose tick stamps done_at');
    t.ok(dose.done_by === 'JX', 'dose tick records done_by from the current initials');

    t.ok(a.errors.length === 0, 'no page errors in tab A: ' + JSON.stringify(a.errors));
  } finally {
    await a.browser.close();
  }

  /* ============================================================
     Tab B: NO-GA required list — add and done, both nurse-gated.
     ============================================================ */
  const seedB = {
    noga_requests: [
      { animal_id: 'DOG-99', location: 'Pound 4', task: 'microchip', done: false }
    ]
  };
  const b = await open(seedB, 'nurses.html');
  try {
    let listText = await b.page.textContent('#noga-list');
    t.ok(listText.includes('DOG-99') && listText.includes('Microchip'), 'pre-existing open NO-GA request renders with its task label');

    await b.page.fill('#noga-animal-id', 'CAT-42');
    await b.page.selectOption('#noga-location', 'Offsite');
    t.ok(await b.page.isVisible('#noga-detail-wrap'), 'choosing Offsite reveals the detail field');
    await b.page.fill('#noga-location-detail', 'Vet clinic');
    await b.page.selectOption('#noga-task', 'fiv_test');
    await b.page.fill('#noga-note', 'urgent test');

    /* ---------- Add: cancelling the passcode adds nothing ---------- */
    await b.page.click('#noga-submit');
    await b.page.waitForSelector('.oc-modal-overlay');
    await b.page.click('.oc-modal-cancel');
    await b.page.waitForTimeout(150);
    let noga = (await b.db()).noga_requests;
    t.ok(noga.length === 1, 'cancelling the passcode leaves the NO-GA list unchanged');

    /* ---------- Add: wrong passcode rejected ---------- */
    await b.page.click('#noga-submit');
    await b.page.waitForSelector('.oc-modal-overlay');
    await b.page.fill('.oc-modal-input', 'nope');
    await b.page.click('.oc-modal-submit');
    await waitPasscodeError(b.page);
    noga = (await b.db()).noga_requests;
    t.ok(noga.length === 1, 'wrong passcode still adds nothing');

    /* ---------- Add: right passcode inserts and it appears in the list ---------- */
    await b.page.fill('.oc-modal-input', 'nurse');
    await b.page.click('.oc-modal-submit');
    await waitPasscodeClosed(b.page);
    await b.page.waitForTimeout(200);
    noga = (await b.db()).noga_requests;
    const added = noga.find(r => r.animal_id === 'CAT-42');
    t.ok(added && added.location === 'Offsite' && added.location_detail === 'Vet clinic' && added.task === 'fiv_test' && added.note === 'urgent test',
      'NO-GA add stores animal/location/detail/task/note');
    listText = await b.page.textContent('#noga-list');
    t.ok(listText.includes('CAT-42') && listText.includes('Offsite — Vet clinic') && listText.includes('FIV test'), 'new NO-GA request appears in the list');

    /* ---------- Done: initials recorded (passcode already unlocked from the add above) ---------- */
    await b.page.locator('.attn-item.noga-item', { hasText: 'DOG-99' }).locator('.noga-done').click();
    await b.page.waitForTimeout(200);
    t.ok(await b.page.locator('.oc-modal-overlay').count() === 0, 'NO-GA done does not re-prompt (already unlocked)');
    noga = (await b.db()).noga_requests;
    const doneRow = noga.find(r => r.animal_id === 'DOG-99');
    t.ok(doneRow.done === true && doneRow.done_by, 'NO-GA Done stamps done + done_by (initials filled via the prompt fallback)');

    t.ok(b.errors.length === 0, 'no page errors in tab B: ' + JSON.stringify(b.errors));
  } finally {
    await b.browser.close();
  }

  /* ============================================================
     Tab C: memo board — tick blocked without the nurse passcode,
     allowed after providing it.
     ============================================================ */
  const seedC = {
    memos: [{ author: 'Vet team', text: 'Fridge stock low', done: false, created_at: ago(1 * H) }]
  };
  const c = await open(seedC, 'nurses.html');
  try {
    const memoCb = c.page.locator('.memo-tick').first();
    await memoCb.click();
    await c.page.waitForSelector('.oc-modal-overlay');
    await c.page.click('.oc-modal-cancel');
    await c.page.waitForTimeout(150);
    let memos = (await c.db()).memos;
    t.ok(memos[0].done === false, 'memo tick is blocked without the nurse passcode');

    await memoCb.click();
    await c.page.waitForSelector('.oc-modal-overlay');
    await c.page.fill('.oc-modal-input', 'nurse');
    await c.page.click('.oc-modal-submit');
    await waitPasscodeClosed(c.page);
    await c.page.waitForTimeout(200);
    memos = (await c.db()).memos;
    t.ok(memos[0].done === true, 'correct nurse passcode allows the memo tick');

    t.ok(c.errors.length === 0, 'no page errors in tab C: ' + JSON.stringify(c.errors));
  } finally {
    await c.browser.close();
  }

  /* ============================================================
     Tab D: new-request alert banner + sound (nurses only). A fresh
     load with existing open items does NOT alert; a new vaccination
     request or new medication-waiting case arriving via realtime
     shows the banner (once each, never again on later refreshes).
     ============================================================ */
  const seedD = {
    nurse_requests: [
      { location: 'Cat Room 1', species: 'kitten', animal_count: 3, done_count: 1, arrived_at: ago(30 * 60 * 1000) }
    ],
    tasks: [
      { title: 'MED-OLD', location: 'Pound 1', shift: 'sick_injured', type: 'medication', urgency: 'urgent',
        needs_medication: true, vet_done_at: ago(1 * H), med_label: 'Give 1 tablet daily', sm_number: 'SM1111', created_at: ago(2 * H) }
    ]
  };
  const d = await open(seedD, 'nurses.html');
  try {
    async function insertRow(page, table, row) {
      await page.evaluate(({ table, row }) => window.supabase.createClient().from(table).insert(row), { table, row });
    }
    async function bannerVisible(page) {
      return page.evaluate(() => getComputedStyle(document.getElementById('new-item-banner')).display !== 'none');
    }

    /* ---------- (a) pre-existing open items on load: no retroactive banner ---------- */
    t.ok(!(await bannerVisible(d.page)), 'opening the page with existing open items does not show the banner');

    /* ---------- (b) a NEW vaccination request arriving shows the banner, vaccination wording ---------- */
    await insertRow(d.page, 'nurse_requests', { location: 'Cat Room 2', species: 'cat', animal_count: 2, done_count: 0 });
    await d.page.waitForFunction(() => getComputedStyle(document.getElementById('new-item-banner')).display !== 'none', { timeout: 3000 });
    let bannerText = await d.page.textContent('#new-item-banner-text');
    t.ok(bannerText.includes('vaccination request'), 'new vaccination request shows banner with vaccination wording: ' + bannerText);
    t.ok(!bannerText.includes('medication label'), 'no pre-existing medication case is wrongly included: ' + bannerText);

    /* ---------- (d) Dismiss button hides it ---------- */
    await d.page.click('#new-item-banner-dismiss');
    t.ok(!(await bannerVisible(d.page)), 'Dismiss button hides the banner');

    /* ---------- (c) a NEW medication-waiting case arriving shows the banner, medication wording ---------- */
    await insertRow(d.page, 'tasks', {
      title: 'MED-NEW', location: 'Pound 2', shift: 'sick_injured', type: 'medication', urgency: 'urgent',
      needs_medication: true, vet_done_at: new Date().toISOString(), sm_number: 'SM2222', med_label: 'Amoxicillin BID'
    });
    await d.page.waitForFunction(() => getComputedStyle(document.getElementById('new-item-banner')).display !== 'none', { timeout: 3000 });
    bannerText = await d.page.textContent('#new-item-banner-text');
    t.ok(bannerText.includes('medication label'), 'new medication-waiting case shows banner with medication wording: ' + bannerText);
    t.ok(!bannerText.includes('vaccination request'), 'the already-seen vaccination request does not re-trigger alongside it: ' + bannerText);

    /* ---------- sound: playAlertTone() runs (AudioContext) without throwing ---------- */
    t.ok(d.errors.length === 0, 'synthesised alert tone does not throw a page error: ' + JSON.stringify(d.errors));

    /* ---------- (e) an item that already alerted does not alert again on a later refresh ---------- */
    await d.page.click('#new-item-banner-dismiss');
    t.ok(!(await bannerVisible(d.page)), 'banner dismissed before the next refresh check');
    // Trigger another loadAll() via an unrelated table change (mirrors a realtime
    // tick / the 60s poll) with no new vaccination/medication items.
    await insertRow(d.page, 'memos', { author: 'Nurse team', text: 'unrelated memo' });
    await d.page.waitForTimeout(500);
    t.ok(!(await bannerVisible(d.page)), 'the vaccination request and medication case already seen do not re-trigger the banner on a later refresh');

    t.ok(d.errors.length === 0, 'no page errors in tab D: ' + JSON.stringify(d.errors));
  } finally {
    await d.browser.close();
  }

  t.done();
})();
