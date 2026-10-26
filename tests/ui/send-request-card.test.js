const { open } = require('./harness');
const t = require('./check')('send-request-card');
(async () => {
  const s = await open({}, 'index.html');
  try {
    await s.page.waitForSelector('#send-request');
    t.ok(await s.page.locator('#send-request .sr-panel:visible').count() === 1 && await s.page.isVisible('#req-submit'), 'opens on Vets with only that form showing');
    const labels = {};
    for (const to of ['vets', 'nurses', 'behaviour']) {
      await s.page.click('.sr-tab[data-sr="' + to + '"]');
      t.ok(await s.page.locator('#send-request .sr-panel:visible').count() === 1, to + ': only its own form shows');
      labels[to] = await s.page.$$eval('.sr-panel[data-to="' + to + '"] .sr-form > label', ls => ls.map(l => l.firstChild.textContent.trim().replace(/ \(.*\)$/, '')));
    }
    t.ok(Object.values(labels).every(l => l[0] === 'What type of request?'), 'every form starts with What: ' + JSON.stringify(labels));
    t.ok(Object.values(labels).every(l => l.includes('Needed within') && l.includes('Location / Space')), 'every form has Space and Needed within');
    t.ok(/^Reason/.test(labels.vets[labels.vets.length - 1]) && /^Reason/.test(labels.nurses[labels.nurses.length - 1]) && /^Reason/.test(labels.behaviour[labels.behaviour.length - 1]), 'every form ends with the reason / note');
    // Vet clinic is a place for every request, and asks for a detail (ward) instead of a pen
    for (const id of ['req-location', 'nr-location', 'bk-room']) t.ok((await s.page.$$eval('#' + id + ' option', os => os.map(o => o.value))).includes('Vet clinic'), id + ' offers Vet clinic');
    await s.page.click('.sr-tab[data-sr="vets"]');
    await s.page.selectOption('#req-location', 'Vet clinic');
    t.ok(await s.page.isVisible('#req-location-detail') && !(await s.page.isVisible('#req-pen')), 'Vet clinic asks for a detail, not a pen');
    await s.page.click('.sr-tab[data-sr="behaviour"]');
    await s.page.fill('#sr-initials', 'ab'); await s.page.dispatchEvent('#sr-initials', 'change');
    await s.page.fill('#bk-animal', 'BEH-9'); await s.page.selectOption('#bk-kind', 'courthold');
    await s.page.selectOption('#bk-room', 'Vet clinic'); await s.page.fill('#bk-pen', 'ward 2');
    await s.page.click('#bk-submit');
    await s.page.waitForFunction(() => window.__db.behaviour_tasks.length === 1);
    t.ok((await s.db()).behaviour_tasks[0].location === 'Vet clinic — ward 2', 'behaviour request from the Vet clinic keeps the ward: ' + (await s.db()).behaviour_tasks[0].location);
    t.ok(s.errors.length === 0, 'no page errors: ' + s.errors.join('; '));
  } finally { await s.browser.close(); }
  t.done();
})();
