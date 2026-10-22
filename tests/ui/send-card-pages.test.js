// The one request card on the Vets, Nurses and Behaviour pages: same field order as the staff page, same location list.
const { open } = require('./harness');
const t = require('./check')('send-card-pages');
async function labels(page, root) {
  return page.$$eval(root + ' .sc-panel:not([hidden]) .sc-form > label', ls => ls.filter(l => getComputedStyle(l).display !== 'none').map(l => l.firstChild.textContent.trim().replace(/ \(.*\)$/, '')));
}
(async () => {
  // Vets page: Nurses and Behaviour tabs
  let p = await open({}, 'vets.html');
  try {
    await p.page.waitForSelector('#send-request .sc-tab');
    t.ok(JSON.stringify(await p.page.$$eval('#send-request .sc-tab', bs => bs.map(b => b.textContent))) === '["Nurses","Behaviour"]', 'vets page: Nurses and Behaviour tabs');
    let l = await labels(p.page, '#send-request');
    t.ok(l[0] === 'What' && l[1] === 'Animal ID' && l[2] === 'Space' && l[3] === 'Pen / detail' && /^Reason/.test(l[l.length - 1]), 'vets page, Nurses: What, Animal ID, Space, Pen / detail ... Reason last: ' + l);
    t.ok(/Dispense medication/.test(await p.page.textContent('#send-request .sc-panel[data-to="nurses"] [data-f="kind"] option:first-child')) && /dispense medication/i.test(await p.page.textContent('#send-request .sc-panel[data-to="nurses"] .sc-lead')), 'vets page, Nurses: dispensing medication / a treatment course is the first choice and is named in the card');
    await p.page.click('#send-request .sc-tab[data-sc="behaviour"]');
    l = await labels(p.page, '#send-request');
    t.ok(l.join() === 'What,Animal ID,Space,Pen / detail,Needed within,Reason', 'vets page, Behaviour: same order as the staff page: ' + l);
    for (const to of ['nurses', 'behaviour']) t.ok((await p.page.$$eval('#send-request .sc-panel[data-to="' + to + '"] [data-f="room"] option', os => os.map(o => o.value))).includes('Vet clinic'), 'vets page ' + to + ': Vet clinic is a space');
    t.ok(p.errors.length === 0, 'vets page: no errors ' + p.errors.join('; '));
  } finally { await p.browser.close(); }
  // Nurses page: Vets and Behaviour tabs
  p = await open({}, 'nurses.html');
  try {
    await p.page.waitForSelector('.send-card-open'); await p.page.click('#processing-col .send-card-open');
    let l = await labels(p.page, '.sc-overlay');
    t.ok(l.join() === 'What,Animal ID,Space,Pen / detail,Needed within,Reason / note', 'nurses page, Vets: ' + l);
    await p.page.click('.sc-overlay .sc-tab[data-sc="behaviour"]');
    l = await labels(p.page, '.sc-overlay');
    t.ok(l.join() === 'What,Animal ID,Space,Pen / detail,Needed within,Reason', 'nurses page, Behaviour: ' + l);
    t.ok((await p.page.$$eval('.sc-overlay [data-f="room"] option', os => os.map(o => o.value))).includes('Vet clinic'), 'nurses page: Vet clinic is a space');
    await p.page.click('.sc-modal-x'); t.ok(await p.page.locator('.sc-overlay').count() === 0, 'the window closes with the cross');
    t.ok(p.errors.length === 0, 'nurses page: no errors ' + p.errors.join('; '));
  } finally { await p.browser.close(); }
  t.done();
})();
