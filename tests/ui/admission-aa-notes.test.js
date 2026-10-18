// Admission AA page: note cards (view, copy, Word download), "updated" marker, alert on update.
const { open } = require('./harness');
const t = require('./check')('admission-aa-notes');
const H = 3600 * 1000;
const ago = ms => new Date(Date.now() - ms).toISOString();
const DOCX = Buffer.from('PK-fake-docx-bytes').toString('base64');

(async () => {
  const seed = { aa_items: [
    { id: 'n1', kind: 'processing_note', animal_ids: ['T-100'], sent_by: 'AB', sent_at: ago(2 * H), payload: { text: 'Exam normal.\nWeight 12 kg.', docx_b64: DOCX, location: 'Pound 1' } },
    { id: 'n2', kind: 'processing_note', animal_ids: ['T-200'], sent_by: 'AB', sent_at: ago(3 * H), updated_at: ago(10 * 60 * 1000), payload: { text: '<img src=x onerror=window.__pwned=1>' } },
    { id: 'm1', kind: 'med_chart', animal_ids: ['T-300'], sent_by: 'CD', sent_at: ago(1 * H), payload: { lines: ['Drug A 1 tablet BID x 5 days', 'Drug B 0.5 mL SID x 3 days'] } }
  ] };
  const a = await open(seed, 'admission-aa.html');
  try {
    const n1 = await a.page.textContent('.aa-card[data-id="n1"]');
    t.ok(/T-100/.test(n1) && /Processing notes/.test(n1) && /Pound 1/.test(n1), 'note card shows ID, type and location');
    t.ok(await a.page.isHidden('.aa-card[data-id="n1"] .aa-notes'), 'notes are collapsed until View is pressed');
    await a.page.click('.aa-card[data-id="n1"] .aa-view');
    t.ok(/Exam normal\.\s*Weight 12 kg\./.test(await a.page.textContent('.aa-card[data-id="n1"] .aa-notes')), 'View shows the note text');
    t.ok(await a.page.locator('.aa-card[data-id="n2"] .aa-docx').count() === 0, 'no Download Word button when the tool sent no Word file');

    const dl = a.page.waitForEvent('download');
    await a.page.click('.aa-card[data-id="n1"] .aa-docx');
    const d = await dl;
    t.ok(d.suggestedFilename() === 'T-100_notes.docx', 'download is named after the animal: ' + d.suggestedFilename());
    const bytes = require('fs').readFileSync(await d.path());
    t.ok(bytes.toString() === 'PK-fake-docx-bytes', 'downloaded bytes are the decoded Word file');

    await a.page.evaluate(() => { navigator.clipboard.writeText = async (s) => { window.__copied = s; }; });
    await a.page.click('.aa-card[data-id="n1"] .aa-copy');
    t.ok(await a.page.evaluate(() => window.__copied) === 'Exam normal.\nWeight 12 kg.', 'Copy puts the exact note text on the clipboard');

    t.ok(/updated/i.test(await a.page.textContent('.aa-card[data-id="n2"]')), 'an updated card says so');
    t.ok(!/updated/i.test(n1), 'a never-updated card does not');
    await a.page.click('.aa-card[data-id="n2"] .aa-view');
    t.ok(await a.page.evaluate(() => window.__pwned === undefined), 'hostile note text is shown as text, not executed');
    const m1 = await a.page.textContent('.aa-card[data-id="m1"]');
    t.ok(/Drug A 1 tablet BID x 5 days/.test(m1) && /Drug B 0.5 mL SID x 3 days/.test(m1), 'medication chart lines are listed on the card');

    t.ok(await a.page.isHidden('#new-item-banner'), 'no banner for what was already there on load');
    await a.page.evaluate(() => sb.from('aa_items').update({ updated_at: new Date().toISOString(), payload: { text: 'Exam normal.\nWeight 12.5 kg.' } }).eq('id', 'n1'));
    await a.page.waitForSelector('#new-item-banner', { state: 'visible', timeout: 5000 });
    t.ok(/1 new item/.test(await a.page.textContent('#new-item-banner-text')), 'an updated card raises the banner');
    t.ok(a.errors.length === 0, 'no page errors: ' + a.errors.join('; '));
  } finally { await a.browser.close(); }
  t.done();
})();
