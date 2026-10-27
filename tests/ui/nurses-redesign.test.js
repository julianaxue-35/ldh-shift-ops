// Nurses page redesign: active tasks vs completed (folded away), category badges, pen badges, medication sent by the vets under
// "Medication labels to make", a distinct Welfare / Processing split, floating bulk bar. Fictional animals only.
const { open } = require('./harness');
const t = require('./check')('nurses-redesign');
const ago = ms => new Date(Date.now() - ms).toISOString();
(async () => {
  const n = await open({ noga_requests: [
    { animal_id: 'NR-1', location: 'Cat Room 1 / 28', task: 'blood', created_at: ago(2 * 3600e3), done: false, added_by: 'Vet team' },
    { animal_id: 'NR-2', location: 'Adoption 1 / 8', task: 'med_label', note: 'Meloxicam oral suspension 0.5mg/mL, give 0.34mL orally once daily', created_at: ago(3 * 3600e3), done: false, added_by: 'LW' },
    { animal_id: 'NR-3', location: 'Pound 2 / 20', task: 'dispense', note: 'Doxy paste 1 notch SID for 5 days', created_at: ago(5 * 3600e3), done: true, done_at: ago(3600e3), done_by: 'RL', added_by: 'YN' },
    { animal_id: 'NR-5', location: 'Adoption 1 / 8', task: 'dispense', note: 'Doxy paste 1 notch SID for 5 days', created_at: ago(2 * 3600e3), done: false, source_task_id: 'x', added_by: 'YN' },
    { animal_id: 'NR-4', location: 'Pound 3 / 148', task: 'microchip', created_at: ago(4 * 3600e3), done: false, added_by: 'Vet team' },
    { animal_id: 'NR-6', location: 'Cat Room 2 / 3', task: 'fiv_test', created_at: ago(2 * 3600e3), done: true, done_at: ago(1800e3), done_by: 'PM', added_by: 'Vet team' }
  ] }, 'nurses.html');
  try {
    await n.page.waitForSelector('#noga-list .noga-item');
    // medication sent by the vets lands under Medication labels, not Miscellaneous tasks
    const meds = await n.page.$$eval('#med-labels-list > .noga-item .nt-id', els => els.map(e => e.textContent));
    t.ok(meds.sort().join() === 'NR-2,NR-5', 'medication label and dispense tasks sent by the vets are under "Medication labels to make": ' + meds);
    t.ok(await n.page.locator('#noga-list .noga-item:has-text("NR-2"), #noga-list .noga-item:has-text("NR-5"), #proc-misc-list .noga-item:has-text("NR-2")').count() === 0, 'and none of them are in Miscellaneous tasks');
    const dispense = n.page.locator('#med-labels-list .nt-card', { hasText: 'NR-5' });
    t.ok(/Doxy paste 1 notch SID/.test(await dispense.locator('.nt-block .med-label-text').textContent()) && await dispense.locator('.noga-copy, .noga-back, .noga-done').count() === 3, 'a dispense task shows its medication in a block with Copy, Send back to vet and Done');
    // active vs completed (miscellaneous tasks)
    const active = await n.page.$$eval('#noga-list > .noga-item', els => els.map(e => e.querySelector('.nt-id').textContent));
    t.ok(active.join() === 'NR-1', 'active miscellaneous tasks are listed first: ' + active);
    t.ok(await n.page.locator('#noga-list details.done-block').count() === 1 && !(await n.page.locator('#noga-list details.done-block').evaluate(e => e.open)), 'finished tasks are folded into a collapsed "Completed" block');
    t.ok(/Completed in the last 24 h\s*1/.test(await n.page.textContent('#noga-list details.done-block summary')), 'the block says how many are completed');
    await n.page.click('#noga-list details.done-block summary');
    const done = n.page.locator('#noga-list details.done-block .nt-card.done');
    t.ok(await done.count() === 1 && /done by PM/.test(await done.textContent()) && (await done.locator('.nt-id').evaluate(e => getComputedStyle(e).textDecorationLine)) === 'line-through', 'a completed task is struck through with a green "done by" badge');
    t.ok(await done.locator('.noga-putback').count() === 1 && await n.page.locator('#noga-list .nt-card:not(.done) .noga-done').count() === 1, 'active tasks have Done; completed ones have Put back');
    // the vets' medication that is done also folds away under Medication labels
    t.ok(await n.page.locator('#med-labels-list details.done-block').count() === 1 && /NR-3/.test(await n.page.textContent('#med-labels-list details.done-block')), 'finished medication tasks fold away under Medication labels too');
    // every task card keeps Send back to vet
    t.ok(await n.page.locator('#med-labels-list .nt-card:not(.done)').count() === (await n.page.locator('#med-labels-list .nt-card:not(.done) .noga-back, #med-labels-list .nt-card:not(.done) .med-back-btn').count()), 'medication cards all have Send back to vet');
    t.ok(await n.page.locator('#noga-list .nt-card:not(.done) .noga-back').count() === 1 && await n.page.locator('#proc-misc-list .nt-card:not(.done) .noga-back').count() === 1, 'so do the miscellaneous and Processing task cards');
    // badges
    const blood = n.page.locator('#noga-list .nt-card', { hasText: 'NR-1' });
    t.ok(/Test/.test(await blood.locator('.nt-cat').textContent()) && /Pen 28/.test(await blood.locator('.nt-pen').textContent()) && /Cat Room 1/.test(await blood.locator('.nt-room').textContent()), 'cards show the animal ID, a pen badge and a colour-coded category badge');
    t.ok(await n.page.locator('#proc-misc-list .nt-card', { hasText: 'NR-4' }).count() === 1, 'Processing tasks (microchip) still sit in the Processing column');
    // no search / filter / summary row any more
    t.ok(await n.page.locator('#nt-search, #nt-room, #nt-summary').count() === 0, 'the search, room filter and summary chips are gone');
    // Welfare and Processing are clearly separated
    const w = await n.page.locator('#welfare-col').evaluate(e => getComputedStyle(e).backgroundColor), p = await n.page.locator('#processing-col').evaluate(e => getComputedStyle(e).backgroundColor);
    t.ok(w !== p && /^rgba\(/.test(w) && /^rgba\(/.test(p) && (await n.page.locator('.nurse-cols').evaluate(e => getComputedStyle(e, '::before').content)) === '""', 'the two nurse columns have their own tinted panels and a divider line between them');
    // floating bulk bar
    t.ok(!(await n.page.isVisible('#bulk-bar-welfare')), 'no bulk bar until something is ticked');
    await n.page.check('#noga-list .nt-card:has-text("NR-1") .row-pick');
    t.ok(await n.page.isVisible('#bulk-bar-welfare') && (await n.page.locator('#bulk-bar-welfare').evaluate(e => getComputedStyle(e).position)) === 'fixed', 'ticking a task brings up a floating action bar');
    t.ok(n.errors.length === 0, 'no page errors: ' + n.errors.join('; '));
  } finally { await n.browser.close(); }
  t.done();
})();
