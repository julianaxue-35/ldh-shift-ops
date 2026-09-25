const { chromium } = require('playwright');
const path = require('path');
const pageUrl = (name) => 'file://' + path.resolve(__dirname, '../../' + (name || 'index.html'));
// Node-side mirror of the STUB's own PASSCODES (below) — open() runs outside
// the page, so it needs its own copy to auto-clear the vets/nurses entry gate.
const PASSCODES = { nurse: 'nurse', vet: 'vet2026' };

// In-memory stand-in for the Supabase client. Runs inside the page.
const STUB = `
(() => {
  const uuid = () => 'id' + Math.random().toString(36).slice(2) + Date.now();
  const db = window.__db = { tasks: [], memos: [], roster: [], nurse_requests: [], nurse_treatments: [], nurse_treatment_doses: [], locations: [], surveillance_snapshots: [], noga_requests: [] };
  const now = () => new Date().toISOString();
  const defaults = {
    // Round 3 (0010_round3.sql) columns replicated here so UI tests reflect
    // the DB's column defaults without a live Supabase project.
    tasks: () => ({
      urgency: 'routine', done: false, red_flags: [], type: 'check_recheck', origin: 'add_on', created_at: now(),
      needs_medication: false, vet_done_at: null, med_chart_done: false, med_label: null, med_done_by: null, med_done_at: null,
      sm_number: null, location_detail: null
    }),
    memos: () => ({ done: false, created_at: now() }),
    roster: () => ({}),
    nurse_requests: () => ({ kind: 'vaccination', done_count: 0, arrived_at: now(), created_at: now() }),
    nurse_treatments: () => ({ stopped: false, created_at: now() }),
    nurse_treatment_doses: () => ({}),
    locations: () => ({}),
    surveillance_snapshots: () => ({}),
    noga_requests: () => ({ task: 'other', done: false, created_at: now() })
  };
  // Mirrors the tasks_hold_medication trigger (0010_round3.sql): a medication
  // case can't be marked done until the nurse sets med_done_at.
  function applyMedicationHold(row) {
    if (row.needs_medication && !row.med_done_at && row.done) {
      row.done = false;
      row.vet_done_at = row.vet_done_at || now();
      row.completed_at = null;
    }
    return row;
  }
  const listeners = [];
  function table(name) {
    let op = null, payload = null, filters = [], orderCol = null, limitN = null, asc = true, single = false, conflictCols = ['id'];
    const b = {
      select() { if (!op) op = 'select'; return b; },
      insert(rows) { op = 'insert'; payload = Array.isArray(rows) ? rows : [rows]; return b; },
      update(v) { op = 'update'; payload = v; return b; },
      upsert(rows, upsertOpts) { op = 'upsert'; payload = Array.isArray(rows) ? rows : [rows]; conflictCols = (upsertOpts && upsertOpts.onConflict ? upsertOpts.onConflict : 'id').split(',').map(c => c.trim()); return b; },
      delete() { op = 'delete'; return b; },
      eq(k, v) { filters.push(r => r[k] === v); return b; },
      gte(k, v) { filters.push(r => r[k] >= v); return b; },
      lt(k, v) { filters.push(r => r[k] < v); return b; },
      in(k, vals) { filters.push(r => vals.indexOf(r[k]) !== -1); return b; },
      not(k, op, v) { if (op === 'is' && v === null) filters.push(r => r[k] != null); return b; },
      is(k, v) { filters.push(r => (v === null ? r[k] == null : r[k] === v)); return b; },
      order(c, o) { orderCol = c; asc = !(o && o.ascending === false); return b; },
      limit(n) { limitN = n; return b; },
      single() { single = true; return b; },
      then(res, rej) {
        if (window.__fail && window.__fail[name]) { res({ data: null, error: { message: 'boom' } }); return; }
        try {
          const rows = db[name];
          const match = () => rows.filter(r => filters.every(f => f(r)));
          const hold = row => (name === 'tasks' ? applyMedicationHold(row) : row);
          let data;
          if (op === 'insert') { data = payload.map(p => hold(Object.assign({ id: uuid() }, defaults[name](), p))); data.forEach(d => rows.push(d)); }
          else if (op === 'update') { data = match(); data.forEach(r => hold(Object.assign(r, payload))); }
          else if (op === 'upsert') {
            data = payload.map(p => {
              const existing = rows.find(r => conflictCols.every(c => r[c] === p[c]));
              if (existing) { hold(Object.assign(existing, p)); return existing; }
              const created = hold(Object.assign({ id: uuid() }, defaults[name](), p));
              rows.push(created);
              return created;
            });
          }
          else if (op === 'delete') { data = match(); data.forEach(r => rows.splice(rows.indexOf(r), 1)); }
          else { data = match(); if (orderCol) data = data.slice().sort((x, y) => (x[orderCol] > y[orderCol] ? 1 : -1) * (asc ? 1 : -1)); if (limitN != null) data = data.slice(0, limitN); }
          if (op !== 'select') listeners.filter(l => l.table === name).forEach(l => setTimeout(l.cb, 0));
          const out = JSON.parse(JSON.stringify(data));
          res({ data: single ? out[0] : out, error: null });
        } catch (e) { rej ? rej(e) : res({ data: null, error: { message: e.message } }); }
      }
    };
    return b;
  }
  // Auth session: defaults to already-signed-in (every pre-existing test relies
  // on this). A test can start logged out via open(seed, page, { loggedOut: true })
  // and/or require specific credentials via { loginCreds: { email, password } }
  // (see ops-core.test.js). Read lazily so the flags — set by an addInitScript
  // registered AFTER this stub — are in place before first use.
  let authInit = false, authSession = null;
  function ensureAuthInit() {
    if (authInit) return;
    authInit = true;
    authSession = window.__forceLoggedOut ? null : { user: { id: 'u1' } };
  }
  const PASSCODES = { nurse: 'nurse', vet: 'vet2026' };   // mirrors role_passcodes seed (0010_round3.sql)
  window.supabase = { createClient: () => ({
    auth: {
      getSession: async () => { ensureAuthInit(); return { data: { session: authSession } }; },
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => { ensureAuthInit(); authSession = null; },
      signInWithPassword: async (creds) => {
        ensureAuthInit();
        const want = window.__loginCreds;
        const email = creds && creds.email, password = creds && creds.password;
        if (want && (email !== want.email || password !== want.password)) {
          return { data: { session: null }, error: { message: 'Invalid login credentials' } };
        }
        authSession = { user: { id: 'u1', email } };
        return { data: { session: authSession }, error: null };
      }
    },
    from: table,
    rpc: async (fn, args) => {
      if (fn === 'check_passcode') {
        const expected = PASSCODES[args && args.p_role];
        return { data: expected != null && expected === (args && args.p_code), error: null };
      }
      return { data: [], error: null };
    },
    channel: () => ({ on(_e, f, cb) { listeners.push({ table: f.table, cb }); return this; }, subscribe() { return this; } })
  }) };
})();
`;

async function open(seed = {}, pageName, opts = {}) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 1000 } });
  await ctx.route('**/supabase.js', r => r.abort());
  await ctx.route('https://julianaxue-35.github.io/**', r => r.abort());   // Pick up opens the shift tool in a new tab; keep tests offline
  await ctx.addInitScript(STUB);
  await ctx.addInitScript((s) => {
    Object.keys(s).forEach(k => s[k].forEach(r => window.__db[k].push(
      Object.assign({ id: 'seed' + Math.random().toString(36).slice(2), created_at: new Date().toISOString() }, r))));
  }, seed);
  // opts.loggedOut: start with no session (default: already signed in, as before).
  // opts.loginCreds: { email, password } signInWithPassword must match to succeed.
  if (opts.loggedOut) await ctx.addInitScript(() => { window.__forceLoggedOut = true; });
  if (opts.loginCreds) await ctx.addInitScript((creds) => { window.__loginCreds = creds; }, opts.loginCreds);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept('JX'));   // prompt() -> initials "JX"; confirm() -> OK
  await page.goto(pageUrl(pageName));
  await page.waitForTimeout(500);
  // vets.html/nurses.html show a full-screen role-passcode gate right after
  // sign-in (2026-09-26). Auto-clear it with the matching seeded code so
  // existing tests reach the page as before; pass opts.skipRoleGate to drive
  // it manually in a test that specifically exercises the gate itself.
  if (!opts.skipRoleGate) {
    const gate = page.locator('#oc-role-gate');
    if (await gate.count()) {
      const role = await gate.getAttribute('data-role');
      await page.fill('#oc-role-gate .oc-gate-input', PASSCODES[role] || '');
      await page.click('#oc-role-gate .oc-gate-submit');
      await gate.waitFor({ state: 'detached' });
    }
  }
  return { browser, page, errors, db: () => page.evaluate(() => window.__db) };
}
module.exports = { open };
