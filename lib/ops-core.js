/* LDH Shift Ops — shared browser core (login, Supabase client, escaping,
   realtime, passcode gate, nav).
   Browser: global OpsCore. Node: module.exports (definitions only — the
   DOM/window/sessionStorage calls only run when its functions are invoked
   from a browser page, same convention as lib/ldh-logic.js). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OpsCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const SUPABASE_URL = 'https://yeazfafvylawwgoxlhbl.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_fow5B_VGO3gKPf4BaULsOQ_ZiSH8q8Y';
  // Shared staff account. Not a secret — the password is what gates access.
  const STAFF_EMAIL = 'staff@ldh-shift-ops.local';

  const NAV_LINKS = [
    { key: 'staff', href: 'index.html', label: 'Shelter staff' },
    { key: 'vets', href: 'vets.html', label: 'Vets' },
    { key: 'nurses', href: 'nurses.html', label: 'Nurses' },
    { key: 'stats', href: 'stats.html', label: 'Stats' }
  ];

  let SB = null;          // set by init(); requirePasscode()/subscribe() use it
  let stylesInjected = false;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function getPassFlag(role) {
    try { return sessionStorage.getItem('ldh_pass_' + role) === '1'; } catch (e) { return false; }
  }
  function setPassFlag(role) {
    try { sessionStorage.setItem('ldh_pass_' + role, '1'); } catch (e) { /* ignore: unlock just won't persist this tab */ }
  }

  function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    const css = `
      #login-screen.oc-login-screen { min-height: 100vh; display: flex; align-items: center; justify-content: center; }
      .oc-login-card {
        background: var(--card-bg, #fff); border-radius: 14px; border: 1px solid var(--border, rgba(30,34,56,0.10));
        box-shadow: var(--shadow-card, 0 2px 6px rgba(30,34,56,0.06)); padding: 32px; width: 320px;
      }
      .oc-login-card h1 { font-size: 1.2rem; margin: 0 0 6px; }
      .oc-login-card p { font-size: 0.85rem; color: var(--muted, #6B7280); margin: 0 0 20px; }
      .oc-login-error { color: var(--critical, #D03B3B); font-size: 0.82rem; margin: -6px 0 10px; display: none; }
      .oc-login-card input {
        border: 1px solid var(--border, rgba(30,34,56,0.10)); border-radius: 12px; padding: 10px 14px;
        background: var(--card-bg, #fff); font: inherit; font-size: 0.9rem; color: var(--ink, #1E2238); width: 100%; margin-bottom: 10px;
        box-sizing: border-box;
      }
      .oc-login-card button {
        border: none; border-radius: 12px; padding: 10px 18px; background: var(--amber, #FF9F43); color: var(--ink, #1E2238);
        font: inherit; font-size: 0.85rem; font-weight: 700; cursor: pointer; width: 100%;
      }
      .oc-login-link { display: inline-block; margin-top: 14px; font-size: 0.78rem; color: var(--muted, #6B7280); cursor: pointer; text-decoration: underline; }
      #login-email-wrap.oc-hidden { display: none; }

      .oc-modal-overlay {
        position: fixed; inset: 0; background: rgba(30,34,56,0.45); display: flex;
        align-items: center; justify-content: center; z-index: 9999;
      }
      .oc-modal {
        background: var(--card-bg, #fff); border-radius: 14px; padding: 24px; width: 300px;
        box-shadow: var(--shadow-card, 0 2px 6px rgba(30,34,56,0.06));
      }
      .oc-modal-text { font-size: 0.88rem; margin: 0 0 12px; color: var(--ink, #1E2238); }
      .oc-modal-error { color: var(--critical, #D03B3B); font-size: 0.82rem; margin: -4px 0 10px; display: none; }
      .oc-modal-input {
        border: 1px solid var(--border, rgba(30,34,56,0.10)); border-radius: 12px; padding: 10px 14px;
        background: var(--card-bg, #fff); font: inherit; font-size: 0.9rem; width: 100%; margin-bottom: 12px; box-sizing: border-box;
      }
      .oc-modal-actions { display: flex; gap: 8px; }
      .oc-modal-actions button {
        flex: 1; border: none; border-radius: 12px; padding: 9px 12px; font: inherit; font-size: 0.82rem;
        font-weight: 700; cursor: pointer;
      }
      .oc-modal-submit { background: var(--amber, #FF9F43); color: var(--ink, #1E2238); }
      .oc-modal-cancel { background: var(--card-bg, #fff); border: 1px solid var(--border, rgba(30,34,56,0.10)) !important; color: var(--ink, #1E2238); }

      .oc-nav-link { display: block; padding: 8px 0; font-size: 0.85rem; color: var(--sidebar-text-muted, #9BA0BC); text-decoration: none; }
      .oc-nav-link.active { color: #fff; font-weight: 700; }
    `;
    const styleEl = document.createElement('style');
    styleEl.setAttribute('data-opscore', '1');
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  }

  // Builds the one-box login screen if the page doesn't already have one,
  // and wires it up. Returns the elements it will use.
  function ensureLoginDom() {
    injectStyles();
    let screen = document.getElementById('login-screen');
    if (!screen) {
      screen = document.createElement('div');
      screen.id = 'login-screen';
      screen.className = 'oc-login-screen';
      screen.innerHTML = `
        <div id="login-card" class="oc-login-card">
          <h1>LDH Shift Ops</h1>
          <p>Sign in with the shared staff account to continue.</p>
          <p id="login-error" class="oc-login-error"></p>
          <input id="login-password" type="password" placeholder="Staff password" autocomplete="current-password">
          <div id="login-email-wrap" class="oc-hidden">
            <input id="login-email" type="email" placeholder="Email" autocomplete="username">
          </div>
          <button id="login-submit" type="button">Sign in</button>
          <a id="login-diff-account" class="oc-login-link" href="#">Use a different account</a>
        </div>`;
      document.body.appendChild(screen);
    } else {
      screen.classList.add('oc-login-screen');
    }
    screen.style.display = 'none';
    return {
      screen,
      errorEl: document.getElementById('login-error'),
      passwordEl: document.getElementById('login-password'),
      emailEl: document.getElementById('login-email'),
      emailWrap: document.getElementById('login-email-wrap'),
      submitBtn: document.getElementById('login-submit'),
      diffLink: document.getElementById('login-diff-account')
    };
  }

  function init(opts) {
    opts = opts || {};
    const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    SB = sb;

    return new Promise((resolve) => {
      const dom = ensureLoginDom();

      function showLogin() { dom.screen.style.display = 'flex'; }
      function hideLogin() { dom.screen.style.display = 'none'; }

      function finish(session) {
        hideLogin();
        resolve({ sb, session });
        const navSlot = document.getElementById('ops-nav');
        if (navSlot) navSlot.innerHTML = navHTML(opts.page);
      }

      dom.diffLink.addEventListener('click', (e) => {
        e.preventDefault();
        dom.emailWrap.classList.toggle('oc-hidden');
      });

      async function attemptSignIn() {
        const password = dom.passwordEl.value;
        dom.errorEl.style.display = 'none';
        if (!password) return;
        const emailVisible = !dom.emailWrap.classList.contains('oc-hidden');
        const email = (emailVisible && dom.emailEl.value.trim()) ? dom.emailEl.value.trim() : STAFF_EMAIL;
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) {
          dom.errorEl.textContent = error.message;
          dom.errorEl.style.display = 'block';
          return;
        }
        finish(data && data.session);
      }
      dom.submitBtn.addEventListener('click', attemptSignIn);
      dom.passwordEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') attemptSignIn(); });
      dom.emailEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') attemptSignIn(); });

      sb.auth.getSession().then(({ data }) => {
        if (data && data.session) finish(data.session);
        else showLogin();
      });
    });
  }

  function requirePasscode(role, reason) {
    if (getPassFlag(role)) return Promise.resolve(true);
    injectStyles();
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'oc-modal-overlay';
      overlay.innerHTML = `
        <div class="oc-modal">
          <p class="oc-modal-text">Enter the ${esc(role)} passcode to ${esc(reason)}.</p>
          <p class="oc-modal-error">Wrong passcode</p>
          <input type="password" class="oc-modal-input" autocomplete="off">
          <div class="oc-modal-actions">
            <button type="button" class="oc-modal-cancel">Cancel</button>
            <button type="button" class="oc-modal-submit">Unlock</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      const input = overlay.querySelector('.oc-modal-input');
      const errEl = overlay.querySelector('.oc-modal-error');

      function close() { overlay.remove(); }

      async function trySubmit() {
        const code = input.value;
        let ok = false;
        try {
          const { data, error } = await SB.rpc('check_passcode', { p_role: role, p_code: code });
          ok = !error && data === true;
        } catch (e) { ok = false; }
        if (ok) {
          setPassFlag(role);
          close();
          resolve(true);
        } else {
          errEl.style.display = 'block';
          input.value = '';
          input.focus();
        }
      }
      overlay.querySelector('.oc-modal-submit').addEventListener('click', trySubmit);
      overlay.querySelector('.oc-modal-cancel').addEventListener('click', () => { close(); resolve(false); });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') trySubmit(); });
      input.focus();
    });
  }

  function subscribe(tables, onChange) {
    let timer = null;
    function debounced() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = null; onChange(); }, 200);
    }
    const channels = (tables || []).map(tb => SB.channel(tb + '-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: tb }, debounced)
      .subscribe());
    return { channels, unsubscribe() { channels.forEach(ch => { try { SB.removeChannel(ch); } catch (e) { /* stub has no removeChannel */ } }); } };
  }

  function navHTML(current) {
    return NAV_LINKS.map(l => `<a href="${esc(l.href)}" class="oc-nav-link${l.key === current ? ' active' : ''}"${l.key === current ? ' aria-current="page"' : ''}>${esc(l.label)}</a>`).join('');
  }

  return { SUPABASE_URL, SUPABASE_ANON_KEY, STAFF_EMAIL, init, esc, requirePasscode, subscribe, navHTML };
});
