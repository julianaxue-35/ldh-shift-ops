const { open } = require('./harness');
const t = require('./check')('behaviour-board');
const ago = ms => new Date(Date.now() - ms).toISOString();
(async () => {
  const b = await open({
    tasks: [{ title: 'BEH-1', location: 'Cat Room 1 / 3', shift: 'sick_injured', type: 'shelter', urgency: 'urgent', problem: 'sneezing', done: false }],
    behaviour_tasks: [
      { animal_id: 'BEH-1', kind: 'behaviour_review', location: 'Cat Room 1 / 3', due_window: 'today', status: 'done', done_at: ago(3600e3), done_by: 'JX', done_note: 'calm with handling', history: [] },
      { animal_id: 'BEH-1', kind: 'courthold', location: 'Cat Room 1 / 3', due_window: 'today', status: 'open', lane: 'cat', history: [] },
      { animal_id: 'NO-CASE', kind: 'other', location: 'Pound 1', due_window: 'today', status: 'open', lane: 'dog', history: [] }
    ]
  }, 'shelter-board.html');
  try {
    await b.page.waitForSelector('.case', { timeout: 5000 });
    const txt = await b.page.textContent('.case[data-case]');
    t.ok(/Behaviour done/i.test(txt) && /calm with handling/.test(txt) && /JX/.test(txt), "the Done note and initials show on the animal's card");
    t.ok(/waiting for the behaviour team/i.test(txt) && /Courthold reassessment/.test(txt), 'an open behaviour task shows as pending');
    t.ok(await b.page.locator('.case').count() === 1, 'animals with no case on the board do not add cards or break it');
    t.ok(b.errors.length === 0, 'no page errors: ' + b.errors.join('; '));
  } finally { await b.browser.close(); }
  t.done();
})();
