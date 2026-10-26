// Nurses page: Send to Admission AA card (FIV, microchip, UV, Microchip + UV, bulk vaccination update).
const { open } = require('./harness');
const t = require('./check')('nurses-send-aa');
const LDHLogic = require('../../lib/ldh-logic');
const todayISO = LDHLogic.localISO(new Date());

(async () => {
  const seed = {
    noga_requests: [{ animal_id: 'FOS-9', location: 'Pathway', task: 'microchip', done: false }],
    nurse_requests: [{ kind: 'microchip_uv', location: 'Pathway', species: 'cat', animal_count: 1, done_count: 0, animal_id: 'FOS-7', arrived_at: new Date().toISOString() }]
  };
  const p = await open(seed, 'nurses.html');
  try {
    await p.page.fill('#initials-processing', 'ab'); await p.page.fill('#initials-welfare', 'ab');
    await p.page.click('.sc-tab[data-sc="aa"]'); await p.page.fill('#send-request .sc-who [data-f="initials"]', 'ab');

    // Bulk vaccination update: messy IDs, several animals, one card for the AA.
    await p.page.selectOption('[data-to="aa"] [data-f="kind"]', 'vaccination');
    t.ok(await p.page.isVisible('[data-to="aa"] [data-f="vaccine"]') && !(await p.page.isVisible('[data-to="aa"] [data-f="chip"]')), 'vaccination shows vaccine fields, not chip fields');
    t.ok((await p.page.inputValue('[data-to="aa"] [data-f="vdate"]')) === todayISO, 'vaccination date defaults to today');
    await p.page.fill('[data-to="aa"] [data-f="ids"]', 'a1, A2  a3\na1');
    await p.page.click('[data-send="aa"]');
    t.ok(/vaccine/i.test(await p.page.textContent('[data-to="aa"] [data-msg]')), 'vaccine is required: ' + await p.page.textContent('[data-to="aa"] [data-msg]'));
    await p.page.fill('[data-to="aa"] [data-f="vaccine"]', 'F3');
    await p.page.click('[data-send="aa"]');
    await p.page.waitForFunction(() => window.__db.aa_items.length === 1);
    let row = (await p.db()).aa_items[0];
    t.ok(row.kind === 'vaccination' && JSON.stringify(row.animal_ids) === '["A1","A2","A3"]', 'one row, cleaned IDs: ' + JSON.stringify(row.animal_ids));
    t.ok(row.payload.vaccine === 'F3' && row.payload.date === todayISO && row.sent_by === 'AB', 'payload and initials recorded');
    t.ok((await p.page.inputValue('[data-to="aa"] [data-f="ids"]')) === '', 'form clears after sending');

    // Microchip: one animal only, digits validated, implanter = initials.
    await p.page.selectOption('[data-to="aa"] [data-f="kind"]', 'microchip');
    await p.page.fill('[data-to="aa"] [data-f="ids"]', 'A5 A6');
    await p.page.fill('[data-to="aa"] [data-f="chip"]', '985 112 000 123 456');
    await p.page.click('[data-send="aa"]');
    t.ok(/one animal/i.test(await p.page.textContent('[data-to="aa"] [data-msg]')), 'two animals refused for microchip');
    await p.page.fill('[data-to="aa"] [data-f="ids"]', 'A5');
    await p.page.fill('[data-to="aa"] [data-f="chip"]', '12AB');
    await p.page.click('[data-send="aa"]');
    t.ok(/digits/i.test(await p.page.textContent('[data-to="aa"] [data-msg]')), 'bad chip number refused');
    await p.page.fill('[data-to="aa"] [data-f="chip"]', '985 112 000 123 456');
    await p.page.click('[data-send="aa"]');
    await p.page.waitForFunction(() => window.__db.aa_items.length === 2);
    row = (await p.db()).aa_items[1];
    t.ok(row.payload.chip_number === '985112000123456' && row.payload.implanter === 'AB', 'chip stored as digits with implanter initials');

    // Microchip + UV, then FIV.
    await p.page.selectOption('[data-to="aa"] [data-f="kind"]', 'microchip_uv');
    t.ok(await p.page.isVisible('[data-to="aa"] [data-f="chip"]') && await p.page.isVisible('[data-to="aa"] [data-f="uv"]'), 'combined type shows chip and UV fields');
    await p.page.fill('[data-to="aa"] [data-f="ids"]', 'A7'); await p.page.fill('[data-to="aa"] [data-f="chip"]', '985112000123457'); await p.page.fill('[data-to="aa"] [data-f="uv"]', 'Clear');
    await p.page.click('[data-send="aa"]');
    await p.page.waitForFunction(() => window.__db.aa_items.length === 3);
    await p.page.selectOption('[data-to="aa"] [data-f="kind"]', 'fiv');
    await p.page.fill('[data-to="aa"] [data-f="ids"]', 'A8'); await p.page.fill('[data-to="aa"] [data-f="result"]', 'FIV negative');
    await p.page.click('[data-send="aa"]');
    await p.page.waitForFunction(() => window.__db.aa_items.length === 4);
    t.ok((await p.db()).aa_items[3].payload.result === 'FIV negative', 'FIV result sent');

    // Prefill buttons on a microchip task and a Microchip + UV request.
    await p.page.click('.noga-item .aa-prefill');
    t.ok((await p.page.inputValue('[data-to="aa"] [data-f="kind"]')) === 'microchip' && (await p.page.inputValue('[data-to="aa"] [data-f="ids"]')) === 'FOS-9', 'misc microchip row prefills type and ID');
    await p.page.click('.nr-item .aa-prefill');
    t.ok((await p.page.inputValue('[data-to="aa"] [data-f="kind"]')) === 'microchip_uv' && (await p.page.inputValue('[data-to="aa"] [data-f="ids"]')) === 'FOS-7', 'Microchip + UV request prefills type and ID');

    // Review fix: a half-typed result must never carry over onto the next animal's prefill.
    await p.page.evaluate(() => { aaSet = (f, v) => { document.querySelector('[data-to="aa"] [data-f="' + f + '"]').value = v; }; aaSet('result', 'FIV positive'); aaSet('chip', '985112000123999'); aaSet('uv', 'Glow'); aaSet('vaccine', 'F3'); });
    await p.page.click('.nr-item .aa-prefill');
    t.ok((await p.page.inputValue('[data-to="aa"] [data-f="result"]')) === '' && (await p.page.inputValue('[data-to="aa"] [data-f="chip"]')) === '' && (await p.page.inputValue('[data-to="aa"] [data-f="uv"]')) === '' && (await p.page.inputValue('[data-to="aa"] [data-f="vaccine"]')) === '', 'prefill clears old result / chip / UV / vaccine text');

    t.ok(p.errors.length === 0, 'no page errors: ' + p.errors.join('; '));
  } finally { await p.browser.close(); }
  t.done();
})();
