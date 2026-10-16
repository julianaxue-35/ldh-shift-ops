// 2026-10-16: vets "Put back" a picked-up case; nurses "Send back to vet" with a result, which becomes a
// shelter request on the vet board (Within 2 hours -> Emergency, Within 12-24 hours -> Urgent). Plus the FAQ sections.
const { open } = require('./harness');
const t = require('./check')('putback-sendback');
const ago = ms => new Date(Date.now() - ms).toISOString();
const H = 3600 * 1000;

(async () => {
  /* ---------- Vets: Put back ---------- */
  const v = await open({ tasks: [
    { title: 'PB-1', location: 'Pound 1', shift: 'sick_injured', type: 'shelter', urgency: 'urgent', created_at: ago(2 * H), claimed_at: ago(0.5 * H), done: false },
    { title: 'PB-2', location: 'Pound 2', shift: 'sick_injured', type: 'shelter', urgency: 'urgent', created_at: ago(2 * H), claimed_at: null, done: false }
  ] }, 'vets.html');
  try {
    t.ok(await v.page.locator('.attn-item', { hasText: 'PB-1' }).locator('.put-back-btn').count() === 1, 'a picked-up case shows Put back');
    t.ok(await v.page.locator('.attn-item', { hasText: 'PB-2' }).locator('.put-back-btn').count() === 0, 'an unclaimed case has no Put back');
    await v.page.locator('.attn-item', { hasText: 'PB-1' }).locator('.put-back-btn').click();
    await v.page.waitForTimeout(300);
    t.ok(await v.page.locator('.oc-modal-overlay').count() === 0, 'Put back asks for nothing — no reason box, no prompt');
    const row = (await v.db()).tasks.find(x => x.title === 'PB-1');
    t.ok(row.claimed_at == null && row.claimed_by == null && row.put_back_at != null && row.done === false, 'Put back clears the claim, stamps put_back_at, case stays open');
    const card = v.page.locator('.attn-item', { hasText: 'PB-1' });
    t.ok(await card.locator('.pick-up-btn').count() === 1, 'the put-back case can be picked up again');
    t.ok((await card.textContent()).includes('Put back'), 'the card says it was put back');
    t.ok(await v.page.locator('#faq details').count() >= 8, 'vets FAQ is present');
    t.ok((await v.page.textContent('#faq')).includes('Disease tracking'), 'vets FAQ covers disease tracking');
    t.ok(v.errors.length === 0, 'no page errors on vets: ' + JSON.stringify(v.errors));
  } finally { await v.browser.close(); }

  /* ---------- Nurses: Send back to vet (miscellaneous task, 2 h) ---------- */
  const n = await open({
    noga_requests: [{ animal_id: 'FIV-1', location: 'Cat Room 1 / 4', task: 'fiv_test', done: false }],
    nurse_requests: [{ kind: 'blood', location: 'Cat Room 2', species: 'cat', animal_count: 3, done_count: 0, arrived_at: ago(1 * H) }]
  }, 'nurses.html');
  try {
    await n.page.fill('#initials-input', 'JX');
    await n.page.locator('.noga-item', { hasText: 'FIV-1' }).locator('.noga-back').click();
    await n.page.fill('.back-result', '');
    await n.page.click('.back-confirm');
    t.ok((await n.page.textContent('.back-error')).includes('result'), 'a result comment is required');
    t.ok((await n.db()).tasks.length === 0, 'nothing is created when the comment is missing');
    await n.page.fill('.back-result', 'FIV negative, FeLV negative');
    await n.page.selectOption('.back-action', 'upload');
    await n.page.selectOption('.back-window', '2h');
    await n.page.click('.back-confirm');
    await n.page.waitForTimeout(300);
    let db = await n.db();
    const made = db.tasks.find(x => x.title === 'FIV-1');
    t.ok(made && made.type === 'shelter' && made.urgency === 'red_flag' && made.location === 'Cat Room 1 / 4' && made.done === false, '2 h send-back makes an open Emergency shelter request');
    t.ok(made.problem.includes('FIV test') && made.problem.includes('FIV negative, FeLV negative') && made.problem.includes('ShelterMate') && made.problem.includes('JX'), 'the request carries test, result, vet action and sender');
    const misc = db.noga_requests.find(x => x.animal_id === 'FIV-1');
    t.ok(misc.done === true && misc.done_by === 'JX' && misc.result_note === 'FIV negative, FeLV negative' && misc.returned_at, 'the misc task is closed with the result recorded');
    t.ok((await n.page.textContent('#noga-list')).includes('sent back to vet'), 'the nurse list shows it was sent back');

    /* ---------- FIV/blood nurse request (head-count): asks for the animal ID, 12-24 h, request left open ---------- */
    await n.page.locator('.nr-item', { hasText: 'Cat Room 2' }).locator('.nr-back').click();
    await n.page.fill('.back-result', 'bloods run, printout on cage');
    await n.page.click('.back-confirm');
    t.ok((await n.page.textContent('.back-error')).includes('animal ID'), 'a head-count request needs an animal ID');
    await n.page.fill('.back-animal', 'BLD-9');
    await n.page.selectOption('.back-action', 'interpret');
    await n.page.selectOption('.back-window', '12_24h');
    await n.page.click('.back-confirm');
    await n.page.waitForTimeout(300);
    db = await n.db();
    const blood = db.tasks.find(x => x.title === 'BLD-9');
    t.ok(blood && blood.urgency === 'urgent' && blood.location === 'Cat Room 2' && /nterpret/.test(blood.problem), '12-24 h send-back makes an Urgent request asking the vet to interpret');
    t.ok(db.nurse_requests[0].done_count === 0, 'the nurse request itself is left open');
    t.ok(await n.page.locator('#faq details').count() >= 8, 'nurses FAQ is present');
    t.ok((await n.page.textContent('#faq')).includes('Send back to vet'), 'nurses FAQ explains send back');
    t.ok(n.errors.length === 0, 'no page errors on nurses: ' + JSON.stringify(n.errors));
  } finally { await n.browser.close(); }

  /* ---------- Shelter staff FAQ ---------- */
  const s = await open({}, 'index.html');
  try {
    t.ok(await s.page.locator('#faq details').count() >= 8, 'shelter staff FAQ is present');
    const txt = await s.page.textContent('#faq');
    t.ok(txt.includes('Suspected condition') && txt.includes('Why do we track it'), 'staff FAQ explains what and why we track');
    t.ok(s.errors.length === 0, 'no page errors on index: ' + JSON.stringify(s.errors));
  } finally { await s.browser.close(); }

  t.done();
})();
