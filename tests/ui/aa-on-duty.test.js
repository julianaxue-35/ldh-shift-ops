// Admission AA page: shows today's Welfare and Processing nurse initials.
const { open } = require('./harness');
const t = require('./check')('aa-on-duty');
(async () => {
  const today = new Date().toLocaleDateString('en-CA');
  const a = await open({ nurse_on_duty: [
    { day: today, role: 'welfare', initials: 'AB' }, { day: today, role: 'processing', initials: 'CD' },
    { day: '2020-01-01', role: 'welfare', initials: 'ZZ' }] }, 'admission-aa.html');
  try {
    await a.page.waitForFunction(() => /AB/.test(document.getElementById('aa-on-duty').textContent));
    const txt = (await a.page.textContent('#aa-on-duty')).replace(/\s+/g, ' ');
    t.ok(/Welfare nurse AB/.test(txt) && /Processing nurse CD/.test(txt), 'shows both nurses: ' + txt);
    t.ok(!/ZZ/.test(txt), "an earlier day's initials are never shown");
    await a.page.evaluate(() => { window.__db.nurse_on_duty.splice(0, window.__db.nurse_on_duty.length); return loadAll(); });
    await a.page.waitForFunction(() => /not set yet/.test(document.getElementById('aa-on-duty').textContent));
    t.ok((await a.page.textContent('#aa-on-duty')).match(/not set yet/g).length === 2, 'nobody set: says so for both');
    t.ok(a.errors.length === 0, 'no page errors: ' + a.errors.join('; '));
  } finally { await a.browser.close(); }
  t.done();
})();
