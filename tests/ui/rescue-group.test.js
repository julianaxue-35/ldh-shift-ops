// 2026-11-18: a rescue request for several animals is ONE request; each animal has its own place and its own checks.
const { open } = require('./harness');
const t = require('./check')('rescue-group');
(async () => {
  // 1) nurse-only group: UV for two, microchip + UV for one -> one request per kind of check
  const a = await open();
  try {
    t.ok(!(await a.page.isVisible('#req-group')), 'no group box for an ordinary request');
    await a.page.selectOption('#req-type', 'rescue');
    await a.page.fill('#req-title', '1170301, 1170302, 1170303');
    t.ok(await a.page.isVisible('#req-group') && await a.page.locator('.grp-row').count() === 3, 'three IDs show three rows');
    t.ok(!(await a.page.locator('#req-x-microchip').isVisible()), 'the single-animal ticks step aside in a group');
    const row = id => '.grp-row[data-gid="' + id + '"] ';
    await a.page.check(row('1170301') + '[data-k="uv"]');
    await a.page.check(row('1170302') + '[data-k="uv"]');
    await a.page.check(row('1170303') + '[data-k="uv"]'); await a.page.check(row('1170303') + '[data-k="microchip"]');
    await a.page.selectOption(row('1170302') + '[data-g="room"]', 'Pound 2'); await a.page.fill(row('1170302') + '[data-g="pen"]', '4');
    await a.page.click('#req-submit'); await a.page.waitForTimeout(500);
    const db = await a.db();
    const card = db.nurse_requests[0];
    t.ok(db.nurse_requests.length === 1 && db.tasks.length === 0 && card.kind === 'rescue_group', 'ONE nurse card for the whole group, no vet case');
    t.ok(card.animal_count === 3 && card.location === 'Various' && card.animals.some(x => x.id === '1170302' && x.location === 'Pound 2 / 4'), 'it lists all three animals with their own places');
    t.ok(JSON.stringify(card.animals.map(x => x.checks)) === JSON.stringify([['uv'], ['uv'], ['microchip', 'uv']]), 'each animal keeps its own checks: ' + JSON.stringify(card.animals.map(x => x.checks)));
    t.ok(a.errors.length === 0, 'no page errors: ' + a.errors.join('; '));
  } finally { await a.browser.close(); }
  // 2) the nurse ticks animals off one by one
  const n = await open({ nurse_requests: [{ id: 'g1', kind: 'uv', location: 'Various', species: 'cat', animal_count: 2, done_count: 0, animal_id: '1170401, 1170402', arrived_at: new Date(Date.now() - 600e3).toISOString(), created_at: new Date().toISOString(),
    animals: [{ id: '1170401', location: 'Cat Room 1', done: false }, { id: '1170402', location: 'Pound 2 / 4', done: false }] }] }, 'nurses.html');
  try {
    await n.page.waitForSelector('#nr-list .nr-item');
    t.ok((await n.page.textContent('#nr-list .nr-item')).includes('2 animals (rescue group)'), 'the nurse sees one card for the group');
    await n.page.check('.nr-animal-tick[data-i="0"]'); await n.page.waitForTimeout(400);
    let r = (await n.db()).nurse_requests[0];
    t.ok(r.done_count === 1 && r.animals[0].done === true && !r.completed_at, 'ticking one animal counts 1 of 2');
    await n.page.click('.nr-animal-tick[data-i="1"]', { noWaitAfter: true }); await n.page.waitForTimeout(500);
    r = (await n.db()).nurse_requests[0];
    t.ok(r.done_count === 2 && r.completed_at, 'ticking the last one completes the request');
    t.ok(n.errors.length === 0, 'no page errors: ' + n.errors.join('; '));
  } finally { await n.browser.close(); }
  // 3) with notes the group goes to the vets as ONE case; the vet transfers the whole bundle to the nurses
  const g = await open();
  try {
    await g.page.selectOption('#req-type', 'rescue'); await g.page.fill('#req-title', '1170501, 1170502');
    await g.page.fill('#req-problem', 'leaving with rescue Friday');
    await g.page.check('.grp-row[data-gid="1170501"] [data-k="uv"]'); await g.page.check('.grp-row[data-gid="1170502"] [data-k="uv"]'); await g.page.check('.grp-row[data-gid="1170502"] [data-k="microchip"]');
    await g.page.click('#req-submit'); await g.page.waitForTimeout(500);
    const d = await g.db();
    t.ok(d.tasks.length === 1 && d.tasks[0].group_animals.length === 2 && /Rescue group of 2 animals/.test(d.tasks[0].problem) && d.nurse_requests.length === 0, 'notes make it ONE vet case for the whole group');
  } finally { await g.browser.close(); }
  // 4) the vet hands the whole bundle to the nurses in one go
  const ago = ms => new Date(Date.now() - ms).toISOString();
  const v = await open({ tasks: [{ id: 'grp1', title: '1170601', location: 'Various', shift: 'sick_injured', type: 'rescue', urgency: 'urgent', red_flags: [], done: false, created_at: ago(600e3),
    problem: 'Rescue group of 2 animals: 1170601 (Cat Room 1; UV check), 1170602 (Pound 2 / 4; microchip + UV check)',
    group_animals: [{ id: '1170601', location: 'Cat Room 1', kinds: ['uv'], species: 'cat' }, { id: '1170602', location: 'Pound 2 / 4', kinds: ['microchip', 'uv'], species: 'cat' }] }] }, 'vets.html');
  try {
    await v.page.waitForSelector('.attn-item .transfer-btn');
    await v.page.click('.attn-item:has-text("1170601") .transfer-btn');
    await v.page.waitForSelector('.transfer-modal-overlay');
    t.ok((await v.page.textContent('.transfer-modal-overlay')).includes('whole rescue group') && !(await v.page.locator('.transfer-task').isVisible()), 'the transfer box says it moves the whole group');
    await v.page.fill('.transfer-initials', 'JX'); await v.page.click('.transfer-confirm'); await v.page.waitForTimeout(500);
    const d = await v.db();
    t.ok(d.nurse_requests.length === 1 && d.nurse_requests[0].kind === 'rescue_group' && d.nurse_requests[0].animals.length === 2 && JSON.stringify(d.nurse_requests[0].animals[1].checks) === JSON.stringify(['microchip', 'uv']), 'ONE nurse card for the whole bundle, each animal with its own checks');
    t.ok(d.tasks[0].done === true, 'and the vet case is closed');
    t.ok(v.errors.length === 0, 'no page errors: ' + v.errors.join('; '));
  } finally { await v.browser.close(); }
  // 5) only Microchip / UV / Treatment check / Other (free text) are offered per animal
  const o = await open();
  try {
    await o.page.selectOption('#req-type', 'rescue'); await o.page.fill('#req-title', '1170701, 1170702');
    t.ok(await o.page.locator('.grp-row').first().locator('input[data-k]').count() === 4 && await o.page.locator('details', { hasText: 'More requests' }).count() === 0, 'four ticks per animal and no "more requests" list');
    await o.page.check('.grp-row[data-gid="1170701"] [data-k="treatment"]');
    await o.page.check('.grp-row[data-gid="1170702"] [data-k="other"]');
    await o.page.click('#req-submit'); await o.page.waitForTimeout(300);
    t.ok((await o.db()).nurse_requests.length === 0, '"Other" with no text is refused');
    await o.page.fill('.grp-row[data-gid="1170702"] [data-g="otherText"]', 'check the ears and weigh'); await o.page.click('#req-submit'); await o.page.waitForTimeout(500);
    const g5 = (await o.db()).nurse_requests;
    t.ok(g5.length === 1 && g5[0].animals.length === 2 && JSON.stringify(g5[0].animals[0].checks) === JSON.stringify(['treatment']) && JSON.stringify(g5[0].animals[1].checks) === JSON.stringify(['other']) && g5[0].animals[1].other === 'check the ears and weigh', 'treatment check and the free-text request ride on the same grouped card');
    t.ok((await o.db()).noga_requests.length === 0, 'no separate per-animal tasks');
    t.ok(o.errors.length === 0, 'no page errors: ' + o.errors.join('; '));
  } finally { await o.browser.close(); }
  // 6) transferring a medication request to the nurse: the request text is already in the note box; Tab fills the hint on other requests
  const m = await open({ tasks: [
    { id: 'med1', title: '1180801', location: 'Cat Room 1', shift: 'sick_injured', type: 'medication', needs_medication: true, urgency: 'urgent', red_flags: [], done: false, created_at: ago(600e3), sm_number: '1180801', problem: 'Meloxicam 0.5mg/ml 0.2ml SID with food for 5 days', med_label: 'Meloxicam 0.5mg/ml 0.2ml orally once daily with food for 5 days' },
    { id: 'chk1', title: '1180802', location: 'Cat Room 2', shift: 'sick_injured', type: 'shelter', urgency: 'urgent', red_flags: [], done: false, created_at: ago(600e3), problem: 'Please recheck the eye' }] }, 'vets.html');
  try {
    await m.page.waitForSelector('.attn-item .transfer-btn');
    await m.page.click('.attn-item:has-text("1180801") .transfer-btn'); await m.page.waitForSelector('.transfer-modal-overlay');
    t.ok((await m.page.inputValue('.transfer-note')) === 'Meloxicam 0.5mg/ml 0.2ml orally once daily with food for 5 days', 'a medication request opens with its label already typed in the note box');
    await m.page.click('.transfer-cancel');
    await m.page.click('.attn-item:has-text("1180802") .transfer-btn'); await m.page.waitForSelector('.transfer-modal-overlay');
    t.ok((await m.page.inputValue('.transfer-note')) === '', 'another request leaves the box empty with a grey hint');
    await m.page.focus('.transfer-note'); await m.page.keyboard.press('Tab');
    t.ok((await m.page.inputValue('.transfer-note')) === 'Please recheck the eye', 'pressing Tab fills the hint in for real');
    t.ok(m.errors.length === 0, 'no page errors: ' + m.errors.join('; '));
  } finally { await m.browser.close(); }
  t.done();
})();
