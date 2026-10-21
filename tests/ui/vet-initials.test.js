// Vets put their initials in each request to the nurses (misc task, treatment, transfer), and the nurses can see them.
const { open } = require('./harness');
const t = require('./check')('vet-initials');
const ago = ms => new Date(Date.now() - ms).toISOString();
(async () => {
  const v = await open({ tasks: [{ title: 'CASE-1', location: 'Pound 1', shift: 'sick_injured', type: 'shelter', urgency: 'urgent', done: false, created_at: ago(3600e3) }] }, 'vets.html');
  try {
    await v.page.waitForSelector('#send-request [data-f="initials"]');
    const F = f => '#send-request .sc-panel[data-to="nurses"] [data-f="' + f + '"]';
    const msg = () => v.page.textContent('#send-request .sc-panel[data-to="nurses"] [data-msg]');
    t.ok(await v.page.locator('#vet-initials').count() === 0, 'no separate "vet initials for today" box on the vets page');
    t.ok(await v.page.isVisible('#send-request [data-f="initials"]'), 'the one request card has an initials box');
    // nurse task (one animal): blocked without initials
    await v.page.selectOption(F('kind'), 'other');
    await v.page.fill(F('animal'), 'INI-1');
    await v.page.click('[data-send="nurses"]'); await v.page.waitForTimeout(200);
    t.ok((await v.db()).noga_requests.length === 0 && /initials/i.test(await msg()), 'a nurse task cannot be sent without initials');
    await v.page.fill('#send-request [data-f="initials"]', 'ab3c');
    t.ok((await v.page.inputValue('#send-request [data-f="initials"]')) === 'ABC', 'initials are letters only, upper case');
    await v.page.click('[data-send="nurses"]');
    await v.page.waitForFunction(() => window.__db.noga_requests.length === 1);
    t.ok((await v.db()).noga_requests[0].added_by === 'ABC', 'a nurse task carries the vet\'s initials');
    t.ok(/requested by ABC/.test(await v.page.textContent('#misc-list')), 'and the vet sees who asked in the list');
    // treatment course: uses the same initials box, which keeps the last initials typed
    t.ok((await v.page.inputValue('#send-request [data-f="initials"]')) === 'ABC', 'the card keeps the initials just used');
    await v.page.fill('#send-request [data-f="initials"]', 'xy');
    await v.page.selectOption(F('kind'), 'course');
    await v.page.fill(F('animal'), 'INI-2'); await v.page.fill(F('treatment'), 'flush'); await v.page.click('[data-send="nurses"]');
    await v.page.waitForFunction(() => window.__db.nurse_treatments.length === 1);
    t.ok((await v.db()).nurse_treatments[0].requested_by === 'XY', 'a treatment request carries the initials typed in it');
    // transfer
    await v.page.waitForSelector('.transfer-btn'); await v.page.click('.transfer-btn');
    t.ok((await v.page.inputValue('.transfer-initials')) === 'XY', 'the transfer window has an initials box, filled in from the last request');
    await v.page.fill('.transfer-initials', ''); await v.page.click('.transfer-confirm'); await v.page.waitForTimeout(300);
    t.ok((await v.db()).noga_requests.length === 1, 'a transfer cannot be sent without initials');
    await v.page.fill('.transfer-initials', 'jx'); await v.page.click('.transfer-confirm');
    await v.page.waitForFunction(() => window.__db.noga_requests.length === 2);
    t.ok((await v.db()).noga_requests[1].added_by === 'JX', 'a case transferred to a nurse carries them');
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
    t.ok(/INI-1.*requested by ABC/.test(misc) && !/OLD-1[^|]*requested by/.test(misc), 'the nurse sees who asked on a task (older "Vet team" tasks show nothing extra)');
    t.ok(/requested by ABC/.test((await n.page.textContent('#nurse-doses')).replace(/\s+/g, ' ')), 'and on a treatment');
    t.ok(n.errors.length === 0, 'no nurse page errors');
  } finally { await n.browser.close(); }
  t.done();
})();
