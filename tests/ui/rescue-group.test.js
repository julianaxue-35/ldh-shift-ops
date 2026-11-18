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
    const uv = db.nurse_requests.find(r => r.kind === 'uv'), both = db.nurse_requests.find(r => r.kind === 'microchip_uv');
    t.ok(db.nurse_requests.length === 2 && db.tasks.length === 0, 'two nurse requests (UV, microchip + UV), no vet case');
    t.ok(uv && uv.animal_count === 2 && uv.animals.length === 2 && uv.animals.some(x => x.id === '1170302' && x.location === 'Pound 2 / 4') && uv.location === 'Various', 'the UV request lists both animals with their own places');
    t.ok(both && both.animal_count === 1 && both.animal_id === '1170303', 'the one that needs both is its own request');
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
    t.ok(d.nurse_requests.length === 2 && d.nurse_requests.some(r => r.kind === 'uv' && r.animal_id === '1170601') && d.nurse_requests.some(r => r.kind === 'microchip_uv' && r.animal_id === '1170602'), 'one nurse request per kind of check');
    t.ok(d.tasks[0].done === true, 'and the vet case is closed');
    t.ok(v.errors.length === 0, 'no page errors: ' + v.errors.join('; '));
  } finally { await v.browser.close(); }
  t.done();
})();
