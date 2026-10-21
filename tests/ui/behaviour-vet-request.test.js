const { open } = require('./harness');
const t = require('./check')('behaviour-vet-request');
(async () => {
  const b = await open({}, 'behaviour.html');
  const F = f => '#send-request [data-f="' + f + '"]';
  const msg = () => b.page.textContent('#send-request [data-msg]');
  try {
    await b.page.waitForSelector('#send-request [data-send="vets"]');
    t.ok(await b.page.locator('#send-request .sc-tab').count() === 1, 'the Behaviour page card is for the vets');
    await b.page.click('[data-send="vets"]');
    t.ok(/animal ID/i.test(await msg()), 'asks for the animal ID');
    await b.page.fill(F('animal'), 'BEH-1');
    await b.page.click('[data-send="vets"]');
    t.ok(/initials/i.test(await msg()), 'asks for initials');
    t.ok((await b.db()).tasks.length === 0, 'nothing sent without initials');
    await b.page.fill(F('initials'), 'jx');
    await b.page.selectOption(F('room'), 'Cat Room 1'); await b.page.fill(F('pen'), '12');
    await b.page.check(F('courthold')); await b.page.fill(F('note'), 'two weeks');
    await b.page.click('[data-send="vets"]');
    await b.page.waitForFunction(() => window.__db.tasks.length === 1);
    const r = (await b.db()).tasks[0];
    t.ok(r.title === 'BEH-1' && r.location === 'Cat Room 1 / 12' && r.type === 'medication' && r.needs_medication === true, 'shelter stress medication lands on the vet board as a medication request');
    t.ok(/COURTHOLD/.test(r.problem) && /sent by JX/.test(r.problem) && /two weeks/.test(r.problem), 'courthold, initials and note are in the request: ' + r.problem);
    t.ok(/Sent to the vets/.test(await msg()), 'confirms it was sent');
    t.ok((await b.page.inputValue('#bh-initials')) === 'JX', 'the page initials follow the card');
    await b.page.fill(F('animal'), 'BEH-2'); await b.page.selectOption(F('kind'), 'other');
    await b.page.click('[data-send="vets"]');
    await b.page.waitForFunction(() => window.__db.tasks.length === 2);
    const o = (await b.db()).tasks[1];
    t.ok(o.type === 'shelter' && !o.needs_medication && !/COURTHOLD/.test(o.problem), '"Other" is a plain shelter request, no courthold when unticked');
    await b.page.fill(F('animal'), 'BEH-3'); await b.page.selectOption(F('room'), 'Vet clinic'); await b.page.fill(F('pen'), 'ward 2');
    await b.page.click('[data-send="vets"]');
    await b.page.waitForFunction(() => window.__db.tasks.length === 3);
    const v = (await b.db()).tasks[2];
    t.ok(v.location === 'Vet clinic' && v.location_detail === 'ward 2', 'Vet clinic keeps the ward as the detail: ' + v.location + ' / ' + v.location_detail);
    t.ok(b.errors.length === 0, 'no page errors: ' + b.errors.join('; '));
  } finally { await b.browser.close(); }
  t.done();
})();
