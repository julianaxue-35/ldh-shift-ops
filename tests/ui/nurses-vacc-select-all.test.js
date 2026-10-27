// Nurses: one button ticks every animal on the vaccination list; then send them all, or mark them all done.
const { open } = require('./harness');
const t = require('./check')('nurses-vacc-select-all');
const { makeReport7 } = require('../fixtures/report7-fixture.cjs');
(async () => {
  const buf = await makeReport7([
    { id: '9100001', location: 'Cat Room 2', kennel: '01', due: 46314 },
    { id: '9100002', location: 'Cat Room 2', kennel: '02', due: 46314 },
    { id: '9100003', location: 'Vet Clinic', due: 46314 },
    { id: '9100004', location: 'Cat Adoptions 1', kennel: '03', due: 46314, treatment: 'Nobivac Rabies' }
  ]);
  const n = await open({}, 'nurses.html');
  try {
    await n.page.fill('#initials-processing', 'cd');
    await n.page.setInputFiles('#vacc-file', { name: 'Report7.xlsx', mimeType: 'application/octet-stream', buffer: buf });
    await n.page.waitForSelector('#vacc-list .vr-group');
    await n.page.click('#vacc-select-all');
    t.ok(await n.page.locator('.vr-pick:checked').count() === 4 && /4 ticked/.test(await n.page.textContent('#vacc-count')), 'Select all ticks every animal');
    t.ok(/Untick all/.test(await n.page.textContent('#vacc-select-all')), 'the button then offers to untick');
    await n.page.click('#vacc-select-all');
    t.ok(await n.page.locator('.vr-pick:checked').count() === 0, 'tapping again unticks them all');
    await n.page.click('#vacc-select-all');
    await n.page.click('#vacc-send');
    await n.page.waitForFunction(() => window.__db.aa_items.length === 2);
    t.ok((await n.page.locator('.vr-pick').count()) === 0, 'all four were sent and leave the list');

    // mark done without sending
    await n.page.fill('#vacc-add-id', '9100010 - 9100012'); await n.page.fill('#vacc-add-loc', 'Pound 3'); await n.page.click('#vacc-add');
    t.ok(!(await n.page.isVisible('#vacc-float')), 'the Send / Mark done bar only appears once something is ticked');
    await n.page.click('#vacc-select-all');
    await n.page.click('#vacc-done');
    await n.page.waitForFunction(() => document.querySelectorAll('.vr-pick').length === 0);
    t.ok((await n.db()).aa_items.length === 2, 'marking done sends nothing to the Admission AA');
    await n.page.fill('#vacc-add-id', '9100010'); await n.page.click('#vacc-add');
    t.ok(/already on the list or already sent/.test(await n.page.textContent('#vacc-error')), 'done animals are not added again today');
    t.ok(n.errors.length === 0, 'no page errors: ' + n.errors.join('; '));
  } finally { await n.browser.close(); }
  t.done();
})();
