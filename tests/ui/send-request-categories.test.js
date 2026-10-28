const { open } = require('./harness');
const t = require('./check')('send-request-categories');
(async () => {
  const s = await open({}, 'index.html');
  try {
    await s.page.waitForSelector('#send-request');
    // Vets: an "Other" request needs a note and is stored as an ordinary shelter request
    const vetsKinds = await s.page.$$eval('#req-type option', os => os.map(o => o.value));
    t.ok(vetsKinds.includes('other'), 'Vets has an Other option: ' + vetsKinds);
    await s.page.fill('#req-title', 'CAT-1'); await s.page.selectOption('#req-type', 'other');
    let dialog = '';
    s.page.once('dialog', d => { dialog = d.message(); });   // the harness accepts it
    await s.page.click('#req-submit');
    await s.page.waitForTimeout(300);
    t.ok(/Describe/.test(dialog), 'Vets Other without a note is refused: ' + dialog);
    await s.page.fill('#req-problem', 'Please look at a lump');
    await s.page.click('#req-submit');
    await s.page.waitForFunction(() => window.__db.tasks.length === 1);
    const row = (await s.db()).tasks[0];
    t.ok(row.type === 'shelter' && /lump/.test(row.problem), 'Other is stored as a shelter request with the note: ' + row.type);
    // Nurses (staff page): vaccination on arrival only; one-animal tasks are asked by the vets from the Vets page
    await s.page.click('.sr-tab[data-sr="nurses"]');
    const nurseKinds = await s.page.$$eval('#nr-kind option', os => os.map(o => o.value));
    t.ok(nurseKinds.join() === 'vaccination', 'the staff Nurses tab offers vaccination only: ' + nurseKinds);
    t.ok(await s.page.locator('#nr-animal').count() === 0 && await s.page.isVisible('#nr-count'), 'no one-animal task form on the staff page, only the group (how many) form');
    // the vets page asks the nurses to dispense medication: a plain task, no schedule
    const v = await open({}, 'vets.html');
    try {
      await v.page.waitForSelector('#send-request .sc-tab');
      const F = f => '#send-request .sc-panel[data-to="nurses"] [data-f="' + f + '"]';
      t.ok((await v.page.$eval(F('kind'), e => e.value)) === 'dispense', 'on the Vets page the Nurses tab starts on Dispense medication');
      t.ok(!(await v.page.isVisible(F('treatment'))) && !(await v.page.isVisible(F('days'))) && !(await v.page.isVisible(F('times'))), 'dispensing asks for no treatment type, times a day or days');
      await v.page.fill('#vet-initials', 'jx'); await v.page.fill(F('animal'), 'MED-1');
      let dlg = ''; v.page.once('dialog', () => {});
      await v.page.click('[data-send="nurses"]');
      t.ok(/medication to dispense/i.test(await v.page.textContent('#send-request .sc-panel[data-to="nurses"] [data-msg]')) && (await v.db()).noga_requests.length === 0, 'it needs the medication written in the note');
      await v.page.fill(F('note'), 'meloxicam 0.5 ml with food'); await v.page.selectOption(F('room'), 'Pound 2'); await v.page.fill(F('pen'), '6');
      await v.page.click('[data-send="nurses"]');
      await v.page.waitForFunction(() => window.__db.noga_requests.length === 1);
      const r = (await v.db()).noga_requests[0];
      t.ok(r.task === 'dispense' && r.animal_id === 'MED-1' && r.location === 'Pound 2 / 6' && r.note === 'meloxicam 0.5 ml with food' && r.added_by === 'JX', 'saved as a Dispense medication nurse task with the medication, place and initials: ' + JSON.stringify(r));
      t.ok(/Dispense medication/.test(await v.page.textContent('#misc-list')), 'and listed under the nurse tasks requested');
      t.ok(v.errors.length === 0, 'vets page: no errors ' + v.errors.join('; '));
    } finally { await v.browser.close(); }
    t.ok(s.errors.length === 0, 'no page errors: ' + s.errors.join('; '));
  } finally { await s.browser.close(); }
  t.done();
})();
