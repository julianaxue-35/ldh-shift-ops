// Vet board: the optional quick note on DONE.
const { open } = require('./harness');
const t = require('./check')('vet-done-note');
(async () => {
  const mk = (title, extra) => Object.assign({ title, location: 'Pound 1', shift: 'sick_injured', type: 'shelter', urgency: 'routine', done: false, created_at: new Date().toISOString() }, extra || {});
  const v = await open({ tasks: [mk('NOTE-1'), mk('NOTE-2', { plan: 'Plan synced from the tool' }), mk('NOTE-3'), mk('NOTE-4', { needs_medication: true, type: 'medication' })] }, 'vets.html');
  try {
    const done = async (title, note) => {
      await v.page.locator('.attn-item', { hasText: title }).locator('.done-btn').click();
      await v.page.waitForSelector('.done-modal-overlay');
      if (note != null) await v.page.fill('.done-modal-overlay .done-note', note);
      if (title === 'NOTE-4') { await v.page.fill('.done-modal-overlay .done-medlabel', 'Drug A'); }
      await v.page.click('.done-confirm');
      await v.page.waitForTimeout(250);
      return (await v.db()).tasks.find(x => x.title === title);
    };
    const a = await done('NOTE-1', '  Bright and eating.  ');
    t.ok(a.done && a.note === 'Bright and eating.' && a.plan === 'Bright and eating.', 'a quick note is trimmed and saved as the note and, with no plan yet, the plan');
    const b = await done('NOTE-2', 'Recheck Friday');
    t.ok(b.note === 'Recheck Friday' && b.plan === 'Plan synced from the tool', 'a plan already synced from the tool is never overwritten');
    const c = await done('NOTE-3', null);
    t.ok(c.done && !c.note && !c.plan, 'no note typed: nothing is written, Done works as before');
    const d = await done('NOTE-4', 'Start tonight');
    t.ok(d.note === 'Start tonight', 'a medication case keeps the note too');
    t.ok(v.errors.length === 0, 'no page errors: ' + v.errors.join('; '));
  } finally { await v.browser.close(); }
  t.done();
})();
