# LDH Shift Ops Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working prototype of the LDH Shift Ops dashboard — a live, multi-user shift task board — backed by a dedicated Supabase project, with a public/staff access boundary enforced by Postgres Row-Level Security rather than client-side JS.

**Architecture:** A single-file HTML/JS/CSS frontend (no build step, matching `~/ldh-shift-tools` conventions) talks directly to a dedicated Supabase project via the Supabase JS client — no custom backend server. All access control is enforced by Postgres RLS policies on the database itself, gated by a single shared Supabase Auth account. Operational task/roster/memo data lives in Supabase and syncs live via Supabase Realtime; clinical/completion detail stays entirely in the existing offline `processing.html` / `sick-injured.html` / `surgery.html` tools and never touches this system.

**Tech Stack:** Supabase (Postgres + Auth + Realtime), Supabase CLI for local dev, vanilla HTML/CSS/JS frontend, Supabase JS SDK v2 (loaded via CDN `<script>` tag — the one intentional exception to the "no external dependencies" rule below, since a real backend client library is unavoidable), Node.js + `@supabase/supabase-js` for test scripts, Playwright for browser/UI tests.

**Spec:** `docs/superpowers/specs/2026-09-16-ldh-shift-ops-dashboard-design.md`

## Global Constraints

- Fictional/placeholder data only in this prototype — no real animal numbers or medical notes, per spec's rollout checklist (real data waits on LDH IT review).
- No `sensitive` flag or per-role data restriction anywhere in the schema — the access boundary is uniformly "public: nothing, staff: everything," per spec.
- No clinical/medical-detail field anywhere in the Supabase schema. The only free-text field synced live is the short completion note, and its UI label/placeholder must say it is for coordination only, not clinical detail (per spec).
- Every table (`tasks`, `memos`, `roster`) must have RLS enabled with an `authenticated`-only policy — verified by a direct anonymous-query test, not just UI behavior.
- Frontend is a single `index.html` file, system font stack, no external font dependency (per spec — external JS SDK for Supabase is the one allowed exception, stated above).
- Design tokens (updated 2026-09-18, see amendment below — **verbatim from `mock/index.html`, which supersedes the values originally stated here**): background `#F4F6FB`; sidebar `#1E2238` with white text; card shadow `8px 8px 18px rgba(163,177,198,0.45), -8px -8px 18px rgba(255,255,255,0.85)` (inset variant for inputs); accent colors amber `#FF9F43` (Sick & Injured), royal blue `#4A6CF7` (Surgery), green `#229A63` (Processing — changed from the original violet); rounded corners 14-20px; thin dividers only, no hard borders elsewhere — **except** `#new-request-form`, which is deliberately flat (`#fff` background, `1px solid rgba(30,34,56,0.12)` border, no shadow) rather than a raised card, per Juliana's feedback that the fill-in form should read as a plain box, not a display tile.
- Shifts are exactly: `processing`, `sick_injured`, `surgery`. Locations are exactly: Cat Room 1, Cat Room 2, Cat Room 3, Adoption 1, Adoption 2, FIR Room, Pound 1, Pound 2, Pound 3, Pound 4, Transport.

## Design updates since this plan was first written (2026-09-18)

The spec's original visual description (three different chart types, one per
shift; location-grouped open queue; small "Urgent attention" rail card;
"Recently completed" and memo board both in a sidebar-adjacent rail) was
superseded through a design-review pass done directly against a working
mock. **`mock/index.html` in this repo is now the authoritative reference for
markup, CSS, and layout** — build the real frontend (Tasks 4-7) by adapting
its structure directly, wiring in real Supabase calls per the data-flow
guidance already in those tasks, rather than the original inline code
samples below, which describe the pre-redesign layout and are now stale
guidance for the specific UI, though their Supabase wiring/interface
guidance still holds.

Deltas from the original plan text, for anyone diffing against the tasks below:

- **"Open queue" → "Cases flagged"**: a single table (Animal / Location /
  Shift / Type / Urgency / action), sorted urgent-first, with a search-by-
  animal-ID box — not the original location-grouped card list.
- **Shift-progress charts unified**: the original spec gave each shift a
  different chart type (paired bar / donut / horizontal bars). Replaced with
  one consistent card per shift — a progress bar plus "`done` / `total`
  processed today" plus that shift's on-duty roster chips folded in (roster
  no longer has its own separate panel).
- **New hero "Completion" donut**: one large donut above the shift-progress
  row showing total tasks completed today across all shifts combined.
- **"Recently completed" panel retained**, placed directly under "Cases
  flagged" — this isn't optional polish, it's what the spec's
  Progress/documentation-tracking cross-check (supervisor checks the board's
  done list against the offline tool's export by animal ID) actually depends
  on having a visible list to check against.
- **"Urgent attention" split into two tiers**: "Needs immediate attention"
  (`urgency = 'urgent'`) and "Due within 24 hours" (`urgency = 'soon'` — e.g.
  medication requests), each its own list with a mark-done action for
  vet/nurse. No new field was added for this — it's derived from the
  existing `urgency` enum, not a new manual input.
- **Memo board moved to the very bottom of the page**, full width, laid out
  to wrap and grow rather than being height-constrained in a rail.
- **Processing's colour changed from violet to green** (`#229A63`). Amber
  (Sick & Injured) and blue (Surgery) are unchanged. Juliana's own words:
  "we will refine it as it goes" — treat this palette as still open to
  iteration, not finalized.

**Not part of this plan** — tracked instead as the 2026-09-18 amendment to
the spec (`docs/superpowers/specs/2026-09-16-ldh-shift-ops-dashboard-design.md`):
a narrow, one-directional completion sync from `processing.html` /
`sick-injured.html` / `surgery.html` (in `~/ldh-shift-tools`, a separate
repo) that pushes animal ID + location + shift to this dashboard's `tasks`
table, only at the moment an item is ticked Completed in those tools. That
work touches a different repo and needs its own plan once this dashboard is
live and its schema is stable — do not fold it into Tasks 1-8 below.

---

## File Structure

```
ldh-shift-ops/
├── index.html                        # entire frontend: HTML + <style> + <script>
├── supabase/
│   ├── config.toml                   # created by `supabase init`
│   ├── migrations/
│   │   ├── 0001_init_schema.sql      # tasks, memos, roster tables
│   │   └── 0002_rls_policies.sql     # RLS + realtime publication
│   └── seed.sql                      # fictional demo data
├── tests/
│   ├── package.json                  # test-only Node deps (not shipped)
│   ├── rls.test.mjs                  # direct anonymous-vs-authenticated RLS check
│   ├── auth.spec.mjs                 # Playwright: login gating
│   ├── task-board.spec.mjs           # Playwright: request/queue/mark-done/live sync
│   └── panels.spec.mjs               # Playwright: charts, roster, memo, completed panel
├── .gitignore                        # excludes .env, supabase/.temp
├── .env.example                      # SUPABASE_URL / SUPABASE_ANON_KEY placeholders (not real secrets)
└── README.md                         # security model, prototype status, IT rollout checklist
```

`index.html` stays one file per the existing tools' convention, but internally organized into clearly separated `<script>` sections (state, Supabase client, auth, task board, charts, roster, memos) so later tasks can extend it without re-reading the whole file each time — each task below specifies exact line-anchored insertion points once Task 4 has created the file.

---

## Task 1: Project scaffolding & local Supabase dev environment

**Files:**
- Create: `supabase/config.toml` (via `supabase init`)
- Create: `.gitignore`
- Create: `.env.example`
- Create: `tests/package.json`
- Modify: `README.md` (stub)

**Interfaces:**
- Produces: a running local Supabase stack (`supabase start`) that later tasks connect to at `http://127.0.0.1:54321` with a local anon key printed to stdout.

- [ ] **Step 1: Install and verify the Supabase CLI**

Run: `supabase --version`
Expected: prints a version number. If not installed: `brew install supabase/tap/supabase`.

- [ ] **Step 2: Initialize the Supabase project**

Run (from `~/ldh-shift-ops`): `supabase init`
Expected: creates `supabase/config.toml` and `supabase/` scaffolding.

- [ ] **Step 3: Start the local stack and capture the local anon key**

Run: `supabase start`
Expected: prints `API URL`, `anon key`, `service_role key`. Copy the `API URL` and `anon key` — later steps use them.

- [ ] **Step 4: Write `.gitignore`**

```
.env
.env.local
supabase/.temp
node_modules/
```

- [ ] **Step 5: Write `.env.example`**

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=replace-with-local-anon-key-from-supabase-start
```

- [ ] **Step 6: Write `tests/package.json`**

```json
{
  "name": "ldh-shift-ops-tests",
  "private": true,
  "type": "module",
  "devDependencies": {
    "@playwright/test": "^1.47.0",
    "@supabase/supabase-js": "^2.45.0"
  }
}
```

- [ ] **Step 7: Install test dependencies**

Run: `cd tests && npm install && npx playwright install chromium && cd ..`
Expected: installs without error.

- [ ] **Step 8: Write README stub**

```markdown
# LDH Shift Ops Dashboard

**Status: prototype, fictional data only.** Do not enter real animal numbers,
real staff names, or any clinical detail until LDH IT has completed the
security review described in `docs/superpowers/specs/2026-09-16-ldh-shift-ops-dashboard-design.md`.

Full security model and rollout checklist: see that spec, and the "Security
model" section below (added in the final task of the implementation plan).
```

- [ ] **Step 9: Commit**

```bash
git add supabase/config.toml .gitignore .env.example tests/package.json README.md
git commit -m "Scaffold Supabase project and test tooling"
```

---

## Task 2: Database schema + RLS policies, verified against a live anonymous query

**Files:**
- Create: `supabase/migrations/0001_init_schema.sql`
- Create: `supabase/migrations/0002_rls_policies.sql`
- Create: `tests/rls.test.mjs`
- Test: `tests/rls.test.mjs`

**Interfaces:**
- Produces: tables `public.tasks`, `public.memos`, `public.roster` with columns exactly as named below (later tasks' frontend code depends on these exact names). RLS enabled on all three, `authenticated`-only.

- [ ] **Step 1: Write the schema migration**

`supabase/migrations/0001_init_schema.sql`:

```sql
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  location text not null,
  shift text not null check (shift in ('processing','sick_injured','surgery')),
  type text not null check (type in ('shelter','foster','rescue','medication','check_recheck')),
  origin text not null default 'add_on' check (origin in ('scheduled','add_on')),
  urgency text not null check (urgency in ('routine','soon','urgent')),
  done boolean not null default false,
  completed_by_role text check (completed_by_role in ('attendant','vet_nurse')),
  completed_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);

create table public.memos (
  id uuid primary key default gen_random_uuid(),
  author text not null,
  text text not null,
  created_at timestamptz not null default now()
);

create table public.roster (
  id uuid primary key default gen_random_uuid(),
  shift text not null check (shift in ('processing','sick_injured','surgery')),
  staff_name text not null,
  roster_date date not null default current_date
);

create index tasks_shift_idx on public.tasks (shift);
create index tasks_location_idx on public.tasks (location);
create index roster_shift_date_idx on public.roster (shift, roster_date);
```

- [ ] **Step 2: Write the RLS + realtime migration**

`supabase/migrations/0002_rls_policies.sql`:

```sql
alter table public.tasks enable row level security;
alter table public.memos enable row level security;
alter table public.roster enable row level security;

create policy "authenticated_select_tasks" on public.tasks
  for select using (auth.role() = 'authenticated');
create policy "authenticated_insert_tasks" on public.tasks
  for insert with check (auth.role() = 'authenticated');
create policy "authenticated_update_tasks" on public.tasks
  for update using (auth.role() = 'authenticated');

create policy "authenticated_select_memos" on public.memos
  for select using (auth.role() = 'authenticated');
create policy "authenticated_insert_memos" on public.memos
  for insert with check (auth.role() = 'authenticated');

create policy "authenticated_select_roster" on public.roster
  for select using (auth.role() = 'authenticated');
create policy "authenticated_insert_roster" on public.roster
  for insert with check (auth.role() = 'authenticated');
create policy "authenticated_update_roster" on public.roster
  for update using (auth.role() = 'authenticated');
create policy "authenticated_delete_roster" on public.roster
  for delete using (auth.role() = 'authenticated');

alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.memos;
```

- [ ] **Step 3: Apply migrations locally**

Run: `supabase db reset`
Expected: runs both migrations without error, ends with "Finished supabase db reset".

- [ ] **Step 4: Write the RLS verification test (the security-critical test from the spec)**

`tests/rls.test.mjs`:

```js
import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
if (!ANON_KEY) throw new Error('Set SUPABASE_ANON_KEY before running this test');

test('anonymous client cannot read tasks, memos, or roster', async () => {
  const anon = createClient(URL, ANON_KEY);

  const { data: tasks, error: tasksErr } = await anon.from('tasks').select('*');
  assert.equal(tasksErr, null);
  assert.deepEqual(tasks, []);

  const { data: memos, error: memosErr } = await anon.from('memos').select('*');
  assert.equal(memosErr, null);
  assert.deepEqual(memos, []);

  const { data: roster, error: rosterErr } = await anon.from('roster').select('*');
  assert.equal(rosterErr, null);
  assert.deepEqual(roster, []);
});

test('anonymous client cannot insert a task', async () => {
  const anon = createClient(URL, ANON_KEY);
  const { error } = await anon.from('tasks').insert({
    title: 'test', location: 'Pound 1', shift: 'processing',
    type: 'other', origin: 'add_on', urgency: 'routine',
  });
  assert.notEqual(error, null);
});
```

- [ ] **Step 5: Run the test and confirm it currently passes against local stack**

Run: `cd tests && SUPABASE_ANON_KEY=<local-anon-key-from-step-3-of-task-1> node --test rls.test.mjs && cd ..`
Expected: both tests PASS — proving RLS blocks anonymous access at the database level before any frontend code exists.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations tests/rls.test.mjs
git commit -m "Add schema and RLS policies, verified against live anonymous query"
```

---

## Task 3: Seed data + shared staff auth account

**Files:**
- Create: `supabase/seed.sql`
- Modify: `.env.example` (add staff login placeholders)

**Interfaces:**
- Produces: one Supabase Auth user (`staff@ldh-shift-ops.local` locally) usable by all frontend tasks for login; fictional rows in `tasks`, `memos`, `roster` for manual and automated testing.

- [ ] **Step 1: Write fictional seed data**

`supabase/seed.sql`:

```sql
insert into public.tasks (title, location, shift, type, origin, urgency, done)
values
  ('Recheck — A-1042', 'Cat Room 2', 'sick_injured', 'check_recheck', 'scheduled', 'soon', false),
  ('Medication — A-2077', 'Pound 3', 'processing', 'medication', 'scheduled', 'routine', false),
  ('Post-op check — A-3390', 'Adoption 1', 'surgery', 'check_recheck', 'add_on', 'urgent', false),
  ('Wound recheck — A-1188', 'FIR Room', 'sick_injured', 'check_recheck', 'add_on', 'urgent', true);

insert into public.memos (author, text)
values ('Vet team', 'Fictional seed memo — Cat Room 2 recheck moved to 2pm.');

insert into public.roster (shift, staff_name, roster_date)
values
  ('processing', 'Fictional Nurse A', current_date),
  ('sick_injured', 'Fictional Vet B', current_date),
  ('surgery', 'Fictional Vet C', current_date);
```

- [ ] **Step 2: Apply seed data locally**

Run: `supabase db reset`
Expected: reruns migrations then `seed.sql` automatically (Supabase CLI convention), ends without error.

- [ ] **Step 3: Verify seed rows are present via service-role query**

Run:
```bash
cd tests && node -e "
import('@supabase/supabase-js').then(async ({ createClient }) => {
  const c = createClient('http://127.0.0.1:54321', process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await c.from('tasks').select('*');
  console.log(error ?? data.length + ' tasks');
});
" && cd ..
```
Expected: prints `4 tasks` (the local `SUPABASE_SERVICE_ROLE_KEY` is printed by `supabase start`).

- [ ] **Step 4: Create the shared staff auth account**

Run:
```bash
curl -X POST 'http://127.0.0.1:54321/auth/v1/admin/users' \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"staff@ldh-shift-ops.local","password":"replace-locally","email_confirm":true}'
```
Expected: `201` response with a user object. Note: in production this same call (against the real project, with a real password chosen at rollout time — not committed anywhere) is how LDH IT provisions the one shared account; document this in Task 8's README rather than hardcoding a real password anywhere in the repo.

- [ ] **Step 5: Update `.env.example` with staff login placeholders**

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=replace-with-local-anon-key-from-supabase-start
STAFF_LOGIN_EMAIL=staff@ldh-shift-ops.local
STAFF_LOGIN_PASSWORD=replace-locally-never-commit-real-password
```

- [ ] **Step 6: Commit**

```bash
git add supabase/seed.sql .env.example
git commit -m "Add fictional seed data and shared staff auth account provisioning"
```

---

## Task 4: Frontend shell — design tokens, Supabase client, login/session gating

**Files:**
- Create: `index.html`
- Create: `tests/auth.spec.mjs`
- Test: `tests/auth.spec.mjs`

**Interfaces:**
- Consumes: `SUPABASE_URL`, `SUPABASE_ANON_KEY` from Task 1; `staff@ldh-shift-ops.local` account from Task 3.
- Produces: global `window.LDH` namespace with `LDH.supabase` (the Supabase client), `LDH.session` (current session or null), and `LDH.role` (`'attendant' | 'vet_nurse' | null`, from a self-selected dropdown, stored in `sessionStorage`). Later tasks read/write these three.
- Produces: a `<main id="app" hidden>` element that later tasks render into, only unhidden after login succeeds — no data-bearing markup exists before that.

- [ ] **Step 1: Write `index.html` base structure, design tokens, and login gate**

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LDH Shift Ops</title>
<style>
  :root {
    --bg: #F4F6FB;
    --sidebar: #1E2238;
    --amber: #FF9F43;
    --blue: #4A6CF7;
    --violet: #8C62FF;
    --shadow-raised: 8px 8px 18px rgba(163,177,198,0.45), -8px -8px 18px rgba(255,255,255,0.85);
    --shadow-inset: inset 6px 6px 12px rgba(163,177,198,0.4), inset -6px -6px 12px rgba(255,255,255,0.8);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: var(--bg);
    color: #1E2238;
  }
  .card {
    background: var(--bg);
    border-radius: 18px;
    box-shadow: var(--shadow-raised);
    padding: 20px;
  }
  input, select, textarea {
    border: none;
    border-radius: 14px;
    box-shadow: var(--shadow-inset);
    padding: 10px 14px;
    background: var(--bg);
    font: inherit;
  }
  button {
    border: none;
    border-radius: 14px;
    padding: 10px 18px;
    background: var(--amber);
    color: #1E2238;
    font-weight: 600;
    cursor: pointer;
  }
  #login-screen {
    max-width: 360px;
    margin: 15vh auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  #login-error { color: #C0392B; font-size: 0.9em; min-height: 1.2em; }
  #app { display: none; }
  #app.visible { display: block; }
</style>
</head>
<body>

<section id="login-screen" class="card">
  <h1 style="margin:0;font-size:1.2em;">LDH Shift Ops — staff login</h1>
  <input id="login-password" type="password" placeholder="Staff password" autocomplete="current-password">
  <button id="login-submit">Log in</button>
  <div id="login-error"></div>
</section>

<main id="app"></main>

<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>
<script>
  window.LDH = { supabase: null, session: null, role: null };

  const SUPABASE_URL = window.__LDH_SUPABASE_URL__ || 'http://127.0.0.1:54321';
  const SUPABASE_ANON_KEY = window.__LDH_SUPABASE_ANON_KEY__ || '';
  const STAFF_EMAIL = 'staff@ldh-shift-ops.local';

  LDH.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  function showApp() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').classList.add('visible');
    document.dispatchEvent(new CustomEvent('ldh:authenticated'));
  }

  function showLogin(message) {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app').classList.remove('visible');
    document.getElementById('login-error').textContent = message || '';
  }

  async function attemptLogin(password) {
    const { data, error } = await LDH.supabase.auth.signInWithPassword({
      email: STAFF_EMAIL,
      password,
    });
    if (error) {
      showLogin('Incorrect password.');
      return;
    }
    LDH.session = data.session;
    showApp();
  }

  document.getElementById('login-submit').addEventListener('click', () => {
    const pw = document.getElementById('login-password').value;
    attemptLogin(pw);
  });
  document.getElementById('login-password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('login-submit').click();
  });

  LDH.supabase.auth.getSession().then(({ data }) => {
    if (data.session) {
      LDH.session = data.session;
      showApp();
    } else {
      showLogin();
    }
  });
</script>
</body>
</html>
```

- [ ] **Step 2: Serve the file locally for testing**

Run (in a separate terminal, kept running for all subsequent frontend tests): `python3 -m http.server 4173`
Expected: serves `index.html` at `http://127.0.0.1:4173/index.html`.

- [ ] **Step 3: Write the failing Playwright test**

`tests/auth.spec.mjs`:

```js
import { test, expect } from '@playwright/test';

const APP_URL = 'http://127.0.0.1:4173/index.html';

test('unauthenticated visitor sees only the login screen, no app data', async ({ page }) => {
  await page.goto(APP_URL);
  await expect(page.locator('#login-screen')).toBeVisible();
  await expect(page.locator('#app')).not.toHaveClass(/visible/);
});

test('wrong password shows an error and keeps app hidden', async ({ page }) => {
  await page.goto(APP_URL);
  await page.fill('#login-password', 'definitely-wrong');
  await page.click('#login-submit');
  await expect(page.locator('#login-error')).toHaveText('Incorrect password.');
  await expect(page.locator('#app')).not.toHaveClass(/visible/);
});

test('correct password reveals the app', async ({ page }) => {
  await page.goto(APP_URL);
  await page.fill('#login-password', process.env.STAFF_LOGIN_PASSWORD);
  await page.click('#login-submit');
  await expect(page.locator('#app')).toHaveClass(/visible/);
});
```

- [ ] **Step 4: Run the test, expect the first two to pass and the third to fail (Supabase URL/key not yet injected)**

Run: `cd tests && npx playwright test auth.spec.mjs && cd ..`
Expected: first two PASS; third FAILS (page can't reach local Supabase without injected config).

- [ ] **Step 5: Inject local Supabase config for the test run**

Add before the closing `</head>` in `index.html`:

```html
<script>
  window.__LDH_SUPABASE_URL__ = 'http://127.0.0.1:54321';
</script>
```

(The anon key is not hardcoded — instead read it from a query string during local testing, so `tests/auth.spec.mjs` can set `page.goto(APP_URL + '?anon_key=' + encodeURIComponent(process.env.SUPABASE_ANON_KEY))`.) Update the `SUPABASE_ANON_KEY` line in `index.html`'s script to:

```js
const params = new URLSearchParams(location.search);
const SUPABASE_ANON_KEY = params.get('anon_key') || window.__LDH_SUPABASE_ANON_KEY__ || '';
```

And update `auth.spec.mjs`'s `page.goto` calls to append `?anon_key=${encodeURIComponent(process.env.SUPABASE_ANON_KEY)}`.

- [ ] **Step 6: Re-run the test suite**

Run: `cd tests && SUPABASE_ANON_KEY=<local-anon-key> STAFF_LOGIN_PASSWORD=<password-set-in-task-3-step-4> npx playwright test auth.spec.mjs && cd ..`
Expected: all three PASS.

- [ ] **Step 7: Commit**

```bash
git add index.html tests/auth.spec.mjs
git commit -m "Add frontend shell with design tokens and login-gated session"
```

---

## Task 5: New request form, open queue, mark-done, live sync

**Files:**
- Modify: `index.html` (append inside `<main id="app">` and the main `<script>` block from Task 4)
- Create: `tests/task-board.spec.mjs`
- Test: `tests/task-board.spec.mjs`

**Interfaces:**
- Consumes: `LDH.supabase`, `LDH.role` from Task 4; `tasks` table columns from Task 2.
- Produces: `LDH.role` is now set via a dropdown rendered on first login (`'attendant'` or `'vet_nurse'`, persisted in `sessionStorage` under key `ldh_role`). Produces DOM containers `#queue` (grouped-by-location task list) and `#new-request-form`, consumed by Task 6's chart code reading the same in-memory `LDH.tasks` array.

- [ ] **Step 1: Add role selector, request form, and queue markup inside `#app`**

Insert into `index.html`, inside `<main id="app">`:

```html
<div class="card" id="role-picker">
  <label>Viewing as:
    <select id="role-select">
      <option value="attendant">Animal Attendant</option>
      <option value="vet_nurse">Vet / Nurse</option>
    </select>
  </label>
</div>

<section class="card" id="new-request-form" hidden>
  <h2>New task request</h2>
  <input id="req-title" placeholder="Animal ID / kennel, e.g. A-1042">
  <select id="req-location">
    <option>Cat Room 1</option><option>Cat Room 2</option><option>Cat Room 3</option>
    <option>Adoption 1</option><option>Adoption 2</option><option>FIR Room</option>
    <option>Pound 1</option><option>Pound 2</option><option>Pound 3</option><option>Pound 4</option>
    <option>Transport</option>
  </select>
  <select id="req-shift">
    <option value="processing">Processing</option>
    <option value="sick_injured">Sick &amp; Injured</option>
    <option value="surgery">Surgery</option>
  </select>
  <select id="req-type">
    <option value="check_recheck">Check/recheck</option>
    <option value="medication">Medication</option>
    <option value="other">Other</option>
  </select>
  <select id="req-origin">
    <option value="scheduled">Scheduled</option>
    <option value="add_on">Add-on (logged today)</option>
  </select>
  <select id="req-urgency">
    <option value="routine">Routine</option>
    <option value="soon">Soon</option>
    <option value="urgent">Urgent</option>
  </select>
  <button id="req-submit">Submit request</button>
</section>

<section class="card" id="queue-section">
  <h2>Open queue</h2>
  <div id="queue"></div>
</section>
```

- [ ] **Step 2: Add role-gating, request submission, queue rendering, and realtime subscription logic**

Append to the main `<script>` block in `index.html` (after the auth code):

```js
LDH.tasks = [];

document.addEventListener('ldh:authenticated', initTaskBoard);

function initTaskBoard() {
  LDH.role = sessionStorage.getItem('ldh_role') || 'attendant';
  document.getElementById('role-select').value = LDH.role;
  applyRoleVisibility();

  document.getElementById('role-select').addEventListener('change', (e) => {
    LDH.role = e.target.value;
    sessionStorage.setItem('ldh_role', LDH.role);
    applyRoleVisibility();
  });

  document.getElementById('req-submit').addEventListener('click', submitNewRequest);

  loadTasks();
  LDH.supabase
    .channel('tasks-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
      loadTasks();
    })
    .subscribe();
}

function applyRoleVisibility() {
  document.getElementById('new-request-form').hidden = LDH.role !== 'attendant';
}

async function submitNewRequest() {
  const payload = {
    title: document.getElementById('req-title').value.trim(),
    location: document.getElementById('req-location').value,
    shift: document.getElementById('req-shift').value,
    type: document.getElementById('req-type').value,
    origin: document.getElementById('req-origin').value,
    urgency: document.getElementById('req-urgency').value,
  };
  if (!payload.title) return;
  const { error } = await LDH.supabase.from('tasks').insert(payload);
  if (!error) document.getElementById('req-title').value = '';
}

async function loadTasks() {
  const { data, error } = await LDH.supabase
    .from('tasks')
    .select('*')
    .order('urgency', { ascending: false })
    .order('created_at', { ascending: true });
  if (error) return;
  LDH.tasks = data;
  renderQueue();
  document.dispatchEvent(new CustomEvent('ldh:tasks-updated'));
}

function renderQueue() {
  const container = document.getElementById('queue');
  const open = LDH.tasks.filter((t) => !t.done);
  const byLocation = {};
  for (const t of open) {
    (byLocation[t.location] ??= []).push(t);
  }
  const urgencyOrder = { urgent: 0, soon: 1, routine: 2 };
  container.innerHTML = '';
  for (const [location, items] of Object.entries(byLocation)) {
    items.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);
    const group = document.createElement('div');
    group.innerHTML = `<h3>${location}</h3>`;
    for (const t of items) {
      const row = document.createElement('div');
      row.className = 'card';
      row.dataset.taskId = t.id;
      row.innerHTML = `
        <strong>${t.title}</strong> — ${t.type.replace('_', '/')} (${t.urgency})
        ${LDH.role === 'vet_nurse' ? '<button class="mark-done">Mark done</button>' : ''}
      `;
      const btn = row.querySelector('.mark-done');
      if (btn) btn.addEventListener('click', () => markDone(t.id));
      group.appendChild(row);
    }
    container.appendChild(group);
  }
}

async function markDone(taskId) {
  await LDH.supabase
    .from('tasks')
    .update({ done: true, completed_by_role: LDH.role, completed_at: new Date().toISOString() })
    .eq('id', taskId);
}
```

- [ ] **Step 3: Write the failing Playwright test for the core workflow and live sync**

`tests/task-board.spec.mjs`:

```js
import { test, expect } from '@playwright/test';

const APP_URL = 'http://127.0.0.1:4173/index.html';

async function login(page) {
  const url = `${APP_URL}?anon_key=${encodeURIComponent(process.env.SUPABASE_ANON_KEY)}`;
  await page.goto(url);
  await page.fill('#login-password', process.env.STAFF_LOGIN_PASSWORD);
  await page.click('#login-submit');
  await expect(page.locator('#app')).toHaveClass(/visible/);
}

test('attendant can submit a request; vet/nurse sees it and marks it done live', async ({ browser }) => {
  const attendantCtx = await browser.newContext();
  const attendantPage = await attendantCtx.newPage();
  await login(attendantPage);

  const vetCtx = await browser.newContext();
  const vetPage = await vetCtx.newPage();
  await login(vetPage);
  await vetPage.selectOption('#role-select', 'vet_nurse');

  await attendantPage.fill('#req-title', 'Playwright-Test-Animal-9001');
  await attendantPage.selectOption('#req-location', 'Pound 2');
  await attendantPage.click('#req-submit');

  await expect(vetPage.locator('#queue')).toContainText('Playwright-Test-Animal-9001', { timeout: 5000 });

  await vetPage.locator('div.card', { hasText: 'Playwright-Test-Animal-9001' })
    .locator('.mark-done').click();

  await expect(vetPage.locator('#queue')).not.toContainText('Playwright-Test-Animal-9001', { timeout: 5000 });

  await attendantCtx.close();
  await vetCtx.close();
});

test('attendant role does not see a mark-done button, and cannot see the request form as vet_nurse', async ({ page }) => {
  await login(page);
  await expect(page.locator('#new-request-form')).toBeVisible();
  await page.selectOption('#role-select', 'vet_nurse');
  await expect(page.locator('#new-request-form')).toBeHidden();
});
```

- [ ] **Step 4: Run the test to verify it fails before the markup/logic exists**

Run: `cd tests && SUPABASE_ANON_KEY=<local-anon-key> STAFF_LOGIN_PASSWORD=<password> npx playwright test task-board.spec.mjs && cd ..`
Expected: FAIL (elements don't exist yet) — confirms the test is exercising real functionality, not a false positive. (If following TDD strictly, run this before Steps 1-2; if implementing Steps 1-2 first, instead treat this as the "run before final pass" checkpoint and proceed to Step 5.)

- [ ] **Step 5: Run the test again with Steps 1-2 implemented**

Run: same command as Step 4.
Expected: both tests PASS.

- [ ] **Step 6: Commit**

```bash
git add index.html tests/task-board.spec.mjs
git commit -m "Add new request form, open queue, mark-done, and live sync"
```

---

## Task 6: Shift progress charts + roster panel

**Files:**
- Modify: `index.html`
- Create: `tests/panels.spec.mjs` (charts portion; memo/completed portions added in Task 7)
- Test: `tests/panels.spec.mjs`

**Interfaces:**
- Consumes: `LDH.tasks` (from Task 5's `loadTasks`), `ldh:tasks-updated` event.
- Produces: `#shift-progress` (three chart containers by shift) and `#roster-panel`, re-rendered on every `ldh:tasks-updated` event.

- [ ] **Step 1: Add chart and roster markup inside `#app`**

```html
<section class="card" id="shift-progress">
  <h2>Shift progress</h2>
  <div id="chart-processing"></div>
  <div id="chart-sick-injured"></div>
  <div id="chart-surgery"></div>
</section>

<section class="card" id="roster-panel">
  <h2>Today's roster</h2>
  <div id="roster-processing"><h4 style="color:var(--violet)">Processing</h4><div class="roster-chips" data-shift="processing"></div></div>
  <div id="roster-sick-injured"><h4 style="color:var(--amber)">Sick &amp; Injured</h4><div class="roster-chips" data-shift="sick_injured"></div></div>
  <div id="roster-surgery"><h4 style="color:var(--blue)">Surgery</h4><div class="roster-chips" data-shift="surgery"></div></div>
</section>
```

- [ ] **Step 2: Add chart rendering and roster load/render logic**

```js
document.addEventListener('ldh:tasks-updated', renderShiftProgress);
document.addEventListener('ldh:authenticated', loadRoster);

function renderShiftProgress() {
  const bySh = (shift) => LDH.tasks.filter((t) => t.shift === shift);

  const proc = bySh('processing');
  const procDone = proc.filter((t) => t.done).length;
  document.getElementById('chart-processing').innerHTML =
    `<strong style="color:var(--violet)">Processing</strong>: ${procDone} done / ${proc.length - procDone} remaining`;

  const si = bySh('sick_injured');
  const siPct = si.length ? Math.round((si.filter((t) => t.done).length / si.length) * 100) : 0;
  document.getElementById('chart-sick-injured').innerHTML =
    `<strong style="color:var(--amber)">Sick &amp; Injured</strong>: ${siPct}% complete`;

  const surg = bySh('surgery').filter((t) => !t.done);
  const byUrgency = { urgent: 0, soon: 0, routine: 0 };
  for (const t of surg) byUrgency[t.urgency]++;
  document.getElementById('chart-surgery').innerHTML =
    `<strong style="color:var(--blue)">Surgery remaining</strong>: urgent ${byUrgency.urgent}, soon ${byUrgency.soon}, routine ${byUrgency.routine}`;
}

async function loadRoster() {
  const { data, error } = await LDH.supabase
    .from('roster')
    .select('*')
    .eq('roster_date', new Date().toISOString().slice(0, 10));
  if (error) return;
  for (const shift of ['processing', 'sick_injured', 'surgery']) {
    const container = document.querySelector(`.roster-chips[data-shift="${shift}"]`);
    container.innerHTML = data
      .filter((r) => r.shift === shift)
      .map((r) => `<span class="card" style="display:inline-block;padding:4px 10px;margin:2px;">${r.staff_name}</span>`)
      .join('');
  }
}
```

- [ ] **Step 3: Write the failing test**

`tests/panels.spec.mjs`:

```js
import { test, expect } from '@playwright/test';

const APP_URL = 'http://127.0.0.1:4173/index.html';

async function login(page) {
  const url = `${APP_URL}?anon_key=${encodeURIComponent(process.env.SUPABASE_ANON_KEY)}`;
  await page.goto(url);
  await page.fill('#login-password', process.env.STAFF_LOGIN_PASSWORD);
  await page.click('#login-submit');
  await expect(page.locator('#app')).toHaveClass(/visible/);
}

test('shift progress charts render seeded data', async ({ page }) => {
  await login(page);
  await expect(page.locator('#chart-processing')).toContainText('Processing');
  await expect(page.locator('#chart-sick-injured')).toContainText('% complete');
  await expect(page.locator('#chart-surgery')).toContainText('urgent');
});

test('roster panel shows seeded staff under the correct shift', async ({ page }) => {
  await login(page);
  await expect(page.locator('.roster-chips[data-shift="surgery"]')).toContainText('Fictional Vet C');
});
```

- [ ] **Step 4: Run the test and confirm it fails before Steps 1-2**

Run: `cd tests && SUPABASE_ANON_KEY=<local-anon-key> STAFF_LOGIN_PASSWORD=<password> npx playwright test panels.spec.mjs && cd ..`
Expected: FAIL.

- [ ] **Step 5: Implement Steps 1-2, re-run**

Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add index.html tests/panels.spec.mjs
git commit -m "Add shift progress charts and roster panel"
```

---

## Task 7: Memo board + Recently completed panel

**Files:**
- Modify: `index.html`
- Modify: `tests/panels.spec.mjs` (add memo/completed test cases)
- Test: `tests/panels.spec.mjs`

**Interfaces:**
- Consumes: `LDH.role`, `LDH.supabase`, `LDH.tasks`.
- Produces: `#memo-board`, `#completed-panel`. Completion note field is explicitly labeled non-clinical, per spec.

- [ ] **Step 1: Add memo board and completed panel markup**

```html
<section class="card" id="memo-board">
  <h2>Memo board</h2>
  <div id="memo-list"></div>
  <div id="memo-post" hidden>
    <textarea id="memo-text" placeholder="Post a memo..."></textarea>
    <button id="memo-submit">Post</button>
  </div>
</section>

<section class="card" id="completed-panel">
  <h2>Recently completed</h2>
  <p style="font-size:0.85em;color:#555;">Status updates only — clinical detail belongs in the offline shift tool, not here.</p>
  <div id="completed-list"></div>
</section>
```

- [ ] **Step 2: Add memo and completed-panel logic**

```js
document.addEventListener('ldh:authenticated', () => {
  document.getElementById('memo-post').hidden = LDH.role !== 'vet_nurse';
  loadMemos();
  LDH.supabase
    .channel('memos-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'memos' }, loadMemos)
    .subscribe();
  document.getElementById('memo-submit').addEventListener('click', submitMemo);
});

document.getElementById('role-select')?.addEventListener('change', (e) => {
  document.getElementById('memo-post').hidden = e.target.value !== 'vet_nurse';
});

async function loadMemos() {
  const { data, error } = await LDH.supabase
    .from('memos')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) return;
  document.getElementById('memo-list').innerHTML = data
    .map((m) => `<div class="card"><strong>${m.author}</strong>: ${m.text}</div>`)
    .join('');
}

async function submitMemo() {
  const text = document.getElementById('memo-text').value.trim();
  if (!text) return;
  const { error } = await LDH.supabase.from('memos').insert({ author: 'Vet team', text });
  if (!error) document.getElementById('memo-text').value = '';
}

document.addEventListener('ldh:tasks-updated', renderCompletedPanel);

function renderCompletedPanel() {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const recent = LDH.tasks.filter(
    (t) => t.done && t.completed_at && new Date(t.completed_at).getTime() > cutoff
  );
  document.getElementById('completed-list').innerHTML = recent
    .map((t) => `<div class="card">${t.title} — done by ${t.completed_by_role} at ${new Date(t.completed_at).toLocaleTimeString()}${t.note ? ' — ' + t.note : ''}</div>`)
    .join('');
}
```

- [ ] **Step 3: Add failing test cases to `tests/panels.spec.mjs`**

Append:

```js
test('vet/nurse can post a memo, attendant cannot', async ({ page }) => {
  await login(page);
  await expect(page.locator('#memo-post')).toBeHidden();
  await page.selectOption('#role-select', 'vet_nurse');
  await expect(page.locator('#memo-post')).toBeVisible();
  await page.fill('#memo-text', 'Playwright test memo');
  await page.click('#memo-submit');
  await expect(page.locator('#memo-list')).toContainText('Playwright test memo');
});

test('completed panel shows the non-clinical disclaimer', async ({ page }) => {
  await login(page);
  await expect(page.locator('#completed-panel')).toContainText('clinical detail belongs in the offline shift tool');
});
```

- [ ] **Step 4: Run, confirm failure before Steps 1-2, then implement and re-run**

Run: `cd tests && SUPABASE_ANON_KEY=<local-anon-key> STAFF_LOGIN_PASSWORD=<password> npx playwright test panels.spec.mjs && cd ..`
Expected: new tests FAIL before Steps 1-2, PASS after.

- [ ] **Step 5: Commit**

```bash
git add index.html tests/panels.spec.mjs
git commit -m "Add memo board and recently-completed panel with non-clinical note disclaimer"
```

---

## Task 8: Security documentation and IT rollout checklist

**Files:**
- Modify: `README.md`

**Interfaces:**
- None (documentation only).

- [ ] **Step 1: Write the full README, replacing the Task 1 stub**

```markdown
# LDH Shift Ops Dashboard

**Status: prototype, fictional data only.** Do not enter real animal numbers,
real staff names, or any clinical detail until LDH IT has signed off per the
checklist below.

## What this is

A live, multi-user shift task board for The Lost Dogs' Home, replacing
ad-hoc coordination during Processing / Sick & Injured / Surgery shifts.
Full design rationale: `docs/superpowers/specs/2026-09-16-ldh-shift-ops-dashboard-design.md`.

## Security model

- **Separate Supabase project.** Not shared with `~/shelter-platform`
  (ShelterNexus) — its own database, its own credentials.
- **Access boundary:** public gets nothing; any authenticated LDH staff
  member (one shared login) gets everything. Enforced by Postgres
  Row-Level Security on every table (`tasks`, `memos`, `roster`), not by
  frontend JavaScript. A request without a valid session returns zero rows
  from the database itself — verified directly in `tests/rls.test.mjs`.
- **Clinical detail never enters this system.** Only operational metadata
  (task/location/shift/urgency/status) lives here. The actual medical
  record stays in the existing offline tools
  (`processing.html` / `sick-injured.html` / `surgery.html` in
  `~/ldh-shift-tools`), which remain local-storage-only and never touch a
  network.
- **The one trust-based (not technical) boundary:** the short completion
  note shown in "Recently completed" is meant for coordination only
  ("moved to Cat Room 2"), not clinical detail — RLS keeps it away from
  the public, but nothing stops a staff member from typing something
  clinical into it. The UI carries an explicit reminder of this.
- **Progress/documentation tracking** is a manual periodic cross-check:
  compare the live board's "done" list for a shift against that day's
  offline-tool export, using the animal ID present in both.

## Rollout checklist (before any real data)

1. LDH IT/security review of the production Supabase project config, RLS
   policies (`supabase/migrations/0002_rls_policies.sql`), and the
   shared-password approach.
2. Decide and document password rotation/storage practice: who holds it,
   how it's shared with new staff, how it's rotated if someone leaves.
3. Create the production Supabase project (`supabase projects create`),
   apply migrations (`supabase db push`), and provision the one shared
   staff auth account the same way as the local one in
   `supabase/seed.sql`'s companion `curl` command in the implementation
   plan — but with a real password chosen at rollout time, never
   committed to this repo.
4. Deploy `index.html` (it can stay on public GitHub Pages — the page
   ships with no data embedded, and fetches nothing until a session
   exists) with the production `SUPABASE_URL` and anon key injected via
   the same `window.__LDH_SUPABASE_URL__` / `?anon_key=` mechanism used
   in local testing.
5. Explicit sign-off before the first real (non-fictional) task is
   logged.

## Local development

```bash
supabase start        # local Postgres + Auth + Realtime
python3 -m http.server 4173   # serve index.html
cd tests && npm install && npx playwright install chromium
```

Run tests:

```bash
cd tests
SUPABASE_ANON_KEY=<from supabase start> STAFF_LOGIN_PASSWORD=<set in task 3> \
  node --test rls.test.mjs
SUPABASE_ANON_KEY=<...> STAFF_LOGIN_PASSWORD=<...> npx playwright test
```
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Document security model and IT rollout checklist"
```

---

## Self-Review Notes

- **Spec coverage:** dedicated Supabase project (Task 1-3), RLS-enforced public/staff boundary with a direct anonymous-query test (Task 2), single shared password (Task 3-4), online/offline data split with no clinical field in schema (Task 2, enforced by omission; documented Task 8), completed-panel non-clinical disclaimer (Task 7), shift progress charts x3, roster, memo board, new-request/queue/mark-done workflow (Tasks 5-7), fictional-data-only prototype scope and IT rollout checklist (Task 3 seed data, Task 8 README) — all covered.
- **Placeholder scan:** no TBD/TODO; all code blocks are complete and runnable given the stated local Supabase credentials, which are inherently per-machine (not a placeholder — a real secret that cannot be hardcoded).
- **Type/naming consistency:** `shift` values (`processing`/`sick_injured`/`surgery`), `role` values (`attendant`/`vet_nurse`), and column names are used identically across Tasks 2 through 8.
