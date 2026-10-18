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
    t.ok(groups.join('|') === 'Cat Room 2|Cat Adoptions 1|Vet Clinic', 'animals are grouped by shelter location in room order: ' + groups.join('|'));
    const room2 = (await n.page.innerText('.vr-group[data-location="Cat Room 2"]')).replace(/\s+/g, ' ');
    t.ok(room2.indexOf('9000002') < room2.indexOf('9000001') && /kennel 07/.test(room2) && /overdue/.test(room2), 'kennels in number order, overdue flagged: ' + room2.slice(0, 160));
    t.ok(!/Never Shown|956000000000001/.test(await n.page.textContent('#vacc-list')), 'names and microchip numbers are never shown');

    await n.page.click('#vacc-send');
    t.ok(/Tick the animals/.test(await n.page.textContent('#vacc-error')), 'nothing ticked: asks to tick animals');
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

    // a wrong file gives a message, not an error
    await n.page.setInputFiles('#vacc-file', { name: 'notes.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('not a spreadsheet') });
    await n.page.waitForFunction(() => /could not be opened/.test(document.getElementById('vacc-error').textContent));
    t.ok(true, 'a wrong file is explained, not an error');
    t.ok(n.errors.length === 0, 'no page errors: ' + n.errors.join('; '));
  } finally { await n.browser.close(); }
  t.done();
})();
