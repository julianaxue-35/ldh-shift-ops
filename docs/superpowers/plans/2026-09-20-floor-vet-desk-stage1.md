# Floor / Vet Desk — Stage 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three-tier time-based triage (red flag / urgent / routine) with a Vet-desk queue, claim, shift-change sweep, memo tick-off, nurse vaccination requests and nurse treatment reminders.

**Architecture:** Keep the single static page (`index.html`, GitHub Pages) + Supabase + the shared staff login. All time/status/dose logic lives in one pure, dependency-free module (`lib/ldh-logic.js`) that runs in the browser (global `LDHLogic`) and in Node, so it is unit-tested without a browser. UI changes in `index.html` call that module. One new migration adds columns and tables.

**Tech Stack:** Vanilla JS, Supabase JS v2 (CDN), Postgres (migration tested with PGlite), Node `node:test`, Playwright (browser tests with an in-memory Supabase stub).

**Spec:** `docs/superpowers/specs/2026-09-20-floor-and-vet-desk-redesign-design.md` (sections 3, 5, 6, 6b, 8 for stage 1). Stage 1 of 4; surveillance, plan line and rounds are later stages.

## Global Constraints

- Static site only: no build step, no bundler, no new runtime dependency. New JS file loads with a plain `<script src>`.
- Every value interpolated into HTML goes through the existing `esc()` helper.
- Supabase access uses the existing `sb` client; after every write call `loadAll()` (existing pattern for roster), do not rely on realtime alone.
- Only operational metadata goes to the cloud: no clinical narrative, no microchip numbers (spec §2).
- Emergencies are radioed: the flag form must show "Emergency? Radio the vet — don't wait for this board."
- Tier names and targets (verbatim from spec §3): **Red flag** within 2 h; **Urgent** within 12–24 h (amber from 12 h, red from 24 h); **Routine** within 24–48 h (normal <24 h, **amber 24–48 h, red from 48 h**). Nurse vaccination request: **3 hours from arrival**. Storage values of `tasks.urgency`: `red_flag`, `urgent`, `routine` (legacy `soon` is still accepted by the database and treated as `urgent`).
- A case stops ageing once claimed ("I've got this") or done.
- British spelling in UI text. Migrations are numbered; this stage adds `0008_triage_and_vet_desk.sql`.
- Every commit message ends with these two trailer lines:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_019i8WeJhv2ECwicHJkS2C3y
  ```
- Never point tests at the live Supabase project. Do not push until Task 9.

## File Structure

| File | Responsibility |
|---|---|
| `lib/ldh-logic.js` (new) | Pure logic: tiers, status/colour, queue sort, locations list, nurse request status, dose slots, sweep, memo split |
| `tests/logic.test.mjs` (new) | Unit tests for `lib/ldh-logic.js` (`node --test`) |
| `tests/migration.test.mjs` (new) | PGlite test of `0008` |
| `tests/ui/harness.js`, `tests/ui/check.js`, `tests/ui/run-all.js` (new) | Playwright harness with in-memory Supabase stub, tiny assert helper, runner |
| `tests/ui/*.test.js` (new) | One browser test per UI task |
| `tests/package.json`, `tests/README.md`, `.gitignore` (new/modify) | Dev-only test setup |
| `supabase/migrations/0008_triage_and_vet_desk.sql` (new) | Schema for stage 1 |
| `index.html` (modify) | Flag form, Vet-desk board, memos, nurse requests, nurse treatments, sweep |

---

### Task 1: Pure logic module + unit tests

**Files:**
- Create: `lib/ldh-logic.js`
- Create: `tests/logic.test.mjs`
- Create: `tests/package.json`, `tests/README.md`; modify/create `.gitignore`

**Interfaces:**
- Produces (`LDHLogic`): `RED_FLAGS: {key,label}[]`, `TIER_LABELS`, `TIER_TARGETS`, `LOCATIONS: string[]`, `tierFromFlags(flags)`, `normTier(t)`, `statusOf(task, nowMs) -> {tier, level:'ok'|'amber'|'red'|'seen', dueAt:number|null, label}`, `sortQueue(tasks, nowMs)`, `fmtDuration(ms)`, `localISO(Date)`, `addDaysISO(iso,n)`, `doseSlots(startISO, timesPerDay, days) -> {day_no,slot_no,due_date}[]`, `slotLabel(timesPerDay, slot)`, `doseLevel(dose, todayISO) -> 'done'|'overdue'|'due'|'later'`, `vaccStatus(req, nowMs) -> {level:'ok'|'amber'|'red'|'done', dueAt?, label}`, `courseProgress(doses) -> {done,total}`, `buildSweep({tasks,requests,doses}, nowMs)`, `sweepText(sweep, nowMs)`, `splitMemos(memos)`.
- Task fields consumed: `urgency`, `created_at`, `claimed_at`, `done`, `title`, `location`. Request fields: `arrived_at`, `animal_count`, `done_count`, `species`, `location`. Dose fields: `due_date`, `done_at`, `slot_no`, plus enriched `animal_id`, `treatment`, `location`, `slot_label`.

- [ ] **Step 1: Test setup files**

Create `tests/package.json`:
```json
{ "name": "ldh-shift-ops-tests", "private": true, "type": "module",
  "devDependencies": { "@electric-sql/pglite": "^0.2.0" } }
```
Create `tests/README.md`:
```markdown
# Tests (dev only)
- Unit: `node --test tests/logic.test.mjs`
- Migration (needs `cd tests && npm install` once): `node --test tests/migration.test.mjs`
- Browser: needs Playwright. On Juliana's Mac it is at
  `~/.npm/_npx/e41f203b7505f1fb/node_modules` (find with `find ~/.npm/_npx -maxdepth 4 -iname playwright -type d`).
  Run: `NODE_PATH=<that path> node tests/ui/run-all.js`
Never point tests at the live Supabase project; the browser tests use an in-memory stub.
```
Ensure `.gitignore` contains `node_modules/` and `.DS_Store` (append if the file exists).

- [ ] **Step 2: Write the failing tests**

Create `tests/logic.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const L = createRequire(import.meta.url)('../lib/ldh-logic.js');

const H = 3600 * 1000, M = 60 * 1000;
const NOW = new Date('2026-09-20T12:00:00').getTime();
const task = (urgency, agoMs, extra = {}) => Object.assign(
  { id: 't' + Math.random(), title: 'A1', location: 'Pound 1', urgency, created_at: new Date(NOW - agoMs).toISOString(), done: false, claimed_at: null }, extra);

test('tierFromFlags: any red flag -> red_flag, none -> routine', () => {
  assert.equal(L.tierFromFlags(['bleeding']), 'red_flag');
  assert.equal(L.tierFromFlags([]), 'routine');
  assert.equal(L.tierFromFlags(undefined), 'routine');
});

test('red_flag: ok until 30 min left, amber, then red when overdue (2 h)', () => {
  assert.equal(L.statusOf(task('red_flag', 1 * H), NOW).level, 'ok');
  assert.equal(L.statusOf(task('red_flag', 1.75 * H), NOW).level, 'amber');
  assert.equal(L.statusOf(task('red_flag', 2 * H + M), NOW).level, 'red');
  assert.match(L.statusOf(task('red_flag', 3 * H), NOW).label, /^overdue 1h/);
});

test('urgent: ok <12h, amber 12-24h, red from 24h', () => {
  assert.equal(L.statusOf(task('urgent', 11 * H), NOW).level, 'ok');
  assert.equal(L.statusOf(task('urgent', 12 * H), NOW).level, 'amber');
  assert.equal(L.statusOf(task('urgent', 24 * H), NOW).level, 'red');
});

test('routine: normal <24h, amber 24-48h (day 2), red from 48h (day 3)', () => {
  assert.equal(L.statusOf(task('routine', 23 * H), NOW).level, 'ok');
  assert.equal(L.statusOf(task('routine', 24 * H), NOW).level, 'amber');
  assert.equal(L.statusOf(task('routine', 47 * H), NOW).level, 'amber');
  assert.equal(L.statusOf(task('routine', 48 * H), NOW).level, 'red');
});

test('claimed or done tasks stop ageing (level seen); legacy soon = urgent', () => {
  assert.equal(L.statusOf(task('routine', 60 * H, { claimed_at: new Date(NOW).toISOString() }), NOW).level, 'seen');
  assert.equal(L.statusOf(task('routine', 60 * H, { done: true }), NOW).level, 'seen');
  assert.equal(L.statusOf(task('soon', 13 * H), NOW).tier, 'urgent');
});

test('sortQueue: red before amber before ok, then tier, then oldest first', () => {
  const a = task('routine', 1 * H, { title: 'ok-routine' });
  const b = task('red_flag', 3 * H, { title: 'red-redflag' });
  const c = task('routine', 50 * H, { title: 'red-routine' });
  const d = task('urgent', 13 * H, { title: 'amber-urgent' });
  const order = L.sortQueue([a, d, c, b], NOW).map(t => t.title);
  assert.deepEqual(order, ['red-redflag', 'red-routine', 'amber-urgent', 'ok-routine']);
});

test('fmtDuration', () => {
  assert.equal(L.fmtDuration(5 * M), '5m');
  assert.equal(L.fmtDuration(2 * H + 5 * M), '2h 5m');
  assert.equal(L.fmtDuration(27 * H), '1d 3h');
});

test('doseSlots: 2/day for 7 days = 14 slots with correct dates, incl. month rollover', () => {
  const s = L.doseSlots('2026-09-20', 2, 7);
  assert.equal(s.length, 14);
  assert.deepEqual(s[0], { day_no: 1, slot_no: 1, due_date: '2026-09-20' });
  assert.deepEqual(s[13], { day_no: 7, slot_no: 2, due_date: '2026-09-26' });
  assert.equal(L.addDaysISO('2026-09-30', 1), '2026-10-01');
});

test('slotLabel and doseLevel', () => {
  assert.equal(L.slotLabel(2, 1), 'AM');
  assert.equal(L.slotLabel(2, 2), 'PM');
  assert.equal(L.slotLabel(1, 1), 'Daily');
  assert.equal(L.doseLevel({ due_date: '2026-09-19', done_at: null }, '2026-09-20'), 'overdue');
  assert.equal(L.doseLevel({ due_date: '2026-09-20', done_at: null }, '2026-09-20'), 'due');
  assert.equal(L.doseLevel({ due_date: '2026-09-21', done_at: null }, '2026-09-20'), 'later');
  assert.equal(L.doseLevel({ due_date: '2026-09-19', done_at: 'x' }, '2026-09-20'), 'done');
});

test('vaccStatus: 3 h from arrival', () => {
  const req = (agoMs, done = 0) => ({ arrived_at: new Date(NOW - agoMs).toISOString(), animal_count: 8, done_count: done });
  assert.equal(L.vaccStatus(req(1 * H), NOW).level, 'ok');
  assert.equal(L.vaccStatus(req(2.67 * H), NOW).level, 'amber');
  assert.equal(L.vaccStatus(req(3 * H + M), NOW).level, 'red');
  assert.equal(L.vaccStatus(req(5 * H, 8), NOW).level, 'done');
  assert.match(L.vaccStatus(req(4 * H), NOW).label, /^overdue 1h/);
});

test('courseProgress and splitMemos', () => {
  assert.deepEqual(L.courseProgress([{ done_at: 'x' }, { done_at: null }, { done_at: null }]), { done: 1, total: 3 });
  const s = L.splitMemos([{ id: 1, done: false }, { id: 2, done: true }]);
  assert.equal(s.active.length, 1); assert.equal(s.completed.length, 1);
});

test('buildSweep and sweepText', () => {
  const overdue = task('red_flag', 3 * H, { title: 'RED1' });
  const unclaimedOk = task('routine', 1 * H, { title: 'OK1' });
  const claimed = task('routine', 60 * H, { title: 'CLAIMED', claimed_at: new Date(NOW).toISOString() });
  const req = { arrived_at: new Date(NOW - 4 * H).toISOString(), animal_count: 8, done_count: 2, species: 'cat', location: 'FIR Room' };
  const dose = { due_date: '2026-09-19', done_at: null, animal_id: '1174362', location: 'Cat Room 1', treatment: 'Flush site', slot_label: 'AM' };
  const sw = L.buildSweep({ tasks: [overdue, unclaimedOk, claimed], requests: [req], doses: [dose] }, NOW);
  assert.deepEqual(sw.overdueCases.map(t => t.title), ['RED1']);
  assert.deepEqual(sw.unclaimed.map(t => t.title).sort(), ['OK1', 'RED1']);
  assert.equal(sw.overdueRequests.length, 1);
  assert.equal(sw.overdueDoses.length, 1);
  const txt = L.sweepText(sw, NOW);
  assert.match(txt, /Overdue cases \(1\)/);
  assert.match(txt, /RED1 — Pound 1 — Red flag, overdue 1h/);
  assert.match(txt, /FIR Room — 8 cat\(s\) to vaccinate, overdue 1h/);
  assert.match(txt, /1174362 — Cat Room 1 — Flush site \(2026-09-19 AM\)/);
});

test('locations list matches the Cranbourne spaces used by the flag form', () => {
  assert.deepEqual(L.LOCATIONS, ['Cat Room 1', 'Cat Room 2', 'Cat Room 3', 'Adoption 1', 'Adoption 2', 'FIR Room', 'Pound 1', 'Pound 2', 'Pound 3', 'Pound 4', 'Transport']);
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd ~/ldh-shift-ops && node --test tests/logic.test.mjs`
Expected: FAIL — `Cannot find module '../lib/ldh-logic.js'`.

- [ ] **Step 4: Implement `lib/ldh-logic.js`**

```js
/* LDH Shift Ops — pure logic (no DOM, no network).
   Browser: global LDHLogic. Node: module.exports (for unit tests). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LDHLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const HOUR = 3600 * 1000, MIN = 60 * 1000;

  const TIER_LABELS = { red_flag: 'Red flag', urgent: 'Urgent', routine: 'Routine' };
  const TIER_TARGETS = { red_flag: 'within 2 h', urgent: 'within 12–24 h', routine: 'within 24–48 h' };
  const RED_FLAGS = [
    { key: 'not_eating', label: 'Not eating' },
    { key: 'laboured_breathing', label: 'Laboured breathing' },
    { key: 'bleeding', label: 'Bleeding' },
    { key: 'cant_stand', label: "Can't stand / collapsed" },
    { key: 'repeated_vomiting', label: 'Repeated vomiting' }
  ];
  const LOCATIONS = ['Cat Room 1', 'Cat Room 2', 'Cat Room 3', 'Adoption 1', 'Adoption 2', 'FIR Room',
    'Pound 1', 'Pound 2', 'Pound 3', 'Pound 4', 'Transport'];

  function tierFromFlags(flags) { return Array.isArray(flags) && flags.length ? 'red_flag' : 'routine'; }
  function normTier(t) { return t === 'soon' ? 'urgent' : (TIER_LABELS[t] ? t : 'routine'); }

  function fmtDuration(ms) {
    const m = Math.floor(Math.abs(ms) / MIN);
    const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
    if (d) return d + 'd ' + h + 'h';
    if (h) return h + 'h ' + mm + 'm';
    return mm + 'm';
  }

  function statusOf(task, now) {
    const tier = normTier(task.urgency);
    if (task.done || task.claimed_at) {
      return { tier, level: 'seen', dueAt: null, label: task.claimed_at ? 'claimed' : 'done' };
    }
    const created = new Date(task.created_at).getTime();
    const elapsed = now - created;
    let dueAt, level;
    if (tier === 'red_flag') {
      dueAt = created + 2 * HOUR;
      level = now >= dueAt ? 'red' : (dueAt - now <= 30 * MIN ? 'amber' : 'ok');
    } else if (tier === 'urgent') {
      dueAt = created + 24 * HOUR;
      level = elapsed >= 24 * HOUR ? 'red' : (elapsed >= 12 * HOUR ? 'amber' : 'ok');
    } else {
      dueAt = created + 48 * HOUR;
      level = elapsed >= 48 * HOUR ? 'red' : (elapsed >= 24 * HOUR ? 'amber' : 'ok');
    }
    const label = now >= dueAt ? 'overdue ' + fmtDuration(now - dueAt) : fmtDuration(dueAt - now) + ' left';
    return { tier, level, dueAt, label };
  }

  const LEVEL_RANK = { red: 0, amber: 1, ok: 2, seen: 3 };
  const TIER_RANK = { red_flag: 0, urgent: 1, routine: 2 };
  function sortQueue(tasks, now) {
    return tasks.slice().sort((a, b) => {
      const sa = statusOf(a, now), sb = statusOf(b, now);
      return LEVEL_RANK[sa.level] - LEVEL_RANK[sb.level]
        || TIER_RANK[sa.tier] - TIER_RANK[sb.tier]
        || new Date(a.created_at) - new Date(b.created_at);
    });
  }

  function localISO(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function addDaysISO(iso, n) {
    const [y, m, d] = iso.split('-').map(Number);
    return localISO(new Date(y, m - 1, d + n));
  }
  function doseSlots(startISO, timesPerDay, days) {
    const out = [];
    for (let day = 1; day <= days; day++) {
      for (let slot = 1; slot <= timesPerDay; slot++) {
        out.push({ day_no: day, slot_no: slot, due_date: addDaysISO(startISO, day - 1) });
      }
    }
    return out;
  }
  const SLOT_NAMES = { 1: ['Daily'], 2: ['AM', 'PM'], 3: ['Morning', 'Midday', 'Evening'], 4: ['Early AM', 'Late AM', 'Afternoon', 'Evening'] };
  function slotLabel(timesPerDay, slot) { return (SLOT_NAMES[timesPerDay] || [])[slot - 1] || ('Dose ' + slot); }
  function doseLevel(dose, todayISO) {
    if (dose.done_at) return 'done';
    if (dose.due_date < todayISO) return 'overdue';
    if (dose.due_date === todayISO) return 'due';
    return 'later';
  }
  function courseProgress(doses) {
    return { done: doses.filter(d => d.done_at).length, total: doses.length };
  }

  function vaccStatus(req, now) {
    if (req.done_count >= req.animal_count) return { level: 'done', label: 'complete' };
    const dueAt = new Date(req.arrived_at).getTime() + 3 * HOUR;
    const level = now >= dueAt ? 'red' : (dueAt - now <= 30 * MIN ? 'amber' : 'ok');
    return { level, dueAt, label: now >= dueAt ? 'overdue ' + fmtDuration(now - dueAt) : fmtDuration(dueAt - now) + ' left' };
  }

  function buildSweep(input, now) {
    const todayISO = localISO(new Date(now));
    const openTasks = (input.tasks || []).filter(t => !t.done);
    return {
      overdueCases: openTasks.filter(t => statusOf(t, now).level === 'red'),
      unclaimed: openTasks.filter(t => !t.claimed_at),
      overdueRequests: (input.requests || []).filter(r => vaccStatus(r, now).level === 'red'),
      overdueDoses: (input.doses || []).filter(d => doseLevel(d, todayISO) === 'overdue')
    };
  }
  function sweepText(sweep, now) {
    const L = ['Handover — ' + new Date(now).toLocaleString('en-AU')];
    const sec = (title, arr, fmt) => {
      L.push(''); L.push(title + ' (' + arr.length + ')');
      if (!arr.length) L.push('- none');
      arr.forEach(x => L.push('- ' + fmt(x)));
    };
    sec('Overdue cases', sweep.overdueCases,
      t => t.title + ' — ' + t.location + ' — ' + TIER_LABELS[normTier(t.urgency)] + ', ' + statusOf(t, now).label);
    const overdueIds = new Set(sweep.overdueCases.map(t => t.id));
    sec('Not yet claimed', sweep.unclaimed.filter(t => !overdueIds.has(t.id)),
      t => t.title + ' — ' + t.location + ' — ' + TIER_LABELS[normTier(t.urgency)]);
    sec('Overdue nurse requests', sweep.overdueRequests,
      r => r.location + ' — ' + r.animal_count + ' ' + r.species + '(s) to vaccinate, ' + vaccStatus(r, now).label);
    sec('Overdue treatment doses', sweep.overdueDoses,
      d => d.animal_id + ' — ' + d.location + ' — ' + d.treatment + ' (' + d.due_date + ' ' + d.slot_label + ')');
    return L.join('\n');
  }

  function splitMemos(memos) {
    return { active: memos.filter(m => !m.done), completed: memos.filter(m => m.done) };
  }

  return { RED_FLAGS, TIER_LABELS, TIER_TARGETS, LOCATIONS, tierFromFlags, normTier, statusOf, sortQueue,
    fmtDuration, localISO, addDaysISO, doseSlots, slotLabel, doseLevel, vaccStatus, courseProgress,
    buildSweep, sweepText, splitMemos };
});
```

- [ ] **Step 5: Run to verify it passes**

Run: `node --test tests/logic.test.mjs`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/ldh-logic.js tests/logic.test.mjs tests/package.json tests/README.md .gitignore
git commit -m "feat: pure triage/nurse/sweep logic module with unit tests"   # + trailers (Global Constraints)
```

---

### Task 2: Migration 0008 + PGlite test

**Files:**
- Create: `supabase/migrations/0008_triage_and_vet_desk.sql`
- Create: `tests/migration.test.mjs`

**Interfaces:**
- Produces (DB): `tasks.urgency in ('routine','urgent','red_flag')`; `tasks.red_flags text[]`, `claimed_by text`, `claimed_at timestamptz`; `memos.done boolean`, `done_at timestamptz`, `source text` + UPDATE/DELETE policies; tables `nurse_requests(id, kind, location, species, animal_count, note, arrived_at, done_count, claimed_by, created_by, created_at, completed_at)`, `nurse_treatments(id, animal_id, location, treatment, times_per_day, days, start_date, requested_by, stopped, created_at)`, `nurse_treatment_doses(id, treatment_id, day_no, slot_no, due_date, done_by, done_at)`.

- [ ] **Step 1: Write the failing test**

Create `tests/migration.test.mjs`:
```js
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const MIG = path.resolve(import.meta.dirname, '../supabase/migrations');
const BASE = ['0001_init_schema.sql', '0002_rls_policies.sql', '0004_task_problem_field.sql', '0005_task_condition_field.sql'];

async function db(files) {
  const d = new PGlite();
  await d.exec(`
    create schema auth;
    create function auth.role() returns text language sql as $$ select 'authenticated' $$;
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create role authenticated; create role anon;
    create publication supabase_realtime;`);
  for (const f of files) await d.exec(fs.readFileSync(path.join(MIG, f), 'utf8'));
  return d;
}
const rejects = async (d, sql) => { try { await d.exec(sql); return false; } catch (e) { return true; } };

test('existing urgency values map: urgent->red_flag, soon->urgent, routine unchanged', async () => {
  const d = await db(BASE);
  await d.exec(`insert into public.tasks (title,location,shift,urgency) values
    ('a','r','sick_injured','urgent'),('b','r','sick_injured','soon'),('c','r','sick_injured','routine')`);
  await d.exec(fs.readFileSync(path.join(MIG, '0008_triage_and_vet_desk.sql'), 'utf8'));
  const r = await d.query(`select title, urgency from public.tasks order by title`);
  assert.deepEqual(r.rows.map(x => x.urgency), ['red_flag', 'urgent', 'routine']);
});

test('new tier value accepted, legacy soon still accepted, junk rejected, new columns default sensibly', async () => {
  const d = await db([...BASE, '0008_triage_and_vet_desk.sql']);
  await d.exec(`insert into public.tasks (title,location,shift,urgency,red_flags) values ('x','r','sick_injured','red_flag','{bleeding}')`);
  await d.exec(`insert into public.tasks (title,location,shift,urgency) values ('y','r','sick_injured','soon')`);
  assert.ok(await rejects(d, `insert into public.tasks (title,location,shift,urgency) values ('bad','r','sick_injured','bogus')`));
  await d.exec(`insert into public.tasks (title,location,shift) values ('z','r','sick_injured')`);
  const r = await d.query(`select red_flags, claimed_by from public.tasks where title='z'`);
  assert.deepEqual(r.rows[0].red_flags, []);
  assert.equal(r.rows[0].claimed_by, null);
});

test('memos can be ticked off and deleted (policies exist)', async () => {
  const d = await db([...BASE, '0008_triage_and_vet_desk.sql']);
  const pol = await d.query(`select cmd from pg_policies where tablename='memos'`);
  const cmds = pol.rows.map(r => r.cmd);
  assert.ok(cmds.includes('UPDATE') && cmds.includes('DELETE'));
  await d.exec(`insert into public.memos (author,text) values ('JX','hello')`);
  await d.exec(`update public.memos set done = true, done_at = now() where author='JX'`);
  assert.equal((await d.query(`select done from public.memos`)).rows[0].done, true);
});

test('nurse tables: constraints, uniqueness, cascade', async () => {
  const d = await db([...BASE, '0008_triage_and_vet_desk.sql']);
  await d.exec(`insert into public.nurse_requests (location,species,animal_count) values ('FIR Room','cat',8)`);
  assert.ok(await rejects(d, `insert into public.nurse_requests (location,species,animal_count) values ('FIR Room','cat',0)`));
  assert.ok(await rejects(d, `insert into public.nurse_requests (location,species,animal_count) values ('FIR Room','rabbit',1)`));
  await d.exec(`insert into public.nurse_treatments (animal_id,location,treatment,times_per_day,days) values ('1174362','Cat Room 1','Flush site',2,7)`);
  assert.ok(await rejects(d, `insert into public.nurse_treatments (animal_id,location,treatment,times_per_day,days) values ('x','r','t',5,7)`));
  const t = (await d.query(`select id from public.nurse_treatments`)).rows[0].id;
  await d.exec(`insert into public.nurse_treatment_doses (treatment_id,day_no,slot_no,due_date) values ('${t}',1,1,'2026-09-20')`);
  assert.ok(await rejects(d, `insert into public.nurse_treatment_doses (treatment_id,day_no,slot_no,due_date) values ('${t}',1,1,'2026-09-20')`));
  await d.exec(`delete from public.nurse_treatments`);
  assert.equal((await d.query(`select count(*)::int as n from public.nurse_treatment_doses`)).rows[0].n, 0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd tests && npm install && cd .. && node --test tests/migration.test.mjs`
Expected: FAIL — `ENOENT ... 0008_triage_and_vet_desk.sql`. (If it instead fails while applying `0001`/`0002`, fix the harness bootstrap in `db()` — e.g. a missing stub — before continuing.)

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0008_triage_and_vet_desk.sql`:
```sql
-- Stage 1 of the Floor / Vet desk redesign (2026-09-20).

-- 1. Three triage tiers. Old 'urgent' (act now) becomes 'red_flag'; old 'soon' becomes 'urgent'.
alter table public.tasks drop constraint if exists tasks_urgency_check;
update public.tasks set urgency = 'red_flag' where urgency = 'urgent';
update public.tasks set urgency = 'urgent' where urgency = 'soon';
-- 'soon' stays allowed ONLY so a browser tab still running the old page keeps working
-- through the switch-over; the app treats it as 'urgent' (LDHLogic.normTier).
alter table public.tasks
  add constraint tasks_urgency_check check (urgency in ('routine','soon','urgent','red_flag'));
alter table public.tasks add column red_flags text[] not null default '{}';
alter table public.tasks add column claimed_by text;
alter table public.tasks add column claimed_at timestamptz;

-- 2. Memos can be ticked off (kept, hidden) or deleted.
alter table public.memos add column done boolean not null default false;
alter table public.memos add column done_at timestamptz;
alter table public.memos add column source text;
create policy "authenticated_update_memos" on public.memos
  for update using (auth.role() = 'authenticated');
create policy "authenticated_delete_memos" on public.memos
  for delete using (auth.role() = 'authenticated');

-- 3. Nurse vaccination requests (groups of animals, 3 h from arrival).
create table public.nurse_requests (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'vaccination',
  location text not null,
  species text not null check (species in ('cat','dog')),
  animal_count int not null check (animal_count > 0),
  note text,
  arrived_at timestamptz not null default now(),
  done_count int not null default 0 check (done_count >= 0),
  claimed_by text,
  created_by text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- 4. Nurse treatment reminders: a course (N times a day for D days) and its dose ticks.
create table public.nurse_treatments (
  id uuid primary key default gen_random_uuid(),
  animal_id text not null,
  location text not null,
  treatment text not null,
  times_per_day int not null check (times_per_day between 1 and 4),
  days int not null check (days between 1 and 30),
  start_date date not null default current_date,
  requested_by text,
  stopped boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.nurse_treatment_doses (
  id uuid primary key default gen_random_uuid(),
  treatment_id uuid not null references public.nurse_treatments(id) on delete cascade,
  day_no int not null,
  slot_no int not null,
  due_date date not null,
  done_by text,
  done_at timestamptz,
  unique (treatment_id, day_no, slot_no)
);

-- 5. Same access model as the other dashboard tables (shared staff login) + realtime.
do $$
declare t text;
begin
  foreach t in array array['nurse_requests','nurse_treatments','nurse_treatment_doses'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "authenticated_select_%s" on public.%I for select using (auth.role() = ''authenticated'')', t, t);
    execute format('create policy "authenticated_insert_%s" on public.%I for insert with check (auth.role() = ''authenticated'')', t, t);
    execute format('create policy "authenticated_update_%s" on public.%I for update using (auth.role() = ''authenticated'')', t, t);
    execute format('create policy "authenticated_delete_%s" on public.%I for delete using (auth.role() = ''authenticated'')', t, t);
    execute format('alter publication supabase_realtime add table public.%I', t);
  end loop;
end $$;
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/migration.test.mjs`
Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0008_triage_and_vet_desk.sql tests/migration.test.mjs
git commit -m "feat: migration for triage tiers, claims, memo tick-off, nurse tables"   # + trailers
```
Do NOT run this migration on the live database yet (Task 9).

---

### Task 3: Browser test harness + red-flag flag form

**Files:**
- Create: `tests/ui/harness.js`, `tests/ui/check.js`, `tests/ui/run-all.js`, `tests/ui/flag-form.test.js`
- Modify: `index.html` (script tag; form HTML lines ~257-292; submit handler ~561-586; init ~981)

**Interfaces:**
- Consumes: `LDHLogic.RED_FLAGS`, `LDHLogic.tierFromFlags`, `LDHLogic.TIER_LABELS`, `LDHLogic.TIER_TARGETS`, `LDHLogic.LOCATIONS` (Task 1).
- Produces (harness): `open(seed?) -> {browser, page, errors, db()}` where `seed` is `{tasks:[],memos:[],nurse_requests:[],nurse_treatments:[],nurse_treatment_doses:[],roster:[]}` of partial rows; `check(name) -> {ok(cond,msg), done()}`.
- Produces (page): `renderRedFlagForm()`, `selectedFlags()`, `updateTierPreview()`, `fillLocationSelects()` (fills every existing `#req-location`, `#nr-location`, `#nt-location` from `LDHLogic.LOCATIONS`).

- [ ] **Step 1: Write the harness**

Create `tests/ui/check.js`:
```js
module.exports = function (name) {
  let fails = 0;
  return {
    ok(cond, msg) { console.log((cond ? 'PASS ' : 'FAIL ') + name + ': ' + msg); if (!cond) fails++; },
    done() { console.log(fails ? `${name}: ${fails} FAILED` : `${name}: ALL PASSED`); process.exit(fails ? 1 : 0); }
  };
};
```
Create `tests/ui/harness.js`:
```js
const { chromium } = require('playwright');
const path = require('path');
const PAGE_URL = 'file://' + path.resolve(__dirname, '../../index.html');

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

async function open(seed = {}) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 1000 } });
  await ctx.route('**/supabase.js', r => r.abort());
  await ctx.addInitScript(STUB);
  await ctx.addInitScript((s) => {
    Object.keys(s).forEach(k => s[k].forEach(r => window.__db[k].push(
      Object.assign({ id: 'seed' + Math.random().toString(36).slice(2), created_at: new Date().toISOString() }, r))));
  }, seed);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept('JX'));   // prompt() -> initials "JX"; confirm() -> OK
  await page.goto(PAGE_URL);
  await page.waitForTimeout(500);
  return { browser, page, errors, db: () => page.evaluate(() => window.__db) };
}
module.exports = { open };
```
Create `tests/ui/run-all.js`:
```js
const { spawnSync } = require('child_process');
const fs = require('fs'), path = require('path');
let failed = 0;
for (const f of fs.readdirSync(__dirname).filter(n => n.endsWith('.test.js')).sort()) {
  const r = spawnSync('node', [path.join(__dirname, f)], { stdio: 'inherit', env: process.env });
  if (r.status !== 0) failed++;
}
console.log(failed ? `\n${failed} test file(s) FAILED` : '\nALL UI TESTS PASSED');
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Write the failing test**

Create `tests/ui/flag-form.test.js`:
```js
const { open } = require('./harness');
const t = require('./check')('flag-form');
(async () => {
  const { browser, page, errors, db } = await open();
  t.ok(await page.locator('#req-redflags input.req-flag').count() === 5, 'five red-flag checkboxes');
  t.ok((await page.textContent('#req-tier-preview')).startsWith('Routine — check within 24–48 h'), 'preview starts as Routine');
  t.ok((await page.textContent('#req-redflags-wrap')).includes("Emergency? Radio the vet"), 'emergency reminder shown');
  t.ok(await page.locator('#req-urgency').count() === 0, 'manual urgency dropdown removed');
  t.ok(await page.locator('#req-location option').count() === 11, 'location select filled from the shared list');

  await page.fill('#req-title', 'T100');
  await page.check('input.req-flag[value="bleeding"]');
  t.ok((await page.textContent('#req-tier-preview')).startsWith('Red flag — check within 2 h'), 'ticking a red flag switches preview to Red flag');
  await page.click('#req-submit');
  await page.waitForTimeout(200);
  let tasks = (await db()).tasks;
  t.ok(tasks.length === 1 && tasks[0].urgency === 'red_flag' && tasks[0].red_flags.join() === 'bleeding', 'saved as red_flag with the ticked flag');
  t.ok(await page.locator('input.req-flag:checked').count() === 0, 'flags reset after submit');

  await page.fill('#req-title', 'T101');
  await page.click('#req-submit');
  await page.waitForTimeout(200);
  tasks = (await db()).tasks;
  t.ok(tasks.length === 2 && tasks[1].urgency === 'routine' && tasks[1].red_flags.length === 0, 'no flags saves as routine');
  t.ok(errors.length === 0, 'no page errors: ' + errors.join('; '));
  await browser.close();
  t.done();
})();
```

- [ ] **Step 3: Run to verify it fails**

Run: `NODE_PATH=~/.npm/_npx/e41f203b7505f1fb/node_modules node tests/ui/flag-form.test.js`
Expected: FAIL — `LDHLogic`/`req-redflags` missing (first assertion fails).

- [ ] **Step 4: Implement in `index.html`**

4a. Load the module. Replace
`<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>`
with
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>
<script src="lib/ldh-logic.js"></script>
```

4b. Form grid: replace `<div style="display:grid; grid-template-columns: repeat(4,1fr); gap:10px;">` (in `#new-request-form`) with `<div style="display:grid; grid-template-columns: repeat(3,1fr); gap:10px;">`.

4c. Replace the `req-location` select (options are now generated) — old:
```html
          <select id="req-location" style="margin:0; flex:2;">
            <option>Cat Room 1</option><option>Cat Room 2</option><option>Cat Room 3</option>
            <option>Adoption 1</option><option>Adoption 2</option><option>FIR Room</option>
            <option>Pound 1</option><option>Pound 2</option><option>Pound 3</option><option>Pound 4</option>
            <option>Transport</option>
          </select>
```
new: `          <select id="req-location" style="margin:0; flex:2;"></select>`

4d. Delete the whole `req-urgency` select (5 lines: `<select id="req-urgency" style="margin:0;">` … `</select>`).

4e. Insert before `      <button id="req-submit" style="margin-top:6px;">Submit request</button>`:
```html
      <div id="req-redflags-wrap" style="margin:12px 0 4px;">
        <div style="font-size:0.78rem; font-weight:700; margin-bottom:6px;">Red flags — tick any that apply</div>
        <div id="req-redflags" style="display:flex; flex-wrap:wrap; gap:8px 18px;"></div>
        <div id="req-tier-preview" style="font-size:0.85rem; font-weight:700; margin-top:8px;"></div>
        <div style="font-size:0.75rem; color:var(--muted); margin-top:2px;">Emergency? Radio the vet — don't wait for this board.</div>
      </div>
```

4f. In the submit handler replace `      urgency: document.getElementById('req-urgency').value,` with
```js
      urgency: LDHLogic.tierFromFlags(selectedFlags()),
      red_flags: selectedFlags(),
```
and after `    document.getElementById('req-condition').value = '';` add
```js
    document.querySelectorAll('.req-flag').forEach(cb => { cb.checked = false; });
    updateTierPreview();
```

4g. Add these functions just before `  initAuth();` (end of script) and call them:
```js
  function fillLocationSelects() {
    ['req-location', 'nr-location', 'nt-location'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = LDHLogic.LOCATIONS.map(l => `<option>${esc(l)}</option>`).join('');
    });
  }
  function selectedFlags() { return Array.from(document.querySelectorAll('.req-flag:checked')).map(cb => cb.value); }
  function updateTierPreview() {
    const tier = LDHLogic.tierFromFlags(selectedFlags());
    document.getElementById('req-tier-preview').textContent = LDHLogic.TIER_LABELS[tier] + ' — check ' + LDHLogic.TIER_TARGETS[tier];
  }
  function renderRedFlagForm() {
    const wrap = document.getElementById('req-redflags');
    wrap.innerHTML = LDHLogic.RED_FLAGS.map(f =>
      `<label style="display:flex; align-items:center; gap:6px; font-size:0.82rem; margin:0;"><input type="checkbox" class="req-flag" value="${f.key}" style="width:auto; margin:0;"> ${esc(f.label)}</label>`).join('');
    wrap.querySelectorAll('.req-flag').forEach(cb => cb.addEventListener('change', updateTierPreview));
    updateTierPreview();
  }
  fillLocationSelects();
  renderRedFlagForm();
```
(place immediately above the existing `initAuth();` line).

- [ ] **Step 5: Run to verify it passes**

Run: `NODE_PATH=~/.npm/_npx/e41f203b7505f1fb/node_modules node tests/ui/flag-form.test.js`
Expected: `flag-form: ALL PASSED`.

- [ ] **Step 6: Commit**

```bash
git add tests/ui index.html
git commit -m "feat: red-flag checklist on the flag form; browser test harness"   # + trailers
```

---

### Task 4: Vet-desk board by tier, status chips, claim, bump

**Files:**
- Create: `tests/ui/vet-board.test.js`
- Modify: `index.html` (CSS ~154-157 & ~179; `URGENCY_COLOR` line ~412; board HTML ~348-350; `renderQueueTable` ~673-693; `renderBoardCol`/`renderVetBoard` ~695-746; end of script)

**Interfaces:**
- Consumes: `LDHLogic.statusOf`, `sortQueue`, `TIER_LABELS`, `normTier` (Task 1); `tasks.urgency/claimed_by/claimed_at` (Task 2).
- Produces (page): `statusChipHtml(task)`, `myInitials()`, `claimTask(id)`, `unclaimTask(id)`, `bumpToUrgent(id)`; board containers `#board-redflag`, `#board-urgent`, `#board-routine`; a 60-second refresh that re-renders queue, board (and later sweep/nurse cards via `refreshTimers()`).

- [ ] **Step 1: Write the failing test**

Create `tests/ui/vet-board.test.js`:
```js
const { open } = require('./harness');
const t = require('./check')('vet-board');
const ago = ms => new Date(Date.now() - ms).toISOString();
const H = 3600 * 1000, M = 60 * 1000;
(async () => {
  const mk = (title, urgency, agoMs) => ({ title, location: 'Pound 1', shift: 'sick_injured', type: 'shelter', urgency, created_at: ago(agoMs) });
  const { browser, page, errors, db } = await open({ tasks: [
    mk('A-AMBER', 'red_flag', 1.75 * H), mk('B-RED', 'red_flag', 3 * H),
    mk('C-URG', 'urgent', 13 * H), mk('D-R25', 'routine', 25 * H),
    mk('E-R50', 'routine', 50 * H), mk('F-NEW', 'routine', 10 * M)] });
  await page.selectOption('#role-select', 'vet_nurse');
  await page.waitForTimeout(200);
  const col = id => page.textContent('#' + id);
  const rf = await col('board-redflag'), ur = await col('board-urgent'), ro = await col('board-routine');
  t.ok(rf.indexOf('B-RED') > -1 && rf.indexOf('B-RED') < rf.indexOf('A-AMBER'), 'red-flag column: overdue first');
  t.ok(ur.includes('C-URG'), 'urgent column has the urgent case');
  t.ok(ro.indexOf('E-R50') < ro.indexOf('D-R25') && ro.indexOf('D-R25') < ro.indexOf('F-NEW'), 'routine column ordered red, amber, ok');
  t.ok(await page.locator('#board-redflag .lvl-red').count() === 1 && await page.locator('#board-redflag .lvl-amber').count() === 1, 'red-flag chips: one red, one amber');
  t.ok(await page.locator('#board-routine .lvl-red').count() === 1 && await page.locator('#board-routine .lvl-amber').count() === 1 && await page.locator('#board-routine .lvl-ok').count() === 1, 'routine chips: day 3 red, day 2 amber, new ok');
  t.ok((await col('board-routine')).includes('overdue'), 'overdue label shown');

  const row = title => page.locator('.attn-item', { hasText: title });
  await row('D-R25').locator('.claim-btn').click();
  await page.waitForTimeout(200);
  t.ok((await db()).tasks.find(x => x.title === 'D-R25').claimed_by === 'JX', 'claim stores initials');
  t.ok((await row('D-R25').textContent()).includes('Claimed by JX'), 'claimed chip shown');
  t.ok(await row('D-R25').locator('.lvl-amber').count() === 0, 'claimed case no longer ages');

  t.ok(await row('C-URG').locator('.bump-btn').count() === 0, 'bump only offered on routine cases');
  await row('F-NEW').locator('.bump-btn').click();
  await page.waitForTimeout(200);
  t.ok((await col('board-urgent')).includes('F-NEW'), 'bumped case moves to the urgent column');
  t.ok((await db()).tasks.find(x => x.title === 'F-NEW').urgency === 'urgent', 'urgency saved as urgent');

  await page.selectOption('#role-select', 'attendant');
  await page.waitForTimeout(200);
  const firstRow = await page.textContent('#queue-tbody tr');
  t.ok(firstRow.includes('B-RED') && firstRow.includes('Red flag'), 'Floor table lists the most overdue first with its tier');
  t.ok(errors.length === 0, 'no page errors: ' + errors.join('; '));
  await browser.close();
  t.done();
})();
```

- [ ] **Step 2: Run to verify it fails**

Run: `NODE_PATH=~/.npm/_npx/e41f203b7505f1fb/node_modules node tests/ui/vet-board.test.js`
Expected: FAIL (`board-redflag` does not exist).

- [ ] **Step 3: Implement**

3a. CSS. Replace `  .urgency-col h3.urgent-h { color: var(--critical); }` with
```css
  .urgency-col h3.red-h { color: var(--critical); }
  .urgency-col h3.urgent-h { color: #c26a00; }
```
After `  .status-pill.routine { background: rgba(216,214,206,0.35); color: var(--muted); }` add:
```css
  .status-pill.red_flag { background: rgba(208,59,59,0.14); color: var(--critical); }
  .lvl { font-size: 0.68rem; font-weight: 700; padding: 3px 9px; border-radius: 10px; white-space: nowrap; }
  .lvl-ok { background: rgba(34,154,99,0.12); color: var(--green); }
  .lvl-amber { background: rgba(255,159,67,0.22); color: #9a5b00; }
  .lvl-red { background: rgba(208,59,59,0.14); color: var(--critical); }
  .lvl-seen, .lvl-done { background: rgba(107,114,128,0.14); color: var(--muted); }
```
3b. Replace `  const URGENCY_COLOR = { urgent: 'var(--critical)', soon: 'var(--neutral-500)', routine: 'var(--neutral-300)' };` with
`  const URGENCY_COLOR = { red_flag: 'var(--critical)', urgent: 'var(--amber)', soon: 'var(--amber)', routine: 'var(--neutral-300)' };`

3c. Board columns HTML. Replace the three `urgency-col` lines (`Urgent` / `Soon` / `Routine`) with:
```html
            <div class="urgency-col"><h3 class="red-h">Red flag · within 2 h</h3><div id="board-redflag"></div></div>
            <div class="urgency-col"><h3 class="urgent-h">Urgent · 12–24 h</h3><div id="board-urgent"></div></div>
            <div class="urgency-col"><h3 class="routine-h">Routine · 24–48 h</h3><div id="board-routine"></div></div>
```
3d. `renderQueueTable`: delete the line `    const order = { urgent: 0, soon: 1, routine: 2 };`; replace `    open.sort((a, b) => order[a.urgency] - order[b.urgency]);` with `    open = LDHLogic.sortQueue(open, Date.now());`; replace the cell `        <td><span class="status-pill ${t.urgency}">${t.urgency}</span></td>` with
`        <td><span class="status-pill ${LDHLogic.normTier(t.urgency)}">${LDHLogic.TIER_LABELS[LDHLogic.normTier(t.urgency)]}</span> ${statusChipHtml(t)}</td>`

3e. Replace the whole `renderBoardCol` and `renderVetBoard` functions with:
```js
  function statusChipHtml(t) {
    const st = LDHLogic.statusOf(t, Date.now());
    if (st.level === 'seen') return `<span class="lvl lvl-seen">${t.claimed_at ? 'Claimed by ' + esc(t.claimed_by || '?') : 'Done'}</span>`;
    return `<span class="lvl lvl-${st.level}">${esc(st.label)}</span>`;
  }
  function myInitials() {
    let v = localStorage.getItem('ldh_ops_initials') || '';
    if (!v) {
      v = (window.prompt('Your initials (saved on this device):') || '').trim().toUpperCase().slice(0, 4);
      if (v) localStorage.setItem('ldh_ops_initials', v);
    }
    return v;
  }
  async function claimTask(id) {
    const who = myInitials(); if (!who) return;
    const { error } = await sb.from('tasks').update({ claimed_by: who, claimed_at: new Date().toISOString() }).eq('id', id);
    if (error) alert('Could not claim: ' + error.message);
    loadAll();
  }
  async function unclaimTask(id) {
    const { error } = await sb.from('tasks').update({ claimed_by: null, claimed_at: null }).eq('id', id);
    if (error) alert('Could not release: ' + error.message);
    loadAll();
  }
  async function bumpToUrgent(id) {
    const { error } = await sb.from('tasks').update({ urgency: 'urgent' }).eq('id', id);
    if (error) alert('Could not update: ' + error.message);
    loadAll();
  }

  function renderBoardCol(containerId, tasks) {
    const el = document.getElementById(containerId);
    if (!tasks.length) { el.innerHTML = '<p class="empty-state">Nothing here.</p>'; return; }
    el.innerHTML = tasks.map(t => {
      const url = pickUpUrl([t]);
      const canPickUp = !!SHIFT_TOOL_URLS[t.shift];
      const tier = LDHLogic.normTier(t.urgency);
      return `
      <div class="attn-item">
        <label style="display:flex; align-items:center; gap:8px; flex:1; margin:0; cursor:${canPickUp ? 'pointer' : 'default'};">
          <input type="checkbox" class="pickup-check" data-id="${t.id}" ${selectedPickup.has(t.id) ? 'checked' : ''} ${canPickUp ? '' : 'disabled'}>
          <div><div class="aname">${esc(t.title)} ${statusChipHtml(t)}</div><div class="ameta">${esc(t.location)} · ${SHIFT_LABELS[t.shift]} · ${TYPE_LABELS[t.type] || t.type}${t.problem ? ' · ' + esc(t.problem) : ''}${(t.red_flags && t.red_flags.length) ? ' · flags: ' + esc(t.red_flags.join(', ').replace(/_/g, ' ')) : ''}</div></div>
        </label>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          ${t.claimed_at
            ? `<button class="secondary unclaim-btn" data-id="${t.id}">Release</button>`
            : `<button class="secondary claim-btn" data-id="${t.id}">I've got this</button>`}
          ${tier === 'routine' && !t.claimed_at ? `<button class="secondary bump-btn" data-id="${t.id}">Bump to urgent</button>` : ''}
          ${url ? `<a class="secondary pick-up" href="${url}" target="_blank" rel="noopener" style="padding:5px 10px; font-size:0.72rem; border-radius:14px; text-decoration:none; color:var(--ink); display:inline-block;">Pick up →</a>` : ''}
          <button class="secondary mark-done" data-id="${t.id}">Mark done</button>
        </div>
      </div>
    `;
    }).join('');
    el.querySelectorAll('.mark-done').forEach(btn => btn.addEventListener('click', () => markDone(btn.dataset.id)));
    el.querySelectorAll('.claim-btn').forEach(btn => btn.addEventListener('click', () => claimTask(btn.dataset.id)));
    el.querySelectorAll('.unclaim-btn').forEach(btn => btn.addEventListener('click', () => unclaimTask(btn.dataset.id)));
    el.querySelectorAll('.bump-btn').forEach(btn => btn.addEventListener('click', () => bumpToUrgent(btn.dataset.id)));
    el.querySelectorAll('.pickup-check').forEach(cb => cb.addEventListener('change', () => {
      if (cb.checked) selectedPickup.add(cb.dataset.id); else selectedPickup.delete(cb.dataset.id);
      updatePickupBar();
    }));
  }

  function renderVetBoard() {
    const open = LDHLogic.sortQueue(TASKS.filter(t => !t.done && (typeFilter === 'all' || t.type === typeFilter)), Date.now());
    renderBoardCol('board-redflag', open.filter(t => LDHLogic.normTier(t.urgency) === 'red_flag'));
    renderBoardCol('board-urgent', open.filter(t => LDHLogic.normTier(t.urgency) === 'urgent'));
    renderBoardCol('board-routine', open.filter(t => LDHLogic.normTier(t.urgency) === 'routine'));
    updatePickupBar();
  }
```
3f. Keep countdowns fresh: just above `  fillLocationSelects();` (added in Task 3) add
```js
  function refreshTimers() {
    renderQueueTable();
    renderVetBoard();
    if (typeof renderNurseRequests === 'function') renderNurseRequests();
    if (typeof renderNurseTreatments === 'function') renderNurseTreatments();
    if (typeof renderSweep === 'function') renderSweep();
  }
  setInterval(refreshTimers, 60000);
```

- [ ] **Step 4: Run to verify it passes**

Run: `NODE_PATH=~/.npm/_npx/e41f203b7505f1fb/node_modules node tests/ui/vet-board.test.js` then `node tests/ui/flag-form.test.js` (with the same NODE_PATH).
Expected: both `ALL PASSED`.

- [ ] **Step 5: Commit**

```bash
git add index.html tests/ui/vet-board.test.js
git commit -m "feat: three-tier Vet-desk board with status chips, claim and bump-to-urgent"   # + trailers
```

---

### Task 5: Memo tick-off

**Files:**
- Create: `tests/ui/memos.test.js`
- Modify: `index.html` (memo card HTML ~363-369; `renderMemos` ~752-756; memo handlers)

**Interfaces:**
- Consumes: `LDHLogic.splitMemos` (Task 1); `memos.done/done_at` + UPDATE/DELETE policies (Task 2).
- Produces (page): `renderMemos()` (active list + completed toggle), delegated handlers for `.memo-tick`, `.memo-del`, `#memo-completed-toggle`.

- [ ] **Step 1: Write the failing test**

Create `tests/ui/memos.test.js`:
```js
const { open } = require('./harness');
const t = require('./check')('memos');
(async () => {
  const { browser, page, errors, db } = await open({ memos: [
    { author: 'Vet team', text: 'Active one', done: false },
    { author: 'Vet team', text: 'Active two', done: false },
    { author: 'Vet team', text: 'Old done', done: true, done_at: new Date().toISOString() }] });
  await page.selectOption('#role-select', 'vet_nurse');
  await page.waitForTimeout(200);
  t.ok(await page.locator('#memo-list .memo').count() === 2, 'two active memos shown');
  t.ok((await page.textContent('#memo-completed-toggle')).includes('Show completed (1)'), 'completed toggle shows the count');

  await page.locator('.memo', { hasText: 'Active one' }).locator('.memo-tick').check();
  await page.waitForTimeout(250);
  t.ok(await page.locator('#memo-list .memo').count() === 1, 'ticked memo leaves the active list');
  const m = (await db()).memos.find(x => x.text === 'Active one');
  t.ok(m.done === true && !!m.done_at, 'memo kept with done + done_at');

  await page.click('#memo-completed-toggle');
  t.ok(await page.locator('#memo-completed-list .memo').count() === 2, 'completed list shows both ticked memos');

  await page.locator('#memo-completed-list .memo', { hasText: 'Old done' }).locator('.memo-del').click();
  await page.waitForTimeout(250);
  t.ok((await db()).memos.length === 2, 'delete removes the memo (confirm accepted)');

  await page.locator('#memo-completed-list .memo', { hasText: 'Active one' }).locator('.memo-tick').uncheck();
  await page.waitForTimeout(250);
  t.ok(await page.locator('#memo-list .memo').count() === 2, 'un-ticking returns it to the active list');
  t.ok(errors.length === 0, 'no page errors: ' + errors.join('; '));
  await browser.close();
  t.done();
})();
```

- [ ] **Step 2: Run to verify it fails**

Run: `NODE_PATH=~/.npm/_npx/e41f203b7505f1fb/node_modules node tests/ui/memos.test.js`
Expected: FAIL (`#memo-completed-toggle` missing).

- [ ] **Step 3: Implement**

3a. In the memo card, replace `          <div id="memo-list"></div>` with
```html
          <div id="memo-list"></div>
          <button class="secondary" id="memo-completed-toggle" style="display:none; padding:6px 12px; font-size:0.75rem; margin-bottom:10px;"></button>
          <div id="memo-completed-list"></div>
```
3b. Replace `renderMemos` with:
```js
  let showCompletedMemos = false;
  function memoRowHtml(m, isDone) {
    return `<div class="memo ${isDone ? 'memo-done' : ''}">
      <label style="display:flex; gap:8px; align-items:flex-start; margin:0; cursor:pointer;">
        <input type="checkbox" class="memo-tick" data-id="${m.id}" ${isDone ? 'checked' : ''} style="width:auto; margin-top:4px;">
        <span><strong>${esc(m.author)}</strong>: ${esc(m.text)}</span>
      </label>
      ${isDone ? `<button class="secondary memo-del" data-id="${m.id}" style="padding:3px 10px; font-size:0.7rem; margin-top:6px;">Delete</button>` : ''}
    </div>`;
  }
  function renderMemos() {
    const { active, completed } = LDHLogic.splitMemos(MEMOS);
    document.getElementById('memo-list').innerHTML =
      active.map(m => memoRowHtml(m, false)).join('') || '<p class="empty-state">No open memos.</p>';
    const toggle = document.getElementById('memo-completed-toggle');
    toggle.textContent = (showCompletedMemos ? 'Hide' : 'Show') + ' completed (' + completed.length + ')';
    toggle.style.display = completed.length ? 'inline-block' : 'none';
    document.getElementById('memo-completed-list').innerHTML =
      showCompletedMemos ? completed.map(m => memoRowHtml(m, true)).join('') : '';
  }
  document.getElementById('memo-board').addEventListener('change', async (e) => {
    const cb = e.target.closest('.memo-tick'); if (!cb) return;
    const { error } = await sb.from('memos').update({ done: cb.checked, done_at: cb.checked ? new Date().toISOString() : null }).eq('id', cb.dataset.id);
    if (error) alert('Could not update memo: ' + error.message);
    loadAll();
  });
  document.getElementById('memo-board').addEventListener('click', async (e) => {
    const del = e.target.closest('.memo-del');
    if (del) {
      if (confirm('Delete this memo permanently?')) {
        const { error } = await sb.from('memos').delete().eq('id', del.dataset.id);
        if (error) alert('Could not delete memo: ' + error.message);
        loadAll();
      }
      return;
    }
    if (e.target.id === 'memo-completed-toggle') { showCompletedMemos = !showCompletedMemos; renderMemos(); }
  });
```

- [ ] **Step 4: Run to verify it passes**

Run (same NODE_PATH): `node tests/ui/memos.test.js`
Expected: `memos: ALL PASSED`.

- [ ] **Step 5: Commit**

```bash
git add index.html tests/ui/memos.test.js
git commit -m "feat: memos can be ticked off, shown as completed, or deleted"   # + trailers
```

---

### Task 6: Nurse vaccination requests board

**Files:**
- Create: `tests/ui/nurse-requests.test.js`
- Modify: `index.html` (new card before `<div class="kpi-row">`; CSS; globals ~403; `loadAll` ~500-507; `subscribeRealtime` ~516-521; `renderAll` ~970; new functions)

**Interfaces:**
- Consumes: `LDHLogic.vaccStatus`, `LDHLogic.localISO` (Task 1); `nurse_requests` (Task 2); `myInitials()` (Task 4); `fillLocationSelects()` already fills `#nr-location` (Task 3).
- Produces (page): globals `NURSE_REQUESTS`, `NURSE_TREATMENTS`, `NURSE_DOSES` (all three loaded here so Task 7 only renders), `fmtTime(iso)`, `nowLocalInput()`, `renderNurseRequests()`.

- [ ] **Step 1: Write the failing test**

Create `tests/ui/nurse-requests.test.js`:
```js
const { open } = require('./harness');
const t = require('./check')('nurse-requests');
const ago = ms => new Date(Date.now() - ms).toISOString();
const H = 3600 * 1000, M = 60 * 1000;
(async () => {
  const { browser, page, errors, db } = await open({ nurse_requests: [
    { location: 'FIR Room', species: 'cat', animal_count: 8, done_count: 0, arrived_at: ago(2 * H + 40 * M) },
    { location: 'Transport', species: 'dog', animal_count: 1, done_count: 0, arrived_at: ago(4 * H) }] });
  t.ok(await page.locator('#nr-list .nr-item').count() === 2, 'two open requests listed (Floor view)');
  t.ok((await page.textContent('#nr-list')).includes('FIR Room — 8 cats to vaccinate'), 'group wording');
  t.ok(await page.locator('.nr-item', { hasText: 'FIR Room' }).locator('.lvl-amber').count() === 1, 'FIR request amber with 20 minutes left');
  t.ok(await page.locator('.nr-item', { hasText: 'Transport' }).locator('.lvl-red').count() === 1, 'Transport request red (overdue)');
  t.ok(await page.locator('.nr-plus').count() === 0, 'Floor cannot record vaccinations');

  await page.selectOption('#nr-location', 'FIR Room');
  await page.selectOption('#nr-species', 'cat');
  await page.fill('#nr-count', '3');
  await page.fill('#nr-arrived', '');
  await page.click('#nr-now');
  t.ok((await page.inputValue('#nr-arrived')).length === 16, '"Arrived now" fills the arrival time');
  await page.click('#nr-submit');
  await page.waitForTimeout(250);
  const reqs = (await db()).nurse_requests;
  t.ok(reqs.length === 3 && reqs[2].animal_count === 3 && Math.abs(Date.now() - new Date(reqs[2].arrived_at).getTime()) < 120000, 'new request saved with arrival time ~now');

  await page.selectOption('#role-select', 'vet_nurse');
  await page.waitForTimeout(200);
  const fir = () => page.locator('.nr-item', { hasText: 'FIR Room' }).first();
  await fir().locator('.nr-plus').click();
  await page.waitForTimeout(250);
  t.ok((await fir().textContent()).includes('1 of 8 vaccinated'), '+1 vaccinated updates progress');
  await fir().locator('.nr-claim').click();
  await page.waitForTimeout(250);
  t.ok((await fir().textContent()).includes('claimed by JX'), 'claim shows initials');
  await page.locator('.nr-item', { hasText: 'Transport' }).locator('.nr-all').click();
  await page.waitForTimeout(250);
  t.ok(await page.locator('.nr-item', { hasText: 'Transport' }).count() === 0, 'completed request leaves the open list');
  t.ok(!!(await db()).nurse_requests.find(r => r.location === 'Transport').completed_at, 'completed_at recorded');
  t.ok(errors.length === 0, 'no page errors: ' + errors.join('; '));
  await browser.close();
  t.done();
})();
```

- [ ] **Step 2: Run to verify it fails**

Run: `NODE_PATH=~/.npm/_npx/e41f203b7505f1fb/node_modules node tests/ui/nurse-requests.test.js`
Expected: FAIL (`#nr-list` missing).

- [ ] **Step 3: Implement**

3a. Insert this card immediately before `    <div class="kpi-row">`:
```html
    <section class="card" id="nurse-requests">
      <h2>Nurse requests — vaccination on arrival</h2>
      <p class="subtle">Log animals that need vaccinating. The clock is 3 hours from arrival.</p>
      <div id="nr-list"></div>
      <div class="nr-form">
        <label>Space<select id="nr-location"></select></label>
        <label>Species<select id="nr-species"><option value="cat">Cats</option><option value="dog">Dogs</option></select></label>
        <label>How many<input id="nr-count" type="number" min="1" value="1"></label>
        <label>Arrived<input id="nr-arrived" type="datetime-local"></label>
        <button class="secondary" id="nr-now" type="button">Arrived now</button>
        <label>Note (optional)<input id="nr-note" placeholder="e.g. from transport van 2"></label>
        <button id="nr-submit" type="button">Log request</button>
      </div>
    </section>
```
3b. CSS (add next to the `.lvl` rules from Task 4):
```css
  .nr-form, .nt-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-top: 14px; align-items: end; }
  .nr-form label, .nt-form label { font-size: 0.72rem; font-weight: 700; color: var(--muted); display: flex; flex-direction: column; gap: 4px; margin: 0; }
```
3c. Globals: after `  let MEMOS = [];` add
```js
  let NURSE_REQUESTS = [], NURSE_TREATMENTS = [], NURSE_DOSES = [];
```
3d. `loadAll`: replace
```js
    const [tasksRes, memosRes, rosterRes] = await Promise.all([
```
with `    const [tasksRes, memosRes, rosterRes, nrRes, ntRes, ndRes] = await Promise.all([`, and after the line `      sb.from('roster').select('*').eq('roster_date', todayDateStr()),` add
```js
      sb.from('nurse_requests').select('*').order('arrived_at', { ascending: true }),
      sb.from('nurse_treatments').select('*').order('created_at', { ascending: true }),
      sb.from('nurse_treatment_doses').select('*'),
```
and after `    MEMOS = memosRes.data || [];` add
```js
    NURSE_REQUESTS = nrRes.data || [];
    NURSE_TREATMENTS = ntRes.data || [];
    NURSE_DOSES = ndRes.data || [];
```
3e. `subscribeRealtime`: after the `memos-changes` channel block add
```js
    ['nurse_requests', 'nurse_treatments', 'nurse_treatment_doses'].forEach(tb => {
      sb.channel(tb + '-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: tb }, () => { loadAll(); })
        .subscribe();
    });
```
3f. `renderAll`: add `    renderNurseRequests();` after `    renderMemos();` (Task 7 and 8 add their own lines).

3g. Functions (place above `  function refreshTimers() {`):
```js
  function fmtTime(iso) { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
  function nowLocalInput() {
    const d = new Date();
    return LDHLogic.localISO(d) + 'T' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function renderNurseRequests() {
    const now = Date.now();
    const open = NURSE_REQUESTS.filter(r => r.done_count < r.animal_count);
    const canAct = ROLE === 'vet_nurse';
    document.getElementById('nr-list').innerHTML = open.map(r => {
      const st = LDHLogic.vaccStatus(r, now);
      return `<div class="attn-item nr-item">
        <div><div class="aname">${esc(r.location)} — ${r.animal_count} ${esc(r.species)}${r.animal_count > 1 ? 's' : ''} to vaccinate</div>
          <div class="ameta">arrived ${fmtTime(r.arrived_at)} · <b>${r.done_count} of ${r.animal_count} vaccinated</b>${r.claimed_by ? ' · claimed by ' + esc(r.claimed_by) : ''}${r.note ? ' · ' + esc(r.note) : ''}</div></div>
        <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
          <span class="lvl lvl-${st.level}">${esc(st.label)}</span>
          ${canAct ? `<button class="secondary nr-claim" data-id="${r.id}">${r.claimed_by ? 'Release' : "I've got this"}</button>
            <button class="secondary nr-plus" data-id="${r.id}">+1 vaccinated</button>
            <button class="secondary nr-all" data-id="${r.id}">All done</button>` : ''}
        </div></div>`;
    }).join('') || '<p class="empty-state">No vaccination requests open.</p>';
  }
  document.getElementById('nr-arrived').value = nowLocalInput();
  document.getElementById('nr-now').addEventListener('click', () => { document.getElementById('nr-arrived').value = nowLocalInput(); });
  document.getElementById('nr-submit').addEventListener('click', async () => {
    const count = parseInt(document.getElementById('nr-count').value, 10);
    const arrivedRaw = document.getElementById('nr-arrived').value;
    if (!count || count < 1) { alert('Enter how many animals.'); return; }
    if (!arrivedRaw) { alert('Enter the arrival time (or tap "Arrived now").'); return; }
    const { error } = await sb.from('nurse_requests').insert({
      location: document.getElementById('nr-location').value,
      species: document.getElementById('nr-species').value,
      animal_count: count,
      arrived_at: new Date(arrivedRaw).toISOString(),
      note: document.getElementById('nr-note').value.trim() || null,
      created_by: ROLE === 'vet_nurse' ? 'Vet team' : 'Shelter Staff'
    });
    if (error) { alert('Could not log request: ' + error.message); return; }
    document.getElementById('nr-count').value = '1';
    document.getElementById('nr-note').value = '';
    document.getElementById('nr-arrived').value = nowLocalInput();
    loadAll();
  });
  document.getElementById('nr-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('button'); if (!btn) return;
    const r = NURSE_REQUESTS.find(x => x.id === btn.dataset.id); if (!r) return;
    let patch = null;
    if (btn.classList.contains('nr-claim')) {
      if (r.claimed_by) patch = { claimed_by: null };
      else { const who = myInitials(); if (!who) return; patch = { claimed_by: who }; }
    } else if (btn.classList.contains('nr-plus')) {
      const n = Math.min(r.done_count + 1, r.animal_count);
      patch = { done_count: n, completed_at: n >= r.animal_count ? new Date().toISOString() : null };
    } else if (btn.classList.contains('nr-all')) {
      patch = { done_count: r.animal_count, completed_at: new Date().toISOString() };
    }
    if (!patch) return;
    const { error } = await sb.from('nurse_requests').update(patch).eq('id', r.id);
    if (error) alert('Could not update: ' + error.message);
    loadAll();
  });
```

- [ ] **Step 4: Run to verify it passes**

Run (same NODE_PATH): `node tests/ui/nurse-requests.test.js` and re-run `node tests/ui/vet-board.test.js`.
Expected: both `ALL PASSED`.

- [ ] **Step 5: Commit**

```bash
git add index.html tests/ui/nurse-requests.test.js
git commit -m "feat: nurse vaccination requests board with 3-hour clock"   # + trailers
```

---

### Task 7: Nurse treatment reminders

**Files:**
- Create: `tests/ui/nurse-treatments.test.js`
- Modify: `index.html` (new card; `applyRoleVisibility`; `renderAll`; new functions)

**Interfaces:**
- Consumes: `LDHLogic.doseSlots`, `slotLabel`, `doseLevel`, `courseProgress`, `localISO` (Task 1); tables + globals `NURSE_TREATMENTS`, `NURSE_DOSES` (Tasks 2, 6); `myInitials()`, `fmtTime()` (Tasks 4, 6).
- Produces (page): `activeDoses() -> dose[]` enriched with `animal_id, location, treatment, times_per_day, slot_label` and excluding stopped courses (Task 8 consumes it), `renderNurseTreatments()`.

- [ ] **Step 1: Write the failing test**

Create `tests/ui/nurse-treatments.test.js`:
```js
const { open } = require('./harness');
const t = require('./check')('nurse-treatments');
(async () => {
  const { browser, page, errors, db } = await open();
  t.ok(!(await page.isVisible('#nurse-treatments')), 'hidden from Floor view');
  await page.selectOption('#role-select', 'vet_nurse');
  await page.waitForTimeout(200);
  t.ok(await page.isVisible('#nurse-treatments'), 'shown on the Vet desk');

  await page.fill('#nt-animal', '1174362');
  await page.selectOption('#nt-location', 'Cat Room 1');
  await page.fill('#nt-treatment', 'Flush dental extraction site');
  await page.selectOption('#nt-times', '2');
  await page.fill('#nt-days', '7');
  await page.click('#nt-submit');
  await page.waitForTimeout(300);
  let d = await db();
  t.ok(d.nurse_treatments.length === 1 && d.nurse_treatments[0].requested_by === 'JX', 'course saved with requester initials');
  t.ok(d.nurse_treatment_doses.length === 14, '2 a day for 7 days creates 14 dose slots');
  const today = await page.textContent('#nt-today');
  t.ok(today.includes('1174362') && today.includes('AM') && today.includes('PM') && today.includes('Cat Room 1'), "today's doses grouped by space with AM and PM");
  t.ok((await page.textContent('#nt-courses')).includes('0 of 14 done'), 'course progress shown');

  await page.locator('.attn-item', { hasText: 'AM' }).locator('.nt-tick').check();
  await page.waitForTimeout(250);
  d = await db();
  const ticked = d.nurse_treatment_doses.filter(x => x.done_at);
  t.ok(ticked.length === 1 && ticked[0].done_by === 'JX', 'ticking a dose records initials and time');
  t.ok((await page.textContent('#nt-courses')).includes('1 of 14 done'), 'progress updates');

  // an overdue dose (yesterday, not ticked) appears in its own section
  await page.evaluate(() => {
    const tr = window.__db.nurse_treatments[0];
    const y = new Date(); y.setDate(y.getDate() - 1);
    const iso = y.getFullYear() + '-' + String(y.getMonth() + 1).padStart(2, '0') + '-' + String(y.getDate()).padStart(2, '0');
    window.__db.nurse_treatment_doses.push({ id: 'od1', treatment_id: tr.id, day_no: 0, slot_no: 1, due_date: iso, done_by: null, done_at: null });
    return loadAll();
  });
  await page.waitForTimeout(250);
  t.ok((await page.textContent('#nt-overdue')).includes('Overdue') && (await page.textContent('#nt-overdue')).includes('1174362'), 'overdue dose listed separately');

  await page.locator('.nt-stop').first().click();
  await page.waitForTimeout(250);
  d = await db();
  t.ok(d.nurse_treatments[0].stopped === true, 'Stop course marks it stopped (confirm accepted)');
  t.ok(!(await page.textContent('#nt-today')).includes('1174362') && !(await page.textContent('#nt-overdue')).includes('1174362'), 'stopped course disappears from today and overdue');
  t.ok(errors.length === 0, 'no page errors: ' + errors.join('; '));
  await browser.close();
  t.done();
})();
```

- [ ] **Step 2: Run to verify it fails**

Run: `NODE_PATH=~/.npm/_npx/e41f203b7505f1fb/node_modules node tests/ui/nurse-treatments.test.js`
Expected: FAIL (`#nurse-treatments` missing).

- [ ] **Step 3: Implement**

3a. Card, inserted directly after the `nurse-requests` section (before `<div class="kpi-row">`):
```html
    <section class="card" id="nurse-treatments" style="display:none">
      <h2>Nurse treatments</h2>
      <p class="subtle">Vets request a treatment for an animal in the ward; nurses tick each dose off.</p>
      <div id="nt-overdue"></div>
      <div id="nt-today"></div>
      <div id="nt-courses"></div>
      <h3 style="font-size:0.85rem; margin:18px 0 0;">Request a treatment</h3>
      <div class="nt-form">
        <label>Animal ID<input id="nt-animal" placeholder="Animal ID"></label>
        <label>Space<select id="nt-location"></select></label>
        <label>Treatment<input id="nt-treatment" placeholder="e.g. flush dental extraction site"></label>
        <label>Times a day<select id="nt-times"><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option></select></label>
        <label>For how many days<input id="nt-days" type="number" min="1" max="30" value="7"></label>
        <label>Start date<input id="nt-start" type="date"></label>
        <button id="nt-submit" type="button">Request</button>
      </div>
    </section>
```
3b. CSS:
```css
  .nt-loc-h { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; color: var(--muted); margin: 12px 0 2px; }
  .nt-h { font-size: 0.85rem; font-weight: 700; margin: 14px 0 0; }
  .nt-h.overdue { color: var(--critical); }
```
3c. `applyRoleVisibility`: after the line that sets `start-shift-card` add
```js
    document.getElementById('nurse-treatments').style.display = isStaff ? 'none' : 'block';
```
3d. `renderAll`: add `    renderNurseTreatments();` after `    renderNurseRequests();`.

3e. Functions (above `  function refreshTimers() {`):
```js
  function activeDoses() {
    const by = new Map(NURSE_TREATMENTS.map(t => [t.id, t]));
    return NURSE_DOSES
      .filter(d => by.has(d.treatment_id) && !by.get(d.treatment_id).stopped)
      .map(d => {
        const t = by.get(d.treatment_id);
        return Object.assign({}, d, { animal_id: t.animal_id, location: t.location, treatment: t.treatment,
          times_per_day: t.times_per_day, slot_label: LDHLogic.slotLabel(t.times_per_day, d.slot_no) });
      });
  }
  function doseRowHtml(d, todayISO) {
    const done = !!d.done_at;
    return `<label class="attn-item" style="cursor:pointer;">
      <span style="display:flex; gap:10px; align-items:center;">
        <input type="checkbox" class="nt-tick" data-id="${d.id}" ${done ? 'checked' : ''} style="width:20px; height:20px; margin:0;">
        <span><span class="aname">${esc(d.animal_id)} — ${esc(d.treatment)}</span><br>
          <span class="ameta">${esc(d.slot_label)}${d.due_date !== todayISO ? ' · due ' + esc(d.due_date) : ''}${done ? ' · done by ' + esc(d.done_by || '?') + ' ' + fmtTime(d.done_at) : ''}</span></span>
      </span></label>`;
  }
  function groupedDoseHtml(list, todayISO) {
    const by = {};
    list.forEach(d => { (by[d.location] = by[d.location] || []).push(d); });
    return Object.keys(by).sort().map(loc =>
      `<div><div class="nt-loc-h">${esc(loc)}</div>${by[loc].map(d => doseRowHtml(d, todayISO)).join('')}</div>`).join('');
  }
  function renderNurseTreatments() {
    const todayISO = LDHLogic.localISO(new Date());
    const doses = activeDoses();
    const overdue = doses.filter(d => LDHLogic.doseLevel(d, todayISO) === 'overdue');
    const today = doses.filter(d => d.due_date === todayISO);
    document.getElementById('nt-overdue').innerHTML = overdue.length
      ? `<div class="nt-h overdue">Overdue (${overdue.length})</div>${groupedDoseHtml(overdue, todayISO)}` : '';
    const todayDone = today.filter(d => d.done_at).length;
    document.getElementById('nt-today').innerHTML = today.length
      ? `<div class="nt-h">Due today (${todayDone} of ${today.length} done)</div>${groupedDoseHtml(today, todayISO)}`
      : '<p class="empty-state">No treatments due today.</p>';
    const courses = NURSE_TREATMENTS.filter(t => !t.stopped).map(t => {
      const p = LDHLogic.courseProgress(NURSE_DOSES.filter(d => d.treatment_id === t.id));
      return { t, p };
    }).filter(c => c.p.total === 0 || c.p.done < c.p.total);
    document.getElementById('nt-courses').innerHTML = courses.length
      ? `<div class="nt-h">Courses in progress</div>` + courses.map(c => `<div class="attn-item">
          <div><div class="aname">${esc(c.t.animal_id)} — ${esc(c.t.treatment)}</div>
            <div class="ameta">${esc(c.t.location)} · ${c.t.times_per_day}× a day for ${c.t.days} days · ${c.p.done} of ${c.p.total} done${c.t.requested_by ? ' · requested by ' + esc(c.t.requested_by) : ''}</div></div>
          <button class="secondary nt-stop" data-id="${c.t.id}">Stop course</button></div>`).join('')
      : '';
  }
  document.getElementById('nt-start').value = LDHLogic.localISO(new Date());
  document.getElementById('nt-submit').addEventListener('click', async () => {
    const animal = document.getElementById('nt-animal').value.trim();
    const treatment = document.getElementById('nt-treatment').value.trim();
    const times = parseInt(document.getElementById('nt-times').value, 10);
    const days = parseInt(document.getElementById('nt-days').value, 10);
    const start = document.getElementById('nt-start').value || LDHLogic.localISO(new Date());
    if (!animal || !treatment) { alert('Enter the animal ID and the treatment.'); return; }
    if (!days || days < 1 || days > 30) { alert('Days must be between 1 and 30.'); return; }
    const who = myInitials() || 'Vet team';
    const { data: tr, error } = await sb.from('nurse_treatments').insert({
      animal_id: animal, location: document.getElementById('nt-location').value, treatment,
      times_per_day: times, days, start_date: start, requested_by: who
    }).select().single();
    if (error) { alert('Could not save the request: ' + error.message); return; }
    const slots = LDHLogic.doseSlots(start, times, days).map(s => Object.assign({ treatment_id: tr.id }, s));
    const { error: doseErr } = await sb.from('nurse_treatment_doses').insert(slots);
    if (doseErr) {
      await sb.from('nurse_treatments').delete().eq('id', tr.id);   // never leave a course without its doses
      alert('Could not create the dose list: ' + doseErr.message);
      return;
    }
    document.getElementById('nt-animal').value = '';
    document.getElementById('nt-treatment').value = '';
    loadAll();
  });
  document.getElementById('nurse-treatments').addEventListener('change', async (e) => {
    const cb = e.target.closest('.nt-tick'); if (!cb) return;
    let who = null;
    if (cb.checked) { who = myInitials(); if (!who) { cb.checked = false; return; } }
    const { error } = await sb.from('nurse_treatment_doses')
      .update({ done_by: who, done_at: cb.checked ? new Date().toISOString() : null }).eq('id', cb.dataset.id);
    if (error) alert('Could not save the tick: ' + error.message);
    loadAll();
  });
  document.getElementById('nurse-treatments').addEventListener('click', async (e) => {
    const btn = e.target.closest('.nt-stop'); if (!btn) return;
    if (!confirm('Stop this course? Its remaining doses will disappear from the lists.')) return;
    const { error } = await sb.from('nurse_treatments').update({ stopped: true }).eq('id', btn.dataset.id);
    if (error) alert('Could not stop the course: ' + error.message);
    loadAll();
  });
```

- [ ] **Step 4: Run to verify it passes**

Run (same NODE_PATH): `node tests/ui/nurse-treatments.test.js`, then `node tests/ui/run-all.js`.
Expected: `nurse-treatments: ALL PASSED`, then `ALL UI TESTS PASSED`.

- [ ] **Step 5: Commit**

```bash
git add index.html tests/ui/nurse-treatments.test.js
git commit -m "feat: nurse treatment reminders (course, dose ticks, overdue, stop)"   # + trailers
```

---

### Task 8: Shift-change sweep + handover text

**Files:**
- Create: `tests/ui/sweep.test.js`
- Modify: `index.html` (new card; `applyRoleVisibility`; `renderAll`; CSS; new function)

**Interfaces:**
- Consumes: `LDHLogic.buildSweep`, `sweepText`, `statusOf`, `normTier`, `TIER_LABELS`, `vaccStatus` (Task 1); `activeDoses()` (Task 7); `NURSE_REQUESTS`, `TASKS`.
- Produces (page): `renderSweep()`; buttons `#sweep-copy`.

- [ ] **Step 1: Write the failing test**

Create `tests/ui/sweep.test.js`:
```js
const { open } = require('./harness');
const t = require('./check')('sweep');
const ago = ms => new Date(Date.now() - ms).toISOString();
const H = 3600 * 1000, D = 24 * H;
function isoDaysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
(async () => {
  const mk = (title, urgency, agoMs, extra = {}) => Object.assign({ title, location: 'Pound 1', shift: 'sick_injured', type: 'shelter', urgency, created_at: ago(agoMs) }, extra);
  const { browser, page, errors } = await open({
    tasks: [mk('RED1', 'red_flag', 3 * H), mk('OK1', 'routine', 1 * H), mk('CLAIMED', 'routine', 60 * H, { claimed_at: ago(H), claimed_by: 'JX' })],
    nurse_requests: [{ location: 'FIR Room', species: 'cat', animal_count: 8, done_count: 2, arrived_at: ago(4 * H) }],
    nurse_treatments: [{ id: 'tr1', animal_id: '1174362', location: 'Cat Room 1', treatment: 'Flush site', times_per_day: 2, days: 7, start_date: isoDaysAgo(1) }],
    nurse_treatment_doses: [{ id: 'd1', treatment_id: 'tr1', day_no: 1, slot_no: 1, due_date: isoDaysAgo(1), done_at: null }]
  });
  t.ok(!(await page.isVisible('#sweep-card')), 'hidden from Floor view');
  await page.selectOption('#role-select', 'vet_nurse');
  await page.waitForTimeout(250);
  const counts = await page.$$eval('#sweep-body .sweep-n', els => els.map(e => e.textContent.trim()));
  t.ok(counts.join() === '1,1,1,1', 'four sections each count 1: overdue case, not yet claimed, overdue request, overdue dose (got ' + counts.join() + ')');
  const body = await page.textContent('#sweep-body');
  t.ok(body.includes('RED1') && body.includes('OK1') && !body.includes('CLAIMED'), 'claimed cases are not in the sweep');
  t.ok(body.includes('FIR Room') && body.includes('1174362'), 'request and dose lines present');

  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (x) => { window.__copied = x; } }, configurable: true }); });
  await page.click('#sweep-copy');
  await page.waitForTimeout(150);
  const copied = await page.evaluate(() => window.__copied || '');
  t.ok(copied.startsWith('Handover —') && copied.includes('Overdue cases (1)') && copied.includes('RED1 — Pound 1 — Red flag, overdue'), 'Copy handover puts the text on the clipboard');
  t.ok(errors.length === 0, 'no page errors: ' + errors.join('; '));
  await browser.close();
  t.done();
})();
```

- [ ] **Step 2: Run to verify it fails**

Run: `NODE_PATH=~/.npm/_npx/e41f203b7505f1fb/node_modules node tests/ui/sweep.test.js`
Expected: FAIL (`#sweep-card` missing).

- [ ] **Step 3: Implement**

3a. Card, inserted as the FIRST card before the `nurse-requests` section:
```html
    <section class="card" id="sweep-card" style="display:none">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
        <h2 style="margin:0;">Shift-change sweep</h2>
        <button class="secondary" id="sweep-copy" type="button">Copy handover</button>
      </div>
      <p class="subtle" style="margin-top:6px;">Everything still open, overdue or unclaimed — check this before you hand over.</p>
      <div id="sweep-body"></div>
    </section>
```
3b. CSS:
```css
  .sweep-sec h3 { font-size: 0.8rem; margin: 12px 0 4px; }
  .sweep-n { background: var(--critical); color: #fff; border-radius: 10px; padding: 1px 8px; font-size: 0.7rem; margin-left: 4px; }
```
3c. `applyRoleVisibility`: add `    document.getElementById('sweep-card').style.display = isStaff ? 'none' : 'block';`. `renderAll`: add `    renderSweep();` after `renderNurseTreatments();`.

3d. Function (above `refreshTimers`):
```js
  function currentSweep(now) {
    return LDHLogic.buildSweep({ tasks: TASKS, requests: NURSE_REQUESTS, doses: activeDoses() }, now);
  }
  function renderSweep() {
    const now = Date.now();
    const sw = currentSweep(now);
    const overdueIds = new Set(sw.overdueCases.map(t => t.id));
    const tier = t => LDHLogic.TIER_LABELS[LDHLogic.normTier(t.urgency)];
    const sec = (title, lines) => `<div class="sweep-sec"><h3>${title} <span class="sweep-n">${lines.length}</span></h3>${
      lines.length ? lines.map(l => `<div class="ameta">${esc(l)}</div>`).join('') : '<div class="ameta">None</div>'}</div>`;
    document.getElementById('sweep-body').innerHTML =
      sec('Overdue cases', sw.overdueCases.map(t => `${t.title} — ${t.location} — ${tier(t)}, ${LDHLogic.statusOf(t, now).label}`)) +
      sec('Not yet claimed', sw.unclaimed.filter(t => !overdueIds.has(t.id)).map(t => `${t.title} — ${t.location} — ${tier(t)}`)) +
      sec('Overdue nurse requests', sw.overdueRequests.map(r => `${r.location} — ${r.animal_count} ${r.species}(s) to vaccinate, ${LDHLogic.vaccStatus(r, now).label}`)) +
      sec('Overdue treatment doses', sw.overdueDoses.map(d => `${d.animal_id} — ${d.location} — ${d.treatment} (${d.due_date} ${d.slot_label})`));
  }
  document.getElementById('sweep-copy').addEventListener('click', async () => {
    const text = LDHLogic.sweepText(currentSweep(Date.now()), Date.now());
    try { await navigator.clipboard.writeText(text); alert('Handover copied.'); }
    catch (e) { window.prompt('Copy this handover text:', text); }
  });
```

- [ ] **Step 4: Run to verify it passes**

Run (same NODE_PATH): `node tests/ui/sweep.test.js`, then `node tests/ui/run-all.js`, then `node --test tests/logic.test.mjs tests/migration.test.mjs`.
Expected: everything passes.

- [ ] **Step 5: Commit**

```bash
git add index.html tests/ui/sweep.test.js
git commit -m "feat: shift-change sweep with copyable handover"   # + trailers
```

---

### Task 9: Rollout, live trial and cleanup

**Files:**
- Modify: `docs/superpowers/specs/2026-09-20-floor-and-vet-desk-redesign-design.md` (mark stage 1 done)
- No code changes.

**Order matters:** the new page writes `red_flags` (and reads the new tables), so the **database migration must run BEFORE the page goes live**. The migration keeps `'soon'` valid so tabs still running the old page keep working meanwhile.

- [ ] **Step 1: Full local test run**

Run:
```bash
cd ~/ldh-shift-ops
node --test tests/logic.test.mjs tests/migration.test.mjs
NODE_PATH=~/.npm/_npx/e41f203b7505f1fb/node_modules node tests/ui/run-all.js
git status --short
```
Expected: all tests pass; `git status` shows nothing uncommitted apart from `.DS_Store` files.

- [ ] **Step 2: Juliana runs the migration**

Run `pbcopy < supabase/migrations/0008_triage_and_vet_desk.sql`, then tell Juliana: Supabase → SQL Editor → New query → paste → Run. Expected result: "Success. No rows returned." Do not continue until she confirms. (If it errors, paste the error to Claude; do not push.)

- [ ] **Step 3: Push**

```bash
git pull --rebase && git push
```
GitHub Pages updates in about a minute. Ask Juliana to reload the dashboard (hard refresh).

- [ ] **Step 4: Live trial with fake animals (titles start with `TEST`)**

Ask Juliana to check, in this order, on two devices if possible:
1. **Floor:** tick "Bleeding" → preview says "Red flag — check within 2 h"; submit `TEST-RF`; submit `TEST-RT` with no flags.
2. **Vet desk:** `TEST-RF` is in the Red flag column with a countdown; tap "I've got this" (initials prompt) → shows "Claimed by …" on the other device within seconds; "Bump to urgent" on `TEST-RT` moves it to Urgent.
3. **Memos:** post a memo, tick it off (leaves the list), open "Show completed", delete it.
4. **Nurse requests:** log "FIR Room, 8 cats, note TEST" with "Arrived now" → countdown about 2h 59m; "+1 vaccinated" → "1 of 8"; "All done" removes it.
5. **Nurse treatments:** request animal `TEST-1`, any space, "flush site", 2 a day, 3 days → 6 dose slots; today shows AM and PM; tick AM (initials); "Stop course".
6. **Sweep:** shows the counts; "Copy handover" then paste somewhere to read it.

- [ ] **Step 5: Clean up the fake data**

Give Juliana this SQL (SQL Editor → New query → Run):
```sql
delete from public.tasks where title like 'TEST%';
delete from public.nurse_requests where note = 'TEST';
delete from public.nurse_treatments where animal_id like 'TEST%';
delete from public.memos where text like 'TEST%';
```

- [ ] **Step 6: Record completion**

In the spec's build-stage list, mark stage 1 done with the date; commit `git commit -am "docs: stage 1 shipped"` (+ trailers) and push. Update Claude's memory note `project_ldh_shift_ops_redesign.md` with "Stage 1 shipped on <date>; next: stage 2 (surveillance)".

---

## Self-review (spec coverage)

- Spec §3 triage (three tiers, 2 h / 12–24 h / 24–48 h, colours, urgent set by vet/nurse, emergency reminder): Tasks 1, 3, 4. Radioed-case optional after-the-fact log: the flag form already serves this (any case can be flagged); no separate control is built (YAGNI, noted).
- Spec §5 Vet desk (queue, claim with initials, unseen alerts, sweep, handover summary, memo tick-off): Tasks 4, 5, 8. Rounds flag and rounds→memo: **stage 4, out of scope here.**
- Spec §6 nurse requests: Task 6. §6b nurse treatments: Task 7.
- Spec §8 data changes for stage 1: Task 2. (`locations`, `surveillance_snapshots`, `plan_line*`, `diagnosed` belong to stages 2–3.)
- Deviation from spec §3: `due_by` is **derived** from `created_at` + tier by `LDHLogic.statusOf` rather than stored, so bumping a case cannot leave a stale stored deadline.
- Types checked across tasks: `statusOf`/`vaccStatus` levels (`ok|amber|red|seen|done`) match the `lvl-*` CSS classes; `activeDoses()` fields match `buildSweep`/`sweepText` (`animal_id, location, treatment, slot_label, due_date`); `myInitials()` defined in Task 4 and reused in Tasks 6–7.
