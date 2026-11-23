// 2026-11-23: a case picked up by one vet cannot be marked done by another vet (same rule as Put back).
const { open } = require('./harness');
const t = require('./check')('done-only-by-claimer');
const ago = ms => new Date(Date.now() - ms).toISOString();
(async () => {
  const v = await open({ tasks: [{ id: 'c1', title: '1177720', location: 'Cat Room 1', shift: 'sick_injured', type: 'shelter', urgency: 'routine', red_flags: [], done: false, created_at: ago(600e3),
    claimed_at: ago(300e3), claimed_by: 'JX', problem: 'Lethargic' }] }, 'vets.html');
  try {
    const dialogs = []; v.page.on('dialog', d => dialogs.push(d.message()));
    await v.page.waitForSelector('.done-btn');
    await v.page.fill('#vet-initials', 'AB');
    await v.page.click('.done-btn'); await v.page.waitForTimeout(300);
    t.ok(/Only JX can mark it done/.test(dialogs.join(' ')) && !(await v.page.locator('.done-modal-overlay').count()), 'another vet is told only JX can finish it, and no Done box opens: ' + dialogs.join(' '));
    await v.page.fill('#vet-initials', 'JX');
    await v.page.click('.done-btn');
    await v.page.waitForSelector('.done-modal-overlay');
    t.ok(true, 'the vet who picked it up can open the Done box');
    t.ok(v.errors.length === 0, 'no page errors: ' + v.errors.join('; '));
  } finally { await v.browser.close(); }
  t.done();
})();
