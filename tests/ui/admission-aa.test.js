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
    t.ok(!db.aa_items.some(r => r.id === 'late'), 'ticking removes the row from the database completely');
    t.ok(db.aa_items.length === 3, 'other items are untouched');
    t.ok(await a.page.isHidden('#aa-overdue-count'), 'overdue counter clears');

    // Another device already ticked it: our delete matches 0 rows, no error dialog, list refreshes.
    let alerts = 0; a.page.on('dialog', d => { if (d.type() === 'alert') alerts++; });
    await a.page.evaluate(() => { window.__db.aa_items = window.__db.aa_items.filter(r => r.id !== 'vacc'); });
    await a.page.click('.aa-card[data-id="vacc"] .aa-done');
    await a.page.waitForFunction(() => !document.querySelector('.aa-card[data-id="vacc"]'));
    t.ok(alerts === 0, 'ticking an already-ticked card raises no error');
    t.ok(a.errors.length === 0, 'no page errors: ' + a.errors.join('; '));
  } finally { await a.browser.close(); }

  /* Tab B: items arriving while the page is open raise one banner with a count. */
  const b = await open({ aa_items: [{ id: 'old', kind: 'fiv', animal_ids: ['A1'], payload: { result: 'neg' }, sent_by: 'AB', sent_at: ago(1 * H) }] }, 'admission-aa.html');
  try {
    t.ok(await b.page.isHidden('#new-item-banner'), 'nothing already open alerts on load');
    await b.page.evaluate(() => sb.from('aa_items').insert([0, 1, 2].map(i => ({ kind: 'uv', animal_ids: ['B' + i], payload: { result: 'Clear' }, sent_by: 'XY' }))));
    await b.page.waitForSelector('#new-item-banner', { state: 'visible', timeout: 5000 });
    t.ok(/3 new items sent through/.test(await b.page.textContent('#new-item-banner-text')), 'banner summarises with a count: ' + await b.page.textContent('#new-item-banner-text'));
    t.ok(b.errors.length === 0, 'no page errors: ' + b.errors.join('; '));
  } finally { await b.browser.close(); }
  t.done();
})();
