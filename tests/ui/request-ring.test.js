// Dashboard: a second ring for the checks shelter staff ask the vets for.
const { open } = require('./harness');
const t = require('./check')('request-ring');
const H = 3600 * 1000;
(async () => {
  const now = Date.now(), iso = (ms) => new Date(ms).toISOString();
  const seed = { tasks: [
    { title: 'R1', location: 'Pound 1', shift: 'sick_injured', type: 'shelter', done: true, created_at: iso(now - 3 * H), completed_at: iso(now - 1 * H) },
    { title: 'R2', location: 'Pound 1', shift: 'sick_injured', type: 'foster', done: false, created_at: iso(now - 0.5 * H) },
    { title: 'R3', location: 'Pound 2', shift: 'sick_injured', type: 'rescue', done: false, created_at: iso(now - 5 * 24 * H) },
    { title: 'C1', location: 'Pound 3', shift: 'processing', type: 'check_recheck', done: true, created_at: iso(now - 2 * H), completed_at: iso(now - 1 * H) }
  ] };
  const d = await open(seed, 'index.html');
  try {
    t.ok(await d.page.locator('#request-card').count() === 1 && await d.page.locator('#completion-donut').count() === 1, 'a second ring sits beside the first');
    t.ok((await d.page.textContent('#request-fraction')).trim() === '1 of 2', 'counts only shelter check requests (not routine list checks): ' + await d.page.textContent('#request-fraction'));
    t.ok(/50%/.test(await d.page.textContent('#request-donut')) && /REQUESTS/.test(await d.page.textContent('#request-donut')), 'the ring shows the percentage');
    t.ok(/1 older still open/.test(await d.page.textContent('#request-older')), 'an older open request is mentioned, not hidden');
    t.ok(d.errors.length === 0, 'no page errors: ' + d.errors.join('; '));
  } finally { await d.browser.close(); }
  t.done();
})();
