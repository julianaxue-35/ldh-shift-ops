const { open } = require('./harness');
const t = require('./check')('staff-initials');
(async () => {
  const s = await open({}, 'index.html');
  try {
    await s.page.waitForSelector('#nr-initials', { timeout: 5000 });
    await s.page.fill('#nr-initials', 'cd'); await s.page.dispatchEvent('#nr-initials', 'change');
    t.ok(await s.page.inputValue('#req-initials') === 'CD', 'one set of initials is shared by the staff forms');
    await s.page.fill('#nr-note', 'from van 2'); await s.page.click('#nr-submit');
    await s.page.waitForFunction(() => window.__db.nurse_requests.length === 1);
    const n = (await s.db()).nurse_requests[0];
    t.ok(/sent by CD/.test(n.note) && /from van 2/.test(n.note) && n.created_by === 'Shelter Staff (CD)', 'nurse request carries the initials: ' + n.note);
    await s.page.fill('#nr-initials', ''); await s.page.dispatchEvent('#nr-initials', 'change');
    await s.page.click('#nr-submit');
    await s.page.waitForFunction(() => window.__db.nurse_requests.length === 2);
    t.ok((await s.db()).nurse_requests[1].created_by === 'Shelter Staff', 'initials stay optional');
    // the flag form: initials go on the vet request, and a routine request with initials is still a plain routine request
    await s.page.fill('#nr-initials', 'cd'); await s.page.dispatchEvent('#nr-initials', 'change');
    await s.page.fill('#req-title', 'INI-1'); await s.page.check('input.req-flag[value="bleeding_wound"]');
    await s.page.click('#req-submit');
    await s.page.waitForFunction(() => window.__db.tasks.length === 1);
    t.ok(/sent by CD/.test((await s.db()).tasks[0].problem), 'a flagged request shows who sent it: ' + (await s.db()).tasks[0].problem);
    t.ok(s.errors.length === 0, 'no page errors: ' + s.errors.join('; '));
  } finally { await s.browser.close(); }
  t.done();
})();
