// 2026-10-17: Animal history lookup (last 3 months) on the shelter-staff and vets pages, and the FAQ button/panel.
const { open } = require('./harness');
const t = require('./check')('animal-history-faq');
const ago = ms => new Date(Date.now() - ms).toISOString();
const D = 24 * 3600 * 1000;

const seed = () => ({
  tasks: [
    { title: 'A123', location: 'Pound 1 / 4', shift: 'sick_injured', type: 'shelter', urgency: 'urgent', created_at: ago(3 * D), done: true, completed_at: ago(2 * D),
      condition: 'cat_flu', problem: 'sneezing and eye discharge', treatment: 'doxycycline 5 days', plan: 'recheck Friday', note: 'eating well' },
    { title: 'a 123', location: 'Pathway', shift: 'sick_injured', type: 'foster', urgency: 'routine', created_at: ago(40 * D), done: false, problem: 'limping' },
    { title: 'A123', location: 'Pound 1 / 4', shift: 'processing', type: 'check_recheck', created_at: ago(1 * D), done: false },
    { title: 'A123', location: 'Pound 1 / 4', shift: 'surgery', type: 'shelter', created_at: ago(150 * D), done: true, problem: 'way too old' },
    { title: 'B999', location: 'Pound 2', shift: 'sick_injured', type: 'shelter', urgency: 'urgent', created_at: ago(2 * D), done: true, completed_at: ago(1 * D), problem: 'other animal' }
  ],
  flag_history: [
    { task_id: 'gone-1', title: 'A123', flagged_at: ago(60 * D), location: 'Pound 3', reason: 'kennel cough', condition: 'kennel_cough' }
  ]
});

(async () => {
  /* ---------- shelter staff page ---------- */
  const s = await open(seed(), 'index.html');
  try {
    t.ok(!(await s.page.isVisible('#animal-history')), 'no history card until an ID is typed');
    t.ok(!(await s.page.isVisible('#faq-panel')), 'FAQ is closed by default');
    await s.page.fill('#search-box', 'A123');
    await s.page.waitForSelector('#animal-history-out .ah-entry');
    const txt = await s.page.textContent('#animal-history-out');
    t.ok(txt.includes('3 flags'), 'three flags found (two cases + one flag-log-only), not the routine list entry or the 5-month-old one: ' + txt.slice(0, 80));
    t.ok(txt.includes('sneezing and eye discharge') && txt.includes('doxycycline 5 days') && txt.includes('recheck Friday') && txt.includes('eating well'), 'problem, treatment, plan and vet note show');
    t.ok(txt.includes('Cat flu') && txt.includes('Completed'), 'suspected condition and outcome show');
    t.ok(txt.includes('limping') && txt.includes('Still open'), 'an older still-open flag shows (spaces/case in the stored ID ignored)');
    t.ok(txt.includes('kennel cough') && txt.includes('no longer held'), 'a flag known only from the flag log shows its reason, marked as such');
    t.ok(!txt.includes('way too old') && !txt.includes('other animal'), 'nothing older than 3 months, nothing for other animals');
    // a completed case 3 days old is NOT in the 24 h Cases table, which is why the lookup is needed
    t.ok(!(await s.page.textContent('#cases-completed-tbody')).includes('sneezing'), 'the Cases table still only shows the last 24 h');
    await s.page.fill('#search-box', 'zzz-nothing');
    await s.page.waitForFunction(() => document.getElementById('animal-history-out').textContent.includes('Nothing flagged'));
    t.ok(true, 'an ID with no history says so');
    await s.page.fill('#search-box', 'A');
    await s.page.waitForFunction(() => document.getElementById('animal-history').style.display === 'none');
    t.ok(true, 'a one-character search hides the history card');

    // FAQ button opens a panel; Esc and the x close it
    await s.page.click('#faq-btn');
    t.ok(await s.page.isVisible('#faq-panel') && await s.page.isVisible('#faq details >> nth=0'), 'the FAQ button opens the FAQ panel');
    t.ok((await s.page.textContent('#faq-panel')).includes('Disease tracking'), 'the panel holds the full FAQ');
    await s.page.keyboard.press('Escape');
    t.ok(!(await s.page.isVisible('#faq-panel')), 'Esc closes the FAQ');
    await s.page.click('#faq-btn'); await s.page.click('#faq .faq-close');
    t.ok(!(await s.page.isVisible('#faq-panel')), 'the x closes the FAQ');
    t.ok(await s.page.locator('main > #faq, main > section#faq').count() === 0, 'no FAQ section left at the bottom of the page');
    t.ok(s.errors.length === 0, 'no page errors on index: ' + JSON.stringify(s.errors));
  } finally { await s.browser.close(); }

  /* ---------- vets page ---------- */
  const v = await open(seed(), 'vets.html');
  try {
    await v.page.fill('#search-box', 'a123');
    await v.page.waitForSelector('#animal-history-out .ah-entry');
    const txt = await v.page.textContent('#animal-history-out');
    t.ok(await v.page.locator('#animal-lookup, #hist-q').count() === 0, 'the separate Look up an animal card is gone — one search box, same as the staff page');
    t.ok(txt.includes('doxycycline 5 days') && txt.includes('recheck Friday'), 'vets lookup shows treatment and plan');
    await v.page.click('#faq-btn');
    t.ok(await v.page.isVisible('#faq-panel'), 'vets FAQ button opens the panel');
    t.ok(v.errors.length === 0, 'no page errors on vets: ' + JSON.stringify(v.errors));
  } finally { await v.browser.close(); }

  /* ---------- nurses page ---------- */
  const n = await open({}, 'nurses.html');
  try {
    await n.page.click('#faq-btn');
    t.ok(await n.page.isVisible('#faq-panel') && (await n.page.textContent('#faq-panel')).includes('Send back to vet'), 'nurses FAQ button opens the panel');
    t.ok(n.errors.length === 0, 'no page errors on nurses: ' + JSON.stringify(n.errors));
  } finally { await n.browser.close(); }

  t.done();
})();
