const { open } = require('./harness');
const t = require('./check')('behaviour-alert');
const row = (x) => Object.assign({ kind: 'behaviour_review', animal_id: 'BEH-1', location: 'Cat Room 1 / 3', lane: 'incoming', due_window: 'today', reason: 'hissing', flagged_by: 'AB', status: 'open', courthold: false, history: [], created_at: new Date().toISOString() }, x);
(async () => {
  const b = await open({ behaviour_tasks: [row({})] }, 'behaviour.html');
  const shown = () => b.page.evaluate(() => getComputedStyle(document.getElementById('new-item-banner')).display !== 'none');
  const insert = (r) => b.page.evaluate((r) => window.supabase.createClient().from('behaviour_tasks').insert(r), r);
  try {
    await b.page.waitForSelector('.bh-card');
    t.ok(!(await shown()), 'a task already there when the page opens does not alert');
    t.ok(await b.page.isVisible('#sound-chip'), 'the alert sound chip is on the page');
    await insert(row({ animal_id: 'BEH-2' }));
    await b.page.waitForFunction(() => getComputedStyle(document.getElementById('new-item-banner')).display !== 'none', { timeout: 3000 });
    let txt = await b.page.textContent('#new-item-banner-text');
    t.ok(/NEW TASK/.test(txt) && /1 new behaviour task/.test(txt), 'a new task shows the banner: ' + txt);
    t.ok((await b.page.evaluate(() => getComputedStyle(document.getElementById('new-item-banner')).position)) === 'sticky', 'the banner sticks to the top');
    await insert(row({ animal_id: 'BEH-3' }));
    await b.page.waitForFunction(() => /2 new behaviour tasks/.test(document.getElementById('new-item-banner-text').textContent), { timeout: 3000 });
    t.ok(true, 'a second new task adds to the count while the banner is up');
    await b.page.click('#new-item-banner-dismiss');
    t.ok(!(await shown()), 'Dismiss hides the banner');
    await b.page.evaluate(() => window.supabase.createClient().from('behaviour_tasks').update({ lane: 'tl' }).eq('animal_id', 'BEH-2'));
    await b.page.waitForTimeout(500);
    t.ok(!(await shown()), 'moving a task already seen does not alert again');
    t.ok(b.errors.length === 0, 'no page errors: ' + b.errors.join('; '));
  } finally { await b.browser.close(); }
  t.done();
})();
