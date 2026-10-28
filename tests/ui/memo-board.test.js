// Memo board: "Tick all off" after the clinic meeting, and the shared next-meeting date (Vets + Nurses pages).
const { open } = require('./harness');
const t = require('./check')('memo-board');

(async () => {
  for (const page of ['vets.html', 'nurses.html']) {
    const L = page + ': ';
    const v = await open({ memos: [
      { text: 'Memo one', author: 'Vet team', done: false }, { text: 'Memo two', author: 'Nurse team', done: false }, { text: 'Old memo', author: 'Vet team', done: true, done_at: new Date().toISOString() }
    ] }, page);
    try {
      const M = '#memo-board ';
      await v.page.waitForSelector(M + '[data-tick-all]');
      t.ok(/not set/.test(await v.page.textContent(M + '[data-md]')), L + 'the meeting date starts as not set');
      t.ok(/Tick all 2 off/.test(await v.page.textContent(M + '[data-tick-all]')), L + 'Tick all counts the open memos only');

      await v.page.click(M + '[data-md-edit]');
      await v.page.fill(M + '[data-md-input]', '2030-03-05');
      await v.page.click(M + '[data-md-save]');
      await v.page.waitForFunction(() => window.__db.clinic_meeting.length === 1);
      t.ok((await v.db()).clinic_meeting[0].next_date === '2030-03-05', L + 'the date is saved in the shared row');
      t.ok(/Tue,? 5 Mar 2030/.test(await v.page.textContent(M + '[data-md]')), L + 'it shows as a readable date: ' + await v.page.textContent(M + '[data-md]'));
      t.ok((await v.page.textContent(M + '[data-md-note]')) === '', L + 'no "passed" warning for a future date');

      await v.page.click(M + '[data-md-edit]');
      await v.page.fill(M + '[data-md-input]', '2020-01-07');
      await v.page.click(M + '[data-md-save]');
      await v.page.waitForFunction(() => /passed/.test(document.querySelector('#memo-board [data-md-note]').textContent));
      t.ok(true, L + 'a date that has passed says to set the next one');

      await v.page.click(M + '[data-tick-all]');
      await v.page.waitForFunction(() => window.__db.memos.every(m => m.done));
      const memos = (await v.db()).memos;
      t.ok(memos.every(m => m.done && m.done_at), L + 'Tick all off marks every open memo done');
      t.ok(await v.page.locator(M + '[data-tick-all]').isHidden(), L + 'the button hides when nothing is open');
      t.ok(/Show completed \(3\)/.test(await v.page.textContent(M + '#memo-completed-toggle')), L + 'they are kept under completed');
      t.ok(v.errors.length === 0, L + 'no page errors: ' + JSON.stringify(v.errors));
    } finally { await v.browser.close(); }
  }
  t.done();
})();
