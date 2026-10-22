// Every request sent from any page shows "Request submitted successfully" at the bottom of the screen.
const { open } = require('./harness');
const t = require('./check')('submit-toast');
const toast = page => page.evaluate(() => { const e = document.getElementById('oc-toast'); return e && getComputedStyle(e).display !== 'none' ? e.textContent : ''; });
(async () => {
  // Behaviour page: send a task to the vets from the request card
  let p = await open({}, 'behaviour.html');
  try {
    await p.page.waitForSelector('#send-request .sc-form');
    t.ok(!(await toast(p.page)), 'no message before anything is sent');
    await p.page.fill('#bh-initials', 'jx'); await p.page.dispatchEvent('#bh-initials', 'change');
    await p.page.fill('#send-request [data-f="animal"]', 'BEH-1');
    await p.page.selectOption('#send-request [data-f="room"]', 'Cat Room 1');
    await p.page.fill('#send-request [data-f="note"]', 'check');
    await p.page.click('#send-request [data-send="vets"]');
    await p.page.waitForFunction(() => document.getElementById('oc-toast'), null, { timeout: 4000 });
    t.ok(/Request submitted successfully/.test(await toast(p.page)), 'request card shows the message: ' + await toast(p.page));
    // adding a team task from a lane
    await p.page.evaluate(() => document.getElementById('oc-toast').remove());
    await p.page.click('.bh-add[data-lane="tl"]');
    await p.page.fill('.add-animal', 'BEH-2'); await p.page.selectOption('.add-room', 'Cat Room 1');
    await p.page.selectOption('.add-kind', 'courthold');
    await p.page.click('.add-confirm');
    await p.page.waitForFunction(() => document.getElementById('oc-toast'), null, { timeout: 4000 });
    t.ok(/Request submitted successfully/.test(await toast(p.page)), 'a team task shows the message too');
    t.ok(p.errors.length === 0, 'no errors ' + p.errors.join('; '));
  } finally { await p.browser.close(); }
  t.done();
})();
