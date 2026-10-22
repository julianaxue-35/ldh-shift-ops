// Behaviour page: a Behaviour trainer lane (cats and dogs), and its own passcode to open the page.
const { open } = require('./harness');
const t = require('./check')('behaviour-trainer');
const row = (x) => Object.assign({ kind: 'behaviour_review', animal_id: 'BEH-1', location: 'Cat Room 1 / 3', lane: 'incoming', due_window: 'today', reason: 'hissing', flagged_by: 'AB', status: 'open', courthold: false, history: [], created_at: new Date().toISOString() }, x);
(async () => {
  // the lane
  const b = await open({ behaviour_tasks: [row({}), row({ animal_id: 'BEH-2', location: 'Pound 2 / 4' }), row({ animal_id: 'BEH-3', lane: 'trainer' })] }, 'behaviour.html');
  try {
    await b.page.waitForSelector('.bh-card');
    t.ok(await b.page.locator('.bh-lane[data-lane="trainer"] h3').textContent().then(x => /Behaviour trainer/.test(x)), 'there is a Behaviour trainer lane');
    t.ok(await b.page.locator('#lane-trainer .bh-card[data-animal="BEH-3"]').count() === 1, 'a task in the trainer lane shows there');
    const opts = id => b.page.$$eval('.bh-card[data-animal="' + id + '"] .bh-move option', os => os.map(o => o.textContent));
    t.ok((await opts('BEH-1')).includes('Behaviour trainer') && (await opts('BEH-2')).includes('Behaviour trainer'), 'a cat task and a dog task can both go to the trainer');
    t.ok(!(await opts('BEH-1')).includes('Dog assist') && !(await opts('BEH-2')).includes('Cat assist'), 'cats and dogs still never cross between the assists');
    await b.page.fill('#bh-initials', 'jx'); await b.page.dispatchEvent('#bh-initials', 'change');
    await b.page.selectOption('.bh-card[data-animal="BEH-1"] .bh-move', 'trainer');
    await b.page.waitForFunction(() => window.__db.behaviour_tasks[0].lane === 'trainer');
    t.ok(await b.page.locator('#lane-trainer .bh-card[data-animal="BEH-1"]').count() === 1, 'moving a task to the trainer puts it in the trainer lane');
    // add a task to the trainer from its lane
    await b.page.click('.bh-add[data-lane="trainer"]');
    t.ok((await b.page.$eval('.add-overlay .add-to', e => e.value)) === 'trainer', 'the add-task window starts on the trainer');
    await b.page.fill('.add-animal', 'BEH-9'); await b.page.selectOption('.add-kind', 'other'); await b.page.fill('.add-reason', 'training plan');
    await b.page.click('.add-confirm');
    await b.page.waitForFunction(() => window.__db.behaviour_tasks.some(r => r.animal_id === 'BEH-9' && r.lane === 'trainer'));
    t.ok(true, 'a task added from the trainer lane lands in it');
    t.ok(b.errors.length === 0, 'no page errors: ' + b.errors.join('; '));
  } finally { await b.browser.close(); }
  // the passcode
  const g = await open({}, 'behaviour.html', { skipRoleGate: true });
  try {
    await g.page.waitForSelector('#oc-role-gate');
    t.ok((await g.page.getAttribute('#oc-role-gate', 'data-role')) === 'behaviour', 'the Behaviour page asks for the behaviour passcode');
    t.ok(await g.page.isHidden('#app-root'), 'and shows nothing until it is entered');
    await g.page.fill('#oc-role-gate .oc-gate-input', 'wrong'); await g.page.click('#oc-role-gate .oc-gate-submit');
    await g.page.waitForTimeout(300);
    t.ok(await g.page.locator('#oc-role-gate').count() === 1 && await g.page.isHidden('#app-root'), 'a wrong passcode keeps it locked');
    await g.page.fill('#oc-role-gate .oc-gate-input', 'behaviour-test'); await g.page.click('#oc-role-gate .oc-gate-submit');
    await g.page.waitForSelector('#oc-role-gate', { state: 'detached' });
    t.ok(await g.page.isVisible('#app-root'), 'the right passcode opens the page');
    t.ok(g.errors.length === 0, 'no page errors: ' + g.errors.join('; '));
  } finally { await g.browser.close(); }
  t.done();
})();
