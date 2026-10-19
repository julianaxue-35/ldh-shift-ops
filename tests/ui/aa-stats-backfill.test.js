// Admission AA page: cards already ticked (in the Completed list) but never counted get counted once.
const { open } = require('./harness');
const t = require('./check')('aa-stats-backfill');
const H = 3600 * 1000;
const ago = ms => new Date(Date.now() - ms).toISOString();
(async () => {
  const seed = {
    aa_items: [
      { id: 'c1', kind: 'processing_note', animal_ids: ['P-1'], done_ids: ['P-1'], sent_by: 'AB', sent_at: ago(5 * H), completed_at: ago(2 * H), payload: { text: 'x' } },
      { id: 'c2', kind: 'med_chart', animal_ids: ['M-1'], done_ids: ['M-1'], sent_by: 'AB', sent_at: ago(5 * H), completed_at: ago(1 * H), payload: {} },
      { id: 'c3', kind: 'vaccination', animal_ids: ['V-1', 'V-2'], done_ids: ['V-1', 'V-2'], sent_by: 'AB', sent_at: ago(5 * H), completed_at: ago(1 * H), payload: {} },
      { id: 'c4', kind: 'processing_note', animal_ids: ['P-4'], done_ids: ['P-4'], sent_by: 'AB', sent_at: ago(5 * H), completed_at: ago(1 * H), payload: { text: 'x' } }
    ],
    aa_done_log: [{ item_id: 'c4', kind: 'processing_note', animals: 1, completed_at: ago(1 * H) }]
  };
  const a = await open(seed, 'admission-aa.html');
  try {
    await a.page.waitForFunction(() => window.__db.aa_done_log.length === 4);
    const log = (await a.db()).aa_done_log;
    t.ok(log.filter(r => r.item_id === 'c1').length === 1 && log.filter(r => r.item_id === 'c4').length === 1, 'each completed card is counted once, the already-counted one is not doubled');
    t.ok(log.find(r => r.item_id === 'c3').animals === 2, 'a multi-animal card counts every animal');
    await a.page.waitForFunction(() => /This year 2 /.test(document.querySelector('#aa-stats-body [data-period="year"]').innerText.replace(/\s+/g, ' ')));
    t.ok(true, 'the notes total includes them');
    t.ok(a.errors.length === 0, 'no page errors: ' + a.errors.join('; '));
  } finally { await a.browser.close(); }
  t.done();
})();
