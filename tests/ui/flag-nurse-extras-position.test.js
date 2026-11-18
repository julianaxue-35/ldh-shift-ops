// 2026-11-18: for a Rescue / Foster request the Microchip / UV / Treatment section sits straight under the location, above the signs and symptoms.
const { open } = require('./harness');
const t = require('./check')('flag-nurse-extras-position');
(async () => {
  const { browser, page, errors, db } = await open();
  try {
    t.ok(!(await page.isVisible('#req-nurse-extras')), 'hidden for an ordinary shelter request');
    await page.selectOption('#req-type', 'rescue');
    t.ok(await page.isVisible('#req-nurse-extras'), 'shown for a rescue request');
    const y = sel => page.$eval(sel, e => Math.round(e.getBoundingClientRect().top));
    t.ok(await y('#req-nurse-extras') > await y('#req-pen') && await y('#req-nurse-extras') < await y('#req-signs-wrap'), 'it sits between the pen box and the signs');
    t.ok(await y('#req-nurse-extras') < await y('#req-problem'), 'and above the symptoms box');
    t.ok((await page.getAttribute('#req-title', 'placeholder')).includes('Several'), 'the Animal ID box says several animals can be entered');
    await page.fill('#req-title', '1170123, 1170124 - 1170125'); await page.check('#req-x-microchip'); await page.check('#req-x-uv');
    await page.click('#req-submit'); await page.waitForTimeout(500);
    const r = (await db()).nurse_requests;
    t.ok(r.length === 3 && r.every(x => x.kind === 'microchip_uv'), 'three animals entered at once give three microchip + UV requests: ' + r.map(x => x.animal_id).join(','));
    t.ok(errors.length === 0, 'no page errors: ' + errors.join('; '));
  } finally { await browser.close(); }
  t.done();
})();
