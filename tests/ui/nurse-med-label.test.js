// A vet sends a medication label to the Welfare nurse: it shows on the Nurses page with the ID, space, vet initials and the full label.
const { open } = require('./harness');
const t = require('./check')('nurse-med-label');
const LABEL = 'Meloxicam, give 1 tablet orally once daily with food for 5 days, stop if vomiting, diarrhoea or not eating, review on 26/10';
(async () => {
  const n = await open({ noga_requests: [{ animal_id: 'LBL-1', location: 'Pound 1 / 4', task: 'med_label', note: LABEL, added_by: 'JX', source_key: 'c1|0', done: false },
    { animal_id: 'OTH-1', location: 'Pound 2', task: 'other', note: 'bloods', added_by: 'AB', done: false }] }, 'nurses.html');
  try {
    await n.page.waitForSelector('#noga-list .noga-item');
    const rows = await n.page.$$eval('#noga-list .noga-item', rs => rs.map(r => r.textContent.replace(/\s+/g, ' ')));
    const lbl = rows.find(r => /LBL-1/.test(r)) || '';
    t.ok(/LBL-1 — Pound 1 \/ 4/.test(lbl) && /Medication label to make/.test(lbl) && /requested by JX/.test(lbl), 'the nurse sees the animal, the space and the vet\'s initials: ' + lbl.slice(0, 120));
    t.ok(await n.page.locator('#noga-list .med-label-text').count() === 1 && (await n.page.textContent('#noga-list .med-label-text')).trim() === LABEL, 'the full label is shown as one block');
    t.ok(await n.page.locator('#noga-list .noga-item:has-text("LBL-1") .noga-copy').count() === 1 && await n.page.locator('#noga-list .noga-item:has-text("LBL-1") .noga-back').count() === 0, 'Copy and Done (no "send back to vet") on a label task');
    t.ok(await n.page.locator('#noga-list .noga-item:has-text("OTH-1") .noga-back').count() === 1, 'other tasks are unchanged');
    // Done with initials
    await n.page.fill('#initials-welfare', 'ab'); await n.page.dispatchEvent('#initials-welfare', 'change');
    await n.page.click('#noga-list .noga-item:has-text("LBL-1") .noga-done');
    await n.page.waitForFunction(() => window.__db.noga_requests.find(r => r.animal_id === 'LBL-1').done === true);
    const row = (await n.db()).noga_requests.find(r => r.animal_id === 'LBL-1');
    t.ok(row.done && !!row.done_by, 'Done marks it done with the nurse\'s initials: ' + row.done_by);
    t.ok(n.errors.length === 0, 'no page errors: ' + n.errors.join('; '));
  } finally { await n.browser.close(); }
  const v = await open({}, 'vets.html');
  try {
    await v.page.waitForSelector('#mt-task option', { state: 'attached' });
    const opts = await v.page.$$eval('#mt-task option', os => os.map(o => o.value));
    t.ok(opts.length > 3 && !opts.includes('med_label'), 'the vets\' own task form does not offer "Medication label" as a task type: ' + opts.join(','));
  } finally { await v.browser.close(); }
  t.done();
})();
