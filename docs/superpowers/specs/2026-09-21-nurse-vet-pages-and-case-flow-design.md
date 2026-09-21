# Nurse / Vet pages, one case list, medication hand-off — design

Date: 2026-09-21. Follows stage 1 (triage) and stage 2 (surveillance), both live.
Source: Juliana's change list of 2026-09-21 plus her answers in chat. Not yet built.

## 1. What changes, in one paragraph

Shelter staff stay on one page (`index.html`). Vets get their own page (`vets.html`), nurses get theirs
(`nurses.html`). "Red flags" become **Emergency** signs with her five-item checklist; tiers are renamed
Emergency / Urgent / Request checks. "Cases flagged" and "Recently completed" merge into ONE case list
that follows each case from flagged to completed. Cases flagged as needing medication travel
staff → vet → nurse → completed. Nurses get a NO-GA request list (added by the admission AA). Vets and
nurses each get the memo board, with a simple passcode guarding tick-off.

## 2. Shelter staff page (`index.html`)

- **Flag form:** the "Red flags" checklist is replaced by **Emergency signs** (tick any):
  not eating > 48 hours · not urinating > 36 hours · bleeding wound (large cut / can't stop the bleeding) ·
  not defecated > 72 hours · vomited multiple piles.
  Below it the line: "High priority emergency? Radio the vet, don't wait for this board." (No example
  list — laboured breathing / collapse are deliberately NOT options.)
- Any Emergency sign ticked → tier **Emergency** (2 h target, as red flag today). Otherwise the vet or
  nurse can bump to **Urgent** (12–24 h). Default is **Request checks** (24–48 h; amber day 2, red day 3).
  Only the LABELS change. The stored values stay `red_flag` / `urgent` / `routine` so nothing in the
  database needs converting.
- New **"Needs medication"** tick box on the flag form (independent of the request-type dropdown).
  Ticking it also asks for the animal's **SM number** (ShelterMate number), required for medication cases.
- **Location list gains "Offsite"** (fosters and post-adoptions), with an optional free-text detail
  (e.g. foster name or suburb). Offsite is not a shelter space: it has no cages, so it is left out of the
  disease-watch heat map and rates (the board already reports unmapped spaces rather than dropping them).
- **One case list ("Cases")** replaces "Cases flagged" (both the Floor table and the vet board) and
  "Recently completed". Each row shows a stage:
  `Flagged → Picked up → Vet check done` (+ `Waiting on medication` for medication cases) `→ Completed`.
  Plan line from Sick & Injured is shown on the row once written (already synced as the completion note).
  Open cases on top (Emergency first, then Urgent, then Request checks; by time left within a tier);
  Completed at the bottom, kept 24 h from `completed_at`, then hidden (rows are not deleted).
- The vaccination-request form stays here (staff raise them). Their list moves to the nurses page.
- **Heat map ("Disease watch") moves to the bottom of the page.**
- Removed from this page: nurse cards, treatment cards, memo board, Recently completed.

## 3. Vets page (`vets.html`)

- Case queue: the same combined case list with the vet actions — **Pick up** (as today, hands off to Sick &
  Injured, stamps `claimed_at`), bump tier, and **DONE**.
- **DONE** opens a small panel:
  - `Med chart completed` tick (only shown if the case needs medication). Ticked = an admission AA prints
    the chart; unticked = no chart.
  - `Medication label` text box (paste area, only for medication cases): the vet types or pastes the
    label wording (drug, dose, frequency). It travels to the nurse page exactly as typed.
  - Non-medication case: DONE simply completes it.
- Treatment requests (the "Request a treatment — vets" card and course list) move here.
- Memo board (section 6).
- Vets have NO NO-GA list.

## 4. Nurses page (`nurses.html`)

- **Medication labels to make:** one card per case with animal ID, **SM number**, **location** (shelter space
  and pen, or "Offsite — <detail>"), chart status
  ("Chart printed by admission" / "No chart"), and the vet's label text with a **Copy** button. The nurse
  makes the label, collects the meds, and ticks **Done** (initials recorded). That tick completes the case.
- Vaccination requests (existing card, 3 h clock).
- Treatments due (existing overdue / today dose ticks).
- **NO-GA required list:** requests for FIV tests / microchipping that need no general anaesthetic.
  The single admission AA adds requests here (animal ID, location, task: FIV test / microchip / other, note);
  nurses tick them done. No Excel export.
- Memo board (section 6).

## 5. Medication flow — data and the sync trap

Confirmed flow: staff/foster ticks **Needs medication** → case appears on the vet list tagged Medication →
vet does notes in Sick & Injured, reviews, clicks DONE (label + chart option) → case moves to the nurse page →
nurse tick → case shows **Completed** on the shelter/vet list.

New columns on `tasks`: `needs_medication boolean`, `vet_done_at timestamptz`, `med_chart_done boolean`,
`med_label text`, `med_done_by text`, `med_done_at timestamptz`, `sm_number text`, `location_detail text`
(the Offsite free text). `location` itself is the existing column, with the value "Offsite".

**Trap:** Sick & Injured's completion sync (Edge Function) sets `done = true` the moment the vet finishes
in that tool — that would complete a medication case before the nurse has done anything. Fix without
touching the Edge Function: a **`before insert or update` trigger on `tasks`**: if `needs_medication` and
`med_done_at is null` and `new.done`, then `done := false` and `vet_done_at := coalesce(vet_done_at, now())`.
Both the S&I sync and the vet's DONE button therefore land in "Vet check done — waiting on medication".
The nurse's tick sets `med_done_at` and `done = true`, which the trigger lets through. Undo keeps working.

The label wording is clinical detail; it lives only in `tasks.med_label`, is cleared 24 h after completion
(by the same hourly cron mechanism as surgery), and is never sent to the offline tools.

## 6. Passcode and memo board

- **Two passcodes: one for vets, one for nurses.** Stored in a small table read only through an RPC
  `check_passcode(role, code) returns boolean`, so the codes are never in the page source. Entering the right
  code unlocks that page for the tab (sessionStorage) until closed. The admission AA is given the nurse code.
- **Honest scope:** this stops accidental ticks and casual tampering by other staff. It is not real
  security — the underlying Supabase login is still one shared account, so a technical person could bypass
  it. Accepted by Juliana.
- **Gated actions** on `vets.html` / `nurses.html`: Pick up, DONE, bump, nurse Done, dose ticks, NO-GA add/tick,
  memo tick/delete. **Viewing** is not gated (any signed-in staff can open the pages and read).
- **Memo board** appears on both pages, one shared board (same `memos` table): post, tick off, show
  completed, delete. Posting needs no passcode; tick-off and delete do.
- Passcode setup and changes are done in the SQL editor (I provide the statement), like the stations login.

## 7. Wording carried into the offline tools

Sick & Injured's History line currently says "Red flags: …". It becomes "Emergency signs: …" and the
hand-off sends the new labels. `APP_VERSION` bumped on that file. Old rows keep working: label lookup
tolerates the previous keys (`laboured_breathing`, `cant_stand`, …) and shows them as text.

## 8. Build order (each step shippable and tested on its own)

1. **Staff page:** Emergency wording + checklist + tier rename + Needs-medication box + combined case list +
   heat map to bottom. (Migration 0010a: new columns + trigger.)
2. **Split pages + passcodes + memo board** (0010b: passcodes + RPC). Shared `lib/ops-core.js` for login,
   Supabase client, escaping, realtime, passcode gate — so the three pages don't copy each other.
3. **Medication hand-off** (DONE panel, nurse label card, copy button, stage shown on the shelter list).
4. **NO-GA list** (0010c: `noga_requests` table) on the nurses page.
5. S&I wording update in `ldh-shift-tools`.

Migrations run BEFORE the pages that use them, as before. Nothing is pushed to main without her go.

## 9. Rulings I made (change any you disagree with)

1. The Medication **request type** stays in the dropdown for "remote-only" cases; the new **Needs medication**
   tick box is separate and drives the nurse flow. (If she wants only one, say so.)
2. One shared memo board across vets and nurses.
3. Viewing the vets/nurses pages is open to any signed-in staff; only actions need the passcode.
4. Completed cases hidden after 24 h, not deleted (stats and surveillance still count them).
5. SM number = ShelterMate number, typed by staff at flagging (required only when Needs medication is ticked);
   it is an internal record number, not a microchip, so it is fine to hold in the cloud table.
6. Emergency keys are new (`not_eating_48h`, `not_urinating_36h`, `bleeding_wound`, `not_defecated_72h`,
   `vomited_multiple`); old keys still display.

## 10. Not in this round

Roster import (waiting for her), stage 3 (vet-diagnosed conditions), stage 4 (rounds / handover / isolation),
year-2 baseline comparison, the second-sign-per-animal question (unique index still blocks it).
