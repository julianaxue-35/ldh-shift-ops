// Admission AA page: the progress ring and the week / month / quarter / year totals.
const { open } = require('./harness');
const t = require('./check')('aa-stats');
const H = 3600 * 1000;
const ago = ms => new Date(Date.now() - ms).toISOString();
(async () => {
  const seed = {
    aa_items: [
      { id: 'p1', kind: 'processing_note', animal_ids: ['P-1'], sent_by: 'AB', sent_at: ago(1 * H), payload: { text: 'x' } },
      { id: 'v1', kind: 'vaccination', animal_ids: ['V-1', 'V-2'], sent_by: 'CD', sent_at: ago(1 * H), payload: { vaccine: 'F3' } }
    ],
    aa_done_log: [
      { item_id: 'old1', kind: 'processing_note', animals: 1, completed_at: ago(1 * H) },
      { item_id: 'old2', kind: 'si_note', animals: 1, completed_at: ago(2 * H) },
      { item_id: 'old3', kind: 'med_chart', animals: 1, completed_at: ago(2 * H) },
      { item_id: 'old4', kind: 'processing_note', animals: 1, completed_at: ago(40 * 24 * H) }
    ]
  };
  const a = await open(seed, 'admission-aa.html');
  try {
    await a.page.waitForSelector('#aa-stats-body [data-period="year"]');
    const row = k => a.page.innerText('#aa-stats-body [data-period="' + k + '"]').then(x => x.replace(/\s+/g, ' ').trim());
    t.ok(/This year 3 /.test(await row('year')), 'the year counts notes done: ' + await row('year'));
    t.ok(/NOTES TODAY/.test(await a.page.textContent('#aa-stats-body svg')) && /2/.test(await a.page.textContent('#aa-stats-body svg')), 'the ring shows today\'s notes');
    t.ok(!/target|goal/i.test(await a.page.textContent('#aa-stats')), 'no targets or goals');

    /* completing a card counts it; putting it back takes the count away again */
    const logBefore = (await a.db()).aa_done_log.length;
    await a.page.click('.aa-card[data-id="p1"] .aa-done');
    await a.page.waitForFunction((n) => window.__db.aa_done_log.length === n + 1, logBefore);
    const entry = (await a.db()).aa_done_log.find(r => r.item_id === 'p1');
    t.ok(entry && entry.kind === 'processing_note' && entry.animals === 1 && !('animal_ids' in entry) && !('payload' in entry), 'a completion logs only the kind and the number of animals: ' + JSON.stringify(entry));
    await a.page.waitForFunction(() => /This year 4 /.test(document.querySelector('#aa-stats-body [data-period="year"]').innerText.replace(/\s+/g, ' ')));
    t.ok(true, 'the totals go up straight away');

    /* a multi-animal card counts once, when its LAST animal is ticked, as that many animals */
    await a.page.check('.aa-card[data-id="v1"] .aa-animal[data-animal="V-1"]');
    await a.page.waitForTimeout(300);
    t.ok(!(await a.db()).aa_done_log.some(r => r.item_id === 'v1'), 'one animal of two ticked: not counted yet');
    await a.page.click('.aa-card[data-id="v1"] .aa-animal[data-animal="V-2"]');
    await a.page.waitForFunction(() => window.__db.aa_done_log.some(r => r.item_id === 'v1'));
    t.ok((await a.db()).aa_done_log.find(r => r.item_id === 'v1').animals === 2, 'the card is counted as 2 animals');

    await a.page.click('#aa-completed .aa-putback[data-id="p1"]');
    await a.page.waitForFunction(() => !window.__db.aa_done_log.some(r => r.item_id === 'p1'));
    t.ok(true, 'putting a card back removes its count');
    await a.page.click('#aa-empty-done');
    await a.page.waitForTimeout(400);
    t.ok((await a.db()).aa_done_log.some(r => r.item_id === 'v1'), 'emptying the Completed list keeps the history counts');
    t.ok(a.errors.length === 0, 'no page errors: ' + a.errors.join('; '));
  } finally { await a.browser.close(); }
  t.done();
})();
