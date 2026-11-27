// 2026-11-27: notes typed beside an ID never count as another animal; the Nurses page tracks vaccinations given.
const { open } = require('./harness');
const t = require('./check')('counts-and-vacc');
(async () => {
  const iso = new Date().toISOString();
  const row = (title, done) => ({ title, location: 'Location TBC', shift: 'surgery', type: 'check_recheck', done, created_at: iso, completed_at: done ? iso : null });
  const i = await open({ tasks: [row('1175342', false), row('1175342 vc2', true), row('CZU635', false), row('CZU635 has IP', true), row('1177460 vc10', true), row('1175343', false)] }, 'index.html');
  try {
    const card = await i.page.locator('.shift-card', { hasText: 'Surgery' }).locator('.totals').textContent();
    t.ok(/3\s*\/\s*4/.test(card), 'four animals, three done (not seven): ' + card.trim());
  } finally { await i.browser.close(); }
  const n = await open({}, 'nurses.html');
  try {
    const p = n.page;
    await p.evaluate(() => { document.getElementById('initials-processing').value = 'NN'; });
    for (const id of ['1170001', '1170002']) { await p.fill('#vacc-add-id', id); await p.fill('#vacc-add-loc', 'CR1'); await p.click('#vacc-add'); await p.waitForTimeout(150); }
    await p.click('#vacc-select-all'); await p.click('#vacc-done'); await p.waitForTimeout(700);
    t.ok((await n.db()).nurse_vacc_log.map(r => r.animal_id).sort().join() === '1170001,1170002', 'each vaccinated animal is logged');
    const stats = await p.textContent('[data-role="vaccinations"]');
    t.ok(/Vaccinations given/.test(stats) && /2\s*today/.test(stats), 'the Nurses page shows how many were given today');
    t.ok(!n.errors.length, 'no page errors ' + n.errors.join('; '));
  } finally { await n.browser.close(); }
  t.done();
})().catch(e => { console.log('FAIL ' + String(e.message).slice(0, 400)); process.exit(1); });
