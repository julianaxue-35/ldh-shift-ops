// 2026-11-18: an admin / paperwork request is answered on the dashboard: pick up (no shift tool opens), DONE with notes to share + initials,
// and the reply shows on the staff page.
const { open } = require('./harness');
const t = require('./check')('admin-request-reply');
const ago = ms => new Date(Date.now() - ms).toISOString();
(async () => {
  const v = await open({ tasks: [{ id: 'adm1', title: '1180900', location: 'Office', shift: 'sick_injured', type: 'shelter', urgency: 'routine', red_flags: [], done: false, created_at: ago(600e3),
    problem: 'Admin / paperwork review — please review the vet history for the adopter' }] }, 'vets.html');
  try {
    await v.page.evaluate(() => { window.__opened = []; window.open = (u) => { window.__opened.push(u); return null; }; });
    await v.page.waitForSelector('.attn-item .pick-up-btn');
    await v.page.fill('#vet-initials', 'JX').catch(() => {});
    await v.page.click('.attn-item:has-text("1180900") .pick-up-btn');
    await v.page.waitForTimeout(400);
    t.ok((await v.db()).tasks[0].claimed_at && (await v.page.evaluate(() => window.__opened.length)) === 0, 'picked up, and no shift tool was opened');
    await v.page.click('.attn-item:has-text("1180900") .done-btn');
    await v.page.waitForSelector('.done-modal-overlay');
    t.ok((await v.page.textContent('.done-modal-overlay')).includes('Notes to share with the office'), 'the DONE box asks for notes to share with the office');
    await v.page.fill('.done-admin-initials', ''); await v.page.fill('.done-note', 'History reviewed: up to date, desexed.'); await v.page.click('.done-confirm');
    t.ok(await v.page.isVisible('.done-admin-error') && (await v.db()).tasks[0].done === false, 'it will not finish without notes and initials');
    await v.page.fill('.done-admin-initials', 'JX'); await v.page.click('.done-confirm'); await v.page.waitForTimeout(400);
    const row = (await v.db()).tasks[0];
    t.ok(row.done === true && row.note === 'History reviewed: up to date, desexed. — JX', 'saved done with the reply and the vet initials: ' + row.note);
    t.ok(v.errors.length === 0, 'no page errors: ' + v.errors.join('; '));
  } finally { await v.browser.close(); }
  const s = await open({ tasks: [{ id: 'adm1', title: '1180900', location: 'Office', shift: 'sick_injured', type: 'shelter', urgency: 'routine', red_flags: [], done: true, completed_at: ago(60e3), completed_by_role: 'vet_nurse', created_at: ago(900e3),
    problem: 'Admin / paperwork review', note: 'History reviewed: up to date. — JX', plan: 'History reviewed: up to date. — JX' }] }, 'index.html');
  try {
    await s.page.waitForSelector('#cases-completed-tbody tr.case-row');
    const txt = await s.page.textContent('#cases-completed-tbody');
    t.ok(txt.includes('Vet reply') && txt.includes('History reviewed: up to date. — JX'), 'the staff page shows the vet reply in the completed list');
    t.ok(await s.page.locator('#cases-completed-tbody tr.case-drawer:not([hidden])').count() === 1, 'and it is open without clicking');
    t.ok(s.errors.length === 0, 'no page errors: ' + s.errors.join('; '));
  } finally { await s.browser.close(); }
  t.done();
})();
