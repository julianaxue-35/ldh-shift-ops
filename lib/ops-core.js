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
    { key: 'board', href: 'shelter-board.html', label: 'Shelter board' },
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
      .faq-btn { background: var(--card-bg, #fff); border: 1px solid var(--border, #e3e5ee); box-shadow: var(--shadow-card, none); font: inherit; font-size: 0.78rem; font-weight: 700; padding: 6px 12px; border-radius: 12px; cursor: pointer; color: var(--ink, #1E2238); width: auto; }
      .faq-overlay { position: fixed; inset: 0; background: rgba(30,34,56,0.45); z-index: 9000; display: none; align-items: flex-start; justify-content: center; padding: 4vh 12px; overflow-y: auto; }
      .faq-overlay.open { display: flex; }
      .faq-overlay .faq-modal { position: relative; width: 100%; max-width: 720px; max-height: 92vh; overflow-y: auto; margin: 0; }
      .faq-close { position: absolute; top: 10px; right: 12px; background: transparent; border: none; box-shadow: none; font-size: 1.6rem; line-height: 1; padding: 0 6px; cursor: pointer; color: var(--muted, #6B7280); width: auto; }
      .ah-entry { border-top: 1px solid var(--border, #e3e5ee); padding: 10px 0; font-size: 0.85rem; line-height: 1.5; }
      .ah-entry:first-of-type { border-top: none; }
      .ah-head { margin-bottom: 4px; }
      .ah-line { margin: 2px 0; }
      .faq-card details { border-top: 1px solid var(--border, #e3e5ee); padding: 10px 0; }
      .faq-card details:first-of-type { border-top: none; }
      .faq-card summary { cursor: pointer; font-weight: 700; font-size: 0.9rem; }
      .faq-card details > div { font-size: 0.85rem; line-height: 1.55; margin-top: 8px; }
      .faq-card details > div p { margin: 0 0 8px; }
      .faq-card details > div ul, .faq-card details > div ol { margin: 0 0 8px; padding-left: 20px; }
      .faq-card h3.faq-group { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted, #6B7280); margin: 16px 0 2px; }
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

      /* phone / portrait tablet: the sidebar sits on top, so keep it short —
         nav as one wrapped row, no long description text */
      @media (max-width: 800px) {
        #ops-nav { display: flex; flex-wrap: wrap; gap: 0 20px; margin-bottom: 8px !important; }
        aside { padding: 14px 16px !important; }
        aside h2 { margin-bottom: 6px !important; }
        aside p.hint:not(:has(a)) { display: none; }   /* keep the description-free link row (hub / shift tools) */
      }
      /* touch screens: bigger tick boxes and link rows (13px boxes were hard to hit) */
      @media (pointer: coarse) {
        input[type=checkbox] { width: 22px !important; height: 22px !important; }
        aside a { display: inline-block; padding: 8px 0; }
      }
    `;
    const styleEl = document.createElement('style');
    styleEl.setAttribute('data-opscore', '1');
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  }


  /* 2026-10-17: one LDH access code for the shift tools AND the dashboard. The shift tools (ldh-shift-tools, same
     origin as this site) keep the code they were unlocked with under these two names; the dashboard reads them so a
     phone that already entered the code at a tool is not asked again, and writes them when it signs in first so the
     tools do not ask either. Signing out clears both, on this device, so both sides ask again. */
  const SYNC_KEY = 'ldh_sync_code_v1', GATE_OK_KEY = 'ldhGateOk_v2';
  function storedCode() { try { return localStorage.getItem(SYNC_KEY) || ''; } catch (e) { return ''; } }
  function storeCode(code) { try { localStorage.setItem(SYNC_KEY, code); localStorage.setItem(GATE_OK_KEY, '1'); } catch (e) { /* storage blocked: just asked again next time */ } }
  function clearStoredCode() { try { localStorage.removeItem(SYNC_KEY); localStorage.removeItem(GATE_OK_KEY); } catch (e) { /* ignore */ } }
  function isBadCredentials(error) { return !!error && (error.status === 400 || /invalid login/i.test(error.message || '')); }


  // 2026-10-17: the FAQ lives behind one small button in the page header (#faq-btn opens #faq-panel) instead of a long
  // section at the bottom of the page. Esc, the x, or a click outside the panel closes it.
  function wireFaq() {
    const btn = document.getElementById('faq-btn'), panel = document.getElementById('faq-panel');
    if (!btn || !panel || btn.dataset.wired) return;
    btn.dataset.wired = '1';
    const open = (on) => { panel.classList.toggle('open', on); btn.setAttribute('aria-expanded', on ? 'true' : 'false'); };
    btn.addEventListener('click', () => open(true));
    panel.addEventListener('click', (e) => { if (e.target === panel || e.target.closest('.faq-close')) open(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') open(false); });
  }


  /* 2026-10-17: alert sound, shared by the Vets and Nurses pages. ON by default (it stays on across visits; the button
     mutes it and remembers that). Browsers will not play any sound until the page has been tapped/clicked once, so the
     button says so until the first tap — the banner and flashing tab title alert either way. */
  const MUTE_KEY = 'ldh_alert_sound_muted';
  function createAlertSound(chipId) {
    let ctx = null;
    const chip = () => document.getElementById(chipId);
    const running = () => !!ctx && ctx.state === 'running';
    const muted = () => { try { return localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { return false; } };
    const setMuted = (on) => { try { localStorage.setItem(MUTE_KEY, on ? '1' : '0'); } catch (e) { /* stays on for this visit only */ } };
    function paint() {
      const el = chip(); if (!el) return;
      if (muted()) el.textContent = '🔕 Alert sound is muted — tap to turn on';
      else if (running()) el.textContent = '🔔 Alert sound is on — tap to mute';
      else el.textContent = '🔔 Alert sound is on — tap anywhere once to enable it';
      el.classList.toggle('sound-off', muted() || !running());
    }
    function unlock() {
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        if (!ctx) ctx = new Ctx();
        if (ctx.state === 'suspended') ctx.resume().then(paint, () => {});
      } catch (e) { /* unsupported — the banner still shows */ }
      paint();
    }
    function play() {
      try {
        if (muted() || !running()) return;
        const t0 = ctx.currentTime;
        [[880, 0], [660, 0.22], [880, 0.44]].forEach(([freq, at]) => {   // three clear beeps
          const osc = ctx.createOscillator(), gain = ctx.createGain();
          osc.type = 'square'; osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.0001, t0 + at);
          gain.gain.exponentialRampToValueAtTime(0.25, t0 + at + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.18);
          osc.connect(gain).connect(ctx.destination);
          osc.start(t0 + at); osc.stop(t0 + at + 0.2);
        });
      } catch (e) { /* ignore */ }
    }
    ['pointerdown', 'touchstart', 'keydown', 'click'].forEach(ev => document.addEventListener(ev, unlock, { passive: true }));
    const el = chip();
    if (el) el.addEventListener('click', () => {
      if (muted()) { setMuted(false); unlock(); setTimeout(play, 80); }
      else if (!running()) { unlock(); setTimeout(play, 80); }
      else { setMuted(true); paint(); }
    });
    unlock();   // may already be allowed (browsers let a site that was used recently play straight away)
    return { play, unlock };
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
          <input id="login-password" type="password" placeholder="LDH access code" autocomplete="current-password">
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

  // Full-screen role gate shown once, right after sign-in, on a page that
  // passed `gateRole` to init() (vets.html -> 'vet', nurses.html -> 'nurse').
  // 2026-09-26: replaces the earlier design of prompting on every pick-up/
  // DONE/tick — she wants the passcode to guard opening the page at all,
  // not each action once she's in. No Cancel button: there's nothing to
  // fall back to but the page itself, so the only way out is Sign out.
  function showEntryGate(role, onUnlocked) {
    injectStyles();
    const screen = document.createElement('div');
    screen.id = 'oc-role-gate';
    screen.dataset.role = role;
    screen.className = 'oc-login-screen';
    screen.style.cssText = 'position:fixed; inset:0; z-index:9998; display:flex;';
    screen.innerHTML = `
      <div class="oc-login-card">
        <h1>${esc(role.charAt(0).toUpperCase() + role.slice(1))} access</h1>
        <p>Enter the ${esc(role)} passcode to open this page.</p>
        <p class="oc-login-error" id="oc-gate-error">Wrong passcode</p>
        <input type="password" class="oc-gate-input" autocomplete="off" placeholder="Passcode">
        <button type="button" class="oc-gate-submit">Unlock</button>
        <a class="oc-login-link" id="oc-gate-signout">Sign out</a>
      </div>`;
    document.body.appendChild(screen);
    const input = screen.querySelector('.oc-gate-input');
    const errEl = screen.querySelector('#oc-gate-error');
    async function trySubmit() {
      const code = input.value;
      let ok = false;
      try {
        const { data, error } = await SB.rpc('check_passcode', { p_role: role, p_code: code });
        ok = !error && data === true;
      } catch (e) { ok = false; }
      if (ok) {
        setPassFlag(role);
        screen.remove();
        onUnlocked();
      } else {
        errEl.style.display = 'block';
        input.value = '';
        input.focus();
      }
    }
    screen.querySelector('.oc-gate-submit').addEventListener('click', trySubmit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') trySubmit(); });
    screen.querySelector('#oc-gate-signout').addEventListener('click', async () => { await SB.auth.signOut(); location.reload(); });
    input.focus();
  }

  function init(opts) {
    opts = opts || {};
    const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    SB = sb;
    // Every page's Sign out (and the role gates' Sign out) goes through sb.auth.signOut, so clear the shared code here.
    const rawSignOut = sb.auth.signOut.bind(sb.auth);
    sb.auth.signOut = async function () { clearStoredCode(); return rawSignOut.apply(null, arguments); };

    return new Promise((resolve) => {
      const dom = ensureLoginDom();

      function showLogin() { dom.screen.style.display = 'flex'; }
      function hideLogin() { dom.screen.style.display = 'none'; }

      function revealApp(session) {
        resolve({ sb, session });
        wireFaq();
        const navSlot = document.getElementById('ops-nav');
        if (navSlot) navSlot.innerHTML = navHTML(opts.page);
      }

      function finish(session) {
        hideLogin();
        if (opts.gateRole && !getPassFlag(opts.gateRole)) showEntryGate(opts.gateRole, () => revealApp(session));
        else revealApp(session);
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
        if (!emailVisible || !dom.emailEl.value.trim()) storeCode(password);   // the shared staff account only
        finish(data && data.session);
      }
      dom.submitBtn.addEventListener('click', attemptSignIn);
      dom.passwordEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') attemptSignIn(); });
      dom.emailEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') attemptSignIn(); });

      // No session: if this phone already has the LDH code from a shift tool, sign in with it silently. A refused code
      // (it was changed) is cleared so the tools ask for the new one too; any other failure just shows the login box.
      async function silentSignIn() {
        const code = storedCode();
        if (!code) return false;
        try {
          const { data, error } = await sb.auth.signInWithPassword({ email: STAFF_EMAIL, password: code });
          if (error) { if (isBadCredentials(error)) clearStoredCode(); return false; }
          finish(data && data.session);
          return true;
        } catch (e) { return false; }
      }
      sb.auth.getSession().then(async ({ data }) => {
        if (data && data.session) finish(data.session);
        else if (!(await silentSignIn())) showLogin();
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

  return { SUPABASE_URL, SUPABASE_ANON_KEY, STAFF_EMAIL, init, createAlertSound, esc, requirePasscode, subscribe, navHTML };
});
