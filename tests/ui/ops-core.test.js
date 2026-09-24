// Tests lib/ops-core.js directly against a minimal fixture page
// (tests/ui/fixtures/ops-core-page.html), since it has no page of its own yet
// (Tasks 4-6 wire it into index.html/vets.html/nurses.html).
const { open } = require('./harness');
const t = require('./check')('ops-core');
const FIXTURE = 'tests/ui/fixtures/ops-core-page.html';

(async () => {
  const CREDS = { email: 'staff@ldh-shift-ops.local', password: 'goodpass' };
  const { browser, page, errors } = await open({}, FIXTURE, { loggedOut: true, loginCreds: CREDS });
  try {
    /* ---------- one-box login ---------- */
    await page.waitForSelector('#login-screen');
    t.ok(await page.isVisible('#login-screen'), 'login screen shown when there is no session');
    t.ok(!(await page.isVisible('#app')), 'app content hidden before sign-in');
    t.ok((await page.getAttribute('#login-password', 'placeholder')) === 'Staff password', 'one box: password field labelled "Staff password"');
    t.ok(!(await page.isVisible('#login-email')), 'one box: no email field shown up front');

    // wrong password -> rejected, screen stays up
    await page.fill('#login-password', 'wrong-password');
    await page.click('#login-submit');
    await page.waitForFunction(() => document.getElementById('login-error').style.display === 'block');
    t.ok((await page.textContent('#login-error')).length > 0, 'wrong password shows an error');
    t.ok(await page.isVisible('#login-screen'), 'login screen still shown after a wrong password');
    t.ok(!(await page.isVisible('#app')), 'still not signed in after a wrong password');

    // "Use a different account" reveals the email field
    t.ok(!(await page.isVisible('#login-email')), 'email field hidden before the link is used');
    await page.click('#login-diff-account');
    t.ok(await page.isVisible('#login-email'), '"Use a different account" reveals the email field');

    // correct credentials -> signs in
    await page.fill('#login-email', CREDS.email);
    await page.fill('#login-password', CREDS.password);
    await page.click('#login-submit');
    await page.waitForFunction(() => window.__opsSession !== undefined);
    t.ok(!!(await page.evaluate(() => window.__opsSession)), 'correct staff password signs in (session resolved)');
    t.ok(!(await page.isVisible('#login-screen')), 'login screen hidden after sign-in');
    t.ok(await page.isVisible('#app'), 'app content shown after sign-in');

    /* ---------- OpsCore.navHTML ---------- */
    const navVets = await page.evaluate(() => OpsCore.navHTML('vets'));
    t.ok(/class="oc-nav-link active"[^>]*>Vets</.test(navVets), 'navHTML marks the current page active');
    t.ok(!/class="oc-nav-link active"[^>]*>Shelter staff</.test(navVets), 'navHTML does not mark other pages active');
    const navSlot = await page.textContent('#ops-nav');
    t.ok(navSlot.includes('Vets'), 'init() auto-fills a #ops-nav slot using the page passed to init()');
    const activeInSlot = await page.locator('#ops-nav a.active').textContent();
    t.ok(activeInSlot === 'Vets', 'the auto-filled nav marks the init({page}) value current');

    /* ---------- OpsCore.esc ---------- */
    const escaped = await page.evaluate(() => OpsCore.esc('<b>"A" & \'B\'</b>'));
    t.ok(escaped === '&lt;b&gt;&quot;A&quot; &amp; &#39;B&#39;&lt;/b&gt;', 'esc() escapes & < > " \'');

    /* ---------- OpsCore.requirePasscode: wrong code stays open ---------- */
    await page.evaluate(() => { window.__passResult = undefined; OpsCore.requirePasscode('vet', 'pick up cases').then(r => { window.__passResult = r; }); });
    await page.waitForSelector('.oc-modal-overlay');
    t.ok((await page.textContent('.oc-modal-text')) === 'Enter the vet passcode to pick up cases.', 'passcode modal shows the role and reason');
    t.ok(!(await page.isVisible('.oc-modal-error')), 'no error shown before a submit attempt');

    await page.fill('.oc-modal-input', 'not-the-code');
    await page.click('.oc-modal-submit');
    await page.waitForFunction(() => document.querySelector('.oc-modal-error') && getComputedStyle(document.querySelector('.oc-modal-error')).display !== 'none');
    t.ok((await page.textContent('.oc-modal-error')) === 'Wrong passcode', 'wrong code shows "Wrong passcode"');
    t.ok(await page.locator('.oc-modal-overlay').count() === 1, 'modal stays open after a wrong code');
    t.ok((await page.evaluate(() => window.__passResult)) === undefined, 'requirePasscode has not resolved yet');

    /* ---------- right code unlocks ---------- */
    await page.fill('.oc-modal-input', 'vet2026');
    await page.click('.oc-modal-submit');
    await page.waitForFunction(() => window.__passResult !== undefined);
    t.ok((await page.evaluate(() => window.__passResult)) === true, 'right code resolves true');
    t.ok(await page.locator('.oc-modal-overlay').count() === 0, 'modal closes on the right code');
    t.ok((await page.evaluate(() => { try { return sessionStorage.getItem('ldh_pass_vet'); } catch (e) { return null; } })) === '1', 'unlock is remembered in sessionStorage (ldh_pass_vet)');

    // second call in the same tab does not prompt again
    const secondCall = await page.evaluate(() => OpsCore.requirePasscode('vet', 'pick up more cases'));
    t.ok(secondCall === true, 'second call for the same role resolves true without asking again');
    t.ok(await page.locator('.oc-modal-overlay').count() === 0, 'no modal shown on the already-unlocked role');

    /* ---------- cancel resolves false (different, still-locked role) ---------- */
    await page.evaluate(() => { window.__passResult2 = undefined; OpsCore.requirePasscode('nurse', 'delete a note').then(r => { window.__passResult2 = r; }); });
    await page.waitForSelector('.oc-modal-overlay');
    t.ok((await page.textContent('.oc-modal-text')) === 'Enter the nurse passcode to delete a note.', 'a different role gets its own gate (not unlocked by the vet code)');
    await page.click('.oc-modal-cancel');
    await page.waitForFunction(() => window.__passResult2 !== undefined);
    t.ok((await page.evaluate(() => window.__passResult2)) === false, 'Cancel resolves false');
    t.ok(await page.locator('.oc-modal-overlay').count() === 0, 'modal closes on Cancel');
    t.ok((await page.evaluate(() => { try { return sessionStorage.getItem('ldh_pass_nurse'); } catch (e) { return null; } })) !== '1', 'a cancelled attempt is not remembered');

    t.ok(errors.length === 0, 'no page errors: ' + errors.join('; '));
  } finally {
    await browser.close();
  }
  t.done();
})();
