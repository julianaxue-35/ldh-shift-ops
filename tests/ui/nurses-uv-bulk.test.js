// Nurses: tick several UV-only checks, give ONE result, send a single card to the Admission AA and mark them all done.
const { open } = require('./harness');
const t = require('./check')('nurses-uv-bulk');
const ago = ms => new Date(Date.now() - ms).toISOString();

(async () => {
  const seed = {
    nurse_requests: [
      { kind: 'uv', location: 'Pathway', species: 'cat', animal_count: 1, done_count: 0, animal_id: 'U-1', arrived_at: ago(3600e3) },
      { kind: 'uv', location: 'Pathway', species: 'cat', animal_count: 1, done_count: 0, animal_id: 'U-2', arrived_at: ago(3600e3) },
      { kind: 'microchip_uv', location: 'Pathway', species: 'cat', animal_count: 1, done_count: 0, animal_id: 'MU-1', arrived_at: ago(3600e3) },
      { kind: 'vaccination', location: 'Cat Room 2', species: 'cat', animal_count: 3, done_count: 0, arrived_at: ago(3600e3) }
    ],
    noga_requests: [
      { animal_id: 'U-3', location: 'Pathway', task: 'uv', done: false },
      { animal_id: 'U-4', location: 'Pathway', task: 'uv', done: false },
      { animal_id: 'F-1', location: 'Pathway', task: 'fiv_test', done: false }
    ]
  };
  const n = await open(seed, 'nurses.html');
  try {
    t.ok(await n.page.isHidden('#uv-bulk-bar'), 'no bulk bar until something is ticked');
    t.ok(await n.page.locator('.uv-pick').count() === 4, 'only UV-only checks can be ticked (2 nurse requests + 2 misc tasks), not Microchip + UV, FIV or vaccination: ' + await n.page.locator('.uv-pick').count());
    await n.page.fill('#initials-processing', 'cd');

    for (const id of ['U-1', 'U-2']) await n.page.locator('.nr-item', { hasText: id }).locator('.uv-pick').check();
    await n.page.locator('.noga-item', { hasText: 'U-3' }).locator('.uv-pick').check();
    t.ok(/3 UV checks selected/.test(await n.page.textContent('#uv-bulk-bar')), 'bar counts the ticked animals: ' + (await n.page.textContent('#uv-bulk-bar')).replace(/\s+/g, ' ').slice(0, 100));

    await n.page.click('#uv-bulk-send');
    t.ok(/result/i.test(await n.page.textContent('#uv-bulk-error')), 'a result is required');
    t.ok((await n.db()).aa_items.length === 0, 'nothing is sent without a result');

    await n.page.click('#uv-bulk-negative');
    t.ok((await n.page.inputValue('#uv-bulk-result')).toLowerCase().includes('negative'), 'one tap fills "UV negative"');
    await n.page.click('#uv-bulk-send');
    await n.page.waitForFunction(() => document.getElementById('uv-bulk-bar').style.display === 'none');
    const db = await n.db();
    t.ok(db.aa_items.length === 1 && db.aa_items[0].kind === 'uv', 'ONE card goes to the Admission AA');
    const it = db.aa_items[0];
    t.ok(it.animal_ids.slice().sort().join() === 'U-1,U-2,U-3' && /negative/i.test(it.payload.result) && it.sent_by === 'CD', 'card lists all three animals, the result and the nurse initials: ' + JSON.stringify(it));
    const nr = db.nurse_requests.filter(r => r.animal_id);
    t.ok(nr.find(r => r.animal_id === 'U-1').done_count === 1 && nr.find(r => r.animal_id === 'U-2').done_count === 1, 'the ticked nurse requests are marked done');
    t.ok(nr.find(r => r.animal_id === 'MU-1').done_count === 0, 'a Microchip + UV request is left alone');
    const ng = db.noga_requests;
    t.ok(ng.find(r => r.animal_id === 'U-3').done === true && ng.find(r => r.animal_id === 'U-3').done_by === 'CD', 'the ticked misc UV task is marked done with the initials');
    t.ok(ng.find(r => r.animal_id === 'U-4').done === false && ng.find(r => r.animal_id === 'F-1').done === false, 'unticked tasks stay open');
    t.ok(await n.page.locator('.uv-pick:checked').count() === 0, 'selection is cleared after sending');
    t.ok(n.errors.length === 0, 'no page errors: ' + n.errors.join('; '));
  } finally { await n.browser.close(); }
  t.done();
})();
