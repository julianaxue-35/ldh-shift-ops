// The one request card on the Vets, Nurses and Behaviour pages: same field order as the staff page, same location list.
const { open } = require('./harness');
const t = require('./check')('send-card-pages');
async function labels(page, root) {
  return page.$$eval(root + ' .sc-panel:not([hidden]) .sc-form > label', ls => ls.filter(l => getComputedStyle(l).display !== 'none').map(l => l.firstChild.textContent.trim().replace(/ \(.*\)$/, '').replace(/ \*$/, '')));
}
(async () => {
  // Vets page: Nurses and Behaviour tabs
  let p = await open({}, 'vets.html');
  try {
    await p.page.waitForSelector('#send-request .sc-tab');
    t.ok(JSON.stringify(await p.page.$$eval('#send-request .sc-tab', bs => bs.map(b => b.textContent))) === '["Nurses","Behaviour"]', 'vets page: Nurses and Behaviour tabs');
    let l = await labels(p.page, '#send-request');
    t.ok(l[0] === 'What type of request?' && l[1] === 'Animal ID' && l[2] === 'Location / Space' && l[3] === 'Pen / Detail #' && /^Reason/.test(l[l.length - 1]), 'vets page, Nurses: What type of request?, Animal ID, Location / Space, Pen / Detail # ... Reason last: ' + l);
    await p.page.click('#send-request .sc-tab[data-sc="behaviour"]');
    l = await labels(p.page, '#send-request');
    t.ok(l.join() === 'What type of request?,Animal ID,Location / Space,Pen / Detail #,Needed within,Reason', 'vets page, Behaviour: same order as the staff page: ' + l);
    for (const to of ['nurses', 'behaviour']) t.ok((await p.page.$$eval('#send-request .sc-panel[data-to="' + to + '"] [data-f="room"] option', os => os.map(o => o.value))).includes('Vet clinic'), 'vets page ' + to + ': Vet clinic is a space');
    t.ok(p.errors.length === 0, 'vets page: no errors ' + p.errors.join('; '));
  } finally { await p.browser.close(); }
  // Nurses page: Vets and Behaviour tabs
  p = await open({}, 'nurses.html');
  try {
    await p.page.waitForSelector('#send-request .sc-tab');
    let l = await labels(p.page, '#send-request');
    t.ok(l.join() === 'What type of request?,Animal ID,Location / Space,Pen / Detail #,Needed within,Reason / note', 'nurses page, Vets: ' + l);
    await p.page.click('#send-request .sc-tab[data-sc="behaviour"]');
    l = await labels(p.page, '#send-request');
    t.ok(l.join() === 'What type of request?,Animal ID,Location / Space,Pen / Detail #,Needed within,Reason', 'nurses page, Behaviour: ' + l);
    t.ok((await p.page.$$eval('#send-request [data-f="room"] option', os => os.map(o => o.value))).includes('Vet clinic'), 'nurses page: Vet clinic is a space');
    t.ok(p.errors.length === 0, 'nurses page: no errors ' + p.errors.join('; '));
  } finally { await p.browser.close(); }
  t.done();
})();
