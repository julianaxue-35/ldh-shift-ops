const { chromium } = require('playwright');
const path = require('path');
const pageUrl = (name) => 'file://' + path.resolve(__dirname, '../../' + (name || 'index.html'));

// In-memory stand-in for the Supabase client. Runs inside the page.
const STUB = `
(() => {
  const uuid = () => 'id' + Math.random().toString(36).slice(2) + Date.now();
  const db = window.__db = { tasks: [], memos: [], roster: [], nurse_requests: [], nurse_treatments: [], nurse_treatment_doses: [] };
  const now = () => new Date().toISOString();
  const defaults = {
    tasks: () => ({ urgency: 'routine', done: false, red_flags: [], type: 'check_recheck', origin: 'add_on', created_at: now() }),
    memos: () => ({ done: false, created_at: now() }),
    roster: () => ({}),
    nurse_requests: () => ({ kind: 'vaccination', done_count: 0, arrived_at: now(), created_at: now() }),
    nurse_treatments: () => ({ stopped: false, created_at: now() }),
    nurse_treatment_doses: () => ({})
  };
  const listeners = [];
  function table(name) {
    let op = null, payload = null, filters = [], orderCol = null, asc = true, single = false;
    const b = {
      select() { if (!op) op = 'select'; return b; },
      insert(rows) { op = 'insert'; payload = Array.isArray(rows) ? rows : [rows]; return b; },
      update(v) { op = 'update'; payload = v; return b; },
      delete() { op = 'delete'; return b; },
      eq(k, v) { filters.push(r => r[k] === v); return b; },
      gte(k, v) { filters.push(r => r[k] >= v); return b; },
      lt(k, v) { filters.push(r => r[k] < v); return b; },
      in(k, vals) { filters.push(r => vals.indexOf(r[k]) !== -1); return b; },
      order(c, o) { orderCol = c; asc = !(o && o.ascending === false); return b; },
      single() { single = true; return b; },
      then(res, rej) {
        try {
          const rows = db[name];
          const match = () => rows.filter(r => filters.every(f => f(r)));
          let data;
          if (op === 'insert') { data = payload.map(p => Object.assign({ id: uuid() }, defaults[name](), p)); data.forEach(d => rows.push(d)); }
          else if (op === 'update') { data = match(); data.forEach(r => Object.assign(r, payload)); }
          else if (op === 'delete') { data = match(); data.forEach(r => rows.splice(rows.indexOf(r), 1)); }
          else { data = match(); if (orderCol) data = data.slice().sort((x, y) => (x[orderCol] > y[orderCol] ? 1 : -1) * (asc ? 1 : -1)); }
          if (op !== 'select') listeners.filter(l => l.table === name).forEach(l => setTimeout(l.cb, 0));
          const out = JSON.parse(JSON.stringify(data));
          res({ data: single ? out[0] : out, error: null });
        } catch (e) { rej ? rej(e) : res({ data: null, error: { message: e.message } }); }
      }
    };
    return b;
  }
  window.supabase = { createClient: () => ({
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => {}, signInWithPassword: async () => ({ error: null }) },
    from: table,
    rpc: async () => ({ data: [], error: null }),
    channel: () => ({ on(_e, f, cb) { listeners.push({ table: f.table, cb }); return this; }, subscribe() { return this; } })
  }) };
})();
`;

async function open(seed = {}, pageName) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 1000 } });
  await ctx.route('**/supabase.js', r => r.abort());
  await ctx.route('https://julianaxue-35.github.io/**', r => r.abort());   // Pick up opens the shift tool in a new tab; keep tests offline
  await ctx.addInitScript(STUB);
  await ctx.addInitScript((s) => {
    Object.keys(s).forEach(k => s[k].forEach(r => window.__db[k].push(
      Object.assign({ id: 'seed' + Math.random().toString(36).slice(2), created_at: new Date().toISOString() }, r))));
  }, seed);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept('JX'));   // prompt() -> initials "JX"; confirm() -> OK
  await page.goto(pageUrl(pageName));
  await page.waitForTimeout(500);
  return { browser, page, errors, db: () => page.evaluate(() => window.__db) };
}
module.exports = { open };
