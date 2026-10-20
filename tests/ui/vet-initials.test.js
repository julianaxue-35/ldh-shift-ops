// Vets put their initials on what they send to the nurses, and the nurses can see them.
const { open } = require('./harness');
const t = require('./check')('vet-initials');
const ago = ms => new Date(Date.now() - ms).toISOString();
(async () => {
  const v = await open({ tasks: [{ title: 'CASE-1', location: 'Pound 1', shift: 'sick_injured', type: 'shelter', urgency: 'urgent', done: false, created_at: ago(3600e3) }] }, 'vets.html');
  try {
    await v.page.waitForSelector('#vet-initials');
    t.ok(await v.page.isVisible('#vet-initials'), 'there is a box for the vet\'s initials');
    await v.page.fill('#vet-initials', 'ab3c');
    t.ok((await v.page.inputValue('#vet-initials')) === 'ABC', 'initials are letters only, upper case: ' + await v.page.inputValue('#vet-initials'));
    // misc task
    await v.page.fill('#mt-animal', 'INI-1'); await v.page.click('#mt-submit');
    await v.page.waitForFunction(() => window.__db.noga_requests.length === 1);
    t.ok((await v.db()).noga_requests[0].added_by === 'ABC', 'a nurse task carries the vet\'s initials');
    t.ok(/requested by ABC/.test(await v.page.textContent('#misc-list')), 'and the vet sees who asked in the list');
    // treatment
    await v.page.fill('#nt-animal', 'INI-2'); await v.page.fill('#nt-treatment', 'flush'); await v.page.click('#nt-submit');
    await v.page.waitForFunction(() => window.__db.nurse_treatments.length === 1);
    t.ok((await v.db()).nurse_treatments[0].requested_by === 'ABC', 'a treatment request carries them too');
    // transfer a flagged case
    await v.page.waitForSelector('.transfer-btn');
    await v.page.click('.transfer-btn');
    await v.page.click('.transfer-confirm');
    await v.page.waitForFunction(() => window.__db.noga_requests.length === 2);
    t.ok((await v.db()).noga_requests[1].added_by === 'ABC', 'a case transferred to a nurse carries them');
    // empty box: asked once (the test browser answers JX), then remembered
    await v.page.fill('#vet-initials', '');
    await v.page.fill('#mt-animal', 'INI-3'); await v.page.click('#mt-submit');
    await v.page.waitForFunction(() => window.__db.noga_requests.length === 3);
    t.ok((await v.db()).noga_requests[2].added_by === 'JX' && (await v.page.inputValue('#vet-initials')) === 'JX', 'if the box is empty they are asked, and the answer fills the box');
    // remembered on reload the same day
    await v.page.reload(); await v.page.waitForSelector('#vet-initials');
    t.ok((await v.page.inputValue('#vet-initials')) === 'JX', 'kept for the day on this device');
    t.ok(v.errors.length === 0, 'no page errors: ' + v.errors.join('; '));
  } finally { await v.browser.close(); }

  const today = new Date().toLocaleDateString('en-CA');
  const n = await open({
    noga_requests: [{ animal_id: 'INI-1', location: 'Pound 1', task: 'other', note: 'bloods', added_by: 'ABC', done: false }, { animal_id: 'OLD-1', location: 'Pound 2', task: 'other', added_by: 'Vet team', done: false }],
    nurse_treatments: [{ id: 'tr1', animal_id: 'INI-2', location: 'Cat Room 1', treatment: 'flush', times_per_day: 1, days: 3, start_date: today, requested_by: 'ABC', stopped: false }],
    nurse_treatment_doses: [{ treatment_id: 'tr1', day_no: 1, slot_no: 1, due_date: today }]
  }, 'nurses.html');
  try {
    await n.page.waitForSelector('#noga-list .noga-item');
    const misc = (await n.page.textContent('#noga-list')).replace(/\s+/g, ' ');
    t.ok(/INI-1.*requested by ABC/.test(misc) && !/OLD-1[^|]*requested by/.test(misc), 'the nurse sees who asked on a task (older "Vet team" tasks show nothing extra): ' + misc.slice(0, 140));
    t.ok(/requested by ABC/.test((await n.page.textContent('#nurse-doses')).replace(/\s+/g, ' ')), 'and on a treatment');
    t.ok(n.errors.length === 0, 'no nurse page errors');
  } finally { await n.browser.close(); }
  t.done();
})();
