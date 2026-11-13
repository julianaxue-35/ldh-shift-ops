// Admission AA page: a medication chart shows under its note; a chart with no note warns; "Doesn't match" says who to ask.
const { open } = require('./harness');
const t = require('./check')('admission-aa-chart-under-note');
const H = 3600 * 1000;
const ago = ms => new Date(Date.now() - ms).toISOString();

(async () => {
  const seed = { aa_items: [
    { id: 'n1', kind: 'processing_note', animal_ids: ['T-100'], sent_by: 'AB', sent_at: ago(2 * H), payload: { text: 'Exam normal.' } },
    { id: 'm1', kind: 'med_chart', animal_ids: ['T-100'], sent_by: 'CD', sent_at: ago(1 * H), payload: { lines: ['Drug A 1 tablet BID'] } },
    { id: 'm2', kind: 'med_chart', animal_ids: ['T-999'], sent_by: 'EF', sent_at: ago(1 * H), payload: { lines: ['Drug B'] } }
  ] };
  const a = await open(seed, 'admission-aa.html');
  try {
    t.ok(await a.page.locator('.aa-card[data-id="n1"] .aa-chart-under[data-id="m1"]').count() === 1, 'chart is shown inside its note card');
    t.ok(/Drug A 1 tablet BID/.test(await a.page.textContent('.aa-card[data-id="n1"] .aa-chart-under')), 'chart lines show under the note');
    t.ok(await a.page.locator('.aa-col[data-col="charts"] .aa-card[data-id="m1"]').count() === 0, 'paired chart is not repeated in the charts column');
    t.ok(await a.page.locator('.aa-col[data-col="charts"] .aa-card[data-id="m2"]').count() === 1, 'chart with no note stays in the charts column');
    t.ok(/No note was sent with this chart.*EF/.test(await a.page.textContent('.aa-card[data-id="m2"] .aa-nonote')), 'no-note chart warns and names who sent it');
    t.ok(await a.page.locator('.aa-card[data-id="n1"] .aa-nonote').count() === 0, 'a note card has no no-note warning');
    t.ok(await a.page.locator('.aa-chart-under .aa-ask').count() === 0, 'ask-the-vet line hidden at first');
    await a.page.click('.aa-chart-under[data-id="m1"] .aa-mismatch');
    const ask = await a.page.textContent('.aa-chart-under[data-id="m1"] .aa-ask');
    t.ok(/AB/.test(ask) && /CD/.test(ask), "Doesn't match names the note sender and the chart sender: " + ask);
    let q = ''; a.page.once('dialog', d => { q = d.message(); });
    await a.page.click('.aa-chart-under[data-id="m1"] .aa-done');
    await a.page.waitForTimeout(200);
    t.ok(/printed the medication chart for T-100/.test(q), 'Done under the note is the chart\'s own Done: ' + q);
  } finally { await a.browser.close(); }
  t.done();
})();
