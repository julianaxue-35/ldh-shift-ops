// Vets asking the nurses for a task or a treatment can give a pen number, not just the space.
const { open } = require('./harness');
const t = require('./check')('vet-nurse-pen');
(async () => {
  const v = await open({}, 'vets.html');
  try {
    await v.page.waitForSelector('#send-request .sc-panel[data-to="nurses"] [data-f="room"] option', { state: 'attached' });
    const F = f => '#send-request .sc-panel[data-to="nurses"] [data-f="' + f + '"]';
    // one-animal task
    await v.page.fill(F('animal'), 'PEN-1'); await v.page.fill('#vet-initials', 'jx');
    await v.page.selectOption(F('kind'), 'blood');
    await v.page.selectOption(F('room'), 'Pound 1');
    t.ok(await v.page.isVisible(F('pen')), 'a Pen box sits next to the space');
    await v.page.fill(F('pen'), '12');
    await v.page.click('[data-send="nurses"]');
    await v.page.waitForFunction(() => window.__db.noga_requests.length === 1);
    let row = (await v.db()).noga_requests[0];
    t.ok(row.animal_id === 'PEN-1' && row.location === 'Pound 1 / 12', 'the task is saved as "space / pen" like the flag board: ' + row.location);
    t.ok(/Pound 1 \/ 12/.test(await v.page.textContent('#misc-list')), 'and the vet sees it in the list');
    t.ok((await v.page.inputValue(F('pen'))) === '', 'the pen clears for the next one');
    // no pen: just the space
    await v.page.fill(F('animal'), 'PEN-2'); await v.page.click('[data-send="nurses"]');
    await v.page.waitForFunction(() => window.__db.noga_requests.length === 2);
    t.ok((await v.db()).noga_requests[1].location === 'Pound 1', 'leaving the pen blank still works');
    // offsite animals take a detail (kept in location_detail), not a pen
    await v.page.fill(F('animal'), 'PEN-5'); await v.page.selectOption(F('room'), 'Vet clinic'); await v.page.fill(F('pen'), 'ward 2');
    await v.page.click('[data-send="nurses"]');
    await v.page.waitForFunction(() => window.__db.noga_requests.length === 3);
    row = (await v.db()).noga_requests[2];
    t.ok(row.location === 'Vet clinic' && row.location_detail === 'ward 2', 'offsite keeps the detail separately: ' + row.location + ' / ' + row.location_detail);
    // treatment course
    await v.page.selectOption(F('kind'), 'course');
    await v.page.fill(F('animal'), 'PEN-3'); await v.page.selectOption(F('room'), 'Cat Room 2'); await v.page.fill(F('pen'), '7');
    await v.page.fill(F('treatment'), 'flush site'); await v.page.click('[data-send="nurses"]');
    await v.page.waitForFunction(() => window.__db.nurse_treatments.length === 1);
    t.ok((await v.db()).nurse_treatments[0].location === 'Cat Room 2 / 7', 'a treatment course keeps the pen too');
    t.ok(/Cat Room 2 \/ 7/.test(await v.page.textContent('#nt-courses')), 'and shows it in the courses list');
    t.ok(v.errors.length === 0, 'no page errors: ' + v.errors.join('; '));
  } finally { await v.browser.close(); }

  // the nurse sees the pen on the animal, with treatments grouped by room
  const today = new Date().toLocaleDateString('en-CA');
  const n = await open({
    nurse_treatments: [{ id: 'tr1', animal_id: 'PEN-3', location: 'Cat Room 2 / 7', treatment: 'flush site', times_per_day: 1, days: 3, start_date: today, requested_by: 'Vet team', stopped: false },
      { id: 'tr2', animal_id: 'PEN-4', location: 'Cat Room 2 / 9', treatment: 'eye drops', times_per_day: 1, days: 3, start_date: today, requested_by: 'Vet team', stopped: false }],
    nurse_treatment_doses: [{ treatment_id: 'tr1', day_no: 1, slot_no: 1, due_date: today }, { treatment_id: 'tr2', day_no: 1, slot_no: 1, due_date: today }]
  }, 'nurses.html');
  try {
    await n.page.waitForSelector('#nurse-doses .nt-tick');
    const txt = (await n.page.textContent('#nurse-doses')).replace(/\s+/g, ' ');
    t.ok(/PEN-3.*Pen 7/.test(txt) && /PEN-4.*Pen 9/.test(txt), 'the nurse sees each animal with its pen: ' + txt.slice(0, 120));
    t.ok(await n.page.locator('#nurse-doses .nt-group-h').count() === 1, 'one heading for the room, not one per pen');
    t.ok(n.errors.length === 0, 'no nurse page errors');
  } finally { await n.browser.close(); }
  t.done();
})();
