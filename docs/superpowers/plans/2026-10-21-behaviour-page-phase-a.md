# Behaviour page (Phase A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Behaviour page with TL / cat assist / dog assist lanes, a behaviour task bar on the shelter staff page, a "request to vets" banner, Done-with-note feeding the Shelter board, and remembered initials.

**Architecture:** One new table `behaviour_tasks` (staff and team write it directly under the existing signed-in RLS, like `nurse_requests`). Pure rules (species from location, allowed lanes, due time, vet-request row, board lookup) live in `lib/ldh-logic.js` and are unit tested. `behaviour.html` is a new page copied from the `admission-aa.html` shell. The vet request reuses the `tasks` table via a builder like `nurseAskTask`.

**Tech Stack:** Static HTML + inline JS, Supabase (RLS + realtime), PGlite migration tests, node:test logic tests, Playwright UI tests against `tests/ui/harness.js`.

**Spec:** `docs/superpowers/specs/2026-10-21-behaviour-page-design.md` (Phase B, "Send to Behaviour" from the shift tools with the note attached, is a separate later plan).

## Global Constraints
- Run commands from `~/ldh-shift-ops`. UI tests: `NODE_PATH=~/.npm/_npx/e41f203b7505f1fb/node_modules node tests/ui/<file>`. Node tests: `cd tests && node --test <file>`.
- Fictional animals only in tests ("BEH-1"); no real codes, no patient text, no microchip numbers anywhere.
- Dogs and cats never cross: cat locations → lanes `tl`,`cat`; pound 1–4 → `tl`,`dog`; Transport / Rabbit / Pathway / unknown → `tl`,`cat`,`dog`.
- New staff requests land in lane `incoming`, unless "Send straight to TL" is ticked (lane `tl`).
- Reason is required for kinds `behaviour_review` and `incident_review`; kind `other` needs free text.
- Done requires a note and initials. Every request / move / done records initials.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus
- A location string with a pen ("Cat Room 1 / 12", "Pound 2 / 4") must resolve to the right species (`boardRoomOf` handles this); "Offsite" / blank must fall back to all three lanes, never crash.
- Moving a card with a stale lane (two people click at once): the update must not wipe the other person's Done note (move only updates `lane`/`history` where `status='open'`).
- Initials missing: no action may write a row without initials.
- A task flagged for an animal with no case on the Shelter board must not break the board.
- `done_at` older than 7 days rows must be deleted by the database (privacy), and the page must not show them.

## File Structure
- Create `supabase/migrations/0028_behaviour_tasks.sql`; `tests/behaviour-migration.test.mjs`
- Modify `lib/ldh-logic.js` (behaviour rules); create `tests/behaviour-logic.test.mjs`
- Modify `lib/ops-core.js` (nav link, `readInitials/saveInitials`)
- Modify `tests/ui/harness.js` (stub table)
- Create `behaviour.html`; `tests/ui/behaviour-page.test.js`, `behaviour-vet-request.test.js`
- Modify `index.html` (task bar, staff initials); create `tests/ui/staff-behaviour-bar.test.js`
- Modify `shelter-board.html`; create `tests/ui/behaviour-board.test.js`

---

### Task 1: Database table

**Files:** Create `supabase/migrations/0028_behaviour_tasks.sql`, `tests/behaviour-migration.test.mjs`

**Interfaces:** Produces table `behaviour_tasks(id uuid, created_at timestamptz, kind, animal_id, location, lane, due_window, reason, courthold bool, flagged_by, status, done_at, done_note, done_by, history jsonb)`.

- [ ] **Step 1: Write the failing test** `tests/behaviour-migration.test.mjs`

```js
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const MIG = path.resolve(import.meta.dirname, '../supabase/migrations');
async function db() {
  const d = new PGlite();
  await d.exec(`
    create schema auth;
    create function auth.role() returns text language sql as $$ select 'authenticated' $$;
    create function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('app.jwt', true), ''), '{}')::jsonb $$;
    create role authenticated; create role anon;
    create publication supabase_realtime;`);
  await d.exec(fs.readFileSync(path.join(MIG, '0028_behaviour_tasks.sql'), 'utf8'));
  return d;
}
const rejects = async (d, sql) => { try { await d.exec(sql); return null; } catch (e) { return String(e.message); } };
const ins = (extra = '') => `insert into public.behaviour_tasks (kind, animal_id, location, due_window, flagged_by ${extra ? ',' + extra.split('=')[0] : ''}) values ('behaviour_review','BEH-1','Cat Room 1 / 3','today','AB' ${extra ? ',' + extra.split('=')[1] : ''})`;

test('0028: defaults — lane incoming, status open, empty history, courthold false', async () => {
  const d = await db();
  await d.exec(ins());
  const r = (await d.query(`select lane, status, courthold, history from public.behaviour_tasks`)).rows[0];
  assert.equal(r.lane, 'incoming'); assert.equal(r.status, 'open'); assert.equal(r.courthold, false); assert.deepEqual(r.history, []);
});

test('0028: rejects unknown kind, lane, due_window and status', async () => {
  const d = await db();
  const base = { kind: "'other'", animal_id: "'X'", location: "'Pound 1'", due_window: "'today'", flagged_by: "'AB'" };
  for (const [col, bad] of [['kind', 'bogus'], ['lane', 'rabbit'], ['due_window', '1h'], ['status', 'maybe']]) {
    const v = Object.assign({}, base, { [col]: `'${bad}'` });
    const cols = Object.keys(v), sql = `insert into public.behaviour_tasks (${cols.join(',')}) values (${cols.map(c => v[c]).join(',')})`;
    assert.match(await rejects(d, sql) || '', /check/i, col);
  }
});

test('0028: RLS on, in the realtime publication, sync_writer shut out', async () => {
  const d = await db();
  assert.equal((await d.query(`select relrowsecurity from pg_class where relname='behaviour_tasks'`)).rows[0].relrowsecurity, true);
  assert.equal((await d.query(`select count(*)::int n from pg_publication_tables where pubname='supabase_realtime' and tablename='behaviour_tasks'`)).rows[0].n, 1);
  const pol = (await d.query(`select pg_get_expr(polqual, polrelid) q, pg_get_expr(polwithcheck, polrelid) w from pg_policy where polrelid='public.behaviour_tasks'::regclass`)).rows;
  assert.equal(pol.length, 4);
  assert.ok(pol.every(p => /sync_writer/.test((p.q || '') + (p.w || ''))));
});

test('0028: done rows older than 7 days are deleted when a new row arrives; recent done rows stay', async () => {
  const d = await db();
  await d.exec(`insert into public.behaviour_tasks (kind, animal_id, location, due_window, flagged_by, status, done_at, done_note, done_by)
    values ('other','OLD-1','Pound 1','today','AB','done', now() - interval '8 days','n','AB'),
           ('other','NEW-1','Pound 1','today','AB','done', now() - interval '1 day','n','AB')`);
  await d.exec(ins());
  const ids = (await d.query(`select animal_id from public.behaviour_tasks order by animal_id`)).rows.map(r => r.animal_id);
  assert.deepEqual(ids, ['BEH-1', 'NEW-1']);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd tests && node --test behaviour-migration.test.mjs`
Expected: FAIL — `ENOENT ... 0028_behaviour_tasks.sql`.

- [ ] **Step 3: Write the migration** `supabase/migrations/0028_behaviour_tasks.sql`

```sql
-- 2026-10-21: Behaviour team page (behaviour.html). One row per behaviour task.
-- Staff flag tasks from the shelter staff page; the team moves them between lanes and ticks them Done with a note.
-- Animal IDs and notes are patient data: done rows are deleted after 7 days (trigger below).
-- Run this whole file as ONE script. Safe to run more than once.
create table if not exists public.behaviour_tasks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('courthold','surrender_history','incident_review','behaviour_review','other')),
  animal_id text not null,
  location text not null,
  lane text not null default 'incoming' check (lane in ('incoming','tl','cat','dog')),
  due_window text not null check (due_window in ('30_60m','today','48h')),
  reason text,
  courthold boolean not null default false,
  flagged_by text,
  status text not null default 'open' check (status in ('open','done')),
  done_at timestamptz,
  done_note text,
  done_by text,
  history jsonb not null default '[]'::jsonb
);
create index if not exists behaviour_tasks_status_idx on public.behaviour_tasks (status, created_at);
create index if not exists behaviour_tasks_animal_idx on public.behaviour_tasks (animal_id);

create or replace function public.behaviour_tasks_cleanup() returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.behaviour_tasks where status = 'done' and done_at < now() - interval '7 days';
  return null;
end $$;
drop trigger if exists behaviour_tasks_cleanup on public.behaviour_tasks;
create trigger behaviour_tasks_cleanup after insert on public.behaviour_tasks
  for each statement execute function public.behaviour_tasks_cleanup();

alter table public.behaviour_tasks enable row level security;
do $$
declare cmd text;
begin
  foreach cmd in array array['select','insert','update','delete'] loop
    execute format('drop policy if exists "authenticated_%s_behaviour_tasks" on public.behaviour_tasks', cmd);
  end loop;
  create policy "authenticated_select_behaviour_tasks" on public.behaviour_tasks for select
    using (auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
  create policy "authenticated_insert_behaviour_tasks" on public.behaviour_tasks for insert
    with check (auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
  create policy "authenticated_update_behaviour_tasks" on public.behaviour_tasks for update
    using (auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
  create policy "authenticated_delete_behaviour_tasks" on public.behaviour_tasks for delete
    using (auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
end $$;
do $$ begin
  alter publication supabase_realtime add table public.behaviour_tasks;
exception when duplicate_object then null; end $$;
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd tests && node --test behaviour-migration.test.mjs`
Expected: PASS 4/4.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0028_behaviour_tasks.sql tests/behaviour-migration.test.mjs
git commit -m "feat: behaviour_tasks table (migration 0028)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Behaviour rules in LDHLogic

**Files:** Modify `lib/ldh-logic.js` (add before the final `return {` at ~line 689 and add names to the export list); create `tests/behaviour-logic.test.mjs`

**Interfaces:** Produces on `LDHLogic`: `BEHAVIOUR_KINDS`, `BEHAVIOUR_WINDOWS`, `BEHAVIOUR_LANES`, `behaviourSpecies(location) -> 'cat'|'dog'|'either'`, `behaviourLaneChoices(location) -> string[]`, `behaviourValidate({kind, animalId, location, reason}) -> string` (empty = OK), `behaviourDue(row) -> ms`, `behaviourCountdown(row, nowMs) -> {text, overdue}`, `behaviourVetRequest({type, animalId, location, locationDetail, courthold, note, initials}) -> tasks row`, `behaviourForAnimal(rows, animalId, nowMs) -> {open: row[], done: row|null}`.

- [ ] **Step 1: Write the failing test** `tests/behaviour-logic.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const L = createRequire(import.meta.url)('../lib/ldh-logic.js');

test('behaviourSpecies: cat rooms/adoptions are cat, pounds are dog, the rest either', () => {
  for (const loc of ['Cat Room 1 / 12', 'Cat Room 3', 'Adoption 2 / 4', 'FIR Room', 'Cat Isolation ward / 2']) assert.equal(L.behaviourSpecies(loc), 'cat', loc);
  for (const loc of ['Pound 1 / 3', 'Pound 4']) assert.equal(L.behaviourSpecies(loc), 'dog', loc);
  for (const loc of ['Transport', 'Rabbit Room / 2', 'Pathway', 'Offsite', '', null, 'Nowhere 9']) assert.equal(L.behaviourSpecies(loc), 'either', String(loc));
});

test('behaviourLaneChoices: dogs and cats never cross', () => {
  assert.deepEqual(L.behaviourLaneChoices('Cat Room 2 / 1'), ['tl', 'cat']);
  assert.deepEqual(L.behaviourLaneChoices('Pound 2 / 4'), ['tl', 'dog']);
  assert.deepEqual(L.behaviourLaneChoices('Transport'), ['tl', 'cat', 'dog']);
});

test('behaviourValidate: reason required for review kinds, text required for other', () => {
  const ok = { kind: 'courthold', animalId: 'BEH-1', location: 'Pound 1', reason: '' };
  assert.equal(L.behaviourValidate(ok), '');
  assert.match(L.behaviourValidate({ ...ok, animalId: ' ' }), /animal ID/i);
  assert.match(L.behaviourValidate({ ...ok, location: '' }), /space/i);
  assert.match(L.behaviourValidate({ ...ok, kind: 'behaviour_review' }), /reason/i);
  assert.match(L.behaviourValidate({ ...ok, kind: 'incident_review' }), /reason/i);
  assert.match(L.behaviourValidate({ ...ok, kind: 'other' }), /describe/i);
  assert.equal(L.behaviourValidate({ ...ok, kind: 'behaviour_review', reason: 'lunging at staff' }), '');
});

test('behaviourDue / behaviourCountdown', () => {
  const t0 = new Date('2026-10-21T10:00:00').getTime();
  const mk = w => ({ created_at: new Date(t0).toISOString(), due_window: w });
  assert.equal(L.behaviourDue(mk('30_60m')), t0 + 60 * 60000);
  assert.equal(L.behaviourDue(mk('48h')), t0 + 48 * 3600000);
  assert.equal(L.behaviourDue(mk('today')), new Date('2026-10-21T23:59:59.999').getTime());
  assert.equal(L.behaviourCountdown(mk('30_60m'), t0 + 20 * 60000).overdue, false);
  const late = L.behaviourCountdown(mk('30_60m'), t0 + 90 * 60000);
  assert.equal(late.overdue, true); assert.match(late.text, /overdue/i);
});

test('behaviourVetRequest: medication types wait on the nurse label; courthold and initials shown', () => {
  const base = { animalId: 'BEH-1', location: 'Cat Room 1 / 3', courthold: true, note: 'x', initials: 'AB' };
  const med = L.behaviourVetRequest({ ...base, type: 'shelter_stress_med' });
  assert.equal(med.type, 'medication'); assert.equal(med.needs_medication, true); assert.equal(med.sm_number, 'BEH-1');
  assert.equal(med.shift, 'sick_injured'); assert.equal(med.title, 'BEH-1'); assert.equal(med.location, 'Cat Room 1 / 3');
  assert.match(med.problem, /Behaviour team request/); assert.match(med.problem, /shelter stress medication/i);
  assert.match(med.problem, /COURTHOLD/); assert.match(med.problem, /sent by AB/);
  const pack = L.behaviourVetRequest({ ...base, type: 'post_adoption_pack', courthold: false });
  assert.match(pack.problem, /post adoption med pack/i); assert.doesNotMatch(pack.problem, /COURTHOLD/);
  const other = L.behaviourVetRequest({ ...base, type: 'other' });
  assert.equal(other.type, 'shelter'); assert.equal(other.needs_medication, false);
});

test('behaviourForAnimal: open tasks plus the latest done within 24h, matched ignoring spaces/case', () => {
  const now = new Date('2026-10-21T12:00:00').getTime();
  const rows = [
    { animal_id: 'beh 1', status: 'open', kind: 'behaviour_review' },
    { animal_id: 'BEH-1', status: 'done', done_at: new Date(now - 3600e3).toISOString(), done_note: 'a' },
    { animal_id: 'BEH-1', status: 'done', done_at: new Date(now - 2 * 3600e3).toISOString(), done_note: 'older' },
    { animal_id: 'BEH-1', status: 'done', done_at: new Date(now - 30 * 3600e3).toISOString(), done_note: 'too old' },
    { animal_id: 'OTHER', status: 'open' }
  ];
  const r = L.behaviourForAnimal(rows, 'BEH-1', now);
  assert.equal(r.open.length, 1); assert.equal(r.done.done_note, 'a');
  assert.equal(L.behaviourForAnimal(rows, 'NONE', now).done, null);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd tests && node --test behaviour-logic.test.mjs`
Expected: FAIL — `L.behaviourSpecies is not a function`.

- [ ] **Step 3: Implement** — insert above `return { AA_KINDS, ...` in `lib/ldh-logic.js`:

```js
  /* ---------- Behaviour team (2026-10-21) ---------- */
  const BEHAVIOUR_KINDS = { courthold: 'Courthold reassessment', surrender_history: 'Owner surrender history with concerns',
    incident_review: 'Aggression / incident review', behaviour_review: 'Behaviour review', other: 'Other' };
  const BEHAVIOUR_WINDOWS = { '30_60m': 'Within 30–60 minutes', today: 'Within today', '48h': 'Within 48 hours' };
  const BEHAVIOUR_LANES = { tl: 'Behaviour TL', cat: 'Cat assist', dog: 'Dog assist' };
  const BEHAVIOUR_VET_TYPES = { shelter_stress_med: 'Shelter stress medication', post_adoption_pack: 'Post adoption med pack', other: 'Other' };
  const BEHAVIOUR_CAT_ROOMS = ['CR1', 'CR2', 'CR3', 'CA1', 'CA2', 'FIR', 'ISO'], BEHAVIOUR_DOG_ROOMS = ['P1', 'P2', 'P3', 'P4'];
  // Cat rooms + cat adoptions are cats, Pound 1-4 are dogs; Transport (either species), Rabbit, Pathway, Offsite or an unknown place are 'either'.
  function behaviourSpecies(location) {
    const code = boardRoomOf(location).code;
    return BEHAVIOUR_CAT_ROOMS.includes(code) ? 'cat' : BEHAVIOUR_DOG_ROOMS.includes(code) ? 'dog' : 'either';
  }
  function behaviourLaneChoices(location) {
    const sp = behaviourSpecies(location);
    return sp === 'cat' ? ['tl', 'cat'] : sp === 'dog' ? ['tl', 'dog'] : ['tl', 'cat', 'dog'];
  }
  function behaviourValidate(o) {
    if (!String(o.animalId || '').trim()) return 'Enter the animal ID.';
    if (!String(o.location || '').trim()) return 'Choose the space.';
    const reason = String(o.reason || '').trim();
    if ((o.kind === 'behaviour_review' || o.kind === 'incident_review') && !reason) return 'Write the reason for the ' + BEHAVIOUR_KINDS[o.kind].toLowerCase() + '.';
    if (o.kind === 'other' && !reason) return 'Describe the issue you want to flag.';
    return '';
  }
  function behaviourDue(r) {
    const t0 = new Date(r.created_at).getTime();
    if (r.due_window === '30_60m') return t0 + 60 * 60000;
    if (r.due_window === '48h') return t0 + 48 * 3600000;
    const d = new Date(t0); d.setHours(23, 59, 59, 999); return d.getTime();
  }
  function behaviourCountdown(r, now) {
    const left = behaviourDue(r) - now;
    return left < 0 ? { text: 'overdue by ' + fmtDuration(-left), overdue: true } : { text: fmtDuration(left) + ' left', overdue: false };
  }
  // A behaviour-team request to the vets, as an ordinary row for the vet board. The two medication types wait on the nurse's label like any medication request.
  function behaviourVetRequest(o) {
    const label = (BEHAVIOUR_VET_TYPES[o.type] || BEHAVIOUR_VET_TYPES.other);
    const med = o.type === 'shelter_stress_med' || o.type === 'post_adoption_pack';
    const lc = label.charAt(0).toLowerCase() + label.slice(1);
    return {
      title: o.animalId, location: o.location, location_detail: o.locationDetail || null,
      shift: 'sick_injured', type: med ? 'medication' : 'shelter', urgency: 'urgent', red_flags: [],
      needs_medication: med, sm_number: med ? o.animalId : null, condition: null, done: false,
      problem: 'Behaviour team request — ' + (o.type === 'other' ? 'other' : 'dispense ' + lc) + (o.courthold ? ' (COURTHOLD)' : '')
        + (o.note ? ': ' + String(o.note).replace(/[.\s]+$/, '') : '') + '.' + (o.initials ? ' (sent by ' + o.initials + ')' : '')
    };
  }
  // For the Shelter board: this animal's open behaviour tasks, and the latest one finished in the last 24 hours.
  function behaviourForAnimal(rows, animalId, now) {
    const id = normId(animalId), mine = (rows || []).filter(r => normId(r.animal_id) === id);
    const open = mine.filter(r => r.status === 'open');
    const done = mine.filter(r => r.status === 'done' && r.done_at && now - new Date(r.done_at).getTime() < 24 * 3600000)
      .sort((a, b) => new Date(b.done_at) - new Date(a.done_at))[0] || null;
    return { open, done };
  }
```

Add to the export list: `BEHAVIOUR_KINDS, BEHAVIOUR_WINDOWS, BEHAVIOUR_LANES, BEHAVIOUR_VET_TYPES, behaviourSpecies, behaviourLaneChoices, behaviourValidate, behaviourDue, behaviourCountdown, behaviourVetRequest, behaviourForAnimal`. (Check `fmtDuration` takes milliseconds: `grep -n "function fmtDuration" -A6 lib/ldh-logic.js`; if it takes minutes, pass `/60000`.)

- [ ] **Step 4: Run to verify it passes**

Run: `cd tests && node --test behaviour-logic.test.mjs logic.test.mjs consistency.test.mjs`
Expected: all PASS (logic.test.mjs may need `MISC`-style expectations unchanged).

- [ ] **Step 5: Commit**

```bash
git add lib/ldh-logic.js tests/behaviour-logic.test.mjs
git commit -m "feat: behaviour rules in LDHLogic (lanes, due times, vet request, board lookup)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Shared plumbing (nav, initials memory, test stub)

**Files:** Modify `lib/ops-core.js`, `tests/ui/harness.js`; test `tests/ui/ops-core.test.js` stays green

**Interfaces:** Produces `OpsCore.readInitials(key) -> string` (today's saved value or ''), `OpsCore.saveInitials(key, value)`; nav key `behaviour`; stub table `behaviour_tasks`.

- [ ] **Step 1: Add nav link and helpers** in `lib/ops-core.js`: in `NAV_LINKS` insert after the `aa` line:

```js
    { key: 'behaviour', href: 'behaviour.html', label: 'Behaviour' },
```

and above `function navHTML` add:

```js
  // Initials are remembered per device for the day (same idea as the vets and nurses pages).
  function readInitials(key) {
    try { const o = JSON.parse(localStorage.getItem(key) || 'null'); return o && o.day === new Date().toDateString() ? String(o.v || '') : ''; } catch (e) { return ''; }
  }
  function saveInitials(key, v) {
    try { localStorage.setItem(key, JSON.stringify({ v: String(v || '').trim().toUpperCase(), day: new Date().toDateString() })); } catch (e) { /* storage blocked: just asked again */ }
  }
```

and add `readInitials, saveInitials` to the return list.

- [ ] **Step 2: Add the stub table** in `tests/ui/harness.js`: add `behaviour_tasks: []` to the `db` object; add to `defaults`:

```js
    behaviour_tasks: () => ({ lane: 'incoming', status: 'open', courthold: false, history: [], created_at: now() }),
```

- [ ] **Step 3: Run existing nav/shared tests**

Run: `NODE_PATH=~/.npm/_npx/e41f203b7505f1fb/node_modules node tests/ui/run-all.js 2>&1 | tail -5`
Expected: `ALL UI TESTS PASSED` (if any test counts nav links, update its expected count by +1 and note it).

- [ ] **Step 4: Commit**

```bash
git add lib/ops-core.js tests/ui/harness.js tests/ui
git commit -m "feat: Behaviour nav link, per-day initials helpers, stub table" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Behaviour page — lanes, incoming, move, done, add, filters

**Files:** Create `behaviour.html`, `tests/ui/behaviour-page.test.js`

**Interfaces:** Consumes Task 2/3 APIs. Produces DOM ids used by tests: `#bh-initials`, `#incoming-list`, `#lane-tl`, `#lane-cat`, `#lane-dog`, `.bh-card[data-id]`, `.bh-move`, `.bh-done`, `.bh-add[data-lane]`, `#f-kind`, `#f-window`, `#f-court`; modals `.done-overlay` (`.done-note`, `.done-confirm`, `.done-error`), `.add-overlay` (`.add-animal .add-room .add-pen .add-kind .add-window .add-reason .add-to .add-confirm .add-error`).

- [ ] **Step 1: Write the failing test** `tests/ui/behaviour-page.test.js`

```js
const { open } = require('./harness');
const t = require('./check')('behaviour-page');
const ago = ms => new Date(Date.now() - ms).toISOString();
const row = (x) => Object.assign({ kind: 'behaviour_review', animal_id: 'BEH-1', location: 'Cat Room 1 / 3', lane: 'incoming', due_window: 'today', reason: 'hissing at staff', flagged_by: 'AB', status: 'open', history: [], created_at: ago(600e3) }, x);
(async () => {
  const b = await open({ behaviour_tasks: [
    row({}),
    row({ animal_id: 'BEH-2', location: 'Pound 2 / 4', reason: 'guarding food' }),
    row({ animal_id: 'BEH-3', location: 'Transport', kind: 'courthold', courthold: true, reason: '' }),
    row({ animal_id: 'BEH-4', location: 'Cat Room 2 / 1', lane: 'tl', kind: 'incident_review' }),
    row({ animal_id: 'BEH-5', location: 'Pound 1 / 2', lane: 'dog', due_window: '30_60m', created_at: ago(2 * 3600e3) })
  ] }, 'behaviour.html');
  try {
    await b.page.waitForSelector('.bh-card');
    t.ok(await b.page.locator('#incoming-list .bh-card').count() === 3, 'new requests sit in Incoming');
    t.ok(await b.page.locator('#lane-tl .bh-card').count() === 1 && await b.page.locator('#lane-dog .bh-card').count() === 1 && await b.page.locator('#lane-cat .bh-card').count() === 0, 'lanes hold their own cards');
    t.ok(/overdue/i.test(await b.page.textContent('#lane-dog .bh-card')), 'a 30-60 min task two hours old shows overdue');
    t.ok(/hissing at staff/.test(await b.page.textContent('#incoming-list')), 'the reason shows on the card');
    t.ok(await b.page.locator('#incoming-list .bh-card:has-text("BEH-3") .bh-court').count() === 1, 'courthold badge');

    // species rule on the Move menu
    const opts = id => b.page.$$eval(`.bh-card[data-animal="${id}"] .bh-move option`, os => os.map(o => o.value).filter(Boolean));
    t.ok((await opts('BEH-1')).join() === 'tl,cat', 'a cat offers TL or Cat assist only: ' + await opts('BEH-1'));
    t.ok((await opts('BEH-2')).join() === 'tl,dog', 'a dog offers TL or Dog assist only');
    t.ok((await opts('BEH-3')).join() === 'tl,cat,dog', 'transport offers all three');

    // initials are needed before any action
    await b.page.selectOption('.bh-card[data-animal="BEH-1"] .bh-move', 'cat');
    t.ok(/initials/i.test(await b.page.textContent('#bh-error')), 'moving without initials is refused');
    t.ok((await b.db()).behaviour_tasks[0].lane === 'incoming', 'and nothing was written');
    await b.page.fill('#bh-initials', 'jx'); await b.page.dispatchEvent('#bh-initials', 'change');
    await b.page.selectOption('.bh-card[data-animal="BEH-1"] .bh-move', 'cat');
    await b.page.waitForFunction(() => window.__db.behaviour_tasks[0].lane === 'cat');
    const moved = (await b.db()).behaviour_tasks[0];
    t.ok(moved.history.length === 1 && moved.history[0].to === 'cat' && moved.history[0].by === 'JX', 'move is recorded with initials');
    t.ok(await b.page.locator('#lane-cat .bh-card[data-animal="BEH-1"]').count() === 1, 'card appears in the Cat assist lane');

    // Done needs a note
    await b.page.click('#lane-cat .bh-card[data-animal="BEH-1"] .bh-done');
    await b.page.click('.done-confirm');
    t.ok(/note/i.test(await b.page.textContent('.done-error')), 'Done asks for a note');
    await b.page.fill('.done-note', 'calm with handling; keep quiet room');
    await b.page.click('.done-confirm');
    await b.page.waitForFunction(() => window.__db.behaviour_tasks[0].status === 'done');
    const done = (await b.db()).behaviour_tasks[0];
    t.ok(done.done_note === 'calm with handling; keep quiet room' && done.done_by === 'JX' && done.done_at, 'Done stores note, initials and time');
    t.ok(await b.page.locator('.bh-card[data-animal="BEH-1"]').count() === 0, 'a finished task leaves the lanes');

    // remembered initials survive a reload
    await b.page.reload(); await b.page.waitForSelector('#bh-initials');
    t.ok(await b.page.inputValue('#bh-initials') === 'JX', 'initials are remembered on this device');

    // add a team task: TL gives a task to the dog assist; cat location cannot go to dog assist
    await b.page.click('.bh-add[data-lane="tl"]');
    await b.page.fill('.add-animal', 'BEH-9'); await b.page.selectOption('.add-room', 'Cat Room 1'); await b.page.fill('.add-pen', '7');
    t.ok((await b.page.$$eval('.add-to option', os => os.map(o => o.value))).join() === 'tl,cat', 'give-to follows the room (cat room: TL / Cat assist)');
    await b.page.selectOption('.add-room', 'Pound 3');
    t.ok((await b.page.$$eval('.add-to option', os => os.map(o => o.value))).join() === 'tl,dog', 'pound: TL / Dog assist');
    await b.page.selectOption('.add-to', 'dog'); await b.page.selectOption('.add-kind', 'behaviour_review');
    await b.page.click('.add-confirm');
    t.ok(/reason/i.test(await b.page.textContent('.add-error')), 'review kinds need a reason');
    await b.page.fill('.add-reason', 'check kennel stress'); await b.page.click('.add-confirm');
    await b.page.waitForFunction(() => window.__db.behaviour_tasks.some(r => r.animal_id === 'BEH-9'));
    const added = (await b.db()).behaviour_tasks.find(r => r.animal_id === 'BEH-9');
    t.ok(added.lane === 'dog' && added.location === 'Pound 3 / 7' && added.flagged_by === 'JX', 'team task lands in the chosen lane with initials');

    // filters
    await b.page.check('#f-court');
    t.ok(await b.page.locator('.bh-card').count() === 1, 'courthold filter shows only courthold tasks');
    await b.page.uncheck('#f-court');
    await b.page.selectOption('#f-kind', 'incident_review');
    t.ok(await b.page.locator('.bh-card').count() === 1, 'kind filter');
    t.ok(b.errors.length === 0, 'no page errors: ' + b.errors.join('; '));
  } finally { await b.browser.close(); }
  t.done();
})();
```

- [ ] **Step 2: Run to verify it fails**

Run: `NODE_PATH=~/.npm/_npx/e41f203b7505f1fb/node_modules node tests/ui/behaviour-page.test.js`
Expected: FAIL (page missing / selector timeout).

- [ ] **Step 3: Build `behaviour.html`.** Start from the shell:

```bash
sed -n '1,155p' admission-aa.html | sed 's|LDH Shift Ops — Admission AA|LDH Shift Ops — Behaviour|' > behaviour.html
```

Then append the following (page-specific CSS, markup, script, and footer copied from the end of `admission-aa.html`: the `<!-- ip-notice-footer -->` block).

```html
  .bh-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; align-items: start; }
  .bh-col { min-width: 0; display: flex; flex-direction: column; gap: 16px; }
  .bh-lane { background: var(--card-bg); border: 1px solid var(--border); border-top-width: 5px; border-radius: 14px; box-shadow: var(--shadow-card); padding: 14px 16px; }
  .bh-lane[data-lane="tl"] { border-top-color: #7c5cbf; } .bh-lane[data-lane="cat"] { border-top-color: #c98a1a; } .bh-lane[data-lane="dog"] { border-top-color: #3b6ea5; }
  .bh-lane > h3 { margin: 0 0 10px; font-size: 15px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .bh-lane > h3 .bh-add { margin-left: auto; padding: 4px 10px; font-size: 0.75rem; }
  .bh-card { border: 1px solid var(--border); border-radius: 12px; padding: 10px 12px; margin-bottom: 10px; background: var(--card-bg); }
  .bh-card.overdue { border: 2px solid #c0392b; background: rgba(192,57,43,.06); }
  .bh-card .bh-top { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
  .bh-card .aid { font-weight: 800; } .bh-card .meta { font-size: 0.78rem; color: var(--muted); }
  .bh-court { font-size: 11px; font-weight: 800; color: #fff; background: #c0392b; border-radius: 999px; padding: 2px 9px; }
  .bh-card .bh-reason { font-size: 0.85rem; margin: 6px 0; white-space: pre-wrap; }
  .bh-card .bh-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .bh-card .bh-done { background: var(--green); color: #fff; }
  .bh-filters { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; font-size: 0.85rem; }
  .bh-filters select, .bh-filters label { width: auto; margin: 0; }
  .vet-banner .row { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; align-items: end; }
  @media (max-width: 900px) { .bh-cols { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<div class="layout" id="app-root" style="display:none;">
  <aside>
    <h2>LDH Shift Ops</h2>
    <div id="ops-nav" style="margin-bottom:18px;"></div>
    <label style="font-size:0.78rem; color: var(--sidebar-text-muted);">Your initials (kept on this device today)</label>
    <input id="bh-initials" maxlength="4" placeholder="e.g. AB" style="margin-bottom:12px;">
    <p class="hint">Requests from shelter staff arrive in Incoming. Move each to the Behaviour TL or the right assist (cats stay with cat assist, dogs with dog assist), then tick Done with a note about what you found.</p>
    <span id="signout-link">Sign out</span>
  </aside>
  <main>
    <div class="page-head"><div><h1>Behaviour</h1><p>Behaviour team tasks. Done notes show on the Shelter board.</p></div></div>
    <p id="bh-error" class="oc-modal-error" style="margin:0;"></p>

    <section class="card vet-banner" id="bh-vet-form">
      <h2>Request to vets</h2>
      <p class="subtle">Goes onto the vet board. Dispense shelter stress medication, a post adoption med pack, or something else.</p>
      <div class="row">
        <label>Request<select id="bv-type">
          <option value="shelter_stress_med">Dispense shelter stress medication</option>
          <option value="post_adoption_pack">Post adoption med pack</option>
          <option value="other">Other</option></select></label>
        <label>Shelter ID<input id="bv-animal" placeholder="Animal ID"></label>
        <label>Space<select id="bv-room"></select></label>
        <label>Pen / detail<input id="bv-pen" placeholder="Pen #"></label>
        <label>Note<input id="bv-note" placeholder="optional"></label>
        <label style="display:flex; gap:6px; align-items:center;"><input type="checkbox" id="bv-courthold" style="width:auto;"> Courthold</label>
        <button type="button" id="bv-send">Send to vets</button>
      </div>
      <p id="bv-error" class="oc-modal-error"></p>
    </section>

    <section class="card"><div class="bh-filters">
      <b>Filter</b>
      <select id="f-kind"><option value="">All kinds</option></select>
      <select id="f-window"><option value="">Any time frame</option></select>
      <label><input type="checkbox" id="f-court" style="width:auto;"> Courthold only</label>
    </div></section>

    <section class="card" id="incoming"><h2>Incoming <span id="incoming-count" class="box-count"></span></h2><div id="incoming-list"></div></section>

    <div class="bh-cols">
      <div class="bh-col"><section class="bh-lane" id="lane-tl-wrap" data-lane="tl"><h3>Behaviour TL <button type="button" class="secondary bh-add" data-lane="tl">+ Task</button></h3><div id="lane-tl"></div></section></div>
      <div class="bh-col">
        <section class="bh-lane" data-lane="cat"><h3>Cat assist <button type="button" class="secondary bh-add" data-lane="cat">+ Task</button></h3><div id="lane-cat"></div></section>
        <section class="bh-lane" data-lane="dog"><h3>Dog assist <button type="button" class="secondary bh-add" data-lane="dog">+ Task</button></h3><div id="lane-dog"></div></section>
      </div>
    </div>
  </main>
</div>
<script>
  let sb = null, ROWS = [];
  const esc = OpsCore.esc, INIT_KEY = 'ldh_behaviour_initials_v1';
  const $ = id => document.getElementById(id);
  const initials = () => ($('bh-initials').value || '').trim().toUpperCase();
  function needInitials() { if (initials()) { $('bh-error').style.display = 'none'; return true; } $('bh-error').textContent = 'Enter your initials first (top left).'; $('bh-error').style.display = 'block'; return false; }
  const locText = (room, pen) => (LDHLogic.OFFSITE_NAMES.includes(room) || !pen ? room : room + ' / ' + pen);

  async function loadAll() {
    const { data, error } = await sb.from('behaviour_tasks').select('*').order('created_at', { ascending: true });
    if (!error) ROWS = data || [];
    render();
  }
  function filtered() {
    const k = $('f-kind').value, w = $('f-window').value, c = $('f-court').checked;
    return ROWS.filter(r => r.status === 'open' && (!k || r.kind === k) && (!w || r.due_window === w) && (!c || r.courthold || r.kind === 'courthold'));
  }
  function cardHtml(r, now) {
    const cd = LDHLogic.behaviourCountdown(r, now);
    const choices = LDHLogic.behaviourLaneChoices(r.location).filter(l => l !== r.lane);
    const court = r.courthold || r.kind === 'courthold';
    return `<div class="bh-card${cd.overdue ? ' overdue' : ''}" data-id="${esc(r.id)}" data-animal="${esc(r.animal_id)}">
      <div class="bh-top"><span class="aid">${esc(r.animal_id)}</span><span class="meta">${esc(r.location)}</span>${court ? '<span class="bh-court">COURTHOLD</span>' : ''}</div>
      <div class="meta">${esc(LDHLogic.BEHAVIOUR_KINDS[r.kind] || r.kind)} · ${esc(LDHLogic.BEHAVIOUR_WINDOWS[r.due_window])} · ${esc(cd.text)} · flagged by ${esc(r.flagged_by || '?')}</div>
      ${r.reason ? `<div class="bh-reason">${esc(r.reason)}</div>` : ''}
      <div class="bh-actions">
        <select class="bh-move"><option value="">${r.lane === 'incoming' ? 'Assign to…' : 'Move to…'}</option>${choices.map(l => `<option value="${l}">${esc(LDHLogic.BEHAVIOUR_LANES[l])}</option>`).join('')}</select>
        <button type="button" class="bh-done">Done</button>
      </div></div>`;
  }
  function render() {
    const now = Date.now(), rows = filtered();
    $('f-kind').dataset.ready || (() => {
      Object.entries(LDHLogic.BEHAVIOUR_KINDS).forEach(([k, v]) => $('f-kind').insertAdjacentHTML('beforeend', `<option value="${k}">${esc(v)}</option>`));
      Object.entries(LDHLogic.BEHAVIOUR_WINDOWS).forEach(([k, v]) => $('f-window').insertAdjacentHTML('beforeend', `<option value="${k}">${esc(v)}</option>`));
      $('f-kind').dataset.ready = '1';
    })();
    ['incoming', 'tl', 'cat', 'dog'].forEach(lane => {
      const els = rows.filter(r => r.lane === lane).sort((a, b) => LDHLogic.behaviourDue(a) - LDHLogic.behaviourDue(b));
      const host = lane === 'incoming' ? $('incoming-list') : $('lane-' + lane);
      host.innerHTML = els.map(r => cardHtml(r, now)).join('') || '<p class="empty-state">Nothing here.</p>';
      if (lane === 'incoming') $('incoming-count').textContent = els.length || '';
    });
  }

  async function changeRow(id, patch, entry) {
    const row = ROWS.find(r => r.id === id); if (!row) return 'Task not found.';
    const history = (row.history || []).concat([Object.assign({ at: new Date().toISOString(), by: initials() }, entry)]);
    const { data, error } = await sb.from('behaviour_tasks').update(Object.assign({ history }, patch)).eq('id', id).eq('status', 'open').select();
    if (error) return error.message;
    if (!data || !data.length) return 'Someone already finished that task.';
    return '';
  }
  document.addEventListener('change', async (e) => {
    const mv = e.target.closest('.bh-move'); if (!mv || !mv.value) return;
    if (!needInitials()) { mv.value = ''; return; }
    const id = mv.closest('.bh-card').dataset.id, from = ROWS.find(r => r.id === id).lane;
    const err = await changeRow(id, { lane: mv.value }, { from, to: mv.value });
    if (err) { $('bh-error').textContent = err; $('bh-error').style.display = 'block'; }
    loadAll();
  });
  $('bh-initials').addEventListener('change', () => OpsCore.saveInitials(INIT_KEY, initials()));
  ['f-kind', 'f-window', 'f-court'].forEach(id => $(id).addEventListener('change', render));

  /* ---- Done with a note ---- */
  function modal(html, cls) {
    document.querySelectorAll('.' + cls).forEach(el => el.remove());
    const w = document.createElement('div'); w.innerHTML = html;
    document.body.appendChild(w.firstElementChild); return document.querySelector('.' + cls);
  }
  document.addEventListener('click', async (e) => {
    const d = e.target.closest('.bh-done');
    if (d) {
      if (!needInitials()) return;
      const card = d.closest('.bh-card');
      const o = modal(`<div class="oc-modal-overlay done-overlay" data-id="${esc(card.dataset.id)}"><div class="oc-modal">
        <h3>Done — ${esc(card.dataset.animal)}</h3>
        <label style="font-size:0.78rem; font-weight:700;">Note (what you found / the plan) — this shows on the Shelter board</label>
        <textarea class="done-note" rows="4"></textarea>
        <p class="oc-modal-error done-error"></p>
        <div class="oc-modal-actions"><button type="button" class="oc-modal-cancel done-cancel">Cancel</button><button type="button" class="oc-modal-submit done-confirm">Mark done</button></div></div></div>`, 'done-overlay');
      return;
    }
    if (e.target.closest('.done-cancel')) { document.querySelector('.done-overlay').remove(); return; }
    const ok = e.target.closest('.done-confirm');
    if (ok) {
      const o = ok.closest('.done-overlay'), note = o.querySelector('.done-note').value.trim(), er = o.querySelector('.done-error');
      if (!note) { er.textContent = 'Write a note — it goes back to the Shelter board.'; er.style.display = 'block'; return; }
      ok.disabled = true;
      const err = await changeRow(o.dataset.id, { status: 'done', done_at: new Date().toISOString(), done_note: note, done_by: initials() }, { done: true });
      if (err) { ok.disabled = false; er.textContent = err; er.style.display = 'block'; return; }
      o.remove(); loadAll(); return;
    }

    /* ---- add a team task ---- */
    const add = e.target.closest('.bh-add');
    if (add) {
      if (!needInitials()) return;
      const o = modal(`<div class="oc-modal-overlay add-overlay"><div class="oc-modal">
        <h3>New behaviour task</h3>
        <label>Animal ID<input class="add-animal"></label>
        <label>Space<select class="add-room">${LDHLogic.LOCATIONS.map(l => `<option>${esc(l)}</option>`).join('')}</select></label>
        <label>Pen / detail<input class="add-pen"></label>
        <label>Task<select class="add-kind">${Object.entries(LDHLogic.BEHAVIOUR_KINDS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></label>
        <label>Time frame<select class="add-window">${Object.entries(LDHLogic.BEHAVIOUR_WINDOWS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></label>
        <label>Reason / details<textarea class="add-reason" rows="3"></textarea></label>
        <label>Give to<select class="add-to"></select></label>
        <p class="oc-modal-error add-error"></p>
        <div class="oc-modal-actions"><button type="button" class="oc-modal-cancel add-cancel">Cancel</button><button type="button" class="oc-modal-submit add-confirm">Add task</button></div></div></div>`, 'add-overlay');
      const room = o.querySelector('.add-room'), to = o.querySelector('.add-to');
      const sync = () => { const ch = LDHLogic.behaviourLaneChoices(room.value), keep = ch.includes(add.dataset.lane) ? add.dataset.lane : ch[0];
        to.innerHTML = ch.map(l => `<option value="${l}">${esc(LDHLogic.BEHAVIOUR_LANES[l])}</option>`).join(''); to.value = keep; };
      room.addEventListener('change', sync); sync();
      return;
    }
    if (e.target.closest('.add-cancel')) { document.querySelector('.add-overlay').remove(); return; }
    const addOk = e.target.closest('.add-confirm');
    if (addOk) {
      const o = addOk.closest('.add-overlay'), er = o.querySelector('.add-error'), q = s => o.querySelector(s).value.trim();
      const location = locText(q('.add-room'), q('.add-pen'));
      const msg = LDHLogic.behaviourValidate({ kind: q('.add-kind'), animalId: q('.add-animal'), location, reason: q('.add-reason') });
      if (msg) { er.textContent = msg; er.style.display = 'block'; return; }
      addOk.disabled = true;
      const { error } = await sb.from('behaviour_tasks').insert({ kind: q('.add-kind'), animal_id: q('.add-animal'), location, lane: q('.add-to'),
        due_window: q('.add-window'), reason: q('.add-reason') || null, courthold: q('.add-kind') === 'courthold', flagged_by: initials(),
        history: [{ at: new Date().toISOString(), by: initials(), from: 'new', to: q('.add-to') }] });
      if (error) { addOk.disabled = false; er.textContent = error.message; er.style.display = 'block'; return; }
      o.remove(); loadAll();
    }
  });

  /* ---- Request to vets ---- */
  async function sendTaskToVets(row) {
    let { error } = await sb.from('tasks').insert(row);
    if (error && error.code === '23505') {   // same animal already has a case in that pen on this shift: add to it (or reopen if finished)
      const { data: found } = await sb.from('tasks').select('*').eq('title', row.title).eq('location', row.location).eq('shift', row.shift);
      const old = found && found[0];
      if (old && !old.done) ({ error } = await sb.from('tasks').update({ problem: [old.problem, row.problem].filter(Boolean).join(' — ') }).eq('id', old.id));
      else if (old) ({ error } = await sb.from('tasks').update(Object.assign({}, row, { created_at: new Date().toISOString(), completed_at: null, completed_by_role: null, claimed_by: null, claimed_at: null,
        vet_done_at: null, med_chart_done: false, med_label: null, med_done_by: null, med_done_at: null, note: null, treatment: null, plan: null })).eq('id', old.id));
    }
    return error;
  }
  $('bv-send').addEventListener('click', async () => {
    const er = $('bv-error'), fail = m => { er.textContent = m; er.style.display = 'block'; };
    er.style.display = 'none';
    const animalId = $('bv-animal').value.trim();
    if (!animalId) return fail('Enter the shelter ID.');
    if (!needInitials()) return fail('Enter your initials first (top left).');
    const room = $('bv-room').value, pen = $('bv-pen').value.trim(), off = LDHLogic.OFFSITE_NAMES.includes(room);
    const btn = $('bv-send'); btn.disabled = true;
    const row = LDHLogic.behaviourVetRequest({ type: $('bv-type').value, animalId, location: locText(room, pen), locationDetail: off ? pen : '',
      courthold: $('bv-courthold').checked, note: $('bv-note').value.trim(), initials: initials() });
    const error = await sendTaskToVets(row);
    btn.disabled = false;
    if (error) return fail('Could not send to the vets: ' + error.message);
    ['bv-animal', 'bv-pen', 'bv-note'].forEach(id => { $(id).value = ''; }); $('bv-courthold').checked = false;
    er.textContent = 'Sent to the vets.'; er.style.display = 'block'; er.style.color = 'var(--green)';
  });

  (async function () {
    const { sb: client } = await OpsCore.init({ page: 'behaviour' });
    sb = client;
    $('bv-room').innerHTML = LDHLogic.LOCATIONS.map(l => `<option>${esc(l)}</option>`).join('');
    $('bh-initials').value = OpsCore.readInitials(INIT_KEY);
    $('app-root').style.display = 'grid';
    await loadAll();
    OpsCore.subscribe(['behaviour_tasks'], loadAll);
    setInterval(render, 60000);
    $('signout-link').addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });
  })();
</script>
```

Then append the `<!-- ip-notice-footer -->` block and `</body></html>` (copy from the end of `admission-aa.html`).

Notes while building: `.page-head`, `.box-count`, `.oc-modal*` come from the copied shell / `ops-core.js`. If `error` colour of `#bv-error` stays green after a later failure, reset `er.style.color=''` at the start of the handler (add that line).

- [ ] **Step 4: Run to verify it passes**

Run: `NODE_PATH=~/.npm/_npx/e41f203b7505f1fb/node_modules node tests/ui/behaviour-page.test.js`
Expected: `behaviour-page: ALL PASSED`. Fix selectors/code until every line PASSes (read every FAIL line).

- [ ] **Step 5: Commit**

```bash
git add behaviour.html tests/ui/behaviour-page.test.js
git commit -m "feat: Behaviour page (incoming, TL/cat/dog lanes, move, done with note, add, filters)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: "Request to vets" banner test

**Files:** Create `tests/ui/behaviour-vet-request.test.js` (banner already built in Task 4)

- [ ] **Step 1: Write the test**

```js
const { open } = require('./harness');
const t = require('./check')('behaviour-vet-request');
(async () => {
  const b = await open({}, 'behaviour.html');
  try {
    await b.page.waitForSelector('#bv-send');
    await b.page.click('#bv-send');
    t.ok(/shelter ID/i.test(await b.page.textContent('#bv-error')), 'asks for the shelter ID');
    await b.page.fill('#bv-animal', 'BEH-1');
    await b.page.click('#bv-send');
    t.ok(/initials/i.test(await b.page.textContent('#bv-error')), 'asks for initials');
    t.ok((await b.db()).tasks.length === 0, 'nothing sent without initials');
    await b.page.fill('#bh-initials', 'jx'); await b.page.dispatchEvent('#bh-initials', 'change');
    await b.page.selectOption('#bv-room', 'Cat Room 1'); await b.page.fill('#bv-pen', '12');
    await b.page.check('#bv-courthold'); await b.page.fill('#bv-note', 'two weeks');
    await b.page.click('#bv-send');
    await b.page.waitForFunction(() => window.__db.tasks.length === 1);
    const r = (await b.db()).tasks[0];
    t.ok(r.title === 'BEH-1' && r.location === 'Cat Room 1 / 12' && r.type === 'medication' && r.needs_medication === true, 'shelter stress medication lands on the vet board as a medication request');
    t.ok(/COURTHOLD/.test(r.problem) && /sent by JX/.test(r.problem) && /two weeks/.test(r.problem), 'courthold, initials and note are in the request: ' + r.problem);
    await b.page.fill('#bv-animal', 'BEH-2'); await b.page.selectOption('#bv-type', 'other');
    await b.page.click('#bv-send');
    await b.page.waitForFunction(() => window.__db.tasks.length === 2);
    const o = (await b.db()).tasks[1];
    t.ok(o.type === 'shelter' && !o.needs_medication && !/COURTHOLD/.test(o.problem), '"Other" is a plain shelter request, no courthold when unticked');
    t.ok(b.errors.length === 0, 'no page errors: ' + b.errors.join('; '));
  } finally { await b.browser.close(); }
  t.done();
})();
```

- [ ] **Step 2: Run** `NODE_PATH=~/.npm/_npx/e41f203b7505f1fb/node_modules node tests/ui/behaviour-vet-request.test.js` — Expected: ALL PASSED (the banner was written in Task 4; if a check fails, fix `behaviour.html`).
- [ ] **Step 3: Commit** `git add tests/ui/behaviour-vet-request.test.js behaviour.html && git commit -m "test: behaviour request-to-vets banner" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"`

---

### Task 6: Behaviour task bar on the shelter staff page

**Files:** Modify `index.html` (insert after the nurse-request `</section>`, before `<div class="kpi-row">`; script near the nurse-request submit handler); create `tests/ui/staff-behaviour-bar.test.js`

**Interfaces:** Consumes `LDHLogic.behaviourValidate`, `OpsCore.readInitials/saveInitials` (key `ldh_behaviour_initials_v1`). Produces ids `#bh-bar #bk-kind #bk-animal #bk-room #bk-pen #bk-window #bk-reason #bk-tl #bk-initials #bk-submit #bk-error`.

- [ ] **Step 1: Write the failing test** `tests/ui/staff-behaviour-bar.test.js`

```js
const { open } = require('./harness');
const t = require('./check')('staff-behaviour-bar');
(async () => {
  const s = await open({}, 'index.html');
  try {
    await s.page.waitForSelector('#bk-submit');
    const bar = await s.page.evaluate(() => { const nr = document.getElementById('nurse-requests'), bh = document.getElementById('bh-bar'); return !!(nr.compareDocumentPosition(bh) & Node.DOCUMENT_POSITION_FOLLOWING); });
    t.ok(bar, 'the behaviour bar sits below the nurse request bar');
    t.ok((await s.page.$$eval('#bk-kind option', os => os.map(o => o.value))).join() === 'courthold,surrender_history,incident_review,behaviour_review,other', 'task kinds');
    t.ok((await s.page.$$eval('#bk-window option', os => os.map(o => o.value))).join() === '30_60m,today,48h', 'time frames');
    await s.page.click('#bk-submit');
    t.ok(/animal ID/i.test(await s.page.textContent('#bk-error')), 'asks for the animal ID');
    await s.page.fill('#bk-animal', 'BEH-1'); await s.page.selectOption('#bk-kind', 'behaviour_review');
    await s.page.click('#bk-submit');
    t.ok(/reason/i.test(await s.page.textContent('#bk-error')), 'behaviour review needs the reason');
    await s.page.fill('#bk-reason', 'bit a volunteer');
    await s.page.click('#bk-submit');
    t.ok(/initials/i.test(await s.page.textContent('#bk-error')), 'and initials');
    t.ok((await s.db()).behaviour_tasks.length === 0, 'nothing written yet');
    await s.page.fill('#bk-initials', 'ab'); await s.page.dispatchEvent('#bk-initials', 'change');
    await s.page.selectOption('#bk-room', 'Pound 2'); await s.page.fill('#bk-pen', '4');
    await s.page.selectOption('#bk-window', '30_60m');
    await s.page.click('#bk-submit');
    await s.page.waitForFunction(() => window.__db.behaviour_tasks.length === 1);
    const r = (await s.db()).behaviour_tasks[0];
    t.ok(r.lane === 'incoming' && r.location === 'Pound 2 / 4' && r.due_window === '30_60m' && r.flagged_by === 'AB' && r.reason === 'bit a volunteer', 'lands in Incoming with place, time frame, reason, initials');
    // courthold reassessment needs no reason; send straight to TL
    await s.page.fill('#bk-animal', 'BEH-2'); await s.page.selectOption('#bk-kind', 'courthold'); await s.page.fill('#bk-reason', '');
    await s.page.check('#bk-tl'); await s.page.click('#bk-submit');
    await s.page.waitForFunction(() => window.__db.behaviour_tasks.length === 2);
    const c = (await s.db()).behaviour_tasks[1];
    t.ok(c.lane === 'tl' && c.courthold === true && c.kind === 'courthold', 'courthold reassessment sent straight to TL');
    // other needs text
    await s.page.fill('#bk-animal', 'BEH-3'); await s.page.selectOption('#bk-kind', 'other'); await s.page.uncheck('#bk-tl'); await s.page.click('#bk-submit');
    t.ok(/describe/i.test(await s.page.textContent('#bk-error')), '"Other" needs a description');
    t.ok(s.errors.length === 0, 'no page errors: ' + s.errors.join('; '));
  } finally { await s.browser.close(); }
  t.done();
})();
```

- [ ] **Step 2: Run to verify it fails** — Expected: FAIL (`#bk-submit` missing).

- [ ] **Step 3: Implement.** Insert this section after the nurse request `</section>` in `index.html`:

```html
    <section class="card nurse-card" id="bh-bar" style="background:#f6f1fd; border-left-color:#7c5cbf;">
      <h2 style="color:#5b3fa0;">Behaviour request</h2>
      <p class="subtle">Courthold reassessment, owner surrender history with concerns, aggression / incident review or a behaviour review. The behaviour team sees it straight away.</p>
      <div class="nr-form">
        <label>Task<select id="bk-kind">
          <option value="courthold">Courthold reassessment</option>
          <option value="surrender_history">Owner surrender history with concerns</option>
          <option value="incident_review">Aggression / incident review</option>
          <option value="behaviour_review">Behaviour review</option>
          <option value="other">Other</option></select></label>
        <label>Animal ID<input id="bk-animal" placeholder="Animal ID"></label>
        <label>Space<select id="bk-room"></select></label>
        <label>Pen / detail<input id="bk-pen" placeholder="Pen #"></label>
        <label>Needed within<select id="bk-window">
          <option value="30_60m">Within 30–60 minutes</option>
          <option value="today">Within today</option>
          <option value="48h">Within 48 hours</option></select></label>
        <label>Reason (required for reviews)<textarea id="bk-reason" rows="2" placeholder="Why are you flagging this animal? Or describe another issue."></textarea></label>
        <label>Your initials<input id="bk-initials" maxlength="4" placeholder="e.g. AB"></label>
        <label style="display:flex; gap:6px; align-items:center;"><input type="checkbox" id="bk-tl" style="width:auto;"> Send straight to the Behaviour TL</label>
        <button id="bk-submit" type="button">Send to behaviour</button>
      </div>
      <p id="bk-error" class="oc-modal-error"></p>
    </section>
```

And in the page script (after the `nr-submit` handler):

```js
  /* ---- Behaviour request (2026-10-21) ---- */
  (function () {
    const KEY = 'ldh_behaviour_initials_v1', $ = id => document.getElementById(id);
    $('bk-room').innerHTML = LDHLogic.LOCATIONS.map(l => `<option>${esc(l)}</option>`).join('');
    $('bk-initials').value = OpsCore.readInitials(KEY);
    $('bk-initials').addEventListener('change', () => OpsCore.saveInitials(KEY, $('bk-initials').value));
    $('bk-submit').addEventListener('click', async () => {
      const er = $('bk-error'), fail = m => { er.textContent = m; er.style.display = 'block'; };
      er.style.display = 'none';
      const kind = $('bk-kind').value, room = $('bk-room').value, pen = $('bk-pen').value.trim();
      const location = LDHLogic.OFFSITE_NAMES.includes(room) || !pen ? room : room + ' / ' + pen;
      const msg = LDHLogic.behaviourValidate({ kind, animalId: $('bk-animal').value, location, reason: $('bk-reason').value });
      if (msg) return fail(msg);
      const who = $('bk-initials').value.trim().toUpperCase();
      if (!who) return fail('Enter your initials.');
      const btn = $('bk-submit'); btn.disabled = true;
      const lane = $('bk-tl').checked ? 'tl' : 'incoming';
      const { error } = await sb.from('behaviour_tasks').insert({ kind, animal_id: $('bk-animal').value.trim(), location, lane,
        due_window: $('bk-window').value, reason: $('bk-reason').value.trim() || null, courthold: kind === 'courthold', flagged_by: who,
        history: [{ at: new Date().toISOString(), by: who, from: 'new', to: lane }] });
      btn.disabled = false;
      if (error) return fail('Could not send: ' + error.message);
      OpsCore.saveInitials(KEY, who);
      ['bk-animal', 'bk-pen', 'bk-reason'].forEach(id => { $(id).value = ''; }); $('bk-tl').checked = false;
    });
  })();
```

(`esc` must be in scope in `index.html`'s script; if it is named differently, use that name. `sb` is the page's Supabase client.)

- [ ] **Step 4: Run** the new test, then `node tests/ui/flag-form.test.js` and `node tests/ui/nurse-requests.test.js`. Expected: ALL PASSED.
- [ ] **Step 5: Commit** `git add index.html tests/ui/staff-behaviour-bar.test.js && git commit -m "feat: behaviour task bar on the shelter staff page" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"`

---

### Task 7: Optional initials on the staff nurse request and flag forms

**Files:** Modify `index.html`; create `tests/ui/staff-initials.test.js`

**Interfaces:** Consumes `OpsCore.readInitials/saveInitials`. Staff key `ldh_staff_initials_v1`. Produces `#nr-initials`, `#req-initials`; initials appended as `(sent by AB)`.

- [ ] **Step 1: Failing test**

```js
const { open } = require('./harness');
const t = require('./check')('staff-initials');
(async () => {
  const s = await open({}, 'index.html');
  try {
    await s.page.waitForSelector('#nr-initials');
    await s.page.fill('#nr-initials', 'cd'); await s.page.dispatchEvent('#nr-initials', 'change');
    t.ok(await s.page.inputValue('#req-initials') === 'CD', 'one set of initials is shared by the staff forms');
    await s.page.fill('#nr-note', 'from van 2'); await s.page.click('#nr-submit');
    await s.page.waitForFunction(() => window.__db.nurse_requests.length === 1);
    const n = (await s.db()).nurse_requests[0];
    t.ok(/sent by CD/.test(n.note) && /from van 2/.test(n.note) && n.created_by === 'Shelter Staff (CD)', 'nurse request carries the initials: ' + n.note);
    await s.page.fill('#nr-initials', ''); await s.page.dispatchEvent('#nr-initials', 'change');
    await s.page.click('#nr-submit');
    await s.page.waitForFunction(() => window.__db.nurse_requests.length === 2);
    t.ok((await s.db()).nurse_requests[1].created_by === 'Shelter Staff', 'initials stay optional');
    t.ok(s.errors.length === 0, 'no page errors: ' + s.errors.join('; '));
  } finally { await s.browser.close(); }
  t.done();
})();
```

- [ ] **Step 2: Run** — Expected: FAIL (`#nr-initials` missing).
- [ ] **Step 3: Implement.**
  - In the nurse request form add before `<button id="nr-submit"`: `<label>Your initials (optional)<input id="nr-initials" maxlength="4" placeholder="e.g. AB"></label>`.
  - In the flag form find the submit button (`grep -n 'id="req-submit"' index.html`) and add the same field immediately before it with `id="req-initials"`.
  - Script: shared sync of the two inputs and the key `ldh_staff_initials_v1`:

```js
  (function () {
    const KEY = 'ldh_staff_initials_v1', ids = ['nr-initials', 'req-initials'];
    const els = () => ids.map(i => document.getElementById(i)).filter(Boolean);
    els().forEach(e => { e.value = OpsCore.readInitials(KEY); e.addEventListener('change', () => { OpsCore.saveInitials(KEY, e.value); els().forEach(o => { o.value = e.value.trim().toUpperCase(); }); }); });
    window.staffInitials = () => (els()[0] && els()[0].value.trim().toUpperCase()) || '';
  })();
```

  - In the `nr-submit` payload: `created_by: 'Shelter Staff' + (window.staffInitials() ? ' (' + window.staffInitials() + ')' : '')` and `note:` becomes `[note, staffInitials ? 'sent by ' + staffInitials : ''].filter(Boolean).join(' — ') || null`.
  - In the flag `baseRow.problem` join, add `window.staffInitials() ? '(sent by ' + window.staffInitials() + ')' : ''` as a last element of the filtered array (keep the `|| null`).
- [ ] **Step 4: Run** the new test plus `flag-form`, `nurse-requests`, `vet-board` tests. Expected: ALL PASSED (update any assertion that compared the exact `note` / `problem` only if initials were typed; they are not by default).
- [ ] **Step 5: Commit** `git add index.html tests/ui/staff-initials.test.js && git commit -m "feat: optional remembered initials on staff nurse request and flag forms" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"`

---

### Task 8: Behaviour outcome on the Shelter board

**Files:** Modify `shelter-board.html`; create `tests/ui/behaviour-board.test.js`

**Interfaces:** Consumes `LDHLogic.behaviourForAnimal`. Produces `.bh-line` inside a case card.

- [ ] **Step 1: Failing test**

```js
const { open } = require('./harness');
const t = require('./check')('behaviour-board');
const ago = ms => new Date(Date.now() - ms).toISOString();
(async () => {
  const b = await open({
    tasks: [{ title: 'BEH-1', location: 'Cat Room 1 / 3', shift: 'sick_injured', type: 'shelter', urgency: 'urgent', problem: 'sneezing', done: false }],
    behaviour_tasks: [
      { animal_id: 'BEH-1', kind: 'behaviour_review', location: 'Cat Room 1 / 3', due_window: 'today', status: 'done', done_at: ago(3600e3), done_by: 'JX', done_note: 'calm with handling', history: [] },
      { animal_id: 'BEH-1', kind: 'courthold', location: 'Cat Room 1 / 3', due_window: 'today', status: 'open', lane: 'cat', history: [] },
      { animal_id: 'NO-CASE', kind: 'other', location: 'Pound 1', due_window: 'today', status: 'open', lane: 'dog', history: [] }
    ]
  }, 'shelter-board.html');
  try {
    await b.page.waitForSelector('.case');
    const txt = await b.page.textContent('.case[data-case]');
    t.ok(/Behaviour done/i.test(txt) && /calm with handling/.test(txt) && /JX/.test(txt), 'the Done note and initials show on the animal\'s card');
    t.ok(/Behaviour.*(waiting|open|pending)/i.test(txt) && /Courthold reassessment/.test(txt), 'an open behaviour task shows as pending');
    t.ok(await b.page.locator('.case').count() === 1, 'animals with no case on the board do not add cards or break it');
    t.ok(b.errors.length === 0, 'no page errors: ' + b.errors.join('; '));
  } finally { await b.browser.close(); }
  t.done();
})();
```

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** in `shelter-board.html`:
  - `let BEHAVIOUR = [];` next to `let HISTORY`.
  - In `loadAll()`: add `sb.from('behaviour_tasks').select('*')` to the `Promise.all`, destructure as `behRes`, and set `BEHAVIOUR = behRes.error ? [] : (behRes.data || []);` (the board must still work if migration 0028 hasn't been run).
  - In `caseHtml`, before the `return`, compute and insert after the `case-body` fields:

```js
    const bh = LDHLogic.behaviourForAnimal(BEHAVIOUR, t.title, Date.now());
    const bhLines = bh.open.map(r => `<div class="field bh-line"><span class="lbl">Behaviour</span><span class="txt">${esc(LDHLogic.BEHAVIOUR_KINDS[r.kind] || r.kind)} — waiting for the behaviour team</span></div>`).join('')
      + (bh.done ? `<div class="field bh-line"><span class="lbl">Behaviour done</span><span class="txt">${esc(bh.done.done_note || '')} (${esc(bh.done.done_by || '?')}, ${esc(fmtClock(bh.done.done_at))})</span></div>` : '');
```

  and add `${bhLines}` after `${line('Plan', t.plan)}`.
  - Also add `OpsCore.subscribe(['tasks', 'behaviour_tasks'], loadAll)` (replace the existing `['tasks']`).
- [ ] **Step 4: Run** the new test plus `node tests/ui/shelter-board.test.js`. Expected: ALL PASSED.
- [ ] **Step 5: Commit** `git add shelter-board.html tests/ui/behaviour-board.test.js && git commit -m "feat: behaviour outcome and pending tasks on the Shelter board" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"`

---

### Task 10 (added 2026-10-21 at Juliana's request): "Task for behaviour" on the Vets and Nurses pages

Juliana: vets, nurses and the behaviour team should each be able to give each other tasks from their own page, not only from the shelter staff page. The vets already have request forms to nurses, and nurses have "Task for vets"; this adds **Task for behaviour** to both.

**Files:** Modify `lib/ops-core.js` (shared window `.bt-open` -> `.bt-overlay`, inserts a `behaviour_tasks` row, initials remembered under `ldh_behaviour_initials_v1`), `vets.html` (button above the KPI row), `nurses.html` (button beside "Task for vets" in both columns); create `tests/ui/task-for-behaviour.test.js`.

- [ ] Write the test (both pages: window opens, asks for animal ID, reason for reviews, initials; lands in Incoming with place, time frame, reason, initials; initials remembered) and watch it fail.
- [ ] Implement the shared window and the three buttons; test passes; `vets-page`, `nurses-page`, `ops-core` UI tests still pass.
- [ ] Commit.

---

### Task 9: Whole-suite check, mobile, docs, memory

**Files:** Modify `tests/README.md`; create `tests/ui/behaviour-mobile.test.js`; update memory file

- [ ] **Step 1: Mobile test** (phone 390px, tablet 820px: no horizontal scroll, lanes stack on phone, tap targets reachable)

```js
const { open } = require('./harness');
const t = require('./check')('behaviour-mobile');
(async () => {
  for (const [name, w, h] of [['phone', 390, 800], ['tablet', 820, 1100]]) {
    for (const pg of ['behaviour.html', 'index.html']) {
      const b = await open({ behaviour_tasks: [{ animal_id: 'BEH-1', kind: 'behaviour_review', location: 'Cat Room 1 / 3', lane: 'tl', due_window: 'today', reason: 'x', status: 'open', history: [] }] }, pg, { contextOptions: { viewport: { width: w, height: h } } });
      try {
        await b.page.waitForTimeout(300);
        const over = await b.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        t.ok(over <= 1, `${name} ${pg}: no sideways scroll (${over}px)`);
        if (pg === 'behaviour.html' && name === 'phone') {
          const tops = await b.page.evaluate(() => ['lane-tl', 'lane-cat', 'lane-dog'].map(i => document.getElementById(i).getBoundingClientRect().top));
          t.ok(tops[0] < tops[1] && tops[1] < tops[2], 'phone: TL, Cat assist, Dog assist stack in one column');
        }
      } finally { await b.browser.close(); }
    }
  }
  t.done();
})();
```

Run it; fix CSS in `behaviour.html` (e.g. `main { min-width:0 }`, wrap `.bh-actions`) until it passes.

- [ ] **Step 2: Full suites**

Run:
```bash
cd tests && node --test *.test.mjs 2>&1 | tail -8; cd .. && NODE_PATH=~/.npm/_npx/e41f203b7505f1fb/node_modules node tests/ui/run-all.js 2>&1 | tail -6
```
Expected: node `fail 0`; `ALL UI TESTS PASSED`. If an older test counts nav links or compares exact flag `problem` text, update it and say so in the commit.

- [ ] **Step 3: Docs** — add to `tests/README.md` the new suites (`behaviour-logic`, `behaviour-migration`, `behaviour-page`, `behaviour-vet-request`, `staff-behaviour-bar`, `staff-initials`, `behaviour-board`, `behaviour-mobile`).

- [ ] **Step 4: Memory** — append a "Oct 21 — Behaviour page (Phase A)" section to `/Users/jxue/.claude/projects/-Users-jxue/memory/project_ldh_shift_ops_dashboard.md` (lanes, Incoming, species rule, 7-day purge, migration 0028 must be run by Juliana, Phase B = Send to Behaviour from tools with whole note, note deleted on Done, needs IT sign-off) and the Oct 21 vets-initials/"Task for vets"/label-wording batch from the previous session; update the MEMORY.md pointer line.

- [ ] **Step 5: Commit, push, PR**

```bash
git add -A && git commit -m "test: behaviour mobile layout, docs" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push -u origin HEAD
gh pr create --title "Behaviour page, behaviour task bar, request to vets" --body "Phase A of docs/superpowers/specs/2026-10-21-behaviour-page-design.md. Juliana must run migration 0028 before use. 🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

Do not merge until Juliana says "merge". After merge she runs `0028_behaviour_tasks.sql` in the Supabase SQL editor. No Edge Function change is needed for Phase A.
