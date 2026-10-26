// Nurses: a task is marked done automatically once its result is sent to the Admission AA, and any tasks can be
// ticked and marked done together (for when the nurse enters the result in ShelterMate herself).
const { open } = require('./harness');
const t = require('./check')('nurses-bulk-done');
const ago = ms => new Date(Date.now() - ms).toISOString();

(async () => {
  const seed = {
    nurse_requests: [
      { kind: 'uv', location: 'Pathway', species: 'cat', animal_count: 1, done_count: 0, animal_id: 'U-1', arrived_at: ago(3600e3) },
      { kind: 'uv', location: 'Pathway', species: 'cat', animal_count: 1, done_count: 0, animal_id: 'U-2', arrived_at: ago(3600e3) },
      { kind: 'vaccination', location: 'Cat Room 2', species: 'cat', animal_count: 3, done_count: 0, arrived_at: ago(3600e3) },
      { kind: 'microchip', location: 'Pathway', species: 'dog', animal_count: 1, done_count: 0, animal_id: 'C-1', arrived_at: ago(3600e3) }
    ],
    noga_requests: [
      { animal_id: 'FIV-1', location: 'Cat Room 1 / 4', task: 'fiv_test', done: false },
      { animal_id: 'B-1', location: 'Cat Room 1 / 5', task: 'blood', done: false },
      { animal_id: 'E-1', location: 'Cat Room 1 / 6', task: 'ear_swab', done: false },
      { animal_id: 'CH-1', location: 'Pathway', task: 'microchip', done: false }
    ]
  };
  const n = await open(seed, 'nurses.html');
  try {
    await n.page.fill('#initials-welfare', 'ab'); await n.page.fill('#initials-processing', 'cd');

    /* 1. sending to the AA from a task marks that task done */
    await n.page.locator('.noga-item', { hasText: 'FIV-1' }).locator('.aa-prefill').click();
    await n.page.fill('.aa-m-text', 'FIV negative');
    await n.page.click('.aa-m-send');
    await n.page.waitForFunction(() => window.__db.aa_items.length === 1);
    await n.page.waitForTimeout(300);
    let db = await n.db();
    const fiv = db.noga_requests.find(r => r.animal_id === 'FIV-1');
    t.ok(db.aa_items[0].kind === 'fiv' && fiv.done === true && fiv.done_by === 'AB', 'sending a FIV result to the AA marks the FIV task done with the Welfare initials: ' + JSON.stringify([fiv.done, fiv.done_by]));

    await n.page.locator('.nr-item', { hasText: 'U-1' }).locator('.aa-prefill').click();
    await n.page.fill('.aa-m-text', 'UV negative');
    await n.page.click('.aa-m-send');
    await n.page.waitForFunction(() => window.__db.aa_items.length === 2);
    await n.page.waitForTimeout(300);
    db = await n.db();
    t.ok(db.nurse_requests.find(r => r.animal_id === 'U-1').done_count === 1, 'sending a UV result marks the nurse request done');

    /* 2. pick several and mark done (no AA send) */
    t.ok(await n.page.isHidden('#bulk-bar-welfare') && await n.page.isHidden('#bulk-bar-processing'), 'no bars until something is ticked');
    await n.page.locator('.noga-item', { hasText: 'B-1' }).locator('.row-pick').check();
    await n.page.locator('.noga-item', { hasText: 'E-1' }).locator('.row-pick').check();
    t.ok(/2 tasks selected/.test(await n.page.textContent('#bulk-bar-welfare')), 'the welfare bar counts its ticks');
    await n.page.click('#bulk-done-welfare');
    await n.page.waitForTimeout(400);
    db = await n.db();
    t.ok(['B-1', 'E-1'].every(id => { const r = db.noga_requests.find(x => x.animal_id === id); return r.done && r.done_by === 'AB'; }), 'both welfare tasks are marked done with the Welfare initials');

    await n.page.locator('.nr-item', { hasText: 'Cat Room 2' }).locator('.row-pick').check();
    await n.page.locator('.nr-item', { hasText: 'C-1' }).locator('.row-pick').check();
    await n.page.locator('#proc-misc-list .noga-item', { hasText: 'CH-1' }).locator('.row-pick').check();
    t.ok(await n.page.isHidden('#uv-bulk-controls'), 'UV result controls stay hidden when the ticks are not all UV checks');
    await n.page.click('#bulk-done-processing');
    await n.page.waitForTimeout(400);
    db = await n.db();
    t.ok(db.nurse_requests.find(r => r.kind === 'vaccination').done_count === 3 && db.nurse_requests.find(r => r.animal_id === 'C-1').done_count === 1, 'processing requests are marked done (head-count ones fully)');
    t.ok(db.noga_requests.find(r => r.animal_id === 'CH-1').done_by === 'CD', 'the microchip task is stamped with the Processing initials');
    t.ok(await n.page.locator('.row-pick:checked').count() === 0, 'ticks are cleared afterwards');
    t.ok(n.errors.length === 0, 'no page errors: ' + n.errors.join('; '));
  } finally { await n.browser.close(); }
  t.done();
})();
