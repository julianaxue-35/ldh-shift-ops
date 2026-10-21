const { open } = require('./harness');
const t = require('./check')('vets-behaviour-alert');
(async () => {
  const v = await open({}, 'vets.html');
  const shown = () => v.page.evaluate(() => getComputedStyle(document.getElementById('new-item-banner')).display !== 'none');
  const insert = (r) => v.page.evaluate((r) => window.supabase.createClient().from('tasks').insert(r), r);
  try {
    await v.page.waitForSelector('#new-item-banner', { state: 'attached' });
    t.ok(await v.page.isVisible('#sound-chip'), 'the alert sound chip is on the Vets page');
    const base = { shift: 'sick_injured', urgency: 'urgent', red_flags: [], done: false, location: 'Cat Room 1 / 3', created_at: new Date().toISOString() };
    await insert(Object.assign({}, base, { title: 'BEH-1', type: 'medication', needs_medication: true, problem: 'Behaviour team request — dispense shelter stress medication. (sent by JX)' }));
    await v.page.waitForFunction(() => getComputedStyle(document.getElementById('new-item-banner')).display !== 'none', { timeout: 3000 });
    let txt = await v.page.textContent('#new-item-banner-text');
    t.ok(/NEW REQUEST/.test(txt) && /1 new request/.test(txt) && /1 from the Behaviour team/.test(txt), 'a Behaviour request rings the Vets page and says where it came from: ' + txt);
    await insert(Object.assign({}, base, { title: 'STF-1', location: 'Pound 2 / 1', type: 'shelter', needs_medication: false, problem: 'coughing' }));
    await v.page.waitForFunction(() => /2 new requests/.test(document.getElementById('new-item-banner-text').textContent), { timeout: 3000 });
    txt = await v.page.textContent('#new-item-banner-text');
    t.ok(/1 from the Behaviour team/.test(txt), 'a staff request adds to the count, only one is from Behaviour: ' + txt);
    t.ok(v.errors.length === 0, 'no page errors: ' + v.errors.join('; '));
  } finally { await v.browser.close(); }
  t.done();
})();
