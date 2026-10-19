// Admission AA page: own passcode, cards with a 24 h countdown, overdue warning, tick = delete, new-item banner.
const { open } = require('./harness');
const t = require('./check')('admission-aa');
const H = 3600 * 1000, M = 60 * 1000;
const ago = ms => new Date(Date.now() - ms).toISOString();

(async () => {
  /* Tab 0: gated by the AA's own passcode (not the nurse code). */
  const g = await open({}, 'admission-aa.html', { skipRoleGate: true });
  try {
    t.ok((await g.page.getAttribute('#oc-role-gate', 'data-role')) === 'aa', 'the gate is for the aa role');
    t.ok(!(await g.page.isVisible('#app-root')), 'the app is hidden behind the gate');
    await g.page.fill('#oc-role-gate .oc-gate-input', 'nurse');
    await g.page.click('#oc-role-gate .oc-gate-submit');
    await g.page.waitForFunction(() => getComputedStyle(document.querySelector('#oc-gate-error')).display !== 'none');
    t.ok(await g.page.locator('#oc-role-gate').count() === 1, 'the nurse passcode does not open the AA page');
    await g.page.fill('#oc-role-gate .oc-gate-input', 'aa-test');
    await g.page.click('#oc-role-gate .oc-gate-submit');
    await g.page.waitForSelector('#oc-role-gate', { state: 'detached' });
    t.ok(await g.page.isVisible('#app-root'), 'the AA passcode opens the page');
    t.ok((await g.page.locator('#ops-nav a.active').textContent()) === 'Admission AA', 'nav marks Admission AA as current');
    t.ok(/nothing waiting/i.test(await g.page.textContent('#aa-list')), 'empty state when nothing has been sent');
  } finally { await g.browser.close(); }

  /* Tab A: cards, countdown, overdue ordering, tick deletes. */
  const seed = { aa_items: [
    { id: 'fresh', kind: 'fiv', animal_ids: ['A100'], payload: { result: 'FIV negative' }, sent_by: 'AB', sent_at: ago(1 * H) },
    { id: 'late', kind: 'microchip_uv', animal_ids: ['A200'], payload: { chip_number: '985112000123456', implanter: 'CD', uv_result: 'Clear' }, sent_by: 'CD', sent_at: ago(26 * H) },
    { id: 'vacc', kind: 'vaccination', animal_ids: ['A1', 'A2', 'A3'], payload: { vaccine: 'F3', date: '2026-10-17' }, sent_by: 'EF', sent_at: ago(21 * H + 29 * M + 30 * 1000) },
    { id: 'xss', kind: 'fiv', animal_ids: ['<img src=x onerror=window.__pwned=1>'], payload: { result: '"><script>window.__pwned=1</script>' }, sent_by: 'AB', sent_at: ago(2 * H) }
  ] };
  const a = await open(seed, 'admission-aa.html');
  try {
    t.ok((await a.page.textContent('[data-col="tasks"] .box-overdue')).trim() === '1 overdue', 'the nurse-tasks box shows its own overdue count');
    t.ok(await a.page.locator('[data-col="processing"] .box-overdue').count() === 0, 'a box with nothing overdue shows no overdue label');
    t.ok(await a.page.evaluate(() => ['processing', 'sick', 'charts', 'tasks'].every(k => { const s = getComputedStyle(document.querySelector('[data-col="' + k + '"]')); return parseFloat(s.borderTopWidth) >= 1 && parseFloat(s.borderRadius) >= 8 && parseFloat(s.paddingTop) >= 10; })), 'each of the three is a defined, padded, rounded box');
    t.ok(/1 card is overdue/.test(await a.page.textContent('#aa-overdue-banner')) && await a.page.isVisible('#aa-overdue-banner'), 'a red banner tells the AA overdue cards need doing ASAP: ' + await a.page.textContent('#aa-overdue-banner'));
    const order = await a.page.$$eval('.aa-card', els => els.map(e => e.dataset.id));
    t.ok(order[0] === 'late', 'the overdue card is first: ' + order.join(','));
    t.ok(order.indexOf('vacc') < order.indexOf('fresh'), 'oldest first among the on-time cards');
    const late = await a.page.textContent('.aa-card[data-id="late"]');
    t.ok(/Overdue by 2h/.test(late), 'overdue card says how late: ' + late.replace(/\s+/g, ' ').slice(0, 160));
    t.ok(/A200/.test(late) && /985112000123456/.test(late) && /implanted by CD/.test(late) && /UV: Clear/.test(late), 'microchip + UV card shows ID, chip number, implanter and UV result');
    t.ok(/1 overdue/.test(await a.page.textContent('#aa-overdue-count')), 'top counter shows 1 overdue');
    const vacc = await a.page.textContent('.aa-card[data-id="vacc"]');
    t.ok(/2h 30m left/.test(vacc), 'on-time card shows time left');
    t.ok(/A1, A2, A3/.test(vacc) && /3 animals/.test(vacc), 'vaccination card lists every ID');
    t.ok(await a.page.evaluate(() => window.__pwned === undefined), 'hostile text is escaped, not executed');

    await a.page.click('.aa-card[data-id="late"] .aa-done');   // harness auto-accepts the confirm()
    await a.page.waitForFunction(() => !document.querySelector('.aa-card[data-id="late"]'));
    const db = await a.db();
    const lateRow = db.aa_items.find(r => r.id === 'late');
    t.ok(lateRow && lateRow.completed_at, 'ticking marks the card completed (kept for the Completed list, not deleted yet)');
    t.ok(db.aa_items.length === 4 && !db.aa_items.find(r => r.id === 'fresh').completed_at, 'other items are untouched');
    t.ok(await a.page.isHidden('#aa-overdue-count'), 'overdue counter clears');
    t.ok(/A200/.test(await a.page.textContent('#aa-completed')), 'it appears in the Completed list at the bottom');

    /* several animals on one card: every animal is asked about separately */
    t.ok(await a.page.locator('.aa-card[data-id="vacc"] .aa-done').count() === 0, 'a multi-animal card has no single "all done" button');
    t.ok(await a.page.locator('.aa-card[data-id="vacc"] .aa-animal').count() === 3, 'each of the 3 animals has its own tick');
    await a.page.check('.aa-card[data-id="vacc"] .aa-animal[data-animal="A1"]');
    await a.page.waitForFunction(() => document.querySelector('.aa-card[data-id="vacc"] .aa-animal[data-animal="A1"]').checked);
    let vrow = (await a.db()).aa_items.find(r => r.id === 'vacc');
    t.ok(vrow.done_ids.join() === 'A1' && !vrow.completed_at, 'ticking one animal records it; the card stays open');
    t.ok(/1 of 3 done/.test(await a.page.textContent('.aa-card[data-id="vacc"]')), 'progress is shown');
    await a.page.check('.aa-card[data-id="vacc"] .aa-animal[data-animal="A2"]');
    await a.page.waitForFunction(() => document.querySelector('.aa-card[data-id="vacc"] .aa-animal[data-animal="A2"]').checked);
    await a.page.click('.aa-card[data-id="vacc"] .aa-animal[data-animal="A3"]');   // last one: the card leaves the list
    await a.page.waitForFunction(() => !document.querySelector('.aa-card[data-id="vacc"]'));
    vrow = (await a.db()).aa_items.find(r => r.id === 'vacc');
    t.ok(vrow.completed_at && vrow.done_ids.join() === 'A1,A2,A3', 'when the last animal is ticked the card completes');

    /* Completed list: newest first, each can be put back */
    const doneOrder = await a.page.$$eval('#aa-completed .aa-done-row', els => els.map(e => e.dataset.id));
    t.ok(doneOrder.join() === 'vacc,late', 'completed list is newest first: ' + doneOrder.join());
    await a.page.click('#aa-completed .aa-putback[data-id="vacc"][data-animal="A2"]');
    await a.page.waitForSelector('.aa-card[data-id="vacc"]');
    vrow = (await a.db()).aa_items.find(r => r.id === 'vacc');
    t.ok(!vrow.completed_at && vrow.done_ids.join() === 'A1,A3', 'putting one animal back reopens the card with only that animal unticked');
    t.ok(await a.page.locator('.aa-card[data-id="vacc"] .aa-animal:not(:checked)').count() === 1, 'the card shows just that animal waiting');
    await a.page.click('#aa-completed .aa-putback[data-id="late"]');
    await a.page.waitForSelector('.aa-card[data-id="late"]');
    t.ok(!(await a.db()).aa_items.find(r => r.id === 'late').completed_at, 'a single-animal card goes back to waiting');
    await a.page.click('.aa-card[data-id="late"] .aa-done');
    await a.page.waitForFunction(() => !document.querySelector('.aa-card[data-id="late"]'));
    await a.page.click('#aa-empty-done');
    await a.page.waitForFunction(() => !document.querySelector('#aa-completed .aa-done-row'));
    t.ok(!(await a.db()).aa_items.some(r => r.completed_at), 'Empty list removes every completed card from the database');
    t.ok((await a.db()).aa_items.some(r => r.id === 'fresh') && (await a.db()).aa_items.some(r => r.id === 'vacc'), 'waiting cards are untouched by Empty list');

    // Another device already ticked it: our update matches 0 rows, no error dialog, list refreshes.
    let alerts = 0; a.page.on('dialog', d => { if (d.type() === 'alert') alerts++; });
    await a.page.evaluate(() => { window.__db.aa_items = window.__db.aa_items.filter(r => r.id !== 'fresh'); });
    await a.page.click('.aa-card[data-id="fresh"] .aa-done');
    await a.page.waitForFunction(() => !document.querySelector('.aa-card[data-id="fresh"]'));
    t.ok(alerts === 0, 'ticking an already-ticked card raises no error');
    t.ok(a.errors.length === 0, 'no page errors: ' + a.errors.join('; '));
  } finally { await a.browser.close(); }

  /* completed cards older than 24 h are never shown and are removed */
  const old = await open({ aa_items: [
    { id: 'o1', kind: 'fiv', animal_ids: ['Z1'], payload: { result: 'neg' }, sent_by: 'AB', sent_at: ago(30 * H), completed_at: ago(25 * H), done_ids: ['Z1'] },
    { id: 'o2', kind: 'fiv', animal_ids: ['Z2'], payload: { result: 'neg' }, sent_by: 'AB', sent_at: ago(3 * H), completed_at: ago(1 * H), done_ids: ['Z2'] }] }, 'admission-aa.html');
  try {
    await old.page.waitForTimeout(400);
    t.ok(/Z2/.test(await old.page.textContent('#aa-completed')) && !/Z1/.test(await old.page.textContent('#aa-completed')), 'a card completed over 24 h ago is not listed');
    t.ok(!(await old.db()).aa_items.some(r => r.id === 'o1') && (await old.db()).aa_items.some(r => r.id === 'o2'), 'and it is deleted from the database');
  } finally { await old.browser.close(); }

  /* Tab B: items arriving while the page is open raise one banner with a count. */
  const b = await open({ aa_items: [{ id: 'old', kind: 'fiv', animal_ids: ['A1'], payload: { result: 'neg' }, sent_by: 'AB', sent_at: ago(1 * H) }] }, 'admission-aa.html');
  try {
    t.ok(await b.page.isHidden('#new-item-banner'), 'nothing already open alerts on load');
    await b.page.evaluate(() => sb.from('aa_items').insert([0, 1, 2].map(i => ({ kind: 'uv', animal_ids: ['B' + i], payload: { result: 'Clear' }, sent_by: 'XY' }))));
    await b.page.waitForSelector('#new-item-banner', { state: 'visible', timeout: 5000 });
    t.ok(/3 new items sent through/.test(await b.page.textContent('#new-item-banner-text')), 'banner summarises with a count: ' + await b.page.textContent('#new-item-banner-text'));
    t.ok(b.errors.length === 0, 'no page errors: ' + b.errors.join('; '));
  } finally { await b.browser.close(); }
  /* Tab C (review fix): a failed load must not look like "Nothing waiting" nor re-alert every existing item. */
  const c = await open({ aa_items: [{ id: 'keep', kind: 'fiv', animal_ids: ['A9'], payload: { result: 'neg' }, sent_by: 'AB', sent_at: ago(30 * H) }] }, 'admission-aa.html');
  try {
    await c.page.evaluate(() => { window.__fail = { aa_items: true }; return loadAll(); });
    t.ok(/A9/.test(await c.page.textContent('#aa-list')), 'a failed refresh keeps the cards already on screen');
    t.ok(await c.page.isVisible('#aa-load-error'), 'a failed refresh shows a "could not refresh" warning');
    await c.page.evaluate(() => { window.__fail = {}; return loadAll(); });
    t.ok(await c.page.isHidden('#aa-load-error'), 'the warning clears once a refresh works');
    t.ok(await c.page.isHidden('#new-item-banner'), 'recovering does not re-alert items already seen');
  } finally { await c.browser.close(); }
  const d2 = await open({ aa_items: [{ id: 'k2', kind: 'fiv', animal_ids: ['A8'], payload: { result: 'neg' }, sent_by: 'AB', sent_at: ago(1 * H) }] }, 'admission-aa.html', { skipRoleGate: false });
  try {
    await d2.page.evaluate(() => { window.__fail = { aa_items: true }; return loadAll(); });
    await d2.page.evaluate(() => { window.__fail = {}; return loadAll(); });
    t.ok(await d2.page.isHidden('#new-item-banner'), 'banner stays hidden after fail then recover');
  } finally { await d2.browser.close(); }
  t.done();
})();
