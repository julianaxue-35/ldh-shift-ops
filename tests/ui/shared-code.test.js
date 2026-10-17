// 2026-10-17: one LDH access code for the shift tools and the dashboard. The tools store the code under
// ldh_sync_code_v1 / ldhGateOk_v2; the dashboard signs in silently with it, writes it on a manual sign-in,
// and clears both on sign-out. (Uses a dummy code — never a real one.)
const { open } = require('./harness');
const t = require('./check')('shared-code');
const FIXTURE = 'tests/ui/fixtures/ops-core-page.html';
const CREDS = { email: 'staff@ldh-shift-ops.local', password: 'dummy-test-code' };
const get = (page, k) => page.evaluate(k => localStorage.getItem(k), k);
const set = (page, k, v) => page.evaluate(([k, v]) => localStorage.setItem(k, v), [k, v]);

(async () => {
  /* ---------- code already stored by a shift tool -> no login box ---------- */
  let r = await open({}, FIXTURE, { loggedOut: true, loginCreds: CREDS });
  try {
    await set(r.page, 'ldh_sync_code_v1', CREDS.password);
    await set(r.page, 'ldhGateOk_v2', '1');
    await r.page.reload();
    await r.page.waitForFunction(() => window.__opsSession !== undefined);
    t.ok(await r.page.isVisible('#app'), 'a stored LDH code signs the dashboard in with no prompt');
    t.ok(!(await r.page.isVisible('#login-screen')), 'the login box never shows');

    /* sign-out clears the shared code (both keys) and the next load asks again */
    await r.page.evaluate(() => window.__opsSb.auth.signOut());
    t.ok(!(await get(r.page, 'ldh_sync_code_v1')) && !(await get(r.page, 'ldhGateOk_v2')), 'sign-out clears the stored code and the tools unlock flag');
    await r.page.reload();
    await r.page.waitForSelector('#login-screen', { state: 'visible' });
    t.ok(!(await r.page.isVisible('#app')), 'after sign-out the login box is shown again (no silent sign-in)');

    /* manual sign-in stores the code for the tools */
    await r.page.fill('#login-password', CREDS.password);
    await r.page.click('#login-submit');
    await r.page.waitForFunction(() => window.__opsSession !== undefined);
    t.ok((await get(r.page, 'ldh_sync_code_v1')) === CREDS.password && (await get(r.page, 'ldhGateOk_v2')) === '1', 'a manual sign-in stores the code so the shift tools do not ask');
    t.ok(r.errors.length === 0, 'no page errors: ' + JSON.stringify(r.errors));
  } finally { await r.browser.close(); }

  /* ---------- stored code that was changed on the server -> cleared, login box shown ---------- */
  r = await open({}, FIXTURE, { loggedOut: true, loginCreds: CREDS });
  try {
    await set(r.page, 'ldh_sync_code_v1', 'old-code');
    await set(r.page, 'ldhGateOk_v2', '1');
    await r.page.reload();
    await r.page.waitForSelector('#login-screen', { state: 'visible' });
    t.ok(!(await r.page.isVisible('#app')), 'a stale stored code does not sign in');
    t.ok(!(await get(r.page, 'ldh_sync_code_v1')) && !(await get(r.page, 'ldhGateOk_v2')), 'a refused stored code is cleared so the tools ask for the new one too');
  } finally { await r.browser.close(); }

  /* ---------- a different account never overwrites the shared code ---------- */
  r = await open({}, FIXTURE, { loggedOut: true, loginCreds: { email: 'other@example.com', password: 'other-pass' } });
  try {
    await r.page.click('#login-diff-account');
    await r.page.fill('#login-email', 'other@example.com');
    await r.page.fill('#login-password', 'other-pass');
    await r.page.click('#login-submit');
    await r.page.waitForFunction(() => window.__opsSession !== undefined);
    t.ok(!(await get(r.page, 'ldh_sync_code_v1')), 'signing in as a different account does not store a shared code');
  } finally { await r.browser.close(); }

  t.done();
})();
