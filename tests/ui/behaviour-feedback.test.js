// What the Behaviour team decides is fed back to the page that asked: vets' tasks to the Vets page, nurses' tasks to the Nurses page.
const { open } = require('./harness');
const t = require('./check')('behaviour-feedback');
const ago = ms => new Date(Date.now() - ms).toISOString();
const row = (x) => Object.assign({ kind: 'behaviour_review', animal_id: 'X', location: 'Cat Room 1 / 3', lane: 'incoming', due_window: 'today', reason: 'hissing', flagged_by: 'AB', status: 'open', courthold: false, history: [], created_at: ago(3 * 3600e3) }, x);
const seed = () => ({ behaviour_tasks: [
  row({ id: 'v-done', animal_id: 'V-DONE', requested_by_role: 'vets', status: 'done', done_at: ago(2 * 3600e3), done_note: 'Plan: enrichment, handle with towel', done_by: 'XY', kind: 'courthold' }),
  row({ id: 'v-open', animal_id: 'V-OPEN', requested_by_role: 'vets', lane: 'tl' }),
  row({ id: 'v-old', animal_id: 'V-OLD', requested_by_role: 'vets', status: 'done', done_at: ago(30 * 3600e3), done_note: 'old plan', done_by: 'XY' }),
  row({ id: 'n-done', animal_id: 'N-DONE', requested_by_role: 'nurses', status: 'done', done_at: ago(1 * 3600e3), done_note: 'Nurse plan: quiet room', done_by: 'ZZ' }),
  row({ id: 's-done', animal_id: 'S-DONE', requested_by_role: 'staff', status: 'done', done_at: ago(1 * 3600e3), done_note: 'staff plan', done_by: 'ZZ' }),
  row({ id: 'legacy', animal_id: 'LEGACY', status: 'done', done_at: ago(1 * 3600e3), done_note: 'no role', done_by: 'ZZ' })] });
async function finish(page, id) {
  await page.evaluate((id) => window.supabase.createClient().from('behaviour_tasks').update({ status: 'done', done_at: new Date().toISOString(), done_note: 'Just decided: foster with experience', done_by: 'QQ' }).eq('id', id), id);
}
(async () => {
  for (const [pageName, role, mine, others] of [['vets.html', 'vets', 'V-DONE', ['N-DONE', 'S-DONE', 'LEGACY', 'V-OLD']], ['nurses.html', 'nurses', 'N-DONE', ['V-DONE', 'S-DONE', 'LEGACY']]]) {
    const L = pageName.replace('.html', '') + ': ';
    const s = seed();
    if (role === 'nurses') s.behaviour_tasks.push(row({ id: 'n-open', animal_id: 'N-OPEN', requested_by_role: 'nurses', lane: 'cat' }));
    const p = await open(s, pageName);
    try {
      await p.page.waitForSelector('#behaviour-plans .bf-row', { timeout: 5000 });
      const txt = await p.page.textContent('#behaviour-plans');
      t.ok(txt.includes(mine) && /Behaviour team plans/.test(txt), L + 'shows the plan for what this team asked');
      t.ok(role === 'vets' ? /Plan: enrichment, handle with towel/.test(txt) && /done by XY/.test(txt) : /Nurse plan: quiet room/.test(txt) && /done by ZZ/.test(txt), L + 'with the Behaviour team\'s note and who decided');
      t.ok(others.every(x => !txt.includes(x)), L + 'and not the other teams\' tasks, older than 24 h, or tasks with no requester: ' + others.filter(x => txt.includes(x)));
      t.ok(role === 'vets' ? /V-OPEN/.test(txt) && /with the behaviour tl/i.test(txt) : /N-OPEN/.test(txt) && /with the cat assist/i.test(txt), L + 'an open task says where it is up to');
      t.ok(!(await p.page.evaluate(() => getComputedStyle(document.getElementById('new-item-banner')).display !== 'none')), L + 'plans already there when the page opens do not ring');
      await finish(p.page, role === 'vets' ? 'v-open' : 'n-open');
      await p.page.waitForFunction(() => getComputedStyle(document.getElementById('new-item-banner')).display !== 'none', { timeout: 4000 });
      t.ok(/BEHAVIOUR PLAN/.test(await p.page.textContent('#new-item-banner-text')), L + 'when Behaviour ticks one Done the page rings: ' + await p.page.textContent('#new-item-banner-text'));
      await p.page.waitForFunction(() => /Just decided: foster with experience/.test(document.getElementById('behaviour-plans').textContent));
      t.ok(await p.page.locator('#behaviour-plans .bf-open').count() === 0, L + 'and it moves from waiting to the plan list');
      // the other team's task finishing does not ring this page
      await p.page.click('#new-item-banner-dismiss');
      await finish(p.page, 's-done');
      await p.page.waitForTimeout(600);
      t.ok(!(await p.page.evaluate(() => getComputedStyle(document.getElementById('new-item-banner')).display !== 'none')), L + 'another team\'s task finishing does not ring');
      t.ok(p.errors.length === 0, L + 'no page errors: ' + p.errors.join('; '));
    } finally { await p.browser.close(); }
  }
  // the senders say who asked
  const v = await open({}, 'vets.html');
  try {
    await v.page.waitForSelector('#send-request .sc-tab[data-sc="behaviour"]'); await v.page.click('#send-request .sc-tab[data-sc="behaviour"]');
    const P = '#send-request .sc-panel[data-to="behaviour"] ';
    await v.page.fill('#send-request [data-f="initials"]', 'jx'); await v.page.fill(P + '[data-f="animal"]', 'ROLE-1'); await v.page.selectOption(P + '[data-f="kind"]', 'courthold');
    await v.page.click(P + '[data-send="behaviour"]');
    await v.page.waitForFunction(() => window.__db.behaviour_tasks.length === 1);
    t.ok((await v.db()).behaviour_tasks[0].requested_by_role === 'vets', 'a task from the Vets page is stamped vets');
  } finally { await v.browser.close(); }
  const n = await open({}, 'nurses.html');
  try {
    await n.page.waitForSelector('#send-request .sc-tab[data-sc="behaviour"]'); await n.page.click('#send-request .sc-tab[data-sc="behaviour"]');
    const P = '#send-request .sc-panel[data-to="behaviour"] ';
    await n.page.fill('#send-request [data-f="initials"]', 'ab'); await n.page.fill(P + '[data-f="animal"]', 'ROLE-2'); await n.page.selectOption(P + '[data-f="kind"]', 'courthold');
    await n.page.click(P + '[data-send="behaviour"]');
    await n.page.waitForFunction(() => window.__db.behaviour_tasks.length === 1);
    t.ok((await n.db()).behaviour_tasks[0].requested_by_role === 'nurses', 'a task from the Nurses page is stamped nurses');
  } finally { await n.browser.close(); }
  const s = await open({}, 'index.html');
  try {
    await s.page.waitForSelector('.sr-tab[data-sr="behaviour"]'); await s.page.click('.sr-tab[data-sr="behaviour"]');
    await s.page.fill('#sr-initials', 'ab'); await s.page.dispatchEvent('#sr-initials', 'change');
    await s.page.fill('#bk-animal', 'ROLE-3'); await s.page.selectOption('#bk-kind', 'courthold'); await s.page.click('#bk-submit');
    await s.page.waitForFunction(() => window.__db.behaviour_tasks.length === 1);
    t.ok((await s.db()).behaviour_tasks[0].requested_by_role === 'staff', 'a task from the shelter staff page is stamped staff');
  } finally { await s.browser.close(); }
  const b = await open({ behaviour_tasks: [] }, 'behaviour.html');
  try {
    await b.page.waitForSelector('.bh-add[data-lane="tl"]'); await b.page.fill('#bh-initials', 'jx'); await b.page.dispatchEvent('#bh-initials', 'change');
    await b.page.click('.bh-add[data-lane="tl"]'); await b.page.fill('.add-animal', 'ROLE-4'); await b.page.selectOption('.add-kind', 'courthold'); await b.page.click('.add-confirm');
    await b.page.waitForFunction(() => window.__db.behaviour_tasks.length === 1);
    t.ok((await b.db()).behaviour_tasks[0].requested_by_role === 'behaviour', 'a task the Behaviour team adds itself is stamped behaviour');
  } finally { await b.browser.close(); }
  t.done();
})();
