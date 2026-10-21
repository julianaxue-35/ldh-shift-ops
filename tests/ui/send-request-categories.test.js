const { open } = require('./harness');
const t = require('./check')('send-request-categories');
(async () => {
  const s = await open({}, 'index.html');
  try {
    await s.page.waitForSelector('#send-request');
    // Vets: an "Other" request needs a note and is stored as an ordinary shelter request
    const vetsKinds = await s.page.$$eval('#req-type option', os => os.map(o => o.value));
    t.ok(vetsKinds.includes('other'), 'Vets has an Other option: ' + vetsKinds);
    await s.page.fill('#req-title', 'CAT-1'); await s.page.selectOption('#req-type', 'other');
    let dialog = '';
    s.page.once('dialog', d => { dialog = d.message(); });   // the harness accepts it
    await s.page.click('#req-submit');
    await s.page.waitForTimeout(300);
    t.ok(/Describe/.test(dialog), 'Vets Other without a note is refused: ' + dialog);
    await s.page.fill('#req-problem', 'Please look at a lump');
    await s.page.click('#req-submit');
    await s.page.waitForFunction(() => window.__db.tasks.length === 1);
    const row = (await s.db()).tasks[0];
    t.ok(row.type === 'shelter' && /lump/.test(row.problem), 'Other is stored as a shelter request with the note: ' + row.type);
    // Nurses: one-animal tasks, the same list the vets page sends
    await s.page.click('.sr-tab[data-sr="nurses"]');
    const nurseKinds = await s.page.$$eval('#nr-kind option', os => os.map(o => o.value));
    for (const k of ['vaccination', 'task:fiv_test', 'task:blood', 'task:microchip', 'task:ear_swab', 'task:ivft', 'task:med_label', 'task:other']) t.ok(nurseKinds.includes(k), 'Nurses offers ' + k);
    t.ok(!nurseKinds.includes('task:treatment') && !nurseKinds.includes('uv') && !nurseKinds.includes('fiv'), 'treatment / UV are not nurse-tab choices (they come from foster/rescue on the Vets tab)');
    t.ok(!(await s.page.isVisible('#nr-animal')) && await s.page.isVisible('#nr-count'), 'group kinds show How many, not Animal ID');
    await s.page.selectOption('#nr-kind', 'task:ear_swab');
    t.ok(await s.page.isVisible('#nr-animal') && await s.page.isVisible('#nr-detail') && !(await s.page.isVisible('#nr-count')) && !(await s.page.isVisible('#nr-window')), 'a task shows Animal ID and Pen / detail, hides How many and Needed within');
    await s.page.fill('#sr-initials', 'ab'); await s.page.dispatchEvent('#sr-initials', 'change');
    await s.page.selectOption('#nr-kind', 'task:other');
    dialog = ''; s.page.once('dialog', d => { dialog = d.message(); });
    await s.page.fill('#nr-animal', 'CAT-2');
    await s.page.click('#nr-submit'); await s.page.waitForTimeout(300);
    t.ok(/Describe/.test(dialog), 'Nurse Other without a note is refused: ' + dialog);
    await s.page.selectOption('#nr-kind', 'task:ear_swab');
    await s.page.fill('#nr-detail', 'Pen 4'); await s.page.fill('#nr-note', 'left ear');
    await s.page.click('#nr-submit');
    await s.page.waitForFunction(() => (window.__db.noga_requests || []).length === 1);
    const n = (await s.db()).noga_requests[0];
    t.ok(n.task === 'ear_swab' && n.animal_id === 'CAT-2' && /Pen 4/.test(n.location) && n.note === 'left ear' && n.added_by === 'AB', 'ear swab saved for the nurses: ' + JSON.stringify(n));
    t.ok((await s.db()).nurse_requests.length === 0, 'no group request was created');
    await s.page.selectOption('#nr-kind', 'vaccination');
    t.ok(await s.page.isVisible('#nr-count') && !(await s.page.isVisible('#nr-animal')), 'switching back shows the group fields again');
    t.ok(s.errors.length === 0, 'no page errors: ' + s.errors.join('; '));
  } finally { await s.browser.close(); }
  t.done();
})();
