# Sign Groups for Flagging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single "Suspected condition" dropdown on the shelter-staff flag form with tickable sign groups by body system, counted by the surveillance graphs, while old records and past data keep working unchanged.

**Architecture:** Add `tasks.conditions text[]` (kept in step with the existing `condition`, the first group in display order, by a DB trigger). One pure helper `LDHLogic.conditionsOf(row)` is the only place that reads either column; every consumer (survey, summary, display, CSV, history) goes through it. Old keys stay valid and are never merged into new ones.

**Tech Stack:** Vanilla HTML/JS pages, `lib/ldh-logic.js` (UMD, node-testable), Supabase Postgres migrations tested with PGlite, Deno Edge Function, Playwright UI tests with an in-memory stub.

**Spec:** `docs/superpowers/specs/2026-11-01-sign-groups-flagging-design.md` (approved by Juliana 1 Nov 2026, including the "Calls made after the builder check").

## Global Constraints
- Branch `sign-groups` (already created off `071a368`, which holds the unmerged "Total checks" rename; rebase onto `origin/main` before the PR if that branch has merged).
- New group keys, in display order: `respiratory`, `gi`, `urinary`, `skin`, `msk`, `neuro`, `eyes`, `ears`, `wounds_pain_swelling`, `neonatal`, `other` (11).
- Old data is kept: stored rows are never rewritten or deleted. Legacy keys stay valid in the database (old cached pages may still send them) but are removed from the picker, and at READ time fold into the new groups (Juliana, 1 Nov): `cat_flu`→`respiratory`, `kennel_cough`→`respiratory`, `vomiting`→`gi`, `diarrhoea`→`gi`, `eye_condition`→`eyes`, `skin_condition`→`skin`, `wounds_injury`→`wounds_pain_swelling`, `other`→`other`. An unknown key maps to itself.
- Respiratory is read per species: the existing Cats / Dogs / Rabbits tabs of the surveillance board (`surveyBySpecies`) already separate it, and all-species exports carry a Species column from `behaviourSpecies(location)`. No new species field.
- `cat_birthing` is not a surveillance condition and never goes in `conditions`; it keeps today's behaviour exactly and may be combined with ticked groups.
- No urgent tier, no emergency banner, no "general/systemic" or reproductive group. No treatment text anywhere; differentials only; no fracture/neoplasia by default.
- Counting: a case = one animal + one group; an animal with two groups counts once under each ("any" = distinct animal+group, as today).
- Free-plan Supabase: no new tables, no heavier queries.
- Chart colour = position in `SIGN_KEYS` (`--cond-0..10` in `lib/surveillance.css`; add 8..10). Colours of past charts may change; that is accepted.
- Bump the `?v=` cache tag on every changed `lib/*.js`/`.css` file wherever it is included (index, vets, nurses, stats, shelter-board, behaviour, admission-aa) and each page's own `APP_VERSION` if it has one.
- Migration number is `0047`; copy it to the clipboard (`pbcopy`) when handing it to Juliana. Migration file must be safe to run twice.

## Review Focus
- Old open task with only `condition='vomiting'` and `conditions='{}'` displays and counts as "GI signs"; a row with both `vomiting` and `diarrhoea` counts as ONE `gi` case; old `cat_flu` and `kennel_cough` rows count under Respiratory in the Cats and Dogs tabs respectively.
- An old cached page inserts `{condition:'cat_flu'}` only → DB fills `conditions='{cat_flu}'` (raw key kept), which reads as `respiratory`.
- Zero groups ticked → `condition` null, `conditions='{}'`, no "any" case, nothing breaks.
- Same animal re-flagged in the same pen with a new group → groups are unioned, none duplicated, none removed.
- Cat birthing ticked together with `gi` → red-flag tier still applied, `gi` still counted, birthing reason still required.
- Unknown key in a stored row (future key) → shown raw, not a crash, and not counted in the "none" bucket twice.

---

### Task 1: Pure logic — groups, labels, `conditionsOf`, counting

**Files:**
- Modify: `lib/ldh-logic.js` (SIGN_KEYS/CONDITION_LABELS block ~l.71-78; `summariseConditions` ~l.374; `buildSurvey` ~l.636; `reasonText`/`mergeReason`/`flagReason` ~l.228-251; export list ~l.958)
- Test: `tests/logic.test.mjs`, `tests/surveillance-view.test.mjs`

**Interfaces:**
- Produces on `LDHLogic`:
  - `SIGN_GROUPS: Array<{key, label, examples: string}>` — the 11 new groups in display order (`label` = picker text from the spec table, `examples` = the example-signs text).
  - `SIGN_KEYS: string[]` — the 11 new keys only (charts, legends and counts use these).
  - `LEGACY_GROUP: Record<string, string>` — the 7 legacy keys → their group (mapping in Global Constraints).
  - `groupOf(key: string): string` — `LEGACY_GROUP[key]` or the key itself.
  - `CONDITION_LABELS` gains the new keys (short form e.g. `gi: 'GI signs'`, `respiratory: 'Respiratory signs'`); old entries stay so a raw legacy key never shows blank; `none: 'None flagged'` kept.
  - `conditionsOf(row): string[]` — the groups of a row: `row.conditions` if a non-empty array, else `[row.condition]` if set, else `[]`; each passed through `groupOf`, de-duplicated, order kept.
  - `primaryCondition(keys: string[]): string|null` — the key earliest in `SIGN_GROUPS` order (unknown keys after known), `null` if empty.
- `mergeReason(task, entry)` now also returns `conditions` (union of `conditionsOf(task)` and `conditionsOf(entry)`) and `condition: primaryCondition(union)`.

- [ ] **Step 1: Write failing tests** in `tests/logic.test.mjs`: `conditionsOf` (new array; legacy single; `['vomiting','diarrhoea']` → `['gi']`; `cat_flu` and `kennel_cough` → `['respiratory']`; empty; duplicates), `primaryCondition` (`['urinary','gi']` → `gi`), `buildSurvey` with a row `{conditions:['gi','urinary']}` gives 2 cases for that animal in its space and `by.gi`/`by.urinary` 1 each, `summariseConditions` counts a two-group row under both, `mergeReason` unions without duplicates, `reasonText` lists every group label (`GI signs, Urinary signs — …`). Add the Review Focus cases for unknown key and zero groups.
- [ ] **Step 2: Run** `node --test tests/logic.test.mjs tests/surveillance-view.test.mjs` — Expected: FAIL (`conditionsOf is not a function`).
- [ ] **Step 3: Implement** the interface above in `lib/ldh-logic.js`. `buildSurvey`/`summariseConditions` loop over `conditionsOf(t)` instead of `t.condition`; `summariseConditions.flagged` is rows with ≥1 group and `byLocation` counts each group; `flagReason` and `reasonText` join the labels of all groups.
- [ ] **Step 4: Run** the same command — Expected: PASS. Then `node --test tests/*.test.mjs` for regressions (expect migration suites to need PGlite: `cd tests && npm install` once).
- [ ] **Step 5: Commit** `feat: sign groups logic (conditionsOf, SIGN_GROUPS, multi-group counting)`.

### Task 2: Migration 0047 — `conditions`, trigger, snapshot, flag history

**Files:**
- Create: `supabase/migrations/0047_sign_groups.sql`
- Test: `tests/sign-groups-migration.test.mjs` (follow `tests/surveillance-migration.test.mjs` for the PGlite set-up and loading earlier migrations)
- Modify: `tests/surveillance-migration.test.mjs` only if its expectations over `LDHLogic.SIGN_KEYS` need the new length.

**Interfaces:**
- Consumes: `LDHLogic.buildSurvey`, `SIGN_KEYS` (Task 1).
- Produces: SQL `public.sign_group(text) returns text` (immutable; same legacy→group mapping as `LDHLogic.groupOf`); `tasks.conditions text[] not null default '{}'` (raw keys as stored); `flag_history.conditions text[] not null default '{}'`; trigger `tasks_sync_conditions` (before insert or update of condition, conditions): if `conditions` is empty and `condition` is set → `conditions = array[condition]`; else if `conditions` non-empty → `condition = conditions[1]` after ordering by the display order array in the function. Constraints: `tasks_condition_check` and a new `tasks_conditions_check (conditions <@ allowed)` where allowed = the 11 new keys + 7 legacy keys.

- [ ] **Step 1: Write failing test** `sign-groups-migration.test.mjs`: (a) old-style insert `{condition:'vomiting'}` ends with `conditions={vomiting}`; (b) insert `{conditions:['urinary','respiratory']}` ends with `condition='respiratory'`; (c) unknown key rejected; (d) `take_surveillance_snapshot(3)` rows equal `LDHLogic.buildSurvey` for a mixed fixture including a two-group animal, a legacy `vomiting` row, a row with both `vomiting` and `diarrhoea`, a legacy `kennel_cough` row and a no-group row (same shape as the existing "SQL snapshot and JS buildSurvey count the same" test, iterating `LDHLogic.SIGN_KEYS`); (e) `flag_history` gets `conditions` from an inserted task; (f) running the file twice does not error.
- [ ] **Step 2: Run** `node --test tests/sign-groups-migration.test.mjs` — Expected: FAIL (column does not exist).
- [ ] **Step 3: Write the migration.** Backfill `conditions` for existing rows from `condition`. Replace `take_surveillance_snapshot(p_days int default 3)` so the per-sign insert unnests `t.conditions` (cross join over the 11 `SIGN_KEYS`, grouping on `sign_group(u.cond)`, `count(distinct t.title)`) and the `'any'` insert counts `distinct t.title || '|' || sign_group(u.cond)` over `unnest(t.conditions)`. Old `surveillance_snapshots` rows are left as they are (they are only used to count baseline nights) (keep the string-concatenation null trick and its comment). Replace `public.log_flag()` to also copy `new.conditions`. Backfill `flag_history.conditions` from `condition`.
- [ ] **Step 4: Run** the new test and `node --test tests/*.test.mjs` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: migration 0047 sign groups (conditions column, sync trigger, snapshot, flag history)`.

### Task 3: Differentials reference data (draft for Juliana)

**Files:**
- Create: `lib/sign-differentials.js` (UMD like `ldh-logic.js`; exposes `SignDifferentials.BY_GROUP`)
- Test: `tests/sign-differentials.test.mjs`

**Interfaces:**
- Produces: `SignDifferentials.BY_GROUP: Record<groupKey, string[]>` — a key for every one of the 11 new groups except `other` (`respiratory` covers cat flu, kennel cough and lower-respiratory differentials); each an array of 4–10 short differential names (diagnoses only); plus `SignDifferentials.NOTE = 'For reference only. This is a list of possible causes, not a diagnosis.'`

- [ ] **Step 1: Write failing test:** every `SIGN_GROUPS` key except `other` has 4–10 entries; no entry matches `/treat|give|dose|mg|recommend|should|fracture|neoplasia|cancer|tumou?r/i`; `NOTE` is defined.
- [ ] **Step 2: Run** `node --test tests/sign-differentials.test.mjs` — Expected: FAIL.
- [ ] **Step 3: Write the data** from clinical knowledge (cats/dogs in a Victorian shelter, e.g. `gi`: parvovirus, panleukopenia, Giardia, dietary change, intestinal parasites…). Differentials only.
- [ ] **Step 4: Run** the test — Expected: PASS.
- [ ] **Step 5: Commit** `feat: draft sign-group differentials (pending Juliana sign-off)`. **Release gate:** do not merge to main until Juliana has reviewed this file's content.

### Task 4: Flag form on `index.html` — tick list, differentials, submit

**Files:**
- Modify: `index.html` (the `req-condition` select ~l.390-402; handlers ~l.628, 670, 702, 707, 724, 773; `birthingReason` ~l.1019; FAQ ~l.577-579; include `lib/sign-differentials.js`)
- Test: `tests/ui/flag-form.test.js` (update the `signOpts` assertion), new `tests/ui/sign-groups-form.test.js`

**Interfaces:**
- Consumes: `LDHLogic.SIGN_GROUPS`, `conditionsOf`, `primaryCondition`, `mergeReason`, `SignDifferentials.BY_GROUP`.
- Produces in the DOM: container `#req-signs` holding one `<label class="req-chip"><input type="checkbox" class="req-sign" value="<key>">` per group, each label shows `label` plus its `examples`; a collapsed `<details class="sign-diff" data-group="<key>">` under each chip listing the differentials and the NOTE. A separate checkbox `#req-birthing` (label "🚨 Cat birthing — urgent check") replaces the `cat_birthing` option; `#req-birthing-wrap` shows when it is ticked. Helper `selectedSigns(): string[]`.
- Submitted row: `conditions: selectedSigns()` and `condition: primaryCondition(selectedSigns())` (null when none); `needsVet` uses `selectedSigns().length`. Re-flag entry carries `conditions` and uses `mergeReason`.

- [ ] **Step 1: Write failing tests:** `sign-groups-form.test.js` — eleven `.req-sign` boxes in the spec's order, `respiratory` first; the picker contains no differential text until a `details` is opened; ticking `gi` + `urinary` and submitting saves `conditions=['gi','urinary']` and `condition='gi'`; ticking none saves `condition=null` and `conditions=[]` with no error; ticking `#req-birthing` + `gi` still requires the reason, saves red_flag tier, and `conditions=['gi']` (no `cat_birthing`); re-flagging an open animal with `urinary` adds it to the existing row's `conditions` without duplicating `gi`; boxes reset after submit. Update `flag-form.test.js` so the old `signOpts` assertion checks `.req-sign` values instead.
- [ ] **Step 2: Run** `NODE_PATH=<playwright path from tests/README.md> node --test tests/ui/flag-form.test.js tests/ui/sign-groups-form.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** the form, render it from `SIGN_GROUPS` in the same style as `renderRedFlagForm`, wire `change` handlers to `updateTierPreview`, update reset, validation and `needsVet`. Update the three FAQ entries to say "Suspected signs" and that several groups can be ticked.
- [ ] **Step 4: Run** the two UI tests plus `NODE_PATH=… node tests/ui/run-all.js` — Expected: all PASS.
- [ ] **Step 5: Commit** `feat: tickable sign groups on the flag form`.

### Task 5: Display and export consumers

**Files:**
- Modify: `vets.html` (l.367, 526), `shelter-board.html` (l.252), `lib/animal-history-view.js` (l.30), `stats.html` (CSV block ~l.655-672), `lib/surveillance-view.js` (`condColor`, ~l.33), `lib/surveillance.css` (add `--cond-8..10`), FAQ text in `vets.html`/`nurses.html` that says "Suspected condition".
- Test: `tests/surveillance-view.test.mjs`, `tests/ui/disease-watch.test.js`, `tests/ui/stats-page.test.js`, `tests/ui/vet-board.test.js`

**Interfaces:**
- Consumes: `conditionsOf`, `groupOf`, `SIGN_KEYS`, `CONDITION_LABELS`, `behaviourSpecies` (Task 1 and existing).
- `condColor(key)` returns `var(--cond-<SIGN_KEYS.indexOf(groupOf(key))>)`; CSS defines `--cond-8..10` as a validated extension of the categorical palette (distinct from 0-7 in light and dark). The stats CSV gains a `Species` column (`cat` / `dog` / `either`) on the animal rows and in the per-location section.

- [ ] **Step 1: Write failing tests:** a vet card for `{conditions:['gi','urinary']}` shows both labels; a legacy `{condition:'vomiting'}` card shows "GI signs"; shelter-board falls back to the joined labels; stats CSV lists a two-group row once per group in the per-condition section and the animal row shows both labels separated by `; `; `condColor('vomiting')` equals `condColor('gi')`; the Dogs tab counts an old `kennel_cough` row and the Cats tab an old `cat_flu` row under Respiratory; the CSV `Species` column reads `cat` for a Cat Room and `dog` for Pound 1.
- [ ] **Step 2: Run** `node --test tests/surveillance-view.test.mjs` and the named UI tests — Expected: FAIL.
- [ ] **Step 3: Implement** the changes using `conditionsOf`/`CONDITION_LABELS` only (no new key handling in pages).
- [ ] **Step 4: Run** the same tests and the full node and UI suites — Expected: PASS.
- [ ] **Step 5: Commit** `feat: show and export sign groups on vets, board, history, stats`.

### Task 6: Edge Function and Sick & Injured tool

**Files:**
- Modify: `supabase/functions/sync-completion/index.ts` (`flag_check` select and response, ~l.313-319); `tests/flag-edge-validate.test.mjs` if it checks response shape.
- Modify (repo `~/ldh-shift-tools`, separate branch and PR): `sick-injured.html` (l.1488 and the object built at l.2222) and its test.

**Interfaces:**
- `flag_check` response items gain `conditions: string[]` (from `conditionsOf` equivalent: `conditions` if non-empty else `[condition]`), `condition` kept unchanged for old tool versions.
- S&I consumes `conditions` and prints `Suspected signs: <Label, Label>` using a small label map and the same legacy→group mapping copied from `LDHLogic` (so old rows read as their new group); falls back to the raw `condition`, then to the raw key if unknown.

- [ ] **Step 1: Write failing tests:** edge (shape test): response includes `conditions` for a row with `condition='vomiting'` and `conditions='{}'` → `['vomiting']`; S&I (follow the existing `ldh-shift-tools` test for the flag import): a flag with `conditions:['gi','urinary']` puts "Suspected signs: GI signs, Urinary signs" in the consult note, a flag with only `condition:'cat_flu'` puts "Respiratory signs", an unknown key prints raw.
- [ ] **Step 2: Run** the repo test commands — Expected: FAIL.
- [ ] **Step 3: Implement** both sides; bump S&I's own `APP_VERSION`.
- [ ] **Step 4: Run** the tests — Expected: PASS.
- [ ] **Step 5: Commit** in each repo; two PRs. Note in each PR: Edge Function redeploy = paste the whole file; migration 0047 must be run first.

### Task 7: Wrap-up and verification

**Files:** `tests/README.md` (list the new suites), cache tags and versions, `CLAUDE.md`-style notes not needed.

- [ ] **Step 1:** Bump all `?v=` tags and `APP_VERSION`s per Global Constraints.
- [ ] **Step 2:** Run `node --test tests/*.test.mjs` and `NODE_PATH=<playwright> node tests/ui/run-all.js`; Expected: everything PASS. Report the real output.
- [ ] **Step 3:** Open the page with the in-memory stub (see `tests/ui/harness.js`) and check the form visually on a phone-width viewport: picker readable, differentials collapsed, no horizontal scroll.
- [ ] **Step 4:** `pbcopy < supabase/migrations/0047_sign_groups.sql`; tell Juliana the order: run 0047 → merge the dashboard PR → redeploy the Edge Function → merge the shift-tools PR; and that the differentials file needs her sign-off before merge.
- [ ] **Step 5:** Append a dated entry to the project memory `project_ldh_shift_ops_dashboard.md` (standing rule: log after every finished task) and push the branch only when Juliana says so.
