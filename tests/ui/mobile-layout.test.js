// Every dashboard page on phones and tablets: nothing runs off the side, fields don't trigger the iPhone zoom, links are finger-sized.
const { open } = require('./harness');
const { LOCATION_ROWS } = require('./fixtures');
const t = require('./check')('mobile-layout');
const ago = ms => new Date(Date.now() - ms).toISOString(), H = 3600e3;
const mk = (title, urgency, extra) => Object.assign({ title, location: 'Pound 1', shift: 'sick_injured', type: 'shelter', urgency, done: false, created_at: ago(H) }, extra || {});
const seed = {
  locations: LOCATION_ROWS,
  tasks: [mk('E-1', 'red_flag'), mk('U-1', 'urgent', { note: 'a long note about the animal that goes on and on to test wrapping of text in cards' }), mk('R-1', 'routine'), mk('P-1', 'routine', { shift: 'processing', location: 'Cat Room 1' })],
  aa_items: [{ kind: 'processing_note', animal_ids: ['P-1'], sent_by: 'AB', sent_at: ago(H), payload: { text: 'x\ny', priority: true } }, { kind: 'vaccination', animal_ids: ['V-1', 'V-2'], sent_by: 'CD', sent_at: ago(2 * H), payload: { vaccine: 'F3' } }]
};
const pages = ['index.html', 'vets.html', 'nurses.html', 'admission-aa.html', 'shelter-board.html', 'stats.html'];
const sizes = [[360, 740], [390, 844], [768, 1024], [1024, 768]];
(async () => {
  for (const pg of pages) {
    const o = await open(seed, pg, { contextOptions: { hasTouch: true, isMobile: true } });
    for (const [w, h] of sizes) {
      await o.page.setViewportSize({ width: w, height: h }); await o.page.waitForTimeout(250);
      const r = await o.page.evaluate(() => {
        const bad = [];
        document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file]), select, textarea').forEach(e => { if (e.offsetParent && parseFloat(getComputedStyle(e).fontSize) < 16) bad.push(e.id || e.tagName); });
        const links = [];
        document.querySelectorAll('.oc-nav-link, aside a').forEach(e => { if (e.offsetParent && e.getBoundingClientRect().height < 40) links.push((e.textContent || '').trim().slice(0, 20)); });
        return { over: document.documentElement.scrollWidth - innerWidth, bad, links };
      });
      t.ok(r.over <= 0, pg + ' @' + w + 'px: nothing runs off the side (' + r.over + 'px over)');
      t.ok(r.bad.length === 0, pg + ' @' + w + 'px: entry fields use 16px text: ' + r.bad.join(','));
      t.ok(r.links.length === 0, pg + ' @' + w + 'px: navigation links are finger-sized: ' + r.links.join(','));
    }
    t.ok(o.errors.length === 0, pg + ': no page errors ' + o.errors.join(';'));
    await o.browser.close();
  }
  t.done();
})();
