const { open } = require('./harness');
const t = require('./check')('behaviour-page');
const ago = ms => new Date(Date.now() - ms).toISOString();
const row = (x) => Object.assign({ kind: 'behaviour_review', animal_id: 'BEH-1', location: 'Cat Room 1 / 3', lane: 'incoming', due_window: 'today', reason: 'hissing at staff', flagged_by: 'AB', status: 'open', history: [], created_at: ago(600e3) }, x);
(async () => {
  const b = await open({ behaviour_tasks: [
    row({}),
    row({ animal_id: 'BEH-2', location: 'Pound 2 / 4', reason: 'guarding food' }),
    row({ animal_id: 'BEH-3', location: 'Transport', kind: 'courthold', courthold: true, reason: '' }),
    row({ animal_id: 'BEH-4', location: 'Cat Room 2 / 1', lane: 'tl', kind: 'incident_review' }),
    row({ animal_id: 'BEH-5', location: 'Pound 1 / 2', lane: 'dog', due_window: '30_60m', created_at: ago(2 * 3600e3) })
  ] }, 'behaviour.html');
  try {
    await b.page.waitForSelector('.bh-card');
    t.ok(await b.page.locator('#incoming-list .bh-card').count() === 3, 'new requests sit in Incoming');
    t.ok(await b.page.locator('#lane-tl .bh-card').count() === 1 && await b.page.locator('#lane-dog .bh-card').count() === 1 && await b.page.locator('#lane-cat .bh-card').count() === 0, 'lanes hold their own cards');
    t.ok(/overdue/i.test(await b.page.textContent('#lane-dog .bh-card')), 'a 30-60 min task two hours old shows overdue');
    t.ok(/hissing at staff/.test(await b.page.textContent('#incoming-list')), 'the reason shows on the card');
    t.ok(await b.page.locator('#incoming-list .bh-card:has-text("BEH-3") .bh-court').count() === 1, 'courthold badge');

    const opts = id => b.page.$$eval(`.bh-card[data-animal="${id}"] .bh-move option`, os => os.map(o => o.value).filter(Boolean));
    t.ok((await opts('BEH-1')).join() === 'tl,cat,trainer', 'a cat offers TL, Cat assist or the trainer: ' + await opts('BEH-1'));
    t.ok((await opts('BEH-2')).join() === 'tl,dog,trainer', 'a dog offers TL, Dog assist or the trainer');
    t.ok((await opts('BEH-3')).join() === 'tl,cat,dog,trainer', 'transport offers every lane');

    await b.page.selectOption('.bh-card[data-animal="BEH-1"] .bh-move', 'cat');
    t.ok(/initials/i.test(await b.page.textContent('#bh-error')), 'moving without initials is refused');
    t.ok((await b.db()).behaviour_tasks[0].lane === 'incoming', 'and nothing was written');
    await b.page.fill('#bh-initials', 'jx'); await b.page.dispatchEvent('#bh-initials', 'change');
    await b.page.selectOption('.bh-card[data-animal="BEH-1"] .bh-move', 'cat');
    await b.page.waitForFunction(() => window.__db.behaviour_tasks[0].lane === 'cat');
    const moved = (await b.db()).behaviour_tasks[0];
    t.ok(moved.history.length === 1 && moved.history[0].to === 'cat' && moved.history[0].by === 'JX', 'move is recorded with initials');
    t.ok(await b.page.locator('#lane-cat .bh-card[data-animal="BEH-1"]').count() === 1, 'card appears in the Cat assist lane');

    await b.page.click('#lane-cat .bh-card[data-animal="BEH-1"] .bh-done');
    await b.page.click('.done-confirm');
    t.ok(/note/i.test(await b.page.textContent('.done-error')), 'Done asks for a note');
    await b.page.fill('.done-note', 'calm with handling; keep quiet room');
    await b.page.click('.done-confirm');
    await b.page.waitForFunction(() => window.__db.behaviour_tasks[0].status === 'done');
    const done = (await b.db()).behaviour_tasks[0];
    t.ok(done.done_note === 'calm with handling; keep quiet room' && done.done_by === 'JX' && done.done_at, 'Done stores note, initials and time');
    t.ok(await b.page.locator('.bh-card[data-animal="BEH-1"]').count() === 0, 'a finished task leaves the lanes');

    await b.page.reload(); await b.page.waitForSelector('#bh-initials');
    t.ok(await b.page.inputValue('#bh-initials') === 'JX', 'initials are remembered on this device');

    await b.page.click('.bh-add[data-lane="tl"]');
    await b.page.fill('.add-animal', 'BEH-9'); await b.page.selectOption('.add-room', 'Cat Room 1'); await b.page.fill('.add-pen', '7');
    t.ok((await b.page.$$eval('.add-to option', os => os.map(o => o.value))).join() === 'tl,cat,trainer', 'give-to follows the room (cat room: TL / Cat assist / trainer)');
    await b.page.selectOption('.add-room', 'Pound 3');
    t.ok((await b.page.$$eval('.add-to option', os => os.map(o => o.value))).join() === 'tl,dog,trainer', 'pound: TL / Dog assist / trainer');
    await b.page.selectOption('.add-to', 'dog'); await b.page.selectOption('.add-kind', 'behaviour_review');
    await b.page.click('.add-confirm');
    t.ok(/reason/i.test(await b.page.textContent('.add-error')), 'review kinds need a reason');
    await b.page.fill('.add-reason', 'check kennel stress'); await b.page.click('.add-confirm');
    await b.page.waitForFunction(() => window.__db.behaviour_tasks.some(r => r.animal_id === 'BEH-9'));
    const added = (await b.db()).behaviour_tasks.find(r => r.animal_id === 'BEH-9');
    t.ok(added.lane === 'dog' && added.location === 'Pound 3 / 7' && added.flagged_by === 'JX', 'team task lands in the chosen lane with initials');

    await b.page.check('#f-court');
    t.ok(await b.page.locator('.bh-card').count() === 1, 'courthold filter shows only courthold tasks');
    await b.page.uncheck('#f-court');
    await b.page.selectOption('#f-kind', 'incident_review');
    t.ok(await b.page.locator('.bh-card').count() === 1, 'kind filter');
    t.ok(b.errors.length === 0, 'no page errors: ' + b.errors.join('; '));
  } finally { await b.browser.close(); }
  t.done();
})();
