// Nurses: upload the Vet Treatments Due report, group by location, tick what was given, send to the Admission AA.
const { open } = require('./harness');
const t = require('./check')('nurses-report7');
const { makeReport7 } = require('../fixtures/report7-fixture.cjs');

(async () => {
  const buf = await makeReport7([
    { id: '9000001', name: 'Never Shown', chip: '956000000000001', location: 'Cat Room 2', kennel: '50', due: 46300 },
    { id: '9000002', location: 'Cat Room 2', kennel: '07', due: 46314 },
    { id: '9000003', location: 'Vet Clinic', due: 46314 },
    { id: '9000004', location: 'Cat Adoptions 1', kennel: '03', due: 46314, treatment: 'Nobivac Flex Tricat' },
    { id: '9000005', location: 'Cat Adoptions 1', kennel: '04', due: 46314, treatment: 'Nobivac Rabies' }
  ]);
  const n = await open({}, 'nurses.html');
  try {
    await n.page.fill('#initials-processing', 'cd');
    await n.page.setInputFiles('#vacc-file', { name: 'Report7.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: buf });
    await n.page.waitForSelector('#vacc-list .vr-group');
    const groups = await n.page.$$eval('#vacc-list .vr-group', gs => gs.map(g => g.dataset.location));
    t.ok(groups.join('|') === 'Cat Room 2|Vet Clinic|Cat Adoptions 1', 'animals are grouped by shelter location in room order (Vet clinic is now a known place, so it sorts before names the dashboard does not know): ' + groups.join('|'));
    const room2 = (await n.page.innerText('.vr-group[data-location="Cat Room 2"]')).replace(/\s+/g, ' ');
    t.ok(room2.indexOf('9000002') < room2.indexOf('9000001') && /Kennel 07/.test(room2) && /overdue/.test(room2), 'kennels in number order, overdue flagged: ' + room2.slice(0, 160));
    t.ok(!/Never Shown|956000000000001/.test(await n.page.textContent('#vacc-list')), 'names and microchip numbers are never shown');

    t.ok(!(await n.page.isVisible('#vacc-float')), 'nothing ticked: the Send bar is not shown');
    // tick a whole location, then one animal elsewhere
    await n.page.check('.vr-all[data-location="Cat Room 2"]');
    await n.page.locator('.vr-row', { hasText: '9000005' }).locator('.vr-pick').check();
    t.ok(/3 ticked/.test(await n.page.textContent('#vacc-count')), 'the count follows the ticks: ' + await n.page.textContent('#vacc-count'));
    await n.page.click('#vacc-send');
    await n.page.waitForFunction(() => window.__db.aa_items.length === 2);
    const db = await n.db();
    const tri = db.aa_items.find(r => r.payload.vaccine === 'Nobivac Flex Tricat'), rab = db.aa_items.find(r => r.payload.vaccine === 'Nobivac Rabies');
    t.ok(tri.kind === 'vaccination' && tri.animal_ids.slice().sort().join() === '9000001,9000002' && tri.sent_by === 'CD', 'one vaccination card per vaccine, listing every ticked animal with the nurse initials: ' + JSON.stringify(tri.animal_ids));
    t.ok(rab.animal_ids.join() === '9000005', 'a different vaccine is its own card');
    const left = await n.page.$$eval('.vr-pick', cs => cs.map(c => c.dataset.key));
    t.ok(left.length === 2 && left.every(k => /9000003|9000004/.test(k)), 'sent animals leave the list; the rest stay: ' + left.join());

    // reload the same day: the remaining list is still there; re-uploading never repeats what was sent
    await n.page.reload(); await n.page.waitForSelector('#vacc-file');
    t.ok(await n.page.locator('.vr-pick').count() === 2, 'the list is still there after a reload the same day');
    await n.page.setInputFiles('#vacc-file', { name: 'Report7.xlsx', mimeType: 'application/octet-stream', buffer: buf });
    await n.page.waitForSelector('#vacc-list .vr-group');
    t.ok(await n.page.locator('.vr-pick').count() === 2 && /already sent to the Admission AA today/.test(await n.page.textContent('#vacc-error')), 're-uploading the same report leaves out what was already sent');

    // add a cat / dog by hand: just the ID and the location
    await n.page.fill('#vacc-add-id', '9300001');
    await n.page.click('#vacc-add');
    t.ok(/location/i.test(await n.page.textContent('#vacc-error')), 'a location is needed too');
    await n.page.fill('#vacc-add-loc', 'Pound 3');
    await n.page.click('#vacc-add');
    let grp = (await n.page.innerText('.vr-group[data-location="Pound 3"]')).replace(/\s+/g, ' ');
    t.ok(/9300001/.test(grp) && /added by hand/.test(grp), 'the animal appears under its location: ' + grp);
    t.ok((await n.page.inputValue('#vacc-add-id')) === '' && (await n.page.inputValue('#vacc-add-loc')) === 'Pound 3', 'the ID clears but the location stays for the next one');
    await n.page.fill('#vacc-add-id', '9300010 - 9300012');
    await n.page.click('#vacc-add');
    t.ok(await n.page.locator('.vr-pick[data-location="Pound 3"]').count() === 4, 'a litter range adds each animal');
    await n.page.fill('#vacc-add-id', '9300001, 9300013');
    await n.page.click('#vacc-add');
    t.ok(await n.page.locator('.vr-pick[data-location="Pound 3"]').count() === 5 && /already on the list/.test(await n.page.textContent('#vacc-error')), 'an animal already on the list is not added twice');
    await n.page.fill('#vacc-add-id', '9300020 - 9300010');
    await n.page.click('#vacc-add');
    t.ok(/backwards/.test(await n.page.textContent('#vacc-error')), 'a bad range is explained');
    // they are sent like the rest: a plain Vaccination card, and shared to the other devices
    await n.page.locator('.vr-row', { hasText: '9300001' }).locator('.vr-pick').check();
    await n.page.locator('.vr-row', { hasText: '9300013' }).locator('.vr-pick').check();
    const cardsBefore = (await n.db()).aa_items.length;
    await n.page.click('#vacc-send');
    await n.page.waitForFunction((c) => window.__db.aa_items.length === c + 1, cardsBefore);
    const manual = (await n.db()).aa_items.find(r => r.payload.vaccine === 'Vaccination');
    t.ok(manual && manual.kind === 'vaccination' && manual.animal_ids.slice().sort().join() === '9300001,9300013' && manual.sent_by === 'CD', 'by-hand animals go to the Admission AA as one Vaccination card: ' + JSON.stringify(manual && manual.animal_ids));
    await n.page.waitForTimeout(300);
    t.ok((await n.db()).vacc_list[0].animals.some(a => a.id === '9300010'), 'and the by-hand animals still waiting are in the shared list');

    // a wrong file gives a message, not an error
    await n.page.setInputFiles('#vacc-file', { name: 'notes.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('not a spreadsheet') });
    await n.page.waitForFunction(() => /could not be opened/.test(document.getElementById('vacc-error').textContent));
    t.ok(true, 'a wrong file is explained, not an error');
    t.ok(n.errors.length === 0, 'no page errors: ' + n.errors.join('; '));
  } finally { await n.browser.close(); }
  t.done();
})();
