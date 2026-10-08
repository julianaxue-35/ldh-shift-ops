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
  ], locations: LOCATION_ROWS.concat([{ name: 'Rabbit Room', grp: 'Rabbits', cages: 10, sort: 13 }]) };
  const b = await open(seed, 'shelter-board.html');
  try {
    const roomOrder = await b.page.$$eval('#board section.room-card', els => els.map(e => e.dataset.room));
    t.ok(roomOrder.join(',') === 'CR1,CR2,CA2,FIR,P1,RABBIT,PATHWAY,OTHER',
      'only rooms with a flagged animal show, still in walking order (got ' + roomOrder.join(',') + ')');
    const room = code => b.page.locator(`#board section[data-room="${code}"]`);
    const txt = async code => (await room(code).textContent()).replace(/\s+/g, ' ');
    t.ok((await txt('CR1')).includes('Pen 12') && (await txt('CR1')).includes('Pen 30'), 'CR1 holds Cat Room 1 / 12 and the "CR1-30" spelling, as pens 12 and 30');
    t.ok((await txt('CR1')).includes('Mirtazapine ear gel once daily') && (await txt('CR1')).includes('Offer wet food little and often'), 'the vet\'s treatment and plan show against the pen');
    t.ok((await txt('CR1')).includes('Vet has seen — follow plan'), 'a picked-up case with a plan reads "Vet has seen — follow plan"');
    t.ok((await txt('CR1')).includes('Not written yet'), 'a case with no treatment/plan says it is not written yet');
    t.ok((await txt('CA2')).includes('Waiting on medication') && (await txt('CA2')).includes('Pen 3'), 'Adoption 2 case is in CA2 as waiting on medication');
    t.ok((await txt('FIR')).includes('Urgent') && (await txt('FIR')).includes('Waiting for vet'), 'an emergency-sign case shows Urgent');
    t.ok((await txt('P1')).includes('Antibiotic tablet with food') && (await txt('P1')).includes('Pen 5'), 'Pound 1 pen 5 shows its treatment');
    t.ok((await txt('RABBIT')).includes('Pen 1') && (await txt('RABBIT')).includes('Pen 4') && (await txt('RABBIT')).includes('10 pens'), 'RR-1 and "Rabbit Room / 4" both land in Rabbit Room (10 pens)');
    t.ok((await txt('PATHWAY')).includes('Kitten lethargic') && (await txt('PATHWAY')).includes('Carer Smith'), 'foster request sits in Pathway with the carer detail');
    t.ok((await txt('OTHER')).includes('Mystery room 9'), 'an unrecognised location is kept visible under Other, not dropped');
    t.ok((await txt('CR2')).includes('Done') && (await txt('CR2')).includes('No treatment needed') && !(await txt('CR2')).includes('Pen 9'), 'done today stays, done 40 h ago is gone');
    t.ok(!(await b.page.textContent('#board')).includes('9990010'), 'check_recheck list entries are not shown');
    t.ok(!roomOrder.includes('CR3') && !roomOrder.includes('P2') && !roomOrder.includes('TRANSPORT') && roomOrder.includes('CR1'), 'rooms with nothing flagged are not shown at all');
    t.ok(await b.page.locator('#show-empty').count() === 0, 'no empty-room tick-box any more');
    await b.page.fill('#search-box', 'CZT101');
    t.ok((await b.page.$$eval('#board .case', els => els.length)) === 1, 'searching an animal ID narrows to that animal');
    await b.page.fill('#search-box', '');
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
    } finally { await idx.browser.close(); }
  } finally { await b.browser.close(); }
  t.done();
})().catch(e => { console.error(e); process.exit(1); });
