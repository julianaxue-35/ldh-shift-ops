const { open } = require('./harness');
const t = require('./check')('behaviour-vet-request');
(async () => {
  const b = await open({}, 'behaviour.html');
  try {
    await b.page.waitForSelector('#bv-send');
    await b.page.click('#bv-send');
    t.ok(/shelter ID/i.test(await b.page.textContent('#bv-error')), 'asks for the shelter ID');
    await b.page.fill('#bv-animal', 'BEH-1');
    await b.page.click('#bv-send');
    t.ok(/initials/i.test(await b.page.textContent('#bv-error')), 'asks for initials');
    t.ok((await b.db()).tasks.length === 0, 'nothing sent without initials');
    await b.page.fill('#bh-initials', 'jx'); await b.page.dispatchEvent('#bh-initials', 'change');
    await b.page.selectOption('#bv-room', 'Cat Room 1'); await b.page.fill('#bv-pen', '12');
    await b.page.check('#bv-courthold'); await b.page.fill('#bv-note', 'two weeks');
    await b.page.click('#bv-send');
    await b.page.waitForFunction(() => window.__db.tasks.length === 1);
    const r = (await b.db()).tasks[0];
    t.ok(r.title === 'BEH-1' && r.location === 'Cat Room 1 / 12' && r.type === 'medication' && r.needs_medication === true, 'shelter stress medication lands on the vet board as a medication request');
    t.ok(/COURTHOLD/.test(r.problem) && /sent by JX/.test(r.problem) && /two weeks/.test(r.problem), 'courthold, initials and note are in the request: ' + r.problem);
    await b.page.fill('#bv-animal', 'BEH-2'); await b.page.selectOption('#bv-type', 'other');
    await b.page.click('#bv-send');
    await b.page.waitForFunction(() => window.__db.tasks.length === 2);
    const o = (await b.db()).tasks[1];
    t.ok(o.type === 'shelter' && !o.needs_medication && !/COURTHOLD/.test(o.problem), '"Other" is a plain shelter request, no courthold when unticked');
    t.ok(b.errors.length === 0, 'no page errors: ' + b.errors.join('; '));
  } finally { await b.browser.close(); }
  t.done();
})();
