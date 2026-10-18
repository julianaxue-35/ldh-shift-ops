# Admission AA page, Phase 2: vets share notes and medication charts — design

Date: 2026-10-18 · Status: **draft v2 for Juliana's review** (no code written) · Builds on `2026-10-17-admission-aa-page-design.md` (Phase 1 is live)

## Purpose
When a vet is working a shift in the offline shift tools, each animal's finished notes and any medication chart reach the Admission AA page automatically, as a task to enter in ShelterMate. The vet taps one switch at the start of the shift and then just works. A vet who writes up her own notes leaves the switch off and exports as today.

## How it works (your description)
1. **Start of shift:** the vet taps **"Share this shift with Admission AA"** in the tool (Processing or Sick & Injured). It is a switch for the whole shift, stored on that phone with the shift list, and it switches itself off when the list is cleared.
2. **Notes:** when the vet registers an animal as finished (the same moment the tool already tells the dashboard the animal is done and the notes go into the Word/Excel export), a card appears on the Admission AA page: **the animal ID**, location, and that animal's notes to view or copy. The AA enters them in ShelterMate and ticks the card off whenever she gets to it.
3. **Medication charts:** when a medication chart is generated for an animal and the switch is on, the chart (drug, dose, frequency, days) is sent automatically as its own card.
4. **Vets must finish the notes first.** Because the send fires at registration, the notes have to be complete before the vet registers the animal. The tool reminds them with a short line on the register button while the switch is on ("Registering sends these notes to the Admission AA").
5. **Catch-up:** if the switch is turned on mid-shift, animals already registered that shift are sent straight away, so nothing is missed.
6. **Changed after sending:** if a vet edits a note and registers again, the card on the AA page is **updated** (marked "updated hh:mm"), not duplicated. If the AA already ticked the first one off, the update comes through as a new card, because it needs entering again.

## No broken chain
Offline, nothing is queued behind the scenes (as you said, leave it as it is). Instead the tool never lets a missed send go unnoticed:
- Every animal and every medication chart shows a status: **Sent to Admission AA ✓ 10:42** or **NOT SENT**, with a one-tap **Resend**.
- Sent means the dashboard has confirmed it saved. A send that gets no confirmation counts as NOT SENT.
- While the switch is on and anything is NOT SENT, a red bar stays at the top of the tool: "2 items not sent to the Admission AA".
- The Word/Excel export and "Clear list" both warn if anything is still NOT SENT, so the shift cannot be wrapped up with a gap.

## What the AA sees
Same page and rules as Phase 1: banner and sound, 24 hour countdown, overdue in red, tick = deleted, nothing auto-deleted. New card types:
- **Notes:** animal ID, location, sent by (vet initials), the notes text with **Copy**, and **Download Word** if the tool can make a one-animal file (to be confirmed in the plan; otherwise Copy only).
- **Medication chart:** animal ID, drug lines, sent by.

## Data and privacy
- Stored only in `aa_items`; deleted the moment the AA ticks it. Unticked cards stay with the red warning.
- Real patient notes go through the database: **IT sign-off is required before go-live**; first run uses fictional animals only. Public repos: no real codes or patient text in any file, test or commit.
- Size limit per send (about 1.5 MB), clear message if exceeded.

## Changes by place
- **Migration 0018:** add kinds `processing_note`, `si_note`, `med_chart` to `aa_items`; add a "one live card per shift, animal and kind" key (so resends update); size check.
- **Edge Function `sync-completion`:** new `aa` request shape, same LDH code check; replies with a confirmation the tool waits for. Must be deployed **before** the tools are updated (the old function rejects unknown shapes).
- **Dashboard:** `admission-aa.html` and `ldh-logic.js` render the new cards, Copy and Download buttons, "updated" marker.
- **Shift tools:** `processing.html`, `sick-injured.html` (shift switch, status per animal/chart, red bar, export/clear warnings), shared `sync-code.js` (confirmed-send helper), `medchart.js` (chart send); each file's `APP_VERSION` bumped.

## Phasing (each tested with fictional data before the next)
- **2a:** migration, Edge Function, AA page cards, Processing notes switch + status + red bar.
- **2b:** Sick & Injured notes.
- **2c:** medication-chart auto-send.

## Risks
- Rollout order matters: migration → function → dashboard → tools.
- The shift tools are very large single files (3,000 to 4,800 lines); changes are kept small and tested in the browser stub before release.
- A phone that stays offline all shift will show the red bar all shift; that is intended, and the vet falls back to exporting the Word file.
