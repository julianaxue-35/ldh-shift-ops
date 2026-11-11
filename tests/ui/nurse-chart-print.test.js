// A vet sends a medication chart (Excel) to the nurses to print: a task with the lines, and a Download button that fetches the file on click.
const { open } = require('./harness');
const t = require('./check')('nurse-chart-print');
const B64 = Buffer.from('PK-test-xlsx-bytes').toString('base64');
(async () => {
  const n = await open({ noga_requests: [{ id: 'req-chart-1', animal_id: 'CH-1', location: 'Pound 1 / 4', task: 'med_chart', note: 'Meloxicam 1 tablet SID 5 days\nGabapentin 100mg BID', added_by: 'JX', source_key: 'chart|c1', done: false }],
    nurse_chart_files: [{ request_id: 'req-chart-1', filename: 'CH-1_medication_chart.xlsx', xlsx_b64: B64 }] }, 'nurses.html');
  try {
    await n.page.waitForSelector('#med-labels-list .noga-item');
    const card = (await n.page.textContent('#med-labels-list .noga-item:has-text("CH-1")')).replace(/\s+/g, ' ');
    t.ok(/Medication chart to print/.test(card) && /Pound 1/.test(card) && /Pen 4/.test(card) && /requested by JX/.test(card) && /Gabapentin 100mg BID/.test(card), 'the nurse sees the animal, space, vet and the medication lines: ' + card.slice(0, 160));
    t.ok(await n.page.locator('#med-labels-list .noga-item:has-text("CH-1") .noga-chart-dl').count() === 1, 'a Download chart to print button');
    t.ok(await n.page.locator('#med-labels-list .noga-item:has-text("CH-1") .noga-copy').count() === 0, 'no Copy / Send-back buttons (it is a chart, not a label)');
    const dl = n.page.waitForEvent('download');
    await n.page.click('#med-labels-list .noga-item:has-text("CH-1") .noga-chart-dl');
    const d = await dl;
    t.ok(d.suggestedFilename() === 'CH-1_medication_chart.xlsx', 'the file downloads under its own name: ' + d.suggestedFilename());
    await n.page.fill('#initials-welfare', 'ab'); await n.page.dispatchEvent('#initials-welfare', 'change');
    await n.page.click('#med-labels-list .noga-item:has-text("CH-1") .noga-done');
    await n.page.waitForFunction(() => window.__db.noga_requests.find(r => r.animal_id === 'CH-1').done === true);
    t.ok(n.errors.length === 0, 'no page errors: ' + n.errors.join('; '));
  } finally { await n.browser.close(); }
  const v = await open({}, 'vets.html');
  try {
    await v.page.waitForSelector('#send-request .sc-panel[data-to="nurses"] [data-f="kind"] option', { state: 'attached' });
    const opts = await v.page.$$eval('#send-request .sc-panel[data-to="nurses"] [data-f="kind"] option', os => os.map(o => o.value));
    t.ok(!opts.includes('med_chart'), 'the vets\' own task form does not offer "Medication chart" as a task type');
  } finally { await v.browser.close(); }
  t.done();
})();
