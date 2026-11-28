// 2026-11-28: Resources page lists documents by name; opening one shows it, sealed off from the dashboard. Fictional document.
const { open } = require('./harness');
const t = require('./check')('resources');
const body = '<!doctype html><button id="b" onclick="this.textContent=\'pressed\'">press</button><p id="x"></p><script>try{parent.document.title;document.getElementById("x").textContent="REACHED PARENT"}catch(e){document.getElementById("x").textContent="sealed"}</script>';
(async () => {
  const o = await open({ resources: [{ slug: 'doc-a', title: 'Pretend decision file', body, sort: 1 }] }, 'resources.html'); const p = o.page;
  try {
    t.ok((await p.textContent('#doc-list')).includes('Pretend decision file') && !(await p.isVisible('#frame')), 'only the name is shown at first');
    t.ok(await p.locator('#ops-nav a', { hasText: 'Resources' }).count() === 1, 'Resources is in the menu');
    await p.click('#doc-list .doc'); await p.waitForTimeout(500);
    const f = p.frameLocator('#frame');
    await f.locator('#b').click();
    t.ok((await f.locator('#b').textContent()) === 'pressed', 'clicking the name opens it and its buttons work');
    t.ok((await f.locator('#x').textContent()) === 'sealed', 'the document cannot reach the dashboard');
    await p.click('#back'); await p.waitForTimeout(300);
    t.ok(await p.isVisible('#doc-list .doc') && !(await p.isVisible('#frame')), 'and back to the list');
    t.ok(!(await p.locator('#oc-role-gate').count()), 'no extra passcode');
    t.ok(!o.errors.length, 'no page errors ' + o.errors.join('; '));
  } finally { await o.browser.close(); }
  t.done();
})().catch(e => { console.log('FAIL ' + String(e.message).slice(0, 300)); process.exit(1); });
