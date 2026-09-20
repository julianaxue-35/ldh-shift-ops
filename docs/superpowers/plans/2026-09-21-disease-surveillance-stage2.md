# Disease Surveillance — Stage 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A disease-surveillance board built on the signs staff already flag: a heat map of each space's rate (share of cages holding a flagged animal), a group summary, a ranked list of the most commonly reported signs, a "building baseline" banner backed by nightly snapshots, a widened sign list, and a one-click A4 report export.

**Architecture:** Same static site + Supabase + shared login. Pure counting logic goes in `lib/ldh-logic.js` (unit-tested in Node); HTML rendering for the board goes in one shared browser module `lib/surveillance-view.js` (used by both the dashboard's compact card and the stats page); styles in `lib/surveillance.css`. One migration adds the spaces table, the snapshots table, a snapshot function and the wider sign list. A nightly `pg_cron` job (Juliana already enabled pg_cron) calls the snapshot function.

**Tech Stack:** Vanilla JS, Supabase JS v2, Postgres (migration tested with PGlite), `node:test`, Playwright with the existing in-memory Supabase stub.

**Spec:** `docs/superpowers/specs/2026-09-20-floor-and-vet-desk-redesign-design.md` §7 (Disease surveillance) and §8. This plan is stage 2 of 4; the vet-diagnosed layer (Giardia, FURI/FURTI, RW, CIRDC/KC read from Sick & Injured and Processing) is stage 3 and is **out of scope here**.

## Global Constraints

- Static site only: no build step, no bundler, no new runtime dependency. New JS/CSS load with plain `<script src>` / `<link>`.
- Every value interpolated into HTML goes through `esc()` (the view module has its own `esc`).
- **Reported signs** (exact list and storage values, in this order): `cat_flu` "Cat flu (URI)", `kennel_cough` "Kennel cough", `diarrhoea` "Diarrhoea / GI upset", `vomiting` "Vomiting", `eye_condition` "Eye condition", `skin_condition` "Skin condition", `wounds_injury` "Wounds / injury / trauma", `other` "Other". Giardia and other diagnoses are NOT signs and must not appear in the flag form.
- **Rate** = distinct animals (by `tasks.title`) with a flagged sign created within the window ÷ the space's cages, as a percentage with one decimal. Each animal counts once per space. The default window is **last 3 days**. Options: Today, Last 3 days, Last 7 days, Last 30 days, This month.
- A task's **space** is the text before the first `/` in `tasks.location`, trimmed (e.g. `Cat Room 1 / 4` → `Cat Room 1`). Flagged animals whose space is not in the `locations` table are counted in overall totals and the ranked list, and reported as "N flagged animals had a space that isn't in the list" — never silently dropped.
- **No red / "outbreak" language or colours anywhere on the board.** The heat map uses a neutral blue tint scale. No rate-based alerts until a baseline exists.
- **Baseline banner** wording: while building: "Building your baseline — day X of 30." When done (30 or more snapshot days): "Baseline collected — 30+ days of snapshots. Thresholds can now be set from your own data."
- **Caveat text (verbatim meaning):** rates are the share of a space's cages holding an animal flagged with a sign in the period; cages are capacity not occupancy so a half-empty space reads low; only animals someone flagged are counted, so it reads lower than vet-exam prevalence — compare against your own baseline, not older prevalence figures.
- **Cages (Cranbourne, 23 Aug 2026 count)** and groups, verbatim: Cat Room 1 30, Cat Room 2 24, Cat Room 3 10, FIR Room 32 (group "Cat rooms"); Adoption 1 16, Adoption 2 16 ("Cat adoption"); Cat Isolation ward 6 ("Isolation"); Pound 1 30, Pound 2 26, Pound 3 60, Pound 4 9 ("Pounds"); Transport 10 ("Transport"). Total 269. Space names match the flag form's dropdown (`LDHLogic.LOCATIONS`).
- New tables follow the access model of migration 0008: RLS on, `select` for `authenticated` with the same `sync_writer` guard as 0003 (`and coalesce(auth.jwt() -> 'app_metadata' ->> 'role','') <> 'sync_writer'`). `locations` and `surveillance_snapshots` have NO insert/update/delete policies for API users (edited only in the SQL editor / by the job).
- Only operational metadata goes to the cloud. British spelling in UI text.
- Never point tests at the live Supabase project. Do not push or run anything against production until Task 8.
- Every commit message ends with these two trailer lines:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_019i8WeJhv2ECwicHJkS2C3y
  ```

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/0009_surveillance.sql` (new) | Wider sign list, `locations` (+ seed), `surveillance_snapshots`, `take_surveillance_snapshot()`, RLS |
| `tests/surveillance-migration.test.mjs` (new) | PGlite tests for 0009 |
| `tests/consistency.test.mjs` (new) | Guards that the migration's space names / sign keys equal the JS constants |
| `lib/ldh-logic.js` (modify) | `SIGN_KEYS`, wider `CONDITION_LABELS`, `spaceOf`, `windowStart`, `buildSurvey`, `baselineStatus`, wider `summariseConditions` |
| `tests/logic.test.mjs` (modify) | Unit tests for the above |
| `lib/surveillance-view.js` (new) | Browser HTML for heat map, group table, ranked list, baseline banner, caveat |
| `lib/surveillance.css` (new) | Neutral heat-map tile styles |
| `tests/surveillance-view.test.mjs` (new) | Node tests of the view module's HTML |
| `stats.html` (modify) | Full board, window switch, baseline banner, print layout, Export report |
| `index.html` (modify) | Widened flag-form signs; compact "Disease watch" card |
| `tests/ui/harness.js` (modify) | Stub tables `locations`, `surveillance_snapshots` |
| `tests/ui/fixtures.js` (new) | `LOCATION_ROWS` fixture for browser tests |
| `tests/ui/*.test.js` (modify/new) | Browser tests per UI task |

---

### Task 1: Migration 0009 + PGlite tests

**Files:**
- Create: `supabase/migrations/0009_surveillance.sql`
- Create: `tests/surveillance-migration.test.mjs`

**Interfaces:**
- Produces (DB): `tasks.condition` accepts the 8 sign keys; `locations(name pk, grp, cages, sort)` seeded with 12 spaces; `surveillance_snapshots(snapshot_date, space, condition, animals, cages, primary key(snapshot_date,space,condition))` where `condition` is a sign key or the literal `'any'` (distinct animals with any sign); `public.take_surveillance_snapshot(p_days int default 3) returns int` (rows written; upserts for the Melbourne date of `now() - interval '1 hour'`).

- [ ] **Step 1: Write the failing test**

Create `tests/surveillance-migration.test.mjs`:
```js
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const MIG = path.resolve(import.meta.dirname, '../supabase/migrations');
const CHAIN = ['0001_init_schema.sql', '0002_rls_policies.sql', '0003_sync_account_scope.sql', '0004_task_problem_field.sql',
  '0005_task_condition_field.sql', '0008_triage_and_vet_desk.sql', '0009_surveillance.sql'];

async function db() {
  const d = new PGlite();
  await d.exec(`
    create schema auth;
    create function auth.role() returns text language sql as $$ select 'authenticated' $$;
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('app.jwt', true), ''), '{}')::jsonb $$;
    create role authenticated; create role anon;
    create publication supabase_realtime;`);
  for (const f of CHAIN) await d.exec(fs.readFileSync(path.join(MIG, f), 'utf8'));
  return d;
}
const rejects = async (d, sql) => { try { await d.exec(sql); return null; } catch (e) { return String(e.message); } };

test('the wider sign list is accepted; a diagnosis is not', async () => {
  const d = await db();
  for (const k of ['cat_flu', 'kennel_cough', 'diarrhoea', 'vomiting', 'eye_condition', 'skin_condition', 'wounds_injury', 'other']) {
    await d.exec(`insert into public.tasks (title,location,shift,condition) values ('x-${k}','Cat Room 1 / 1','sick_injured','${k}')`);
  }
  assert.match(await rejects(d, `insert into public.tasks (title,location,shift,condition) values ('g','Cat Room 1 / 2','sick_injured','giardia')`), /check constraint|violates/i);
});

test('locations are seeded with the Cranbourne spaces and 269 cages', async () => {
  const d = await db();
  const r = await d.query(`select name, grp, cages from public.locations order by sort`);
  assert.deepEqual(r.rows.map(x => x.name), ['Cat Room 1', 'Cat Room 2', 'Cat Room 3', 'FIR Room', 'Adoption 1', 'Adoption 2', 'Cat Isolation ward', 'Pound 1', 'Pound 2', 'Pound 3', 'Pound 4', 'Transport']);
  assert.equal(r.rows.reduce((n, x) => n + x.cages, 0), 269);
  assert.equal(r.rows.find(x => x.name === 'Cat Isolation ward').grp, 'Isolation');
  assert.equal(r.rows.find(x => x.name === 'FIR Room').grp, 'Cat rooms');
});

test('take_surveillance_snapshot counts distinct animals per space and sign within the window, idempotently', async () => {
  const d = await db();
  await d.exec(`
    insert into public.tasks (title,location,shift,condition,created_at) values
      ('A1','Cat Room 1 / 4','sick_injured','cat_flu', now()),
      ('A2','Cat Room 1 / 5','sick_injured','cat_flu', now()),
      ('A1','Cat Room 1 / 4','processing','kennel_cough', now()),
      ('A3','Pound 2 / 7','sick_injured','cat_flu', now() - interval '5 days'),
      ('A4','Unknown room / 1','sick_injured','other', now()),
      ('A5','Cat Room 2 / 1','sick_injured', null, now());`);
  const n1 = (await d.query(`select public.take_surveillance_snapshot() as n`)).rows[0].n;
  assert.equal(n1, 108, '12 spaces x (8 signs + any)');
  const row = async (space, cond) => (await d.query(`select animals, cages from public.surveillance_snapshots where space=$1 and condition=$2`, [space, cond])).rows[0];
  assert.deepEqual(await row('Cat Room 1', 'cat_flu'), { animals: 2, cages: 30 });
  assert.deepEqual(await row('Cat Room 1', 'kennel_cough'), { animals: 1, cages: 30 });
  assert.equal((await row('Cat Room 1', 'any')).animals, 2, 'A1 has two signs but is one animal');
  assert.equal((await row('Pound 2', 'any')).animals, 0, 'a 5-day-old flag is outside the 3-day window');
  assert.equal((await row('Cat Room 2', 'any')).animals, 0, 'a task with no sign is not counted');
  const total = () => d.query(`select count(*)::int as n from public.surveillance_snapshots`).then(r => r.rows[0].n);
  assert.equal(await total(), 108);
  await d.query(`select public.take_surveillance_snapshot()`);
  assert.equal(await total(), 108, 'running twice on the same day upserts, never duplicates');
  const dt = (await d.query(`select distinct snapshot_date::text as d from public.surveillance_snapshots`)).rows;
  const expected = (await d.query(`select ((now() - interval '1 hour') at time zone 'Australia/Melbourne')::date::text as d`)).rows[0].d;
  assert.deepEqual(dt, [{ d: expected }], 'dated by the Melbourne evening the job ran in');
});

test('locations and snapshots are read-only for API users and guarded against sync_writer', async () => {
  const d = await db();
  const pol = await d.query(`select tablename, cmd, qual from public.pg_policies where tablename in ('locations','surveillance_snapshots') order by 1,2`.replace('public.pg_policies', 'pg_policies'));
  const pairs = pol.rows.map(r => `${r.tablename}:${r.cmd}`).sort();
  assert.deepEqual(pairs, ['locations:SELECT', 'surveillance_snapshots:SELECT'], 'exactly one SELECT policy each, nothing writable');
  pol.rows.forEach(r => assert.ok(String(r.qual).includes('sync_writer'), r.tablename + ' select policy must carry the sync_writer guard'));
  await d.exec(`grant all on all tables in schema public to authenticated; set role authenticated; set app.jwt = '{"app_metadata":{}}';`);
  assert.equal((await d.query(`select count(*)::int as n from public.locations`)).rows[0].n, 12, 'staff can read locations');
  assert.match(await rejects(d, `insert into public.locations (name,grp,cages,sort) values ('X','G',1,99)`), /row.level security|policy/i);
  await d.exec(`set app.jwt = '{"app_metadata":{"role":"sync_writer"}}'`);
  assert.equal((await d.query(`select count(*)::int as n from public.locations`)).rows[0].n, 0, 'sync_writer sees nothing');
  await d.exec(`reset role`);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/surveillance-migration.test.mjs`
Expected: FAIL — `ENOENT ... 0009_surveillance.sql`. (If it fails earlier while applying 0001–0008, fix the harness bootstrap in `db()`, not those migrations. If PGlite lacks the `Australia/Melbourne` timezone, replace the date expression in BOTH the test and the function by `((now() - interval '1 hour') at time zone 'UTC' + interval '10 hours')::date` and note it in your report.)

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0009_surveillance.sql`:
```sql
-- Stage 2 of the Floor / Vet desk redesign: disease surveillance (2026-09-21).
-- Run this whole file as ONE script.

-- 1. Wider list of REPORTED SIGNS (diagnoses such as Giardia are deliberately not signs).
alter table public.tasks drop constraint if exists tasks_condition_check;
alter table public.tasks add constraint tasks_condition_check check (condition is null or condition in
  ('cat_flu','kennel_cough','diarrhoea','vomiting','eye_condition','skin_condition','wounds_injury','other'));

-- 2. Spaces and their cage counts (Cranbourne, 23 Aug 2026 count). Names match the flag form's dropdown.
create table public.locations (
  name text primary key,
  grp text not null,
  cages int not null check (cages >= 0),
  sort int not null
);
insert into public.locations (name, grp, cages, sort) values
  ('Cat Room 1',         'Cat rooms',    30,  1),
  ('Cat Room 2',         'Cat rooms',    24,  2),
  ('Cat Room 3',         'Cat rooms',    10,  3),
  ('FIR Room',           'Cat rooms',    32,  4),
  ('Adoption 1',         'Cat adoption', 16,  5),
  ('Adoption 2',         'Cat adoption', 16,  6),
  ('Cat Isolation ward', 'Isolation',     6,  7),
  ('Pound 1',            'Pounds',       30,  8),
  ('Pound 2',            'Pounds',       26,  9),
  ('Pound 3',            'Pounds',       60, 10),
  ('Pound 4',            'Pounds',        9, 11),
  ('Transport',          'Transport',    10, 12);

-- 3. Nightly snapshot rows, so a baseline builds up over time.
--    condition is a sign key, or 'any' = distinct animals with any sign in that space.
create table public.surveillance_snapshots (
  snapshot_date date not null,
  space text not null,
  condition text not null,
  animals int not null check (animals >= 0),
  cages int not null,
  primary key (snapshot_date, space, condition)
);

-- 4. Snapshot function: distinct animals (tasks.title) per space and sign within the last p_days days.
--    Dated by the Melbourne evening the job ran in (job runs at 13:00 UTC = 23:00 AEST / 00:00 AEDT).
create or replace function public.take_surveillance_snapshot(p_days int default 3)
returns int language plpgsql as $$
declare
  d date := ((now() - interval '1 hour') at time zone 'Australia/Melbourne')::date;
  n1 int; n2 int;
begin
  insert into public.surveillance_snapshots (snapshot_date, space, condition, animals, cages)
  select d, l.name, c.condition, count(distinct t.title)::int, l.cages
  from public.locations l
  cross join (select unnest(array['cat_flu','kennel_cough','diarrhoea','vomiting','eye_condition','skin_condition','wounds_injury','other']) as condition) c
  left join public.tasks t
    on trim(split_part(t.location, '/', 1)) = l.name
   and t.condition = c.condition
   and t.created_at >= now() - make_interval(days => p_days)
  group by l.name, l.cages, c.condition
  on conflict (snapshot_date, space, condition) do update set animals = excluded.animals, cages = excluded.cages;
  get diagnostics n1 = row_count;

  insert into public.surveillance_snapshots (snapshot_date, space, condition, animals, cages)
  select d, l.name, 'any', count(distinct t.title)::int, l.cages
  from public.locations l
  left join public.tasks t
    on trim(split_part(t.location, '/', 1)) = l.name
   and t.condition is not null
   and t.created_at >= now() - make_interval(days => p_days)
  group by l.name, l.cages
  on conflict (snapshot_date, space, condition) do update set animals = excluded.animals, cages = excluded.cages;
  get diagnostics n2 = row_count;
  return n1 + n2;
end;
$$;

-- 5. Access: read-only for signed-in staff (same sync_writer guard as migration 0003). Nothing writable via the API;
--    edit cage counts in the SQL editor, snapshots are written by the job.
alter table public.locations enable row level security;
alter table public.surveillance_snapshots enable row level security;
create policy "staff_select_locations" on public.locations for select using (
  auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
create policy "staff_select_surveillance_snapshots" on public.surveillance_snapshots for select using (
  auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/surveillance-migration.test.mjs tests/migration.test.mjs`
Expected: all pass (4 new + the existing 6).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0009_surveillance.sql tests/surveillance-migration.test.mjs
git commit -m "feat: migration 0009 - wider signs, locations, snapshots, snapshot function"   # + trailers
```
Do NOT run this migration on the live database yet (Task 8).

---

### Task 2: Counting logic (`lib/ldh-logic.js`) + unit tests

**Files:**
- Modify: `lib/ldh-logic.js`
- Modify: `tests/logic.test.mjs`

**Interfaces:**
- Produces (`LDHLogic`): `SIGN_KEYS: string[]` (8, in the spec order); `CONDITION_LABELS` (8 signs + `none`); `spaceOf(location) -> string`; `windowStart(key, nowMs) -> Date` for keys `'today'|'3d'|'7d'|'30d'|'month'` (`'today'` = local midnight; `'month'` = 1st of the local month; others = now minus N×24 h; unknown key = 3d); `buildSurvey(tasks, locations, since) -> {spaces, groups, ranked, totalAnimals, unmapped, since}`; `baselineStatus(dates, target=30) -> {day, of, done, days}`; `summariseConditions` now keys its counts from `SIGN_KEYS` + `none`.
  - `spaces[]`: `{name, grp, cages, animals, rate (number|null, 1 decimal, percent), leading (sign key|null), by: {signKey: distinctAnimals}}`, ordered by the location rows' `sort`.
  - `groups[]`: `{name, animals, cages, rate}` in first-seen order of `spaces`.
  - `ranked[]`: `{key, animals, share}` (share = whole-number percent of `totalAnimals`), sorted by animals desc then `SIGN_KEYS` order; only signs with ≥1 animal.
  - Input `tasks`: rows with `title, location, condition, created_at`; `locations`: rows with `name, grp, cages, sort`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/logic.test.mjs`:
```js
test('SIGN_KEYS and CONDITION_LABELS: the eight reported signs, no diagnoses', () => {
  assert.deepEqual(L.SIGN_KEYS, ['cat_flu', 'kennel_cough', 'diarrhoea', 'vomiting', 'eye_condition', 'skin_condition', 'wounds_injury', 'other']);
  assert.equal(L.CONDITION_LABELS.vomiting, 'Vomiting');
  assert.equal(L.CONDITION_LABELS.eye_condition, 'Eye condition');
  assert.equal(L.CONDITION_LABELS.skin_condition, 'Skin condition');
  assert.equal(L.CONDITION_LABELS.giardia, undefined);
  L.SIGN_KEYS.forEach(k => assert.ok(L.CONDITION_LABELS[k], k));
});

test('spaceOf takes the text before the first slash', () => {
  assert.equal(L.spaceOf('Cat Room 1 / 4'), 'Cat Room 1');
  assert.equal(L.spaceOf('Pound 3/40'), 'Pound 3');
  assert.equal(L.spaceOf('Transport'), 'Transport');
  assert.equal(L.spaceOf(null), '');
});

test('windowStart: today, 3d, 7d, 30d, month', () => {
  const now = new Date('2026-09-21T15:30:00').getTime();
  assert.equal(L.windowStart('today', now).getTime(), new Date('2026-09-21T00:00:00').getTime());
  assert.equal(now - L.windowStart('3d', now).getTime(), 3 * 24 * H);
  assert.equal(now - L.windowStart('7d', now).getTime(), 7 * 24 * H);
  assert.equal(now - L.windowStart('30d', now).getTime(), 30 * 24 * H);
  assert.equal(L.windowStart('month', now).getTime(), new Date('2026-09-01T00:00:00').getTime());
  assert.equal(now - L.windowStart('nonsense', now).getTime(), 3 * 24 * H, 'unknown key falls back to 3 days');
});

const LOC = [
  { name: 'Cat Room 1', grp: 'Cat rooms', cages: 30, sort: 1 },
  { name: 'Cat Room 2', grp: 'Cat rooms', cages: 24, sort: 2 },
  { name: 'Pound 2', grp: 'Pounds', cages: 26, sort: 3 }
];
const trow = (title, location, condition, agoMs) => ({ title, location, condition, created_at: new Date(NOW - agoMs).toISOString() });

test('buildSurvey: distinct animals, rates, leading sign, groups, ranking, unmapped', () => {
  const since = new Date(NOW - 3 * 24 * H);
  const tasks = [
    trow('A1', 'Cat Room 1 / 4', 'cat_flu', 1 * H),
    trow('A2', 'Cat Room 1 / 5', 'cat_flu', 2 * H),
    trow('A1', 'Cat Room 1 / 4', 'vomiting', 3 * H),        // same animal, second sign
    trow('A2', 'Cat Room 1 / 5', 'cat_flu', 4 * H),         // duplicate report of the same sign
    trow('B1', 'Pound 2 / 7', 'kennel_cough', 5 * H),
    trow('C1', 'Cat Room 2 / 1', 'cat_flu', 4 * 24 * H),    // outside the window
    trow('D1', 'Cat Room 2 / 2', null, 1 * H),               // no sign flagged
    trow('E1', 'Mystery Room / 9', 'other', 1 * H)           // space not in the list
  ];
  const r = L.buildSurvey(tasks, LOC, since);
  const s1 = r.spaces.find(s => s.name === 'Cat Room 1');
  assert.equal(s1.animals, 2, 'A1 and A2, each counted once');
  assert.equal(s1.rate, 6.7, '2 / 30 cages = 6.7%');
  assert.equal(s1.leading, 'cat_flu');
  assert.deepEqual(s1.by, { cat_flu: 2, vomiting: 1 });
  assert.equal(r.spaces.find(s => s.name === 'Cat Room 2').animals, 0, 'old flag and unflagged task are not counted');
  assert.equal(r.spaces.find(s => s.name === 'Cat Room 2').leading, null);
  assert.deepEqual(r.spaces.map(s => s.name), ['Cat Room 1', 'Cat Room 2', 'Pound 2'], 'ordered by sort');
  const g = r.groups.find(x => x.name === 'Cat rooms');
  assert.deepEqual([g.animals, g.cages, g.rate], [2, 54, 3.7], 'group = 2 animals / 54 cages');
  assert.equal(r.totalAnimals, 4, 'A1, A2, B1 and the unmapped E1');
  assert.equal(r.unmapped, 1);
  assert.deepEqual(r.ranked.map(x => [x.key, x.animals]), [['cat_flu', 2], ['kennel_cough', 1], ['vomiting', 1], ['other', 1]]);
  assert.equal(r.ranked[0].share, 50, '2 of 4 animals');
});

test('buildSurvey with no data gives zero rates, not errors', () => {
  const r = L.buildSurvey([], LOC, new Date(NOW - 3 * 24 * H));
  assert.equal(r.totalAnimals, 0);
  assert.deepEqual(r.ranked, []);
  assert.equal(r.spaces[0].rate, 0);
  assert.equal(L.buildSurvey([], [{ name: 'X', grp: 'G', cages: 0, sort: 1 }], new Date(NOW)).spaces[0].rate, null, 'zero cages -> no rate');
});

test('baselineStatus counts distinct snapshot days up to 30', () => {
  assert.deepEqual(L.baselineStatus([]), { day: 0, of: 30, done: false, days: 0 });
  assert.deepEqual(L.baselineStatus(['2026-09-01', '2026-09-01', '2026-09-02']), { day: 2, of: 30, done: false, days: 2 });
  const many = Array.from({ length: 35 }, (_, i) => '2026-08-' + String(i + 1).padStart(2, '0'));
  const b = L.baselineStatus(many);
  assert.deepEqual([b.day, b.done, b.days], [30, true, 35]);
});

test('summariseConditions covers the widened sign list', () => {
  const r = L.summariseConditions([{ condition: 'vomiting', location: 'Pound 1 / 1', created_at: '2026-09-01T00:00:00Z' },
    { condition: 'skin_condition', location: 'Pound 1 / 2', created_at: '2026-09-02T00:00:00Z' }]);
  assert.equal(r.counts.vomiting, 1); assert.equal(r.counts.skin_condition, 1); assert.equal(r.counts.eye_condition, 0);
  assert.equal(r.counts.none, 0);
});
```
(Also update the existing test `'CONDITION_LABELS covers every condition value the flag form can save'` to loop over `L.SIGN_KEYS` instead of its hard-coded five.)

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/logic.test.mjs`
Expected: FAIL — `L.SIGN_KEYS` undefined / `L.spaceOf is not a function`.

- [ ] **Step 3: Implement in `lib/ldh-logic.js`**

Replace the existing `CONDITION_LABELS` constant with:
```js
  // Reported SIGNS staff can flag (diagnoses such as Giardia are not signs). Order is the display order.
  const SIGN_KEYS = ['cat_flu', 'kennel_cough', 'diarrhoea', 'vomiting', 'eye_condition', 'skin_condition', 'wounds_injury', 'other'];
  const CONDITION_LABELS = {
    cat_flu: 'Cat flu (URI)', kennel_cough: 'Kennel cough', diarrhoea: 'Diarrhoea / GI upset', vomiting: 'Vomiting',
    eye_condition: 'Eye condition', skin_condition: 'Skin condition', wounds_injury: 'Wounds / injury / trauma',
    other: 'Other', none: 'None flagged'
  };
```
In `summariseConditions`, replace the hard-coded `const counts = { cat_flu: 0, ... none: 0 };` line with:
```js
    const counts = { none: 0 };
    SIGN_KEYS.forEach(k => { counts[k] = 0; });
```
Add these functions above `splitMemos`:
```js
  function spaceOf(location) { return String(location || '').split('/')[0].trim(); }

  function windowStart(key, now) {
    const d = new Date(now);
    if (key === 'today') { d.setHours(0, 0, 0, 0); return d; }
    if (key === 'month') return new Date(d.getFullYear(), d.getMonth(), 1);
    const days = { '3d': 3, '7d': 7, '30d': 30 }[key] || 3;
    return new Date(now - days * 24 * HOUR);
  }

  const round1 = (x) => Math.round(x * 10) / 10;

  // Rates for the heat map: distinct animals (tasks.title) with a flagged sign since `since`, per space, sign and group.
  function buildSurvey(tasks, locations, since) {
    const spaces = locations.slice().sort((a, b) => a.sort - b.sort)
      .map(l => ({ name: l.name, grp: l.grp, cages: l.cages, any: new Set(), by: {} }));
    const idx = {}; spaces.forEach(s => { idx[s.name] = s; });
    const signAnimals = {}, allAnimals = new Set(), unmapped = new Set();
    tasks.forEach(t => {
      if (!t.condition || new Date(t.created_at) < since) return;
      const animal = t.title;
      (signAnimals[t.condition] = signAnimals[t.condition] || new Set()).add(animal);
      allAnimals.add(animal);
      const sp = idx[spaceOf(t.location)];
      if (!sp) { unmapped.add(animal); return; }
      sp.any.add(animal);
      (sp.by[t.condition] = sp.by[t.condition] || new Set()).add(animal);
    });
    const outSpaces = spaces.map(s => {
      let leading = null, max = 0;
      SIGN_KEYS.concat(Object.keys(s.by)).forEach(k => { if (s.by[k] && s.by[k].size > max) { max = s.by[k].size; leading = k; } });
      const by = {}; Object.keys(s.by).forEach(k => { by[k] = s.by[k].size; });
      return { name: s.name, grp: s.grp, cages: s.cages, animals: s.any.size,
        rate: s.cages ? round1(s.any.size / s.cages * 100) : null, leading, by };
    });
    const groups = [];
    outSpaces.forEach(s => {
      let g = groups.find(x => x.name === s.grp);
      if (!g) { g = { name: s.grp, animals: 0, cages: 0, rate: null }; groups.push(g); }
      g.animals += s.animals; g.cages += s.cages;
    });
    groups.forEach(g => { g.rate = g.cages ? round1(g.animals / g.cages * 100) : null; });
    const totalAnimals = allAnimals.size;
    const ranked = Object.keys(signAnimals)
      .map(k => ({ key: k, animals: signAnimals[k].size, share: totalAnimals ? Math.round(signAnimals[k].size / totalAnimals * 100) : 0 }))
      .sort((a, b) => b.animals - a.animals || SIGN_KEYS.indexOf(a.key) - SIGN_KEYS.indexOf(b.key));
    return { spaces: outSpaces, groups, ranked, totalAnimals, unmapped: unmapped.size, since };
  }

  function baselineStatus(dates, target) {
    const of = target || 30, days = new Set(dates).size;
    return { day: Math.min(days, of), of, done: days >= of, days };
  }
```
Add to the export object: `SIGN_KEYS, spaceOf, windowStart, buildSurvey, baselineStatus`.

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/logic.test.mjs`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/ldh-logic.js tests/logic.test.mjs
git commit -m "feat: surveillance counting logic (rates, groups, ranking, baseline) with unit tests"   # + trailers
```

---

### Task 3: Widen the flag form's sign list + consistency guard

**Files:**
- Modify: `index.html` (the `req-condition` select)
- Create: `tests/consistency.test.mjs`
- Modify: `tests/ui/flag-form.test.js`

**Interfaces:**
- Consumes: `LDHLogic.SIGN_KEYS`, `LDHLogic.CONDITION_LABELS`, `LDHLogic.LOCATIONS` (Task 2 / stage 1).
- Produces: the flag form offers exactly the 8 signs; a Node test proving the migration's space names/sign keys equal the JS constants.

- [ ] **Step 1: Write the failing tests**

Create `tests/consistency.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const L = createRequire(import.meta.url)('../lib/ldh-logic.js');
const sql = fs.readFileSync(path.resolve(import.meta.dirname, '../supabase/migrations/0009_surveillance.sql'), 'utf8');

test('the migration seeds exactly the spaces the flag form offers (same names, same order)', () => {
  const names = [...sql.matchAll(/^\s*\('([^']+)',\s*'[^']+',\s*\d+,\s*\d+\)/gm)].map(m => m[1]);
  assert.deepEqual(names, L.LOCATIONS);
});

test('the migration allows exactly the reported signs the JS knows about', () => {
  const check = sql.match(/condition in\s*\(([^)]*)\)/)[1];
  const keys = [...check.matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
  assert.deepEqual(keys, L.SIGN_KEYS);
  const arr = sql.match(/array\[([^\]]*)\]/)[1];
  assert.deepEqual([...arr.matchAll(/'([a-z_]+)'/g)].map(m => m[1]), L.SIGN_KEYS, 'the snapshot function loops the same signs');
});
```
In `tests/ui/flag-form.test.js` add, after the existing "location select" assertion:
```js
  const signOpts = await page.$$eval('#req-condition option', os => os.map(o => o.value));
  t.ok(signOpts.join() === ',cat_flu,kennel_cough,diarrhoea,vomiting,eye_condition,skin_condition,wounds_injury,other', 'flag form offers the eight reported signs (got ' + signOpts.join() + ')');
  t.ok(!(await page.textContent('#req-condition')).toLowerCase().includes('giardia'), 'no diagnoses in the sign list');
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/consistency.test.mjs` — the consistency test should PASS already if Task 1 and 2 are right (it only reads files); then
`NODE_PATH=~/.npm/_npx/e41f203b7505f1fb/node_modules node tests/ui/flag-form.test.js`
Expected: the new sign-list assertion FAILS (form still has five signs).

- [ ] **Step 3: Implement**

In `index.html`, replace the `req-condition` options (from `<option value="cat_flu">` through `<option value="other">Other</option>`) with:
```html
          <option value="cat_flu">Cat flu (URI)</option>
          <option value="kennel_cough">Kennel cough</option>
          <option value="diarrhoea">Diarrhoea / GI upset</option>
          <option value="vomiting">Vomiting</option>
          <option value="eye_condition">Eye condition</option>
          <option value="skin_condition">Skin condition</option>
          <option value="wounds_injury">Wounds / injury / trauma</option>
          <option value="other">Other</option>
```
In `stats.html` replace the hard-coded `const SURV_CONDITIONS = [...]` array with `const SURV_CONDITIONS = LDHLogic.SIGN_KEYS;` (the old monthly table is replaced in Task 5; this keeps the page working in between).

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/logic.test.mjs tests/migration.test.mjs tests/surveillance-migration.test.mjs tests/consistency.test.mjs` and, with the NODE_PATH above, `node tests/ui/run-all.js`.
Expected: everything passes.

- [ ] **Step 5: Commit**

```bash
git add index.html stats.html tests/consistency.test.mjs tests/ui/flag-form.test.js
git commit -m "feat: eight reported signs in the flag form; consistency test against the migration"   # + trailers
```

---

### Task 4: Board rendering module + styles

**Files:**
- Create: `lib/surveillance-view.js`, `lib/surveillance.css`
- Create: `tests/surveillance-view.test.mjs`

**Interfaces:**
- Consumes: `LDHLogic.CONDITION_LABELS`, the `buildSurvey` result shape (Task 2).
- Produces (`SurveillanceView`, global in the browser / `module.exports` in Node): `heatMapHtml(survey) -> string`, `groupsHtml(survey) -> string`, `rankedHtml(survey) -> string`, `baselineHtml(status) -> string`, `caveatHtml() -> string`, `unmappedHtml(survey) -> string` (empty string when `unmapped === 0`).
  - Markup contract (tests and later tasks rely on it): heat map = `<div class="heat-grid">` containing one `<div class="heat-tile" data-space="NAME">` per space with `.heat-name`, `.heat-rate` (e.g. `6.7%`, or `–` when no rate), `.heat-sub` (`N of C cages`, plus ` · Leading sign` when there is one). Groups = `<table class="queue-table heat-groups">`. Ranked = `<table class="queue-table heat-ranked">` with a row per sign, or the text `No signs flagged in this period.` when none.

- [ ] **Step 1: Write the failing test**

Create `tests/surveillance-view.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const L = require('../lib/ldh-logic.js');
const V = require('../lib/surveillance-view.js');

const LOC = [{ name: 'Cat Room 1', grp: 'Cat rooms', cages: 30, sort: 1 }, { name: 'Pound <2>', grp: 'Pounds', cages: 26, sort: 2 }];
const now = Date.now();
const survey = L.buildSurvey([
  { title: 'A1', location: 'Cat Room 1 / 4', condition: 'cat_flu', created_at: new Date(now).toISOString() },
  { title: 'A2', location: 'Cat Room 1 / 5', condition: 'cat_flu', created_at: new Date(now).toISOString() },
  { title: 'Z9', location: 'Nowhere / 1', condition: 'other', created_at: new Date(now).toISOString() }
], LOC, new Date(now - 3 * 24 * 3600 * 1000));

test('heat map: one tile per space with rate, cage counts and leading sign; escapes names', () => {
  const h = V.heatMapHtml(survey);
  assert.match(h, /class="heat-grid"/);
  assert.match(h, /data-space="Cat Room 1"[\s\S]*6\.7%[\s\S]*2 of 30 cages · Cat flu \(URI\)/);
  assert.ok(h.includes('Pound &lt;2&gt;') && !h.includes('Pound <2>'), 'space names are escaped');
  assert.match(h, /data-space="Pound &lt;2&gt;"[\s\S]*0%[\s\S]*0 of 26 cages/);
});

test('heat map is neutral: no red, no outbreak wording', () => {
  const h = V.heatMapHtml(survey) + V.groupsHtml(survey) + V.rankedHtml(survey) + V.baselineHtml({ day: 3, of: 30, done: false, days: 3 });
  assert.ok(!/outbreak|alert|danger|critical|high risk/i.test(h), 'no alarm wording');
  assert.ok(!/rgba?\(\s*2[0-9]{2}\s*,\s*[0-9]{1,2}\s*,\s*[0-9]{1,2}/.test(h), 'no red tints');
});

test('groups and ranked tables', () => {
  const g = V.groupsHtml(survey);
  assert.match(g, /Cat rooms[\s\S]*2[\s\S]*30[\s\S]*6\.7%/);
  const r = V.rankedHtml(survey);
  assert.match(r, /Cat flu \(URI\)[\s\S]*2[\s\S]*67%/, '2 of the 3 flagged animals');
  assert.match(V.rankedHtml(L.buildSurvey([], LOC, new Date())), /No signs flagged in this period\./);
});

test('unmapped spaces are reported, never dropped silently', () => {
  assert.match(V.unmappedHtml(survey), /1 flagged animal had a space that isn.t in the list/);
  assert.equal(V.unmappedHtml(L.buildSurvey([], LOC, new Date())), '');
});

test('baseline banner wording and the caveat', () => {
  assert.match(V.baselineHtml({ day: 3, of: 30, done: false, days: 3 }), /Building your baseline — day 3 of 30\./);
  assert.match(V.baselineHtml({ day: 30, of: 30, done: true, days: 41 }), /Baseline collected — 30\+ days of snapshots\./);
  const c = V.caveatHtml();
  assert.match(c, /capacity/i); assert.match(c, /flagged/i); assert.match(c, /your own baseline/i);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/surveillance-view.test.mjs`
Expected: FAIL — `Cannot find module '../lib/surveillance-view.js'`.

- [ ] **Step 3: Implement**

Create `lib/surveillance-view.js`:
```js
/* LDH Shift Ops — HTML for the disease-surveillance board. Browser: global SurveillanceView. Node: module.exports. */
(function (root, factory) {
  const logic = (typeof module === 'object' && module.exports) ? require('./ldh-logic.js') : root.LDHLogic;
  if (typeof module === 'object' && module.exports) module.exports = factory(logic);
  else root.SurveillanceView = factory(logic);
})(typeof self !== 'undefined' ? self : this, function (L) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = (r) => (r == null ? '–' : r + '%');
  // Neutral blue tint that deepens with the rate — deliberately never red: there is no "high" line until a baseline exists.
  function shade(rate) {
    if (rate == null || rate <= 0) return '#f4f5f8';
    return 'rgba(74,108,247,' + Math.min(0.12 + rate / 100 * 0.55, 0.7).toFixed(2) + ')';
  }

  function heatMapHtml(survey) {
    return '<div class="heat-grid">' + survey.spaces.map(s =>
      `<div class="heat-tile" data-space="${esc(s.name)}" style="background:${shade(s.rate)}">
        <div class="heat-name">${esc(s.name)}</div>
        <div class="heat-rate">${pct(s.rate)}</div>
        <div class="heat-sub">${s.animals} of ${s.cages} cages${s.leading ? ' · ' + esc(L.CONDITION_LABELS[s.leading] || s.leading) : ''}</div>
      </div>`).join('') + '</div>';
  }

  function groupsHtml(survey) {
    return `<table class="queue-table heat-groups"><thead><tr><th>Group</th><th>Animals</th><th>Cages</th><th>Rate</th></tr></thead><tbody>${
      survey.groups.map(g => `<tr><td>${esc(g.name)}</td><td><b>${g.animals}</b></td><td>${g.cages}</td><td>${pct(g.rate)}</td></tr>`).join('')}</tbody></table>`;
  }

  function rankedHtml(survey) {
    if (!survey.ranked.length) return '<p class="empty-state">No signs flagged in this period.</p>';
    return `<table class="queue-table heat-ranked"><thead><tr><th>Sign</th><th>Animals</th><th>Share of flagged</th></tr></thead><tbody>${
      survey.ranked.map(r => `<tr><td>${esc(L.CONDITION_LABELS[r.key] || r.key)}</td><td><b>${r.animals}</b></td><td>${r.share}%</td></tr>`).join('')}</tbody></table>`;
  }

  function unmappedHtml(survey) {
    if (!survey.unmapped) return '';
    return `<p class="subtle">${survey.unmapped} flagged animal${survey.unmapped === 1 ? '' : 's'} had a space that isn't in the list, so ${survey.unmapped === 1 ? 'it is' : 'they are'} counted in the totals and the ranking but not on a tile.</p>`;
  }

  function baselineHtml(status) {
    return status.done
      ? '<div class="baseline-banner done">Baseline collected — 30+ days of snapshots. Thresholds can now be set from your own data.</div>'
      : `<div class="baseline-banner">Building your baseline — day ${status.day} of ${status.of}. Rates are shown as they are; there is no "high" line until there is a month of your own data.</div>`;
  }

  function caveatHtml() {
    return '<p class="subtle heat-caveat">Rate = the share of a space\'s cages holding an animal flagged with a sign in this period. Cages are capacity, not occupancy, so a half-empty space reads low. Only animals someone flagged are counted, so this reads lower than vet-exam prevalence — compare it against your own baseline, not older prevalence figures.</p>';
  }

  return { heatMapHtml, groupsHtml, rankedHtml, unmappedHtml, baselineHtml, caveatHtml };
});
```
Create `lib/surveillance.css`:
```css
.heat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
.heat-tile { border-radius: 12px; padding: 12px 14px; border: 1px solid rgba(30,34,56,0.08); }
.heat-name { font-size: 0.78rem; font-weight: 700; }
.heat-rate { font-size: 1.5rem; font-weight: 700; margin: 2px 0; }
.heat-sub { font-size: 0.72rem; color: #4b5563; }
.baseline-banner { background: rgba(74,108,247,0.08); border-radius: 10px; padding: 10px 14px; font-size: 0.82rem; margin: 10px 0 14px; }
.baseline-banner.done { background: rgba(34,154,99,0.1); }
.heat-caveat { margin-top: 14px; }
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/surveillance-view.test.mjs`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/surveillance-view.js lib/surveillance.css tests/surveillance-view.test.mjs
git commit -m "feat: surveillance board renderer (heat map, groups, ranked signs, baseline banner) with tests"   # + trailers
```

---

### Task 5: Stats page — the full surveillance board

**Files:**
- Modify: `stats.html`
- Modify: `tests/ui/harness.js`
- Create: `tests/ui/fixtures.js`
- Modify: `tests/ui/stats-page.test.js`

**Interfaces:**
- Consumes: `LDHLogic.buildSurvey/windowStart/baselineStatus`, `SurveillanceView.*` (Tasks 2, 4); tables `locations`, `surveillance_snapshots` (Task 1).
- Produces (page): `#surv-window` select (values `today|3d|7d|30d|month`, default `3d`), `#baseline-banner`, `#heat-map`, `#heat-groups`, `#heat-ranked`, `#heat-notes` (unmapped note + caveat), `#report-head` (print-only), buttons `#surveillance-export` (CSV, existing) and `#report-export` (Task 7 wires it), `renderSurvey()`, `loadSurveyData()`.
- Produces (harness): stub tables `locations` and `surveillance_snapshots` (default rows `{}`); `tests/ui/fixtures.js` exports `LOCATION_ROWS` (the 12 spaces with cages, matching the migration).

- [ ] **Step 1: Write the failing test and fixtures**

Create `tests/ui/fixtures.js`:
```js
const spaces = [['Cat Room 1', 'Cat rooms', 30], ['Cat Room 2', 'Cat rooms', 24], ['Cat Room 3', 'Cat rooms', 10], ['FIR Room', 'Cat rooms', 32],
  ['Adoption 1', 'Cat adoption', 16], ['Adoption 2', 'Cat adoption', 16], ['Cat Isolation ward', 'Isolation', 6],
  ['Pound 1', 'Pounds', 30], ['Pound 2', 'Pounds', 26], ['Pound 3', 'Pounds', 60], ['Pound 4', 'Pounds', 9], ['Transport', 'Transport', 10]];
module.exports = { LOCATION_ROWS: spaces.map(([name, grp, cages], i) => ({ id: 'loc' + i, name, grp, cages, sort: i + 1 })) };
```
In `tests/ui/harness.js` add `locations: [], surveillance_snapshots: []` to the stub's `db` object and `locations: () => ({}), surveillance_snapshots: () => ({})` to its `defaults`.

Replace the surveillance assertions in `tests/ui/stats-page.test.js` (the block that waits for `#surveillance-conditions`, and its seeds) with a new test section. Seeds: `const { LOCATION_ROWS } = require('./fixtures');` and add to `seed`: `locations: LOCATION_ROWS`, `surveillance_snapshots: [{ snapshot_date: '2026-09-19', space: 'Cat Room 1', condition: 'any', animals: 1, cages: 30 }, { snapshot_date: '2026-09-20', space: 'Cat Room 1', condition: 'any', animals: 2, cages: 30 }]`, and flagged tasks: two `cat_flu` in `Cat Room 1 / 4` and `Cat Room 1 / 5`, one `vomiting` in `Pound 2 / 3`, one `cat_flu` in `Pound 2 / 9` created 20 days ago. Then assert:
```js
    await stats.page.waitForSelector('#heat-map .heat-tile');
    t.ok(await stats.page.locator('#heat-map .heat-tile').count() === 12, 'a tile for each of the 12 spaces');
    const tile = name => stats.page.locator('#heat-map .heat-tile', { hasText: name }).first().textContent();
    t.ok(/6\.7%/.test(await tile('Cat Room 1')) && /2 of 30 cages/.test(await tile('Cat Room 1')), 'Cat Room 1: 2 animals / 30 cages = 6.7%');
    t.ok(/1 of 26 cages/.test(await tile('Pound 2')), 'Pound 2 counts only the recent flag (the 20-day-old one is outside 3 days)');
    t.ok((await stats.page.textContent('#heat-groups')).includes('Cat rooms') && (await stats.page.textContent('#heat-groups')).includes('Pounds'), 'group summary');
    const ranked = await stats.page.textContent('#heat-ranked');
    t.ok(ranked.indexOf('Cat flu (URI)') < ranked.indexOf('Vomiting'), 'most commonly reported first (flu 2, vomiting 1)');
    t.ok((await stats.page.textContent('#baseline-banner')).includes('Building your baseline — day 2 of 30'), 'baseline banner counts the 2 snapshot days');
    await stats.page.selectOption('#surv-window', '30d');
    await stats.page.waitForTimeout(150);
    t.ok(/2 of 26 cages/.test(await tile('Pound 2')), 'switching to 30 days includes the older flag');
    t.ok((await stats.page.textContent('#heat-notes')).toLowerCase().includes('capacity'), 'the capacity / reported-rate caveat is shown');
    t.ok(!/outbreak|high risk|alert/i.test(await stats.page.textContent('#surveillance-section')), 'no alarm wording on the board');
```
(Keep the trend-card and dashboard-side assertions in that file unchanged.)

- [ ] **Step 2: Run to verify it fails**

Run: `NODE_PATH=~/.npm/_npx/e41f203b7505f1fb/node_modules node tests/ui/stats-page.test.js`
Expected: FAIL (`#heat-map` does not exist).

- [ ] **Step 3: Implement in `stats.html`**

3a. In `<head>` add after the `ldh-logic.js` script tag: `<script src="lib/surveillance-view.js"></script>` and `<link rel="stylesheet" href="lib/surveillance.css">`.

3b. Replace the whole `<section class="card" id="surveillance-section"> … </section>` with:
```html
    <section class="card" id="surveillance-section">
      <h2>Disease surveillance</h2>
      <div class="print-only" id="report-head"></div>
      <p class="subtle">Reported signs — what staff flagged on requests, by space. These are not confirmed diagnoses.</p>
      <div id="baseline-banner"></div>
      <div class="no-print" style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
        <select id="surv-window" style="margin:0; width:auto;">
          <option value="today">Today</option>
          <option value="3d" selected>Last 3 days</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="month">This month</option>
        </select>
        <button class="secondary" id="report-export" style="margin:0;">Export report (PDF)</button>
        <span style="flex:1"></span>
        <input type="month" id="surveillance-month" style="margin:0; width:auto;">
        <button class="secondary" id="surveillance-export" style="margin:0;">Download case list (CSV)</button>
      </div>
      <h3 style="font-size:0.85rem; margin:16px 0 8px;">Heat map — share of cages with a flagged animal</h3>
      <div id="heat-map"></div>
      <h3 style="font-size:0.85rem; margin:16px 0 6px;">By group</h3>
      <div id="heat-groups"></div>
      <h3 style="font-size:0.85rem; margin:16px 0 6px;">Most commonly reported</h3>
      <div id="heat-ranked"></div>
      <div id="heat-notes"></div>
    </section>
```
3c. Replace the JS from `const SURV_CONDITIONS = …` through the end of the `document.getElementById('surveillance-month').addEventListener('change', renderSurveillance);` line (i.e. the old `SURV_CONDITIONS`, `renderSurveillance` and its month listener) with:
```js
  // ---- surveillance board ----
  let SURVEY_LOCATIONS = [], SURVEY_TASKS = [], SNAPSHOT_DATES = [];
  const WINDOW_LABELS = { today: 'Today', '3d': 'Last 3 days', '7d': 'Last 7 days', '30d': 'Last 30 days', month: 'This month' };

  async function loadSurveyData() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const since = new Date(Math.min(monthStart.getTime(), now.getTime() - 30 * 24 * 3600 * 1000));
    const [loc, tk, snap] = await Promise.all([
      sb.from('locations').select('*').order('sort', { ascending: true }),
      sb.from('tasks').select('title, location, condition, created_at').gte('created_at', since.toISOString()),
      sb.from('surveillance_snapshots').select('snapshot_date').eq('condition', 'any')
    ]);
    SURVEY_LOCATIONS = loc.data || [];
    SURVEY_TASKS = (tk.data || []).filter(t => t.condition);
    SNAPSHOT_DATES = (snap.data || []).map(r => r.snapshot_date);
  }

  function renderSurvey() {
    const key = document.getElementById('surv-window').value;
    const since = LDHLogic.windowStart(key, Date.now());
    const survey = LDHLogic.buildSurvey(SURVEY_TASKS, SURVEY_LOCATIONS, since);
    document.getElementById('baseline-banner').innerHTML = SurveillanceView.baselineHtml(LDHLogic.baselineStatus(SNAPSHOT_DATES));
    document.getElementById('heat-map').innerHTML = SURVEY_LOCATIONS.length
      ? SurveillanceView.heatMapHtml(survey)
      : '<p class="empty-state">The spaces list is not set up yet (run migration 0009).</p>';
    document.getElementById('heat-groups').innerHTML = SurveillanceView.groupsHtml(survey);
    document.getElementById('heat-ranked').innerHTML = SurveillanceView.rankedHtml(survey);
    document.getElementById('heat-notes').innerHTML = SurveillanceView.unmappedHtml(survey) + SurveillanceView.caveatHtml();
    document.getElementById('report-head').innerHTML =
      `<h1 style="font-size:1.2rem;margin:0 0 4px;">Disease surveillance report</h1><p style="margin:0 0 12px;">${esc(WINDOW_LABELS[key] || key)} · generated ${esc(new Date().toLocaleString('en-AU'))} · LDH Cranbourne</p>`;
  }
  document.getElementById('surv-window').addEventListener('change', renderSurvey);
```
3d. In `initStats()` replace the line `renderSurveillance();` with `await loadSurveyData();\n    renderSurvey();`.

3e. The CSV export handler still uses its own month query (`loadSurveillance`, `summariseConditions`) — leave it. Add to the page `<style>` (near the end): `.print-only { display: none; }`.

- [ ] **Step 4: Run to verify it passes**

Run (NODE_PATH as above): `node tests/ui/stats-page.test.js`, then `node tests/ui/run-all.js`.
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add stats.html tests/ui/harness.js tests/ui/fixtures.js tests/ui/stats-page.test.js
git commit -m "feat: surveillance board on the stats page (heat map, groups, ranked signs, baseline banner, window switch)"   # + trailers
```

---

### Task 6: Dashboard "Disease watch" card

**Files:**
- Modify: `index.html`
- Create: `tests/ui/disease-watch.test.js`

**Interfaces:**
- Consumes: `LDHLogic.buildSurvey/windowStart`, `SurveillanceView.heatMapHtml/baselineHtml` (Tasks 2, 4); `TASKS` (already loaded by `loadAll`, includes `condition`, `title`, `location`, `created_at`); `locations` table (Task 1).
- Produces (page): card `#disease-watch` (visible to BOTH roles) with `#disease-watch-map`; global `LOCATION_ROWS` loaded in `loadAll`; `renderDiseaseWatch()` called from `renderAll`. The card is hidden when there are no location rows (migration not applied yet).

- [ ] **Step 1: Write the failing test**

Create `tests/ui/disease-watch.test.js`:
```js
const { open } = require('./harness');
const { LOCATION_ROWS } = require('./fixtures');
const t = require('./check')('disease-watch');
const ago = ms => new Date(Date.now() - ms).toISOString();
const H = 3600 * 1000, D = 24 * H;
(async () => {
  const flag = (title, location, condition, agoMs) => ({ title, location, shift: 'sick_injured', type: 'shelter', urgency: 'routine', done: false, condition, created_at: ago(agoMs) });
  const seed = { locations: LOCATION_ROWS, tasks: [flag('A1', 'Cat Room 1 / 4', 'cat_flu', 1 * H), flag('A2', 'Cat Room 1 / 5', 'kennel_cough', 2 * H), flag('B1', 'Pound 3 / 9', 'vomiting', 5 * D), flag('C1', 'Pound 1 / 2', null, 1 * H)] };
  const a = await open(seed);
  try {
    t.ok(await a.page.isVisible('#disease-watch'), 'card visible to shelter staff');
    const tile = name => a.page.locator('#disease-watch-map .heat-tile', { hasText: name }).first().textContent();
    t.ok(await a.page.locator('#disease-watch-map .heat-tile').count() === 12, 'a tile for every space');
    t.ok(/6\.7%/.test(await tile('Cat Room 1')), 'Cat Room 1: 2 of 30 cages = 6.7% (last 3 days)');
    t.ok(/0%/.test(await tile('Pound 3')) && /0 of 60 cages/.test(await tile('Pound 3')), 'a 5-day-old flag is outside the 3-day window');
    t.ok(!/outbreak|alert|high risk/i.test(await a.page.textContent('#disease-watch')), 'no alarm wording');
    t.ok(await a.page.locator('#disease-watch a[href="stats.html"]').count() === 1, 'links to the full board on the stats page');
    await a.page.selectOption('#role-select', 'vet_nurse');
    await a.page.waitForTimeout(200);
    t.ok(await a.page.isVisible('#disease-watch'), 'card also visible to vets and nurses');
    t.ok(a.errors.length === 0, 'no page errors: ' + a.errors.join('; '));
  } finally { await a.browser.close(); }
  // before migration 0009: no spaces list -> the card stays hidden instead of showing an empty board
  const b = await open({ tasks: seed.tasks });
  try {
    t.ok(!(await b.page.isVisible('#disease-watch')), 'card hidden when the spaces list does not exist yet');
    t.ok(b.errors.length === 0, 'no page errors without locations: ' + b.errors.join('; '));
  } finally { await b.browser.close(); }
  t.done();
})();
```

- [ ] **Step 2: Run to verify it fails**

Run: `NODE_PATH=~/.npm/_npx/e41f203b7505f1fb/node_modules node tests/ui/disease-watch.test.js`
Expected: FAIL (`#disease-watch` does not exist).

- [ ] **Step 3: Implement in `index.html`**

3a. In `<head>` after the `ldh-logic.js` script tag add `<script src="lib/surveillance-view.js"></script>` and `<link rel="stylesheet" href="lib/surveillance.css">`.

3b. Insert this card immediately before `    <div class="dashboard-body">`:
```html
    <section class="card" id="disease-watch" style="display:none">
      <div style="display:flex; justify-content:space-between; align-items:baseline; gap:10px; flex-wrap:wrap;">
        <h2 style="margin:0;">Disease watch — last 3 days</h2>
        <a href="stats.html" style="font-size:0.8rem; color:var(--ink);">Full surveillance board →</a>
      </div>
      <p class="subtle" style="margin:6px 0 12px;">Share of each space's cages holding an animal flagged with a sign. No alert line yet — a baseline is being collected first.</p>
      <div id="disease-watch-map"></div>
    </section>
```
3c. Add `let LOCATION_ROWS = [];` after `let NURSE_REQUESTS = [], NURSE_TREATMENTS = [], NURSE_DOSES = [];`.

3d. `loadAll`: add `lcRes` to the destructuring (`const [tasksRes, memosRes, rosterRes, nrRes, ntRes, ndRes, lcRes] = …`), add to the query array `      sb.from('locations').select('*').order('sort', { ascending: true }),` after the `nurse_treatment_doses` line, and add `    LOCATION_ROWS = lcRes.data || [];` after the `NURSE_DOSES = …` assignment.

3e. Add the function above `function refreshTimers() {` and call it from `renderAll` (after `renderNurseTreatments();`) and from `refreshTimers`:
```js
  function renderDiseaseWatch() {
    const card = document.getElementById('disease-watch');
    if (!LOCATION_ROWS.length) { card.style.display = 'none'; return; }
    const survey = LDHLogic.buildSurvey(TASKS, LOCATION_ROWS, LDHLogic.windowStart('3d', Date.now()));
    document.getElementById('disease-watch-map').innerHTML = SurveillanceView.heatMapHtml(survey) + SurveillanceView.unmappedHtml(survey);
    card.style.display = 'block';
  }
```
In `refreshTimers` add `    renderDiseaseWatch();`.

- [ ] **Step 4: Run to verify it passes**

Run (NODE_PATH as above): `node tests/ui/disease-watch.test.js`, then `node tests/ui/run-all.js`.
Expected: all PASS. (Existing tests keep passing: they never seed `locations`, so the card stays hidden for them.)

- [ ] **Step 5: Commit**

```bash
git add index.html tests/ui/disease-watch.test.js
git commit -m "feat: compact Disease watch heat map on the dashboard for both roles"   # + trailers
```

---

### Task 7: Export report (A4 print layout)

**Files:**
- Modify: `stats.html`
- Modify: `tests/ui/stats-page.test.js`

**Interfaces:**
- Consumes: `#report-export`, `#report-head`, `.print-only`, `.no-print` (Task 5).
- Produces: clicking **Export report (PDF)** calls `window.print()`; an `@media print` stylesheet that shows ONLY the surveillance section on A4 (title line with window and date), hiding the sidebar, controls and the other stats sections.

- [ ] **Step 1: Write the failing test**

Append to the stats-page test (inside its `try` block, before the page-error assertion):
```js
    // export report: clicking calls print, and the print layout shows only the surveillance board
    await stats.page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
    await stats.page.click('#report-export');
    t.ok((await stats.page.evaluate(() => window.__printed)) === 1, 'Export report opens the print dialog');
    await stats.page.emulateMedia({ media: 'print' });
    const vis = sel => stats.page.evaluate(s => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none'; }, sel);
    t.ok(await vis('#surveillance-section') && await vis('#heat-map') && await vis('#heat-ranked'), 'print layout shows the heat map and ranked signs');
    t.ok(await vis('#report-head'), 'print layout has a report title with the period and date');
    t.ok(!(await vis('aside')) && !(await vis('#surv-window')) && !(await vis('#report-export')), 'print layout hides the sidebar and the controls');
    t.ok(!(await vis('#trends-section')) && !(await vis('#response-rate-section')), 'print layout leaves out the other stats sections');
    await stats.page.emulateMedia({ media: 'screen' });
```

- [ ] **Step 2: Run to verify it fails**

Run: `NODE_PATH=~/.npm/_npx/e41f203b7505f1fb/node_modules node tests/ui/stats-page.test.js`
Expected: FAIL (`__printed` is 0 — no handler; print layout assertions also fail).

- [ ] **Step 3: Implement in `stats.html`**

3a. Add to the page `<style>`:
```css
  @media print {
    @page { size: A4; margin: 12mm; }
    body { background: #fff; }
    aside, .no-print, #trends-section, #response-rate-section { display: none !important; }
    .layout { display: block !important; }
    main { padding: 0 !important; }
    .print-only { display: block !important; }
    .card { box-shadow: none !important; border: none !important; padding: 0 !important; }
    .heat-tile, table { break-inside: avoid; }
    .heat-tile { border: 1px solid #ccc; }
  }
```
(If the page's existing print-only rule `.print-only { display: none; }` appears earlier, keep it above this block.)

3b. Add the handler next to the other surveillance listeners:
```js
  document.getElementById('report-export').addEventListener('click', () => window.print());
```

- [ ] **Step 4: Run to verify it passes**

Run (NODE_PATH as above): `node tests/ui/stats-page.test.js`, then the full `node tests/ui/run-all.js`, then `node --test tests/*.test.mjs`.
Expected: everything passes.

- [ ] **Step 5: Commit**

```bash
git add stats.html tests/ui/stats-page.test.js
git commit -m "feat: Export report - A4 print layout of the surveillance board"   # + trailers
```

---

### Task 8: Rollout, snapshot schedule and live trial

**Files:**
- Modify: `docs/superpowers/specs/2026-09-20-floor-and-vet-desk-redesign-design.md` (mark stage 2 shipped)
- No code changes.

**Order matters:** the flag form now sends the three new signs, which the OLD database check rejects ("Could not submit"). So **run the migration BEFORE the page goes live.**

- [ ] **Step 1: Full local run**

```bash
cd ~/ldh-shift-ops
export NODE_PATH=~/.npm/_npx/e41f203b7505f1fb/node_modules
node --test tests/*.test.mjs
node tests/ui/run-all.js
git status --short
```
Expected: all pass; nothing uncommitted apart from `.DS_Store`.

- [ ] **Step 2: Juliana runs the migration**

Run `pbcopy < supabase/migrations/0009_surveillance.sql`, then tell Juliana: Supabase → SQL Editor → New query → paste → Run **as one script**. If Supabase offers "Run and enable RLS", choose that. Expected: "Success. No rows returned." Verify with a new query:
```sql
select (select count(*) from public.locations) as spaces,
       (select sum(cages) from public.locations) as cages,
       (select count(*) from pg_policies where tablename in ('locations','surveillance_snapshots')) as policies;
```
Expected: `12 | 269 | 2`. Do not continue until she confirms.

- [ ] **Step 3: Take the first snapshot and schedule the nightly job**

Give Juliana this to run in a new query (pg_cron was enabled for the surgery purge; if `cron` is missing, enable it first under Database → Extensions):
```sql
select public.take_surveillance_snapshot();   -- first snapshot; expect 108
select cron.schedule('surveillance-snapshot', '0 13 * * *', 'select public.take_surveillance_snapshot()');
```
`0 13 * * *` is 13:00 UTC = 23:00 Melbourne (AEST) / 00:00 (AEDT); the function dates the snapshot by the Melbourne evening it ran in. Verify: `select count(*) from public.surveillance_snapshots;` → 108, and `select jobname, schedule from cron.job;` lists `surveillance-snapshot`.

- [ ] **Step 4: Push**

```bash
git pull --rebase && git push
```
Ask Juliana to hard-refresh the dashboard and the stats page (Cmd+Shift+R).

- [ ] **Step 5: Live trial with fake animals (titles start `TEST`)**

1. Flag `TEST-S1` in Cat Room 1 with pen 4, sign **Vomiting**; flag `TEST-S2` in FIR Room with **Eye condition**; flag `TEST-S3` in Pound 2 with **Skin condition**.
2. Dashboard: the **Disease watch** card shows a tile for every space; Cat Room 1 reads 3.3% (1 of 30 cages).
3. Stats → Disease surveillance: same tiles, group summary, ranked list (each sign 1), the baseline banner "day 1 of 30", the caveat text. Switch the window to Today / 7 / 30 days.
4. **Export report (PDF)** → the print preview shows only the surveillance board on A4 with a title line.
5. **Download case list (CSV)** still downloads.

- [ ] **Step 6: Clean up and record**

Cleanup SQL: `delete from public.tasks where title like 'TEST%';` (the snapshot rows made during the trial expire naturally; they only hold counts). In the spec's build-stage list mark stage 2 done with the date; commit `docs: stage 2 shipped` (+ trailers); push. Update Claude's memory note.

---

## Self-review (spec coverage)

- §7 Locations table seeded with the Cranbourne cages and groups: Task 1. Two-layer split: layer 1 (signs, exact 8) Tasks 1–3; layer 2 (vet-diagnosed) is stage 3, out of scope, stated in the header.
- §7 Rate (distinct animals, last 3 days, ÷ cages, %): Task 2 (`buildSurvey`), unit-tested with duplicates, second signs, old flags, unflagged tasks and unmapped spaces.
- §7 Baseline, not thresholds — neutral map, banner "day X of 30", nightly snapshots, no alerts, caveat on screen: Tasks 1 (snapshots), 4 (banner, caveat, neutral tint test), 5 (banner wired to real snapshot days).
- §7 Views — heat map with rate/count/leading sign, group summary, ranked signs, period switch (today / 7 d / 30 d / a month; plus the agreed 3 d default): Tasks 4–5. Dashboard shows the map to both roles: Task 6.
- §7 Export — one-click A4 report + CSV kept as backup: Tasks 5, 7.
- §8 data changes for stage 2 (`locations`, `surveillance_snapshots`, `pg_cron` job): Tasks 1, 8. (`flagged_at`/`due_by` remain derived, unchanged from stage 1.)
- Deviation to note: the spec sketches "per space AND per sign" rates; the tiles show the per-space rate for any sign plus the leading sign, and the per-sign detail lives in the ranked list and the `surveillance_snapshots` rows (which store every space × sign) — so a per-sign heat map can be added later without a schema change.
- Types checked across tasks: `buildSurvey` result fields (`spaces[].rate/animals/cages/leading/by`, `groups[]`, `ranked[].key/animals/share`, `totalAnimals`, `unmapped`) match what `SurveillanceView` reads and what the browser tests assert; `LOCATION_ROWS`/`locations` rows use `name, grp, cages, sort` everywhere (migration, fixtures, `buildSurvey`).
