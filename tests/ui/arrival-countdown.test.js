// 2026-11-27: a nurse request sent as the animals arrive counts down from the moment it is sent; an earlier hour still counts from it.
const { open } = require('./harness');
const t = require('./check')('arrival-countdown');
(async () => {
  const o = await open({}, 'index.html'); const p = o.page;
  try {
    await p.click('.sr-tab[data-sr="nurses"]'); await p.fill('#sr-initials', 'OF'); await p.dispatchEvent('#sr-initials', 'change');
    const send = async () => { await p.click('#nr-submit'); await p.waitForTimeout(500); const r = (await o.db()).nurse_requests; return r[r.length - 1]; };
    await p.fill('#nr-count', '5'); const before = Date.now(); const a = await send();
    t.ok(Math.abs(new Date(a.arrived_at).getTime() - before) < 5000, 'sent on arrival: the 2 hours start now (' + a.arrived_at + ')');
    const earlier = new Date(Date.now() - 3 * 3600000);
    await p.fill('#nr-arrived-date', earlier.toLocaleDateString('en-CA')); await p.selectOption('#nr-arrived-hour', String(earlier.getHours()).padStart(2, '0'));
    const b = await send(); const got = new Date(b.arrived_at);
    t.ok(got.getHours() === earlier.getHours() && got.getMinutes() === 0, 'an earlier arrival picked on purpose counts from that hour (' + b.arrived_at + ')');
    t.ok(!o.errors.length, 'no page errors ' + o.errors.join('; '));
  } finally { await o.browser.close(); }
  t.done();
})().catch(e => { console.log('FAIL ' + String(e.message).slice(0, 300)); process.exit(1); });
