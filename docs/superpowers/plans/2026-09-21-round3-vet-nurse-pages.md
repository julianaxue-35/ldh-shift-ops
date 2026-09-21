# Round 3: Vet / Nurse pages, one case list, medication hand-off — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the dashboard into shelter-staff / vets / nurses pages, replace red flags with an Emergency checklist, merge the two case lists into one, and add the staff → vet → nurse medication hand-off, NO-GA list and passcode-guarded memo boards.

**Architecture:** Static pages + Supabase, as now. One new migration `0010_round3.sql` (run once by Juliana before the pages go live). Shared pure logic stays in `lib/ldh-logic.js`; a new `lib/ops-core.js` holds login, Supabase client, escaping, realtime and the passcode gate so the three pages do not copy each other. Stored tier values (`red_flag`/`urgent`/`routine`) do not change — only labels.

**Tech Stack:** Vanilla JS single-file pages, Supabase (Postgres/RLS/realtime), `node --test` (+ PGlite for SQL), Playwright with the in-memory stub in `tests/ui/harness.js`.

**Spec:** `docs/superpowers/specs/2026-09-21-nurse-vet-pages-and-case-flow-design.md` (binding; conflicts resolve against it).

## Global Constraints

- Do NOT change Juliana's wording where she gave it. Emergency signs, verbatim labels: "Not eating > 48 hours", "Not urinating > 36 hours", "Bleeding wound (large cut / can't stop the bleeding)", "Not defecated > 72 hours", "Vomited multiple piles". Tier labels: **Emergency** / **Urgent** / **Request checks**. Line: "High priority emergency? Radio the vet, don't wait for this board." No laboured-breathing / collapse option anywhere.
- Stored values unchanged: urgency `red_flag`/`urgent`/`routine`(+legacy `soon`). Old `red_flags` keys must still display (schema-migration rule: tolerate old records).
- New policies copy the sync_writer guard: `auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role','') <> 'sync_writer'`.
- The Edge Function `sync-completion` is NOT modified. Medication holding is a DB trigger.
- No microchip numbers, no clinical detail beyond `med_label` in the cloud. `med_label` is cleared 24 h after completion.
- Passcodes: `nurse` and `vet2026`, stored hashed (pgcrypto `extensions.crypt`), never in page source. Gated actions only; viewing not gated. Unlock lasts the tab (sessionStorage; wrap in try/catch).
- Pages must work at phone width, keep the existing look (CSS tokens already in `index.html`).
- Tests never touch live Supabase. Run: `node --test tests/*.test.mjs` and `NODE_PATH=~/.npm/_npx/e41f203b7505f1fb/node_modules node --test tests/ui/*.test.js`.
- Commit per task with trailer `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`. Never push or merge to main.

## File structure

- Create `supabase/migrations/0010_round3.sql` — all DB changes.
- Modify `lib/ldh-logic.js` — Emergency signs, labels, stage, case-list ordering, copy text, Offsite handling.
- Create `lib/ops-core.js` — shared login/client/passcode/realtime helpers (UMD-free browser global `OpsCore`).
- Modify `index.html` — shelter-staff page only.
- Create `vets.html`, `nurses.html`.
- Modify `stats.html` (labels, Offsite excluded, nav links); `tests/ui/harness.js`, `tests/ui/fixtures.js`.
- Tests: `tests/round3-migration.test.mjs`, extend `tests/logic.test.mjs`, new `tests/ui/*.test.js` per page.

---

### Task 1: Migration 0010_round3.sql

**Files:** Create `supabase/migrations/0010_round3.sql`; Test `tests/round3-migration.test.mjs` (copy the PGlite harness style of `tests/migration.test.mjs`, applying 0001–0010).

**Interfaces — Produces (later tasks rely on exactly these names):**
- `tasks` new columns: `needs_medication boolean not null default false`, `vet_done_at timestamptz`, `med_chart_done boolean not null default false`, `med_label text`, `med_done_by text`, `med_done_at timestamptz`, `sm_number text`, `location_detail text`.
- Trigger `tasks_hold_medication` (before insert or update on `tasks`): when `new.needs_medication and new.med_done_at is null and new.done` → `new.done := false; new.vet_done_at := coalesce(new.vet_done_at, now()); new.completed_at := null`. When `new.done` is set with `med_done_at` not null it passes through. Undo (`done=false`) clears nothing extra; the app clears `vet_done_at`/`med_done_at` itself.
- Table `role_passcodes (role text primary key check (role in ('vet','nurse')), code_hash text not null)` with RLS on and NO policies; function `public.check_passcode(p_role text, p_code text) returns boolean` (security definer, `set search_path = public, extensions`, returns `code_hash = crypt(p_code, code_hash)`), revoke from public/anon, grant execute to authenticated. Seed `nurse`→`nurse`, `vet`→`vet2026` with `on conflict (role) do nothing`. Requires `create extension if not exists pgcrypto with schema extensions`.
- Table `noga_requests (id uuid pk default gen_random_uuid(), animal_id text not null, location text not null, location_detail text, task text not null check (task in ('fiv_test','microchip','other')), note text, added_by text, done boolean not null default false, done_by text, done_at timestamptz, created_at timestamptz not null default now())`, RLS with the four guarded policies, added to `supabase_realtime`.
- Purge (commented cron block like 0006): hourly, `update public.tasks set med_label = null where med_done_at < now() - interval '24 hours' and med_label is not null`.
- Header comment: "Run this whole file as ONE script. Safe to run more than once." Use `if not exists` / `on conflict` / `drop trigger if exists` throughout.

- [ ] **Step 1:** Write failing tests: (a) insert `tasks` row with `needs_medication` true and `done` true → stored `done=false`, `vet_done_at` not null; (b) update it with `med_done_at=now(), done=true` → stays done; (c) non-medication row `done=true` untouched; (d) upsert path used by the Edge Function (`insert … on conflict (title,location,shift) do update set done=true`) on a medication row → still not done; (e) `check_passcode('nurse','nurse')` true, wrong code false, `('vet','vet2026')` true, unknown role false, anon cannot execute; (f) `role_passcodes` unreadable by `authenticated`; (g) `noga_requests` insert/select works for authenticated, blocked for a `sync_writer` JWT (mirror the sync_writer test pattern in `migration.test.mjs`); (h) running the file twice is harmless.
- [ ] **Step 2:** Run, confirm fail. **Step 3:** Write the migration. **Step 4:** Run all node tests, confirm pass. **Step 5:** Commit `feat(db): round 3 migration`.

---

### Task 2: Logic module

**Files:** Modify `lib/ldh-logic.js`; Test `tests/logic.test.mjs`.

**Interfaces — Produces:**
- `EMERGENCY_SIGNS`: `[{key:'not_eating_48h',label:'Not eating > 48 hours'},{key:'not_urinating_36h',label:'Not urinating > 36 hours'},{key:'bleeding_wound',label:"Bleeding wound (large cut / can't stop the bleeding)"},{key:'not_defecated_72h',label:'Not defecated > 72 hours'},{key:'vomited_multiple',label:'Vomited multiple piles'}]`. Keep `RED_FLAGS` as an alias of `EMERGENCY_SIGNS` so `tierFromFlags` callers still work; add `signLabel(key)` that also resolves legacy keys (`not_eating`, `laboured_breathing`, `bleeding`, `cant_stand`, `repeated_vomiting`) to their old labels, and returns the raw key if unknown.
- `TIER_LABELS` → `{red_flag:'Emergency', urgent:'Urgent', routine:'Request checks'}`; update `TIER_TARGETS` text only if it embeds names.
- `LOCATIONS` gains `'Offsite'` (last). `spaceOf('Offsite')` returns `null`/unmapped WITHOUT being reported as an unmapped-space warning (add `OFFSITE_NAMES=['Offsite']` and exclude them in `buildSurvey`'s unmapped list). Heat map/rates ignore it.
- `stageOf(task, now)` → one of `'flagged'|'picked_up'|'vet_done'|'waiting_medication'|'completed'`: completed when `done`; for medication tasks with `vet_done_at` and not done → `'waiting_medication'`; non-medication with `done` false and `claimed_at` → `'picked_up'`; else `'flagged'`. (`vet_done` for non-medication is not used; keep the literal for clarity in tests only if needed.)
- `caseList(tasks, now)` → `{open:[…], completed:[…]}`: open sorted with existing `sortQueue`; completed = `done` and `completed_at` within 24 h of `now`, newest first. Tasks with `done` and no `completed_at` are treated as completed at `created_at`.
- `medCopyText(task)` → exactly: `` `${title} | SM ${sm_number||'—'} | ${locationText}\n${med_label||''}` `` where `locationText` = `Offsite — <location_detail>` when location is Offsite and detail present, `Offsite` when no detail, else `location` (pen is already inside `location` text where the app stores it).
- `CHLORSIG_OPTIONS`: `[{label:'Chlorsig — left eye (L)'},{label:'Chlorsig — right eye (R)'},{label:'Chlorsig — both eyes'}]`.

- [ ] **Step 1:** Write failing tests for each export above (including: legacy key label; Offsite not in unmapped warnings; `stageOf` for each stage; `caseList` 24 h boundary; `medCopyText` with/without detail and SM). **Step 2:** fail. **Step 3:** implement. **Step 4:** run `tests/*.test.mjs`, ALL pass (existing tests referencing old labels are updated to the new wording — that is a spec change, not a regression). **Step 5:** commit.

---

### Task 3: Shared core + harness

**Files:** Create `lib/ops-core.js`; Modify `tests/ui/harness.js`, `tests/ui/fixtures.js`.

**Interfaces — Produces (browser global `OpsCore`):**
- `OpsCore.init({ page })` → creates the Supabase client (same URL/anon key constants as `index.html`), shows the existing login card if there is no session, resolves with `{ sb, session }`. Same shared staff login; session persists across the three pages (same origin).
  **One-box login (Juliana, 2026-09-21):** the login card shows ONLY a password field (label "Staff password"). The email is a constant in `OpsCore` (`staff@ldh-shift-ops.local`, not a secret) and is used for `signInWithPassword`. A small "Use a different account" text link reveals the email field for admin use. Wrong password shows the existing error style. No QR code. `index.html` uses this same core (Task 4 removes its own login markup/JS in favour of it), so all three pages share one login and one remembered session.
- `OpsCore.esc(s)`.
- `OpsCore.requirePasscode(role, reason)` → Promise<boolean>: if `sessionStorage['ldh_pass_'+role]==='1'` resolves true; else shows a small modal (input type password, "Enter the vet/nurse passcode to <reason>"), calls `sb.rpc('check_passcode',{p_role:role,p_code})`, on true stores the flag (try/catch) and resolves true, on false shows "Wrong passcode" and stays open; Cancel resolves false. No passcode is logged or stored.
- `OpsCore.subscribe(tables, onChange)` → realtime `postgres_changes` on each table, debounced reload callback (mirror the existing pattern in `index.html`).
- `OpsCore.navHTML(current)` → the sidebar link row: Shelter staff / Vets / Nurses / Stats.
- Harness: the in-memory stub gains `rpc('check_passcode')` (codes `nurse`, `vet2026`), tables `noga_requests`, and the new `tasks` columns with the medication trigger behaviour replicated (so UI tests reflect the DB); fixtures gain medication and Offsite tasks.

- [ ] **Step 1:** Write a UI test for the passcode modal via a tiny test page or the first page that uses it (may be combined with Task 5's test file if a page is needed; here test with a minimal HTML fixture served by the harness): wrong code rejected, right code unlocks, stays unlocked on second call in the tab. **Step 2–4:** implement, pass. **Step 5:** commit.

---

### Task 4: Shelter staff page (`index.html`)

**Files:** Modify `index.html`; Tests: update `tests/ui/flag-form.test.js`, `vet-board.test.js` (rename/repurpose to case-list), `memos.test.js` (memo board leaves this page), `disease-watch.test.js` (position).

Requirements (spec §2; login now comes from `OpsCore.init`, one-box, see Task 3):
- Flag form: replace the checklist with `EMERGENCY_SIGNS`; heading "Emergency signs — tick any that apply"; the radio line exactly as in Global Constraints; tier preview uses new labels; new **Needs medication** checkbox; when ticked show required **SM number** input (`sm_number`); block submit with a clear message if empty. Location select gains **Offsite**; choosing it reveals optional detail input (`location_detail`); the pen field is hidden for Offsite. Insert sets `needs_medication`, `sm_number`, `location_detail`, `red_flags` (new keys), tier via `tierFromFlags`.
- Replace "Cases flagged" (Floor table + vet board) and "Recently completed" with ONE **Cases** section using `caseList`: table columns Animal, Location, Shift/Type, Tier, Stage, Flagged, Time left, Plan (note). Open rows first; a "Completed (last 24 h)" group at the bottom. Medication rows show a "Medication" tag and stage text "Vet check done — waiting on medication" when applicable. Search box keeps filtering. No vet action buttons on this page.
- Remove from this page: nurse requests LIST card (keep the **vaccination request form** and put it in its own small card "Request nurse vaccination"), treatments due, treatment request card, memo board, role select, initials box, "Start a shift" card (moves to vets page), Recently completed.
- Move **Disease watch** to the bottom (after Cases). Sidebar: `OpsCore.navHTML('staff')`.
- Bump nothing in tools repo here. Keep the `LDHLogic` script include; add `ops-core.js`.

- [ ] Steps: update the affected UI tests FIRST to the new expectations (fail), implement, run node + ui suites (all pass), commit.

---

### Task 5: Vets page (`vets.html`)

**Files:** Create `vets.html`; Test `tests/ui/vets-page.test.js`.

Requirements (spec §3, §6): same login card and look; sidebar via `OpsCore.navHTML('vets')`; sections in order: Cases (open queue with three tier columns Emergency / Urgent / Request checks and type filter chips, then completed group), Request a treatment (moved unchanged from index, plus courses list), Start a shift (moved), Memo board (post, tick, show completed, delete; shared `memos` table; hidden-completed toggle as today).
- **Pick up** works as on the old vet board (stamps `claimed_at`, hand-off URL to `sick-injured.html?items=`, payload `{id, location, problem, redFlags (labels via signLabel), condition (label)}`), requires `requirePasscode('vet','pick up cases')` the first time.
- **DONE** on a case opens the panel. Non-medication: confirm → `done:true, completed_by_role:'vet_nurse', completed_at`. Medication: `Med chart completed` checkbox (`med_chart_done`), `Medication label` textarea (`med_label`, required, non-empty), Chlorsig quick-insert buttons appending `CHLORSIG_OPTIONS` label text on a new line; on confirm update `done:true, med_chart_done, med_label` (trigger converts to waiting; page then shows "Waiting on medication"). Gated by `requirePasscode('vet', …)`.
- Bump tier (Request checks → Urgent) gated. Memo tick/delete gated; posting not gated.
- Old completed-undo (vet) kept, gated.

- [ ] Steps: failing UI tests (passcode gate; DONE non-med; DONE med with label+chart+chlorsig button; empty label blocked; memo tick blocked without passcode, allowed after; pick-up hand-off payload), implement, pass, commit.

---

### Task 6: Nurses page (`nurses.html`)

**Files:** Create `nurses.html`; Test `tests/ui/nurses-page.test.js`.

Requirements (spec §4, §6): sidebar via `OpsCore.navHTML('nurses')`; initials box as today (not remembered). Sections: **Medication labels to make** (tasks with `needs_medication`, `vet_done_at` set, `done` false): card shows animal ID, SM number, location text (`Offsite — detail` rule), chart status ("Chart printed by admission" / "No chart"), the label text, a **Copy** button writing `medCopyText(task)` to the clipboard (with a fallback selecting a hidden textarea; show "Copied"), and **Done** → gated `requirePasscode('nurse', …)`, requires initials, sets `med_done_by`, `med_done_at`, `done:true`, `completed_at`, `completed_by_role:'vet_nurse'`. Then: Vaccination requests (existing card logic incl. pick-up with initials, done_count, 3 h clock; NO request form here), Treatments due (existing overdue/today with dose ticks, gated), **NO-GA required list** (open list + form: animal ID, location incl. Offsite+detail, task select FIV test / Microchip / Other, note; add is gated by nurse passcode; tick done with initials gated; done items shown 24 h then hidden), Memo board (same component as vets page — factor the memo board render/handlers into `OpsCore` if it removes duplication; otherwise duplicate minimally).

- [ ] Steps: failing UI tests (med card appears only after vet done; Copy text exact; Done blocked w/o passcode/initials; Done completes the case; NO-GA add/tick; vaccination pick-up; dose tick), implement, pass, commit.

---

### Task 7: Stats, consistency, docs

**Files:** Modify `stats.html`, `tests/consistency.test.mjs`, `tests/ui/stats-page.test.js`, `tests/README.md`.

- `stats.html`: tier labels via `TIER_LABELS`; Offsite excluded from heat map/rates (no cages) and not shown as an unmapped warning; response-rate charts unaffected; nav via `OpsCore.navHTML('stats')` (or plain links if it avoids loading a new script — keep stats standalone if simpler). Keep consistency between dashboard tile and stats board.
- README: list new pages/suites. Full test run, all green.
- [ ] Commit.

---

### Task 8 (tools repo, separate from this worktree): Sick & Injured wording

**Files:** `~/ldh-shift-tools/sick-injured.html` (its own repo; NOT this worktree).
- `flagHistoryLabel`: "Red flags:" → "Emergency signs:". Hand-off already receives labels from the dashboard. Bump `APP_VERSION` (`2026-09-22.1`). No other change. Verify with `node --check` on extracted script and grep. Push only when Juliana says go, together with the dashboard deploy.

## Rollout (after final review; needs Juliana's go at each gate)

1. Run `0010_round3.sql` in the Supabase SQL editor (one script). Verify: `check_passcode('nurse','nurse')`, columns exist, `noga_requests` exists, trigger present.
2. Merge `round3-vet-nurse-pages` fast-forward into main, re-run all tests, push. Push `sick-injured.html` in the same go.
3. Hard refresh; fake `TEST` animal trial through the whole medication path (staff flag with SM number → vets DONE with label → nurse copy + Done → completed on shelter list); NO-GA add/tick; memo passcode.
4. Cleanup SQL for TEST rows (tasks, noga_requests, memos); optional cron for `med_label` purge.
5. Remove worktrees/branches; update memory and spec status.
