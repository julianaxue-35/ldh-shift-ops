const { open } = require('./harness');
const t = require('./check')('behaviour-attached-note');
const ago = ms => new Date(Date.now() - ms).toISOString();
const row = (x) => Object.assign({ kind: 'behaviour_review', animal_id: 'BEH-1', location: 'Cat Room 1 / 3', lane: 'incoming', due_window: 'today', reason: 'hissing at staff', flagged_by: 'AB', status: 'open', history: [], created_at: ago(600e3) }, x);
(async () => {
  const NOTE = 'WHOLE MEDICAL NOTE\nExam: calm. "quoted" \u{1F600}';
  const b = await open({ behaviour_tasks: [row({ attached_note: NOTE }), row({ animal_id: 'BEH-2', location: 'Pound 2 / 4' }), row({ animal_id: 'BEH-3', location: 'Unknown', species: 'cat' })] }, 'behaviour.html');
  try {
    await b.page.waitForSelector('.bh-card');
    t.ok(await b.page.locator('.bh-card[data-animal="BEH-1"] .bh-note').count() === 1, 'a card sent from a tool has a Medical note button');
    t.ok(await b.page.locator('.bh-card[data-animal="BEH-2"] .bh-note').count() === 0, 'a card with no attached note has none');
    await b.page.click('.bh-card[data-animal="BEH-1"] .bh-note');
    await b.page.waitForSelector('.note-overlay');
    t.ok((await b.page.textContent('.note-overlay')).includes('WHOLE MEDICAL NOTE') && (await b.page.textContent('.note-overlay')).includes('\u{1F600}'), 'the note opens read-only with the whole text');
    t.ok(await b.page.locator('.note-overlay textarea, .note-overlay input').count() === 0, 'it cannot be edited');
    await b.page.click('.note-close');
    t.ok(await b.page.locator('.note-overlay').count() === 0, 'it closes');

    const opts = await b.page.$$eval('.bh-card[data-animal="BEH-3"] .bh-move option', os => os.map(o => o.value).filter(Boolean));
    t.ok(opts.join() === 'tl,cat', 'a cat with an unrecognised location is only offered TL or Cat assist: ' + opts);
    await b.page.fill('#bh-initials', 'jx'); await b.page.dispatchEvent('#bh-initials', 'change');
    await b.page.click('.bh-card[data-animal="BEH-1"] .bh-done');
    await b.page.fill('.done-note', 'calm with handling');
    await b.page.click('.done-confirm');
    await b.page.waitForFunction(() => window.__db.behaviour_tasks[0].status === 'done');
    const r = (await b.db()).behaviour_tasks[0];
    t.ok(r.attached_note === null, 'Done deletes the attached note: ' + JSON.stringify(r.attached_note));
    t.ok(r.done_note === 'calm with handling' && r.done_by === 'JX', 'the Done note and initials stay');
    t.ok(b.errors.length === 0, 'no page errors: ' + b.errors.join('|'));
  } finally { await b.browser.close(); }
  t.done();
})();
