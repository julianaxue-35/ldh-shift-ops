// The Report 7 vaccination list is shared: uploaded on the computer, open on the phone, no extra password.
const { open } = require('./harness');
const t = require('./check')('nurses-vacc-sync');
const { makeReport7 } = require('../fixtures/report7-fixture.cjs');
const today = () => new Date().toLocaleDateString('en-CA');

(async () => {
  /* the computer: upload, and the list is stored in the shared database */
  const buf = await makeReport7([
    { id: '9000001', name: 'Never Stored', chip: '956000000000001', location: 'Cat Room 2', kennel: '07' },
    { id: '9000002', location: 'Vet Clinic' }
  ]);
  const pc = await open({}, 'nurses.html');
  try {
    await pc.page.fill('#initials-processing', 'cd');
    await pc.page.setInputFiles('#vacc-file', { name: 'Report7.xlsx', mimeType: 'application/octet-stream', buffer: buf });
    await pc.page.waitForSelector('#vacc-list .vr-group');
    await pc.page.waitForFunction(() => window.__db.vacc_list.length === 1);
    const row = (await pc.db()).vacc_list[0];
    t.ok(row.day === today() && row.animals.length === 2 && row.animals.map(a => a.id).sort().join() === '9000001,9000002', 'uploading saves today\'s list to the shared database: ' + JSON.stringify(row.animals.map(a => a.id)));
    t.ok(!/Never Stored|956000000000001/.test(JSON.stringify(row)), 'names and microchip numbers are not stored');

    /* sending from this device updates the shared list */
    await pc.page.check('.vr-all[data-location="Cat Room 2"]');
    await pc.page.click('#vacc-send');
    await pc.page.waitForFunction(() => window.__db.aa_items.length === 1);
    await pc.page.waitForTimeout(400);
    const after = (await pc.db()).vacc_list[0];
    t.ok(after.animals.map(a => a.id).join() === '9000002' && after.sent.length === 1, 'sent animals leave the shared list and are remembered as sent: ' + JSON.stringify([after.animals.map(a => a.id), after.sent]));
    t.ok(pc.errors.length === 0, 'no page errors (computer): ' + pc.errors.join('; '));
  } finally { await pc.browser.close(); }

  /* the phone: a fresh browser with nothing stored opens the page and finds the list */
  const animals = [
    { id: '9100001', treatment: 'Nobivac Flex Tricat', location: 'Cat Room 2', kennel: '07', due: '2026-10-19', weight: '3' },
    { id: '9100002', treatment: 'Nobivac Flex Tricat', location: 'Vet Clinic', kennel: '', due: '2026-10-19', weight: '1' }
  ];
  const phone = await open({ vacc_list: [{ day: today(), animals, sent: [], updated_at: new Date().toISOString() }] }, 'nurses.html');
  try {
    await phone.page.waitForSelector('#vacc-list .vr-group');
    t.ok(await phone.page.locator('.vr-pick').count() === 2, 'the phone shows the list uploaded on the computer');
    t.ok(/Cat Room 2/.test(await phone.page.textContent('#vacc-list')) && /Vet Clinic/.test(await phone.page.textContent('#vacc-list')), 'grouped by location');

    /* the computer changes it (someone uploads / sends): the phone updates by itself */
    await phone.page.evaluate(({ day }) => sb.from('vacc_list').update({ animals: [{ id: '9100002', treatment: 'Nobivac Flex Tricat', location: 'Vet Clinic', kennel: '', due: '2026-10-19', weight: '1' }], sent: ['9100001|Nobivac Flex Tricat'], updated_at: new Date(Date.now() + 1000).toISOString() }).eq('day', day), { day: today() });
    await phone.page.waitForFunction(() => document.querySelectorAll('.vr-pick').length === 1, null, { timeout: 5000 });
    t.ok(true, 'a change made on the other device appears without reloading');

    /* an older copy never overwrites a newer one */
    await phone.page.evaluate(({ day }) => sb.from('vacc_list').update({ animals: [], updated_at: '2000-01-01T00:00:00Z' }).eq('day', day), { day: today() });
    await phone.page.waitForTimeout(600);
    t.ok(await phone.page.locator('.vr-pick').count() === 1, 'a stale copy does not wipe the list on this device');

    /* sending from the phone marks them sent for everyone */
    await phone.page.fill('#initials-processing', 'ef');
    await phone.page.locator('.vr-pick').check();
    await phone.page.click('#vacc-send');
    await phone.page.waitForFunction(() => window.__db.aa_items.length === 1);
    await phone.page.waitForTimeout(400);
    const r = (await phone.db()).vacc_list[0];
    t.ok(r.animals.length === 0 && r.sent.includes('9100002|Nobivac Flex Tricat'), 'sending from the phone updates the shared list');
    t.ok(phone.errors.length === 0, 'no page errors (phone): ' + phone.errors.join('; '));
  } finally { await phone.browser.close(); }

  /* yesterday's list is not today's */
  const old = await open({ vacc_list: [{ day: '2020-01-01', animals: [{ id: '1', treatment: 'x', location: 'y' }], sent: [], updated_at: '2020-01-01T00:00:00Z' }] }, 'nurses.html');
  try {
    await old.page.waitForTimeout(600);
    t.ok(await old.page.locator('.vr-pick').count() === 0, "an old day's list is never loaded");
  } finally { await old.browser.close(); }
  t.done();
})();
