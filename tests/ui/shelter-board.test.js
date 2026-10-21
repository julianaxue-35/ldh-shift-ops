const { open } = require('./harness');
const { LOCATION_ROWS } = require('./fixtures');
const t = require('./check')('shelter-board');
const ago = ms => new Date(Date.now() - ms).toISOString();
const H = 3600 * 1000;
(async () => {
  const req = (title, location, extra) => Object.assign({ title, location, shift: 'sick_injured', type: 'shelter', urgency: 'routine', done: false, created_at: ago(1 * H), problem: 'Sneezing' }, extra || {});
  const seed = { tasks: [
    req('9990001', 'Cat Room 1 / 12', { problem: 'Sneezing, runny eyes' }),
    req('9990002', 'CR1-30', { claimed_at: ago(0.5 * H), treatment: 'Mirtazapine ear gel once daily', plan: 'Offer wet food little and often', problem: 'Not eating' }),
    req('9990003', 'Adoption 2 / 3', { needs_medication: true, vet_done_at: ago(0.2 * H), claimed_at: ago(0.5 * H), problem: 'Eye discharge' }),
    req('9990004', 'FIR Room / 21', { urgency: 'red_flag', red_flags: ['laboured_breathing'], problem: 'Struggling to breathe' }),
    req('CZT101', 'Pound 1 / 5', { claimed_at: ago(0.5 * H), treatment: 'Antibiotic tablet with food', plan: 'Cough kennel, walk last', problem: 'Cough' }),
    req('9990005', 'RR-1', { problem: 'Soft droppings' }),
    req('9990006', 'Rabbit Room / 4', { problem: 'Quiet' }),
    req('9990007', 'Pathway', { type: 'foster', location_detail: 'Carer Smith', problem: 'Kitten lethargic' }),
    req('9990008', 'Cat Room 2 / 7', { done: true, completed_at: ago(2 * H), treatment: 'No treatment needed', plan: 'Back to normal' }),
    req('9990009', 'Cat Room 2 / 9', { done: true, completed_at: ago(40 * H) }),                 // finished > 24 h ago: not on the board
    req('9990010', 'Cat Room 3 / 2', { type: 'check_recheck' }),                                  // offline-tool list entry, never flagged: not on the board
    req('9990011', 'Mystery room 9', { problem: 'No idea where' })
  ], flag_history: [
    { title: '9990002', flagged_at: ago(10 * 24 * H), reason: 'Vomiting', location: 'Cat Room 1 / 30' },
    { title: '9990002', flagged_at: ago(40 * 24 * H), reason: '', condition: 'cat_flu', location: 'Cat Room 2 / 3' },
    { title: '9990002', flagged_at: ago(120 * 24 * H), reason: 'ancient', location: 'Cat Room 1 / 1' },       // > 3 months: hidden
    { title: '9990002', flagged_at: ago(1 * H), reason: 'Not eating', location: 'Cat Room 1 / 30' },          // this flag's own log line: not "before"
    { title: '9990001', flagged_at: ago(1 * H), reason: 'Sneezing', location: 'Cat Room 1 / 12' },
    { title: 'SOMEONE-ELSE', flagged_at: ago(5 * 24 * H), reason: 'Gabapentin leak check', location: 'Pound 1 / 5' }
  ], locations: LOCATION_ROWS.concat([{ name: 'Rabbit Room', grp: 'Rabbits', cages: 10, sort: 13 }]) };
  const b = await open(seed, 'shelter-board.html');
  try {
    const roomOrder = await b.page.$$eval('#board section.room-card', els => els.map(e => e.dataset.room));
    t.ok(roomOrder.join(',') === 'CR1,CR2,CA1,CA2,FIR,CR3,ISO,TRANSPORT,P1,P2,P3,P4,RABBIT,PATHWAY,VETCLINIC,OTHER',
      'every room shows, in walking order CR1, CR2, CA1, CA2, FIR, CR3 … Transport, P1-P4, Rabbit, Pathway (got ' + roomOrder.join(',') + ')');
    const room = code => b.page.locator(`#board section[data-room="${code}"]`);
    const txt = async code => (await room(code).textContent()).replace(/\s+/g, ' ');
    t.ok((await txt('CR1')).includes('Pen 12') && (await txt('CR1')).includes('Pen 30'), 'CR1 holds Cat Room 1 / 12 and the "CR1-30" spelling, as pens 12 and 30');
    t.ok((await txt('CR1')).includes('Mirtazapine ear gel once daily') && (await txt('CR1')).includes('Offer wet food little and often'), 'the vet\'s treatment and plan show against the pen');
    t.ok((await txt('CR1')).includes('Vet has seen — follow plan'), 'a picked-up case with a plan reads "Vet has seen — follow plan"');
    t.ok((await txt('CR1')).includes('Not written yet'), 'a case with no treatment/plan says it is not written yet');
    t.ok((await txt('CA2')).includes('Waiting on medication') && (await txt('CA2')).includes('Pen 3'), 'Adoption 2 case is in CA2 as waiting on medication');
    t.ok((await txt('FIR')).includes('Urgent') && (await txt('FIR')).includes('Waiting for vet'), 'an emergency-sign case shows Urgent');
    t.ok((await txt('P1')).includes('Antibiotic tablet with food') && (await txt('P1')).includes('Pen 5'), 'Pound 1 pen 5 shows its treatment');
    t.ok((await txt('RABBIT')).includes('Pen 1') && (await txt('RABBIT')).includes('Pen 4'), 'RR-1 and "Rabbit Room / 4" both land in Rabbit Room');
    t.ok((await txt('PATHWAY')).includes('Kitten lethargic') && (await txt('PATHWAY')).includes('Carer Smith'), 'foster request sits in Pathway with the carer detail');
    t.ok((await txt('OTHER')).includes('Mystery room 9'), 'an unrecognised location is kept visible under Other, not dropped');
    t.ok((await txt('CR2')).includes('Done') && (await txt('CR2')).includes('No treatment needed') && !(await txt('CR2')).includes('Pen 9'), 'done today stays, done 40 h ago is gone');
    t.ok(!(await b.page.textContent('#board')).includes('9990010'), 'check_recheck list entries are not shown');
    t.ok((await txt('CR3')).includes('nothing flagged') && (await room('CR3').getAttribute('class')).includes('empty'), 'a room with nothing flagged is a slim "nothing flagged" strip');
    t.ok(!/\d+ pens/.test(await b.page.textContent('#board')), 'room headers do not show pen counts (staff do not need them)');
    t.ok(await b.page.locator('#show-empty').count() === 0, 'no empty-room tick-box');
    // flagged-before history (last 3 months, reason only)
    t.ok((await txt('CR1')).includes('Flagged before 2×') && (await txt('CR1')).includes('Vomiting') && (await txt('CR1')).includes('Sneezing'), 'an animal flagged twice before shows "Flagged before 2×" with the reasons');
    t.ok(!(await b.page.textContent('#board')).includes('ancient'), 'a flag older than 3 months is not shown');
    t.ok(!(await txt('P1')).includes('Flagged before'), 'an animal with no earlier flag shows no history line');
    t.ok(!(await txt('CR1')).includes('9990001 · Flagged before') && (await b.page.locator('[data-case] .hist').count()) === 1, 'only the animal that was flagged before gets the line; its own current flag and other animals\' flags are not counted');
    t.ok(!(await txt('CR1')).includes('Gabapentin'), 'history carries the reason only — no treatment or plan from earlier flags');
    t.ok(await b.page.locator('#search-box').count() === 0, 'no search box on the board — animal lookup lives on the staff and vets pages');
    // live update: a new flag appears without a reload
    await b.page.evaluate(() => window.__db.tasks.push({ id: 'live1', title: '9990099', location: 'Pound 4 / 2', shift: 'sick_injured', type: 'shelter', urgency: 'routine', done: false, created_at: new Date().toISOString(), problem: 'New flag' }));
    await b.page.evaluate(() => loadAll());
    t.ok((await txt('P4')).includes('New flag') && (await txt('P4')).includes('Pen 2'), 'a newly flagged animal shows up in its room');
    // same sign-in + nav as the rest of the dashboard
    const nav = await b.page.textContent('#ops-nav');
    t.ok(nav.includes('Shelter board') && (await b.page.locator('#ops-nav a.active').textContent()) === 'Shelter board', 'nav lists Shelter board and marks it current');
    t.ok(b.errors.length === 0, 'no page errors (' + b.errors.join('; ') + ')');
    // gated by the same sign-in as every other page
    const out = await open(seed, 'shelter-board.html', { loggedOut: true });
    try {
      t.ok(await out.page.isVisible('#oc-login-screen, .oc-login-screen') && !(await out.page.isVisible('#app-root')), 'signed-out visitors see the sign-in screen, not the board');
    } finally { await out.browser.close(); }
    // foster requests default to Pathway on the main flag form
    const idx = await open({ tasks: [], locations: LOCATION_ROWS }, 'index.html');
    try {
      await idx.page.selectOption('#req-type', 'foster');
      t.ok((await idx.page.inputValue('#req-location')) === 'Pathway', 'choosing Foster request defaults the room to Pathway');
      t.ok(await idx.page.isVisible('#req-location-detail') && !(await idx.page.isVisible('#req-pen')), 'Pathway asks for a detail (foster name) instead of a pen');
      const opts = await idx.page.$$eval('#req-location option', os => os.map(o => o.value));
      t.ok(opts.includes('Rabbit Room') && opts.includes('Pathway'), 'flag form offers Rabbit Room and Pathway');
      // same animal flagged again in the same pen/shift (unique index): finished case is reopened, history keeps the old flag
      await idx.page.evaluate(() => {
        window.__uniqueTasks = true;
        window.__db.tasks.push({ id: 'old1', title: '9990050', location: 'Cat Room 1 / 3', shift: 'sick_injured', type: 'shelter', urgency: 'routine', done: true, completed_at: new Date(Date.now() - 3600e3).toISOString(), created_at: new Date(Date.now() - 5 * 3600e3).toISOString(), problem: 'Sneezing', treatment: 'x', plan: 'y', note: 'n' });
        window.__db.flag_history.push({ id: 'h0', task_id: 'old1', title: '9990050', flagged_at: new Date(Date.now() - 5 * 3600e3).toISOString(), location: 'Cat Room 1 / 3', reason: 'Sneezing' });
      });
      const msgs = []; idx.page.on('dialog', d => msgs.push(d.message()));   // the harness already accepts dialogs
      const flagIt = async (problem) => {
        await idx.page.fill('#req-title', '9990050'); await idx.page.selectOption('#req-location', 'Cat Room 1'); await idx.page.fill('#req-pen', '3');
        await idx.page.fill('#req-problem', problem); await idx.page.click('#req-submit'); await idx.page.waitForTimeout(400);
      };
      await flagIt('Vomiting now');
      const rows = await idx.page.evaluate(() => window.__db.tasks.filter(r => r.title === '9990050'));
      t.ok(rows.length === 1 && rows[0].done === false && rows[0].problem === 'Vomiting now' && rows[0].treatment === null && rows[0].plan === null, 'a re-flag in the same pen reopens the finished case with the new reason and clears the old treatment/plan (got ' + JSON.stringify(rows.map(r => [r.done, r.problem])) + ')');
      const hist = await idx.page.evaluate(() => window.__db.flag_history.filter(h => h.title === '9990050').map(h => h.reason));
      t.ok(hist.join('|') === 'Sneezing|Vomiting now', 'both flags are in the history (got ' + hist.join('|') + ')');
      t.ok(!msgs.some(m => /Could not submit/.test(m)), 'no "duplicate key" error shown to staff');
      // still open: a second person adds a different reason to the SAME case
      await idx.page.fill('#req-title', '9990050'); await idx.page.selectOption('#req-location', 'Cat Room 1'); await idx.page.fill('#req-pen', '3');
      await idx.page.click('#req-submit'); await idx.page.waitForTimeout(300);
      t.ok(msgs.some(m => /already flagged in that pen \(Vomiting now\)/.test(m) && /another reason/i.test(m)), 're-flagging with nothing to add says how to add a reason: ' + msgs.join(' | ').slice(0, 200));
      await flagIt('Diarrhoea since lunch');
      t.ok(msgs.some(m => /already flagged in that pen for: Vomiting now/.test(m) && /Add your reason/.test(m)), 'the person is shown why it was first flagged and asked to add theirs');
      let one = await idx.page.evaluate(() => window.__db.tasks.filter(r => r.title === '9990050'));
      t.ok(one.length === 1 && one[0].problem === 'Vomiting now' && one[0].extra_reasons.length === 1 && one[0].extra_reasons[0].problem === 'Diarrhoea since lunch', 'still ONE case, with the second reason added (got ' + JSON.stringify(one.map(r => r.extra_reasons)) + ')');
      await idx.page.evaluate(() => loadAll());
      const tbody = await idx.page.textContent('#cases-open-tbody');
      t.ok(/Vomiting now/.test(tbody) && /Diarrhoea since lunch/.test(tbody), 'the staff Cases table lists BOTH reasons');
      await idx.page.evaluate(() => { window.__realConfirm = window.confirm; window.confirm = () => false; });
      await flagIt('Cancelled comment');
      await idx.page.evaluate(() => { window.confirm = window.__realConfirm; });
      one = await idx.page.evaluate(() => window.__db.tasks.filter(r => r.title === '9990050'));
      t.ok(one[0].extra_reasons.length === 1, 'saying no to the prompt adds nothing');
      // a serious sign added later raises the case
      await idx.page.fill('#req-title', '9990050'); await idx.page.selectOption('#req-location', 'Cat Room 1'); await idx.page.fill('#req-pen', '3');
      await idx.page.check('input.req-flag[value="bleeding_wound"]'); await idx.page.click('#req-submit'); await idx.page.waitForTimeout(400);
      one = await idx.page.evaluate(() => window.__db.tasks.filter(r => r.title === '9990050'));
      t.ok(one[0].urgency === 'red_flag' && one[0].red_flags.includes('bleeding_wound') && one[0].extra_reasons.length === 2, 'an emergency sign added later raises the case to Emergency');
      t.ok((await idx.page.evaluate(() => window.__db.tasks.filter(r => r.title === '9990050').length)) === 1, 'still just one case');
      // the earlier flag shows on the main Cases table too
      await idx.page.evaluate(() => loadAll());
      t.ok((await idx.page.textContent('#cases-open-tbody')).includes('Flagged before 1× — '), 'the Cases table shows the "Flagged before" line');
    } finally { await idx.browser.close(); }
  } finally { await b.browser.close(); }
  t.done();
})().catch(e => { console.error(e); process.exit(1); });
