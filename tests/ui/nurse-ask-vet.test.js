// Nurses can hand a task to the vets: one "Send a request" box at the top of the page (Vets / Behaviour tabs), and "Send back to vet" on every kind of nurse task.
const { open } = require('./harness');
const t = require('./check')('nurse-ask-vet');
const ago = ms => new Date(Date.now() - ms).toISOString();
(async () => {
  const n = await open({
    nurse_requests: [{ kind: 'vaccination', location: 'Cat Room 1', species: 'cat', animal_count: 2, animal_id: 'VAC-1', done_count: 0, due_window: 'today', arrived_at: ago(3600e3), created_at: ago(3600e3) }]
  }, 'nurses.html');
  const P = '#send-request .sc-panel[data-to="vets"] ';
  const F = f => P + '[data-f="' + f + '"]';
  try {
    await n.page.waitForSelector('#send-request .sc-tab');
    t.ok(await n.page.locator('#send-request').count() === 1 && await n.page.locator('.send-card-open').count() === 0, 'there is ONE request box, not one per nurse column');
    const y = sel => n.page.$eval(sel, e => Math.round(e.getBoundingClientRect().top));
    t.ok(await y('#send-request') < await y('#welfare-col') && await y('#send-request') < await y('#processing-col'), 'and it sits above the Welfare and Processing nurse columns');
    t.ok(await n.page.locator('#nr-list .nr-item:has-text("VAC-1") .nr-back').count() === 1, 'a vaccination request can be sent back to a vet too (not just FIV and blood)');
    await n.page.fill('#initials-welfare', 'ab'); await n.page.dispatchEvent('#initials-welfare', 'change');
    await n.page.reload(); await n.page.waitForSelector('#send-request .sc-tab');
    t.ok(JSON.stringify(await n.page.$$eval('#send-request .sc-tab', bs => bs.map(b => b.textContent))) === '["Vets","Behaviour"]', 'with a Vets and a Behaviour tab');
    t.ok((await n.page.inputValue('#send-request [data-f="initials"]')) === 'AB', 'the nurse\'s initials are filled in from the column box');
    // validation
    await n.page.click('[data-send="vets"]');
    t.ok(/animal ID/i.test(await n.page.textContent(P + '[data-msg]')), 'it asks for the animal ID');
    await n.page.fill(F('animal'), 'ASK-1');
    await n.page.selectOption(F('kind'), 'other');   // the default is "interpret results"; "Other" is the one that needs the task written
    await n.page.click('[data-send="vets"]');
    t.ok(/write the task/i.test(await n.page.textContent(P + '[data-msg]')), 'and for the task itself when the type is Other');
    await n.page.selectOption(F('room'), 'Cat Room 2'); await n.page.fill(F('pen'), '5');
    await n.page.fill(F('note'), 'please look at the left eye');
    await n.page.selectOption(F('window'), '2h');
    await n.page.click('[data-send="vets"]');
    await n.page.waitForFunction(() => window.__db.tasks.length === 1);
    const row = (await n.db()).tasks[0];
    t.ok(row.title === 'ASK-1' && row.location === 'Cat Room 2 / 5' && row.shift === 'sick_injured' && row.type === 'shelter', 'it lands on the vet board as a shelter request in the right space and pen: ' + row.location);
    t.ok(row.urgency === 'red_flag', '"within 2 hours" goes to the Emergency column');
    t.ok(/Task for vets from nurse/.test(row.problem) && /please look at the left eye/.test(row.problem) && /sent by AB/.test(row.problem), 'with what the nurse wrote and her initials: ' + row.problem);
    t.ok(!/Vet to/.test(row.problem), 'no "Vet to: other" clutter when it is a plain ask');
    t.ok(/Sent to the vets/.test(await n.page.textContent(P + '[data-msg]')), 'it confirms it was sent');
    t.ok(n.errors.length === 0, 'no page errors: ' + n.errors.join('; '));
  } finally { await n.browser.close(); }
  t.done();
})();
