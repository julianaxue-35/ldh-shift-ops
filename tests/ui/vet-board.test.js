// Round 3: the old vet board ("Cases flagged" split by urgency, with
// pick-up/bump/mark-done) and the old Floor "Cases flagged" table have been
// replaced on the shelter-staff page by ONE combined Cases list
// (LDHLogic.caseList). Vet actions (pick up, DONE, bump) move to
// vets.html — see Task 5's test file for those; this file now only checks
// the combined list itself.
const { open } = require('./harness');
const { LOCATION_ROWS, ROUND3_TASKS } = require('./fixtures');
const t = require('./check')('case-list');
const ago = ms => new Date(Date.now() - ms).toISOString();
const H = 3600 * 1000, M = 60 * 1000;
(async () => {
  const mk = (title, urgency, agoMs, extra = {}) => Object.assign({ title, location: 'Pound 1', shift: 'sick_injured', type: 'shelter', urgency, created_at: ago(agoMs) }, extra);
  const seed = { locations: LOCATION_ROWS, tasks: [
    mk('A-AMBER', 'red_flag', 1.75 * H),
    mk('B-RED', 'red_flag', 3 * H, { problem: 'limping front-left leg', red_flags: ['bleeding_wound', 'not_eating_48h'], condition: 'wounds_injury' }),
    mk('C-URG', 'urgent', 13 * H),
    mk('D-R25', 'routine', 25 * H),
    mk('E-R50', 'routine', 50 * H),
    mk('F-NEW', 'routine', 10 * M),
    ROUND3_TASKS.medication,
    ROUND3_TASKS.offsite,
    ROUND3_TASKS.completedYesterday,
    ROUND3_TASKS.completed2DaysAgo,
    mk('MED-DONE-YDAY', 'urgent', 20 * H, {
      type: 'medication', needs_medication: true, sm_number: 'MED-DONE-YDAY', vet_done_at: ago(21 * H),
      med_done_by: 'JX', med_done_at: ago(20 * H), done: true, completed_by_role: 'vet_nurse', completed_at: ago(20 * H)
    }),
  ] };
  const { browser, page, errors } = await open(seed);
  try {
    await page.waitForTimeout(200);
    const openText = await page.textContent('#cases-open-tbody');
    const completedText = await page.textContent('#cases-completed-tbody');

    // Highest tier first; inside a tier, overdue before amber before ok.
    t.ok(openText.indexOf('B-RED') < openText.indexOf('A-AMBER'), 'the more overdue Emergency case comes first');
    t.ok(openText.indexOf('A-AMBER') < openText.indexOf('C-URG'), 'Emergency cases come before Urgent');
    t.ok(openText.indexOf('C-URG') < openText.indexOf('E-R50'), 'Urgent comes before Request checks');
    t.ok(openText.indexOf('E-R50') < openText.indexOf('D-R25') && openText.indexOf('D-R25') < openText.indexOf('F-NEW'), 'Request checks ordered red, amber, ok');

    // Tier labels use the new wording.
    t.ok(openText.includes('Emergency') && openText.includes('Urgent') && openText.includes('Request checks'), 'tier column uses the new labels');

    // Stage text.
    t.ok(openText.includes('Flagged'), 'open, unclaimed cases show stage "Flagged"');
    const medRow = page.locator('#cases-open-tbody tr', { hasText: 'MED-CASE' });
    t.ok((await medRow.textContent()).includes('Vet check done — waiting on medication'), 'a medication case awaiting the nurse shows the waiting-on-medication stage');
    t.ok((await medRow.locator('.tag-med').count()) === 1, 'a medication case is tagged "Medication"');
    t.ok((await page.locator('#cases-open-tbody tr', { hasText: 'A-AMBER' }).locator('.tag-med').count()) === 0, 'a non-medication case has no Medication tag');

    // Offsite location text (medCopyText's "Offsite — <detail>" rule).
    const offsiteRow = page.locator('#cases-open-tbody tr', { hasText: 'OFFSITE-CASE' });
    t.ok((await offsiteRow.textContent()).includes('Offsite — Foster carer — J. Smith'), 'an Offsite case shows "Offsite — <detail>"');

    // Completed (last 24h) group: only the case completed within 24h shows.
    t.ok(completedText.includes('DONE-YDAY'), 'a case completed 20h ago is in the Completed group');
    t.ok(!completedText.includes('DONE-2DAY'), 'a case completed over 24h ago is not shown (kept, just hidden)');
    t.ok(!openText.includes('DONE-YDAY') && !openText.includes('DONE-2DAY'), 'completed cases are not in the open table');

    // Completed medication case shows WHO made up the medication (2026-09-26:
    // "if we can't find the medication, we can go back to that nurse").
    const medDoneRow = page.locator('#cases-completed-tbody tr', { hasText: 'MED-DONE-YDAY' });
    t.ok((await medDoneRow.textContent()).includes('meds by JX'), 'a completed medication case shows which nurse made it up, by initials');

    // No vet action buttons on this page — pick-up / bump / DONE move to
    // vets.html (Task 5's test file covers the hand-off and those actions).
    t.ok(await page.locator('.pick-up-btn, .done-btn, .bump-btn').count() === 0, 'no pick-up/bump/mark-done buttons on the shelter staff page');

    // Search box filters the combined list.
    await page.fill('#search-box', 'B-RED');
    await page.waitForTimeout(200);
    const filtered = await page.textContent('#cases-open-tbody');
    t.ok(filtered.includes('B-RED') && !filtered.includes('A-AMBER'), 'search box filters the open cases by animal ID');
    await page.fill('#search-box', '');

    t.ok(errors.length === 0, 'no page errors: ' + errors.join('; '));
  } finally {
    await browser.close();
  }
  t.done();
})();
