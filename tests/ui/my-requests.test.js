// 2026-11-25: "My requests" at the top of each dashboard page (no second Send button: the Send a request card is already there). My requests = sent under your initials; edit, no reply.
const { open } = require('./harness');
const t = require('./check')('my-requests');
const mine = {
  tasks: [{ title: 'M-TASK', location: 'Pound 1', shift: 'sick_injured', type: 'shelter', urgency: 'urgent', done: false, problem: 'Sore paw (sent by JX)' },
          { title: 'OTHER-TASK', location: 'Pound 1', shift: 'sick_injured', type: 'shelter', urgency: 'urgent', done: false, problem: 'Limping (sent by AB)' }],
  nurse_requests: [{ kind: 'vaccination', animal_id: 'M-NR', location: 'Cat Room 1', animal_count: 1, done_count: 0, created_by: 'Shelter Staff (JX)', note: 'sent by JX' }],
  noga_requests: [{ task: 'microchip', animal_id: 'M-NOGA', location: 'Adoption 1', added_by: 'JX', done: true },
                  { task: 'microchip', animal_id: 'STAFF-ONLY', location: 'Adoption 1', added_by: 'Shelter Staff', done: false }],
  behaviour_tasks: [{ kind: 'behaviour_review', animal_id: 'M-BEH', location: 'Pound 2', flagged_by: 'JX', status: 'open', lane: 'incoming', history: [] }]
};
(async () => {
  for (const name of ['index.html', 'vets.html', 'nurses.html', 'behaviour.html']) {
    const s = await open(mine, name);
    try {
      const p = s.page;
      t.ok(await p.locator('.mr-bar button').count() === 1 && await p.locator('.mr-bar [data-mr="mine"]').isVisible(), name + ': one button, My requests, at the top');
      t.ok(await p.locator('#faq-panel summary', { hasText: 'see or change a request I sent' }).count() === 1, name + ': the FAQ explains it');
      await p.evaluate(() => ['sr-initials', 'initials-welfare', 'bh-initials'].forEach(id => { const e = document.getElementById(id); if (e) e.value = 'JX'; }));
      await p.evaluate(() => document.body.dispatchEvent(new Event('input', { bubbles: true })));
      t.ok(/\(JX\)/.test(await p.textContent('.mr-bar button')), name + ': the button shows whose list it is');
      await p.click('.mr-bar [data-mr="mine"]'); await p.waitForTimeout(400);
      const text = await p.textContent('.mr-card');
      t.ok(['M-TASK', 'M-NR', 'M-NOGA', 'M-BEH'].every(x => text.includes(x)), name + ': lists my requests from every list');
      t.ok(!text.includes('OTHER-TASK') && !text.includes('STAFF-ONLY'), name + ': and nobody else\'s (initials inside "Staff" do not count)');
      t.ok(await p.locator('.mr-item', { hasText: 'M-NOGA' }).locator('.req-edit-btn').count() === 0, name + ': a finished one cannot be edited');
      t.ok(!/reply/i.test(text), name + ': no reply');
      await p.locator('.mr-item', { hasText: 'M-BEH' }).locator('.req-edit-btn').click();
      await p.fill('#rq-f-reason', 'barking at the gate'); await p.click('#rq-save'); await p.waitForTimeout(600);
      t.ok(/barking at the gate/.test(await p.textContent('.mr-card')), name + ': an edit saves and shows straight away');
      await p.click('.mr-card [data-close]');
      t.ok(!s.errors.length, name + ': no page errors ' + s.errors.join('; '));
    } finally { await s.browser.close(); }
  }
  // two different initials on the nurses page: one person's list at a time
  const n = await open(mine, 'nurses.html');
  try {
    await n.page.evaluate(() => { document.getElementById('initials-welfare').value = 'AB'; document.getElementById('initials-processing').value = 'JX'; });
    await n.page.click('.mr-bar [data-mr="mine"]'); await n.page.waitForTimeout(400);
    let text = await n.page.textContent('.mr-card [data-body]');
    t.ok(text.includes('OTHER-TASK') && !text.includes('M-TASK'), 'nurses: shows only the first initials');
    await n.page.selectOption('.mr-card [data-who]', 'JX'); await n.page.waitForTimeout(400);
    text = await n.page.textContent('.mr-card [data-body]');
    t.ok(text.includes('M-TASK') && !text.includes('OTHER-TASK'), 'nurses: switching shows only the other initials');
  } finally { await n.browser.close(); }
  // staff page: asked for initials before sending
  for (const [answer, sendAnyway, sent, by] of [['qz', false, 1, 'QZ'], ['', false, 0, ''], ['', true, 1, '']]) {
    const s = await open({}, 'index.html', { askInitials: true });
    try {
      const p = s.page, asked = [];
      p.removeAllListeners('dialog');
      p.on('dialog', d => { asked.push(d.type()); if (d.type() === 'prompt') d.accept(answer); else if (d.type() === 'confirm' && !sendAnyway) d.dismiss(); else d.accept(); });
      await p.click('.sr-tab[data-sr="nurses"]'); await p.fill('#nr-count', '1');
      await p.click('#nr-submit'); await p.waitForTimeout(500);
      const rows = (await s.db()).nurse_requests;
      const label = 'send with "' + answer + '"' + (sendAnyway ? ' then send anyway' : '');
      t.ok(asked[0] === 'prompt' && rows.length === sent, label + ': asked first, ' + rows.length + ' sent (' + asked.join(',') + ')');
      if (by) t.ok(rows[0].created_by === 'Shelter Staff (' + by + ')' && (await p.inputValue('#sr-initials')) === by, label + ': initials recorded and kept in the box');
    } finally { await s.browser.close(); }
  }
  t.done();
})().catch(e => { console.log('FAIL ' + String(e.message).slice(0, 600)); process.exit(1); });
