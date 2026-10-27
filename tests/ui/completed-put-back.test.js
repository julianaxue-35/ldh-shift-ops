// Behaviour page: a Completed list (24 hours, with the note) with Put back; Nurses page: Put back on a finished task.
const { open } = require('./harness');
const t = require('./check')('completed-put-back');
const ago = ms => new Date(Date.now() - ms).toISOString();
const row = (x) => Object.assign({ kind: 'behaviour_review', animal_id: 'BEH-1', location: 'Cat Room 1 / 3', lane: 'tl', due_window: 'today', reason: 'hissing', flagged_by: 'AB', status: 'open', courthold: false, history: [], created_at: ago(3 * 3600e3) }, x);
(async () => {
  const b = await open({ behaviour_tasks: [
    row({ animal_id: 'D-1', status: 'done', done_at: ago(2 * 3600e3), done_note: 'settled, plan: enrichment', done_by: 'XY' }),
    row({ animal_id: 'D-OLD', status: 'done', done_at: ago(30 * 3600e3), done_note: 'old', done_by: 'XY' }),
    row({ animal_id: 'OPEN-1' })] }, 'behaviour.html');
  try {
    await b.page.waitForSelector('#bh-completed');
    const list = await b.page.textContent('#completed-list');
    t.ok(/D-1/.test(list) && /settled, plan: enrichment/.test(list) && /done by XY/.test(list) && !/D-OLD/.test(list), 'finished in the last 24 h are listed with their note and who finished them; older ones are not');
    t.ok(await b.page.locator('.bh-card[data-animal="D-1"]').count() === 0, 'and they are not on the open lanes');
    await b.page.click('.bh-putback');
    t.ok(/initials/i.test(await b.page.textContent('#bh-error')), 'putting back needs your initials');
    await b.page.fill('#bh-initials', 'jx'); await b.page.dispatchEvent('#bh-initials', 'change');
    await b.page.click('.bh-putback');
    await b.page.waitForFunction(() => window.__db.behaviour_tasks.find(r => r.animal_id === 'D-1').status === 'open');
    const r = (await b.db()).behaviour_tasks.find(x => x.animal_id === 'D-1');
    t.ok(!r.done_note && !r.done_by && !r.done_at && r.lane === 'tl' && r.history.some(h => h.from === 'done' && h.to === 'open' && h.by === 'JX'), 'it is open again in its lane, the done note is cleared and the move is recorded');
    await b.page.waitForSelector('.bh-card[data-animal="D-1"]');
    t.ok(!/D-1/.test(await b.page.textContent('#completed-list')), 'and it leaves the Completed list');
    t.ok(b.errors.length === 0, 'no page errors: ' + b.errors.join('; '));
  } finally { await b.browser.close(); }
  const n = await open({ noga_requests: [
    { animal_id: 'N-DONE', location: 'Pound 1', task: 'blood', note: 'pre-op', added_by: 'AB', done: true, done_by: 'NN', done_at: ago(2 * 3600e3) },
    { animal_id: 'N-OPEN', location: 'Pound 2', task: 'ear_swab', added_by: 'AB', done: false }] }, 'nurses.html');
  try {
    await n.page.waitForSelector('#noga-list .noga-item');
    t.ok(await n.page.locator('#noga-list .noga-item:has-text("N-DONE") .noga-putback').count() === 1 && await n.page.locator('#noga-list .noga-item:has-text("N-OPEN") .noga-putback').count() === 0, 'a finished nurse task has Put back; an open one does not');
    await n.page.click('#noga-list details.done-block summary');   // finished tasks fold away under "Completed"
    await n.page.click('.noga-putback');
    await n.page.waitForFunction(() => window.__db.noga_requests.find(r => r.animal_id === 'N-DONE').done === false);
    const r = (await n.db()).noga_requests.find(x => x.animal_id === 'N-DONE');
    t.ok(!r.done_by && !r.done_at, 'it is open again with the finish details cleared');
    t.ok(await n.page.locator('#noga-list .noga-item:has-text("N-DONE") .noga-done').count() === 1, 'and it has its Done button back');
    t.ok(n.errors.length === 0, 'nurses: no page errors: ' + n.errors.join('; '));
  } finally { await n.browser.close(); }
  t.done();
})();
