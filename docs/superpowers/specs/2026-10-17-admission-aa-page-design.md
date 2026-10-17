# Admission AA page — design

Date: 2026-10-17 · Status: **draft for Juliana's review** (no code written)

## Purpose
Give the Admission AA one page that collects everything clinical staff hand over for entry into ShelterMate, so nothing is passed on by verbal message or loose paper. The AA enters each item in ShelterMate, then ticks it off.

## What the AA receives (one card per item)
| Item | Sent by | Content |
|---|---|---|
| FIV test result | Nurse | Animal ID, result |
| Microchip | Nurse | Animal ID, chip number, implanter initials |
| UV result | Nurse | Animal ID, result (arrives with microchip as one combined card when it was a Microchip + UV task) |
| Medication chart | Vet ("Send to AA", can be several per day) | Animal ID, chart text/file |
| Processing notes | Vet ("Share with AA") | Animal ID, note text; AA can view or download as Word |
| Sick & injured notes | Vet ("Share with AA") | same as processing notes |
| **Vaccination update (new)** | Nurse | One or many animal IDs, vaccine given, date; one card per send |

If a vet does the notes herself/himself, they export the chart/notes from the shift tool and nothing is sent.

## Sign-in
AA has their own passcode (new `role_passcodes` role `aa`, checked by the existing `check_passcode` RPC; same pattern as vets/nurses). Passcode is rotated by SQL, never stored in files.

## Lifecycle and privacy (your rules)
1. A card is created when staff send it.
2. It shows a **24-hour countdown** ("18h 20m left") from the time it was sent.
3. **Past 24 h and still not ticked:** the card turns red with an **"Overdue by Xh"** warning and floats to the top. The page also shows a red count at the top ("3 overdue"). It is NOT silently deleted (see open question).
4. **AA ticks it done** (after entering in ShelterMate): the row is **deleted from the database completely, immediately** — no 24 h grace, no archive. Only a count of "done today" is kept in the browser for that session; no patient data.
5. Nothing stays in the database longer than needed: ticked = gone.

## Data model (migration 0017, to be written after approval)
- `aa_items(id, kind, animal_ids text[], payload jsonb, sent_by, sent_at, ...)`; `kind` in fiv, microchip, uv, microchip_uv, med_chart, processing_note, si_note, vaccination.
- RLS: authenticated staff can insert; read/delete only for AA role session. Delete on tick via RPC `aa_complete(id)` that hard-deletes.
- Word download: generated in the browser from `payload` (no file stored).
- Alert banner + sound on new item, same shared module as vets/nurses.

## Where staff send from
- **Nurses page:** microchip-done form gains chip number + initials; new "Vaccination update to AA" box (type one or many animal IDs, vaccine, date → Send).
- **Shift tools (`ldh-shift-tools`)**: "Share with AA" buttons on Processing and S&I notes and medication chart. These tools are offline today; sending needs the same sign-in/Edge Function route as the existing sync, so it is a second PR in that repo.

## Safety / governance
- Patient data now goes to the database, so this needs **IT sign-off before go-live**: build and test with fictional data first.
- Repos are public: no real codes or secrets in files.

## Phasing
1. Page + sign-in + nurse items (FIV, microchip, UV, vaccination update) + countdown/delete-on-tick.
2. Vet/shift-tool sharing of medication charts and notes with Word download.

## Open question
What should happen to a card still unticked after 24 h: stay visible with the red overdue warning until ticked (my recommendation, so nothing is lost before it's entered), or be auto-deleted after, say, 7 days as a backstop?
