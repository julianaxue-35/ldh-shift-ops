// 2026-11-18: any request can be edited after it is sent (location + pen, and the request's own details), from the page that shows it.
const { open } = require('./harness');
const t = require('./check')('request-edit');
const ago = ms => new Date(Date.now() - ms).toISOString();
const LDHLogic = require('../../lib/ldh-logic');
const todayISO = LDHLogic.localISO(new Date());
(async () => {
  const n = await open({
    nurse_requests: [{ id: 'nr1', kind: 'vaccination', location: 'Cat Room 1', species: 'cat', animal_count: 3, done_count: 2, animal_id: 'VAC-1', due_window: 'today', note: 'old note', arrived_at: ago(3600e3), created_at: ago(3600e3) }],
    nurse_treatments: [{ id: 'trt1', animal_id: 'DOG-9', location: 'Pound 3 / 7', treatment: 'Metronidazole', times_per_day: 2, days: 3, stopped: false, start_date: todayISO, created_at: ago(3600e3) }],
    nurse_treatment_doses: [{ id: 'd1', treatment_id: 'trt1', day_no: 1, slot_no: 1, due_date: todayISO }],
    noga_requests: [{ id: 'ng1', animal_id: 'FIV-5', location: 'Cat Room 2', task: 'fiv_test', note: 'before surgery', done: false, created_at: ago(3600e3) }]
  }, 'nurses.html');
  try {
    await n.page.waitForSelector('#nr-list .nr-item');
    // nurse request: change place + pen, the count and the note
    await n.page.click('#nr-list .nr-item:has-text("VAC-1") [data-redit="nurse_requests"]');
    await n.page.waitForSelector('#rq-save');
    t.ok((await n.page.inputValue('#rq-room')) === 'Cat Room 1', 'the box opens on the current space');
    await n.page.selectOption('#rq-room', 'Pound 2'); await n.page.fill('#rq-pen', '12'); await n.page.fill('#rq-f-note', 'new note');
    await n.page.fill('#rq-f-animal_count', '1'); await n.page.click('#rq-save');
    t.ok(await n.page.locator('#rq-err').isVisible(), 'a count below the number already done is refused');
    await n.page.fill('#rq-f-animal_count', '4'); await n.page.click('#rq-save');
    await n.page.waitForSelector('#rq-save', { state: 'detached' });
    let db = await n.db();
    t.ok(db.nurse_requests[0].location === 'Pound 2 / 12' && db.nurse_requests[0].animal_count === 4 && db.nurse_requests[0].note === 'new note', 'saved: location "room / pen", count and note');
    // treatment: pen parsed back out of the stored location
    await n.page.click('.nt-card:has-text("DOG-9") [data-redit="nurse_treatments"]');
    await n.page.waitForSelector('#rq-save');
    t.ok((await n.page.inputValue('#rq-room')) === 'Pound 3' && (await n.page.inputValue('#rq-pen')) === '7', 'an existing "room / pen" splits back into the two boxes');
    t.ok(!(await n.page.locator('.nt-card:has-text("DOG-9") .nt-tick').isChecked()), 'pressing Edit did not tick the dose');
    await n.page.fill('#rq-pen', '9'); await n.page.click('#rq-save');
    await n.page.waitForSelector('#rq-save', { state: 'detached' });
    db = await n.db();
    t.ok(db.nurse_treatments[0].location === 'Pound 3 / 9' && db.nurse_treatments[0].times_per_day === 2, 'treatment moved; its schedule is untouched');
    // nurse task: location_detail for off-site spaces
    await n.page.click('.noga-item:has-text("FIV-5") [data-redit="noga_requests"]');
    await n.page.waitForSelector('#rq-save');
    await n.page.selectOption('#rq-room', 'Offsite'); await n.page.fill('#rq-pen', 'Foster Amy'); await n.page.click('#rq-save');
    await n.page.waitForSelector('#rq-save', { state: 'detached' });
    db = await n.db();
    t.ok(db.noga_requests[0].location === 'Offsite' && db.noga_requests[0].location_detail === 'Foster Amy', 'an off-site space keeps its detail in location_detail');
    // cancel changes nothing
    await n.page.click('#nr-list .nr-item:has-text("VAC-1") [data-redit="nurse_requests"]');
    await n.page.waitForSelector('#rq-cancel'); await n.page.click('#rq-cancel');
    t.ok((await n.db()).nurse_requests[0].location === 'Pound 2 / 12', 'Cancel leaves it as it was');
    t.ok(n.errors.length === 0, 'no page errors: ' + n.errors.join('; '));
  } finally { await n.browser.close(); }
  t.done && t.done();
})();
