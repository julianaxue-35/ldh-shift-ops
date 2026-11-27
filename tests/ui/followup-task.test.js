// 2026-11-27: a further request for an animal whose case a vet has picked up is a NEW task; if nobody has picked it up it is
// added to the same case (no new alert).
const { open } = require('./harness');
const t = require('./check')('followup-task');
const base = extra => Object.assign({ id: 'c1', title: '9990060', location: 'Cat Room 1 / 3', shift: 'sick_injured', type: 'shelter', urgency: 'routine', done: false, problem: 'Vomiting', followup: 0, created_at: new Date().toISOString() }, extra);
async function flag(p, problem) {
  await p.fill('#req-title', '9990060'); await p.selectOption('#req-location', 'Cat Room 1'); await p.fill('#req-pen', '3'); await p.fill('#req-problem', problem);
  await p.click('#req-submit'); await p.waitForTimeout(400);
}
(async () => {
  for (const [label, claimed] of [['picked up', { claimed_at: new Date().toISOString(), claimed_by: 'AB' }], ['not picked up', {}]]) {
    const o = await open({}, 'index.html'); const p = o.page;
    try {
      await p.evaluate(row => { window.__uniqueTasks = true; window.__db.tasks.push(row); }, base(claimed));
      await flag(p, 'Now has diarrhoea');
      if (!claimed.claimed_at) { await p.click('#dup-ask [data-dup="same"]'); await p.waitForTimeout(400); }
      const rows = (await o.db()).tasks.filter(r => r.title === '9990060');
      if (claimed.claimed_at) {
        t.ok(rows.length === 2 && rows[1].followup === 1 && !rows[1].claimed_at && !rows[1].done && /already picked up by AB .* Now has diarrhoea/.test(rows[1].problem), label + ': a new task for the vets: ' + (rows[1] && rows[1].problem));
        t.ok(rows[0].problem === 'Vomiting' && rows[0].claimed_by === 'AB' && !(rows[0].extra_reasons || []).length, label + ': the picked-up case is left as it was');
        await flag(p, 'And off food'); await p.click('#dup-ask [data-dup="same"]'); await p.waitForTimeout(400);
        const after = (await o.db()).tasks.filter(r => r.title === '9990060');
        t.ok(after.length === 2 && after[1].extra_reasons.length === 1, 'a third request joins the new task while nobody has picked that one up');
        await p.evaluate(() => { const r = window.__db.tasks.find(x => x.followup === 1); r.claimed_at = new Date().toISOString(); });
        await flag(p, '3 x mc'); await p.click('#dup-ask [data-dup="open"]'); await p.click('#dup-ask [data-dup="send"]'); await p.waitForTimeout(400);
        const d = await o.db();
        t.ok(d.nurse_requests.length === 1 && d.nurse_requests[0].animal_count === 3 && d.tasks.filter(r => r.title === '9990060').length === 2, 'microchips can still go to the nurses instead');
      } else {
        t.ok(rows.length === 1 && rows[0].extra_reasons.length === 1, label + ': added to the same case, no new task');
      }
      t.ok(!o.errors.length, label + ': no page errors ' + o.errors.join('; '));
    } finally { await o.browser.close(); }
  }
  // the Nurses / Behaviour pages follow the same rule
  const n = await open({}, 'nurses.html');
  try {
    const out = await n.page.evaluate(async row => { window.__uniqueTasks = true; window.__db.tasks.push(row);
      await OpsCore.sendTaskToVets(window.supabase.createClient(), { title: '9990060', location: 'Cat Room 1 / 3', shift: 'sick_injured', type: 'shelter', urgency: 'urgent', problem: 'Result back', done: false });
      return window.__db.tasks.filter(r => r.title === '9990060').map(r => [r.followup || 0, r.problem]); }, base({ claimed_at: new Date().toISOString() }));
    t.ok(out.length === 2 && out[1][0] === 1, 'a nurse sending to a picked-up case makes a new task too: ' + JSON.stringify(out));
  } finally { await n.browser.close(); }
  t.done();
})().catch(e => { console.log('FAIL ' + String(e.message).slice(0, 400)); process.exit(1); });
