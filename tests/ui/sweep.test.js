const { open } = require('./harness');
const t = require('./check')('sweep');
const ago = ms => new Date(Date.now() - ms).toISOString();
const H = 3600 * 1000, D = 24 * H;
function isoDaysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
(async () => {
  const mk = (title, urgency, agoMs, extra = {}) => Object.assign({ title, location: 'Pound 1', shift: 'sick_injured', type: 'shelter', urgency, created_at: ago(agoMs) }, extra);
  const { browser, page, errors } = await open({
    tasks: [mk('RED1', 'red_flag', 3 * H), mk('OK1', 'routine', 1 * H), mk('CLAIMED', 'routine', 60 * H, { claimed_at: ago(H), claimed_by: 'JX' })],
    nurse_requests: [{ location: 'FIR Room', species: 'cat', animal_count: 8, done_count: 2, arrived_at: ago(4 * H) }],
    nurse_treatments: [{ id: 'tr1', animal_id: '1174362', location: 'Cat Room 1', treatment: 'Flush site', times_per_day: 2, days: 7, start_date: isoDaysAgo(1) }],
    nurse_treatment_doses: [{ id: 'd1', treatment_id: 'tr1', day_no: 1, slot_no: 1, due_date: isoDaysAgo(1), done_at: null }]
  });
  try {
    t.ok(!(await page.isVisible('#sweep-card')), 'hidden from Floor view');
    await page.selectOption('#role-select', 'vet_nurse');
    await page.waitForTimeout(250);
    const counts = await page.$$eval('#sweep-body .sweep-n', els => els.map(e => e.textContent.trim()));
    t.ok(counts.join() === '1,1,1,1', 'four sections each count 1: overdue case, not yet claimed, overdue request, overdue dose (got ' + counts.join() + ')');
    const body = await page.textContent('#sweep-body');
    t.ok(body.includes('RED1') && body.includes('OK1') && !body.includes('CLAIMED'), 'claimed cases are not in the sweep');
    t.ok(body.includes('FIR Room') && body.includes('1174362'), 'request and dose lines present');

    await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (x) => { window.__copied = x; } }, configurable: true }); });
    await page.click('#sweep-copy');
    await page.waitForTimeout(150);
    const copied = await page.evaluate(() => window.__copied || '');
    t.ok(copied.startsWith('Handover —') && copied.includes('Overdue cases (1)') && copied.includes('RED1 — Pound 1 — Red flag, overdue'), 'Copy handover puts the text on the clipboard');
    t.ok(errors.length === 0, 'no page errors: ' + errors.join('; '));
  } finally {
    await browser.close();
  }
  t.done();
})();
