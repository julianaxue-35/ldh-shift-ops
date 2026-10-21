// Nurses can hand a task to the vets: a general "Task for vets" button in each column, and "Send back to vet" on every kind of nurse task.
const { open } = require('./harness');
const t = require('./check')('nurse-ask-vet');
const ago = ms => new Date(Date.now() - ms).toISOString();
(async () => {
  const n = await open({
    nurse_requests: [{ kind: 'vaccination', location: 'Cat Room 1', species: 'cat', animal_count: 2, animal_id: 'VAC-1', done_count: 0, due_window: 'today', arrived_at: ago(3600e3), created_at: ago(3600e3) }]
  }, 'nurses.html');
  try {
    await n.page.waitForSelector('.ask-vet-btn');
    t.ok(await n.page.locator('.ask-vet-btn').count() === 2, 'each nurse column has an "Task for vets" button');
    t.ok(await n.page.locator('#nr-list .nr-item:has-text("VAC-1") .nr-back').count() === 1, 'a vaccination request can now be sent back to a vet too (not just FIV and blood)');
    await n.page.fill('#initials-welfare', 'ab'); await n.page.dispatchEvent('#initials-welfare', 'change');
    await n.page.click('#welfare-col .ask-vet-btn');
    t.ok(await n.page.locator('.ask-modal-overlay').count() === 1, 'the button opens the request window');
    // validation
    await n.page.click('.ask-confirm');
    t.ok(/animal ID/i.test(await n.page.textContent('.ask-error')), 'it asks for the animal ID');
    await n.page.fill('.ask-animal', 'ASK-1');
    await n.page.click('.ask-confirm');
    t.ok(/task for the vets/i.test(await n.page.textContent('.ask-error')), 'and for the task itself');
    await n.page.selectOption('.ask-room', 'Cat Room 2'); await n.page.fill('.ask-pen', '5');
    await n.page.fill('.ask-text', 'please look at the left eye');
    await n.page.selectOption('.ask-window', '2h');
    await n.page.click('.ask-confirm');
    await n.page.waitForFunction(() => window.__db.tasks.length === 1);
    const row = (await n.db()).tasks[0];
    t.ok(row.title === 'ASK-1' && row.location === 'Cat Room 2 / 5' && row.shift === 'sick_injured' && row.type === 'shelter', 'it lands on the vet board as a shelter request in the right space and pen: ' + row.location);
    t.ok(row.urgency === 'red_flag', '"within 2 hours" goes to the Emergency column');
    t.ok(/Task for vets from nurse/.test(row.problem) && /please look at the left eye/.test(row.problem) && /sent by AB/.test(row.problem), 'with what the nurse wrote and her initials: ' + row.problem);
    t.ok(!/Vet to/.test(row.problem), 'no "Vet to: other" clutter when it is a plain ask');
    t.ok(await n.page.locator('.ask-modal-overlay').count() === 0, 'the window closes');
    t.ok(n.errors.length === 0, 'no page errors: ' + n.errors.join('; '));
  } finally { await n.browser.close(); }
  t.done();
})();
