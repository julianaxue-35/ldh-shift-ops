// Vets page: collapsed Completed list (initials, ID search, history) and the vet-meeting minutes download.
const { open } = require('./harness');
const t = require('./check')('new-completed-minutes');
const ago = ms => new Date(Date.now() - ms).toISOString();
const H = 3600 * 1000;
const task = (x) => Object.assign({ type: 'request', title: 'X', urgency: 'routine', done: true, completed_by_role: 'vet_nurse', completed_at: ago(2 * H), created_at: ago(5 * H), claimed_by: 'AB', claimed_at: ago(3 * H) }, x);
(async () => {
  const a = await open({ tasks: [task({ title: 'D-111' }), task({ title: 'D-222', claimed_by: 'CD' })],
    memos: [{ id: 'm1', author: 'Vet team', text: 'Review doxy dosing', done: false, created_at: ago(H) }] }, 'vets.html');
  try {
    await a.page.waitForSelector('#completed-list', { state: 'attached' });
    t.ok(!(await a.page.isVisible('#completed-list')), 'Completed list starts collapsed');
    t.ok(/Completed \(last 24 h\): 2/.test(await a.page.textContent('#completed-title')), 'heading shows the count');
    await a.page.click('#completed-details summary');
    const txt = await a.page.textContent('#completed-list');
    t.ok(/D-111 — done by AB/.test(txt) && /D-222 — done by CD/.test(txt), 'rows show the ID and the initials of who did it');
    await a.page.fill('#completed-search', 'D-222');
    const f = await a.page.textContent('#completed-list');
    t.ok(f.includes('D-222') && !f.includes('D-111'), 'search filters by animal ID');
    await a.page.click('#completed-search-all');
    await a.page.waitForTimeout(300);
    t.ok((await a.page.textContent('#completed-list')).includes('D-222'), 'Search all history returns the match');
    const [dl] = await Promise.all([a.page.waitForEvent('download'), a.page.click('[data-dl-minutes]')]);
    t.ok(/Vet-meeting-minutes-.*\.docx$/.test(dl.suggestedFilename()), 'minutes download as a .docx');
    const p = await dl.path(); const buf = require('fs').readFileSync(p);
    t.ok(buf.slice(0, 2).toString() === 'PK', 'file is a valid zip/docx package');
  } finally { await a.browser.close(); }
  t.done();
})().catch(e => { console.error(e); process.exit(1); });
