// Nurses page: the newest nurse request is at the top of the list, in front of the earlier ones.
const { open } = require('./harness');
const t = require('./check')('nurse-requests-order');
const ago = ms => new Date(Date.now() - ms).toISOString(), H = 3600e3;
(async () => {
  const n = await open({
    nurse_requests: [
      { kind: 'vaccination', location: 'Cat Room 1', species: 'cat', animal_count: 2, done_count: 0, due_window: 'today', arrived_at: ago(5 * H), created_at: ago(5 * H) },
      { kind: 'fiv', location: 'Pound 2', species: 'dog', animal_count: 1, animal_id: 'NEW-1', done_count: 0, due_window: '2h', arrived_at: ago(0.1 * H), created_at: ago(0.1 * H) },
      { kind: 'blood', location: 'Pound 3', species: 'dog', animal_count: 1, animal_id: 'MID-1', done_count: 0, due_window: 'today', arrived_at: ago(2 * H), created_at: ago(2 * H) },
      { kind: 'microchip', location: 'Cat Room 2', species: 'cat', animal_count: 1, animal_id: 'DONE-1', done_count: 1, due_window: 'today', arrived_at: ago(1 * H), created_at: ago(1 * H) }
    ]
  }, 'nurses.html');
  try {
    await n.page.waitForSelector('#nr-list .nr-item');
    const rows = await n.page.$$eval('#nr-list .nr-item', rs => rs.map(r => r.textContent.replace(/\s+/g, ' ')));
    t.ok(rows.length === 3, 'the finished request is not listed: ' + rows.length);
    t.ok(/NEW-1/.test(rows[0]) && /MID-1/.test(rows[1]) && /Cat Room 1/.test(rows[2]), 'newest first, oldest last: ' + rows.map(r => r.slice(0, 22)).join(' | '));
    t.ok(n.errors.length === 0, 'no page errors: ' + n.errors.join('; '));
  } finally { await n.browser.close(); }
  t.done();
})();
