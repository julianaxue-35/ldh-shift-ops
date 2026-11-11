// A staff member attaches a phone photo to a flag; the vets open it with a Photo button; it is deleted when the case is finished.
const { open } = require('./harness');
const t = require('./check')('flag-photo');
// a real 2x2 PNG so the browser can decode and shrink it
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8Dwn4GBgYGJAQoAHhgCAh6X4CYAAAAASUVORK5CYII=', 'base64');
(async () => {
  const s = await open({}, 'index.html');
  try {
    const dialogs = []; s.page.on('dialog', d => dialogs.push(d.message()));
    await s.page.waitForSelector('#req-photo-btn');
    t.ok(await s.page.locator('#req-photo-preview').isHidden(), 'no photo to start with');
    await s.page.setInputFiles('#req-photo', { name: 'cat.png', mimeType: 'image/png', buffer: PNG });
    await s.page.waitForSelector('#req-photo-preview', { state: 'visible' });
    t.ok(true, 'the photo is shown as a small preview with a Remove button');
    await s.page.click('#req-photo-remove');
    t.ok(await s.page.locator('#req-photo-preview').isHidden(), 'Remove clears the photo');
    // litter + photo is refused
    await s.page.setInputFiles('#req-photo', { name: 'cat.png', mimeType: 'image/png', buffer: PNG });
    await s.page.waitForSelector('#req-photo-preview', { state: 'visible' });
    await s.page.fill('#req-title', '1170123 - 1170125'); await s.page.click('#req-submit'); await s.page.waitForTimeout(300);
    t.ok(dialogs.some(d => /only go with one animal/.test(d)) && (await s.db()).tasks.length === 0, 'a photo with several animals is refused, nothing saved: ' + dialogs.join(' | '));
    // one animal + photo
    await s.page.fill('#req-title', 'PH-100'); await s.page.fill('#req-problem', 'limping on front-left leg');
    await s.page.click('#req-submit'); await s.page.waitForFunction(() => window.__db.tasks.length === 1, null, { timeout: 5000 });
    const row = (await s.db()).tasks[0];
    const store = await s.page.evaluate(() => window.__storage);
    const keys = Object.keys(store);
    t.ok(/\.jpg$/.test(row.photo_path || '') && keys.length === 1 && keys[0] === 'flag-photos/' + row.photo_path, 'the task points at the uploaded file: ' + row.photo_path);
    t.ok(store[keys[0]].type === 'image/jpeg' && store[keys[0]].size > 0, 'it is stored as a JPEG');
    t.ok(await s.page.locator('#req-photo-preview').isHidden(), 'the form is cleared after sending');
    // storage down: she is asked, and the flag still goes without the photo
    await s.page.evaluate(() => { window.__storageFail = true; });
    await s.page.setInputFiles('#req-photo', { name: 'cat.png', mimeType: 'image/png', buffer: PNG });
    await s.page.waitForSelector('#req-photo-preview', { state: 'visible' });
    await s.page.fill('#req-title', 'PH-101'); await s.page.fill('#req-problem', 'sneezing');
    await s.page.click('#req-submit'); await s.page.waitForFunction(() => window.__db.tasks.length === 2, null, { timeout: 5000 });
    const r2 = (await s.db()).tasks.find(x => x.title === 'PH-101');
    t.ok(!r2.photo_path && dialogs.some(d => /could not be uploaded/.test(d)), 'a failed upload asks to send without the photo, and the flag is saved without one');
    t.ok(s.errors.length === 0, 'no page errors: ' + s.errors.join('; '));
  } finally { await s.browser.close(); }

  const v = await open({ tasks: [
    { title: 'PH-1', location: 'Pound 1 / 2', shift: 'sick_injured', type: 'shelter', urgency: 'routine', red_flags: [], conditions: [], problem: 'limping', done: false, photo_path: 'p1.jpg' },
    { title: 'OLD-1', location: 'Pound 1 / 3', shift: 'sick_injured', type: 'shelter', urgency: 'routine', red_flags: [], conditions: [], problem: 'x', done: true, completed_at: new Date().toISOString(), photo_path: 'old.jpg' }
  ] }, 'vets.html');
  try {
    await v.page.evaluate(() => { window.__storage['flag-photos/p1.jpg'] = { size: 100, type: 'image/jpeg' }; window.__storage['flag-photos/old.jpg'] = { size: 100, type: 'image/jpeg' }; });
    await v.page.waitForSelector('.attn-item[data-id] .photo-btn');
    t.ok(await v.page.locator('.photo-btn').count() === 1, 'the open case shows a Photo button (the finished one does not)');
    await v.page.waitForFunction(() => window.__db.tasks.find(x => x.title === 'OLD-1').photo_path == null, null, { timeout: 5000 });
    t.ok(true, 'a photo reference left on an already-finished case is cleared on load (the sweep)');
    await v.page.click('.photo-btn');
    await v.page.waitForSelector('.oc-photo-overlay img');
    t.ok(true, 'Photo opens the picture full screen'); await v.page.click('.oc-photo-overlay');
    t.ok(await v.page.locator('.oc-photo-overlay').count() === 0, 'tap closes it');
    // pick it up, then DONE
    await v.page.click('.attn-item:has-text("PH-1") .pick-up-btn').catch(() => {});
    await v.page.evaluate(() => { const r = window.__db.tasks.find(x => x.title === 'PH-1'); r.claimed_at = new Date().toISOString(); r.claimed_by = 'JX'; });
    await v.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await v.page.waitForSelector('.attn-item:has-text("PH-1") .done-btn', { timeout: 8000 }).catch(() => {});
    if (await v.page.locator('.attn-item:has-text("PH-1") .done-btn').count()) {
      await v.page.click('.attn-item:has-text("PH-1") .done-btn'); await v.page.click('.done-confirm');
      await v.page.waitForFunction(() => window.__db.tasks.find(x => x.title === 'PH-1').done === true, null, { timeout: 5000 });
      await v.page.waitForFunction(() => window.__db.tasks.find(x => x.title === 'PH-1').photo_path == null, null, { timeout: 5000 });
      t.ok(!(await v.page.evaluate(() => Object.keys(window.__storage).includes('flag-photos/p1.jpg'))), 'DONE deletes the photo file and clears photo_path (the task row stays)');
    } else t.ok(false, 'could not reach the DONE button in this harness');
    t.ok(v.errors.length === 0, 'no page errors: ' + v.errors.join('; '));
  } finally { await v.browser.close(); }
  t.done();
})();
