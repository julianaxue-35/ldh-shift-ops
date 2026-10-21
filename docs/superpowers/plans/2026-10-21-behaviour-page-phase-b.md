# Behaviour page Phase B — "Send to Behaviour" from the shift tools

**Goal:** A vet in Sick & Injured, Processing or Surgery presses **Send to Behaviour** on an animal; the animal lands in the Behaviour page's Incoming strip with the whole current note attached. When behaviour ticks **Done**, the attached note is deleted from the database (the Done note and initials stay).

**Spec:** `docs/superpowers/specs/2026-10-21-behaviour-page-design.md` (Phasing → B). **Builds on:** Phase A (merged, PR #41).

**Repos touched:** `ldh-shift-ops` (migration, Edge Function, behaviour.html, tests) and `ldh-shift-tools` (button in 3 tools, shared `behaviour-send.js`).

## Global Constraints
- Real notes in the database need IT sign-off: fictional animals only (IDs like "BEH-1") in tests and demos. Do not turn this on for real notes until she says IT has signed off.
- No microchip numbers sent. The note text goes as it is; the button must warn nothing, but the Edge Function must never log the note text.
- Same trust path as Admission AA: LDH code check, confirmed send (Sent ✓ / NOT SENT + Resend). Anything but HTTP 200 `{ok:true}` is "not sent".
- Dogs and cats never cross lanes: the existing Phase A rules apply unchanged to these tasks.
- Each tool's own `APP_VERSION` const is bumped on every edit.
- Commits end with the Co-Authored-By and Claude-Session lines; she authorises merges only by saying "merge".

## Design decisions (rulings she can veto)
1. **One send = one Incoming card.** Key = animal ID (upper-case) + Melbourne day + `tool_note`. Sending again updates the same open card's note and reason (no duplicate). A card already Done is not reopened: a new card is made.
2. **What is sent:** animal ID, location, reason (required, free text), initials (required), and the whole note text (`aaNoteOf(a)` / `assembleNote(a)`), up to 20,000 characters. No Word file.
3. **Where the note lives:** new column `behaviour_tasks.attached_note` (text, null normally). Kind of the task = `behaviour_review`, lane `incoming`, `flagged_by` = initials, `due_window` = `today` (the vet can pick 30–60 min / today / 48 h on the send window).
4. **Deleted on Done — enforced by the database, not the page:** a BEFORE UPDATE trigger sets `attached_note = null` whenever `status` becomes `done`. So every path that ticks Done clears it.
5. **Safety net:** an open task's attached note is also cleared after 7 days (same cleanup trigger), so a forgotten task cannot hold a clinical note forever.
6. **Behaviour page:** a card with an attached note shows a "Medical note" button that opens it read-only. The Shelter board never shows the note.
7. **No read-back** of "behaviour has seen it" in Phase B (YAGNI); the tool shows Sent ✓ / NOT SENT only.

## Review Focus
- A note that is edited and re-sent while behaviour has already ticked Done must make a NEW card, not resurrect the old one.
- Done by two people at once (or Done from a stale page) must leave no note behind.
- A 20,000-character note, and one with emoji / newlines / quotes, must round-trip.
- An animal with no ID in the tool cannot be sent (button disabled with a reason).
- The Edge Function must reject the request without the LDH code and never echo the note in errors.

---

### Task 1: Migration 0029 — attached note + clear-on-Done
**Files:** Create `supabase/migrations/0029_behaviour_attached_note.sql`; Test `tests/behaviour-attached-note-migration.test.mjs` (PGlite, same style as `behaviour-migration.test.mjs`).
**Interfaces — Produces:** columns `attached_note text`, `source_key text` (unique where `status='open'`); trigger `behaviour_tasks_clear_note`.
- [ ] Write failing tests: insert with note keeps it; update `status='done'` nulls it even if the same UPDATE sets a new note; open row older than 7 days has note cleared by the cleanup trigger; second open insert with same `source_key` fails 23505; a done row with the same key does not block a new open one.
- [ ] Run → FAIL. [ ] Write the migration (idempotent: `add column if not exists`, `create unique index if not exists … where status='open' and source_key is not null`, `create or replace` trigger function, drop/create trigger). [ ] Run → PASS. [ ] Commit.

### Task 2: Edge Function shape 12 — `behaviour`
**Files:** Modify `supabase/functions/sync-completion/index.ts`; Test `tests/behaviour-edge-validate.test.mjs` (same extraction pattern as `aa-edge-validate.test.mjs`).
**Interfaces — Produces:** `validateBehaviourSend(b)` → `{error}` or `{row:{kind:'behaviour_review',animal_id,location,reason,flagged_by,due_window,attached_note,source_key}}`. Request `{ behaviour: { animal_id, location, reason, sent_by, window, note } }`, reply `{ok:true, updated:boolean}`.
- [ ] Failing tests: missing/too-long ID, empty reason, empty note, note > 20,000, bad window, bad sent_by (1–4 letters), valid body → row; source_key = `bh|<DAY>|<ID>`.
- [ ] Implement validator + handler: update open card with that source_key (set reason, note, flagged_by, `updated` history entry) else insert; 23505 race → update; never reply ok unless a row was written; error messages never contain the note.
- [ ] Run edge tests + full node suite → PASS. [ ] Commit. (She redeploys by pasting the whole file, as before.)

### Task 3: `behaviour-send.js` in ldh-shift-tools
**Files:** Create `behaviour-send.js` (UMD like `aa-share.js`), `tests/behaviour-send.test.mjs`. Reuses `LDHSync.fetch`.
**Interfaces — Produces:** `BehaviourSend.buildBody({animal, noteText, reason, window, sentBy})` (null when no ID), `BehaviourSend.send(body, fetcher)` → boolean, `BehaviourSend.lastError()`, `BehaviourSend.status(a, noteText)` → `'none'|'sent'|'stale'` using `a.bhSentAt` / `a.bhSig`.
- [ ] Failing tests for each (copy the shapes of `aa-share.test.mjs`), including a fake fetcher returning 200/ok:false/500/throw.
- [ ] Implement. [ ] Run → PASS. [ ] Commit.

### Task 4: "Send to Behaviour" button — Sick & Injured
**Files:** Modify `sick-injured.html` (button on the registered-animal card next to the AA controls; small modal: reason, time frame, initials prefilled from `#vetInit`; load `behaviour-send.js`; normalize `bhSentAt/bhSig/bhErr` on load per the schema-migration rule; bump `APP_VERSION`); Test `tests/ui/behaviour-send-si.test.js`.
- [ ] Failing UI test (fictional "BEH-1"): button disabled with no ID; modal needs reason + initials; stubbed fetch receives the body with the whole note; success shows "Sent to Behaviour ✓"; failure shows NOT SENT + Resend; editing the note afterwards shows "Edited since sent" and Resend works.
- [ ] Implement; run the new test and the existing S&I tests. [ ] Commit.

### Task 5: Button — Processing
Same as Task 4 for `processing.html` (`aaNoteOf` equivalent). Test `tests/ui/behaviour-send-processing.test.js`.

### Task 6: Button — Surgery
Same for `surgery.html` using `assembleNote(a)` / `noteEdited`. Test `tests/ui/behaviour-send-surgery.test.js`. (Surgery has no AA share today, so the button sits with the note actions.)

### Task 7: Behaviour page — show the attached note, clear on Done
**Files:** Modify `behaviour.html`, `tests/ui/harness.js` (stub `attached_note`, clear-on-done like the trigger); Test `tests/ui/behaviour-attached-note.test.js`.
- [ ] Failing UI test: card from a tool shows a "From the vets · Medical note" button; opens read-only; Done with a note → card leaves, stub row has `attached_note === null` and `done_note` kept; a card with no note shows no button.
- [ ] Implement. Page also sends `attached_note: null` explicitly on Done (belt and braces with the trigger). [ ] Run behaviour UI tests. [ ] Commit.

### Task 8: Docs and hand-off
README line in both repos; `tests/README.md`; an IT hand-off paragraph (what is stored, where, when it is deleted: on Done, or 7 days). Full node + UI suites green. Open PRs (ops + tools); do not merge.

## After the plan
Final whole-branch review by a fresh opus reviewer; fixes with RED→GREEN; PRs for both repos; she says "merge", then runs `0029_…sql` and pastes the Edge Function.
