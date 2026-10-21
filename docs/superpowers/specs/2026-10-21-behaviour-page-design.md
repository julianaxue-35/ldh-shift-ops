# Behaviour page and behaviour task bar — design

Date: 2026-10-21 · Status: **draft for Juliana's review** (no code written) · Builds on the nurse/vet pages and the shelter staff page (`index.html`).

## Purpose
Give the behaviour team their own page on the shift board. Staff flag behaviour tasks from the shelter staff page; the team works them in lanes, records the outcome on Done, and that outcome shows on the Shelter board. The team can also ask the vets for shelter stress medication, a post adoption med pack, or something else, without leaving their page.

## Behaviour page (`behaviour.html`)
**Banner across the top: "Request to vets".** Type (shelter stress medication / post adoption med pack / other), shelter ID, location, optional **courthold** tick, vet-readable note for "other", and the requester's initials. It writes to the existing `tasks` board (same path as other vet requests) so vets see it where they already look. No second queue.

**Incoming strip.** Every behaviour request from the shelter staff page lands here first, unassigned. Each card has an assign control (see Reassigning).

**Two columns below.**
- Left: **Behaviour TL**.
- Right: **Cat assist** on top, **Dog assist** underneath.

**Task card:** animal ID, location, kind, time frame with countdown / overdue marker, the reason, who flagged it (initials), courthold badge. Buttons: **Done**, **Move to…**.

**Done:** opens a note box ("what did you find / what is the plan") plus initials. The task closes, and the note and initials are kept as the outcome.

**Tasks from the team:** each lane has a small "add task" form, so a TL can give a task to an assist and an assist can give one back to the TL.

**Filters:** kind, time frame, courthold, lane.

## Reassigning (dogs and cats never cross)
- All new staff requests land in Incoming.
- Cat location (cat rooms, cat adoptions): choices are **TL** or **Cat assist**.
- Dog location (pound 1–4): choices are **TL** or **Dog assist**.
- Transport (could be either): choices are TL, Cat assist or Dog assist; the person assigning picks.
- Unrecognised location: treated like transport.
- On the staff form an optional **"Send straight to TL"** tick puts the task in the TL lane instead of Incoming.
- Moves are recorded (who, when, from, to).

## Shelter staff page: Behaviour task bar
Below the nurse request bar.
- **Kinds:** courthold reassessment, owner surrender history with concerns, aggression / incident review, behaviour review, other (free text).
- **Time frame:** 30–60 mins, within today, within 48 hours.
- **Reason box:** required for behaviour review and aggression / incident review; free text always available for "other".
- Shelter ID, location, "Send straight to TL" tick, initials.

## Initials
Every request or assignment to vets, nurses or behaviour asks for the person's initials. They are remembered per device for the day, using the same approach as the vets page (`ldh_vets_initials_v1`-style key, one shared behaviour key) and can be changed at any time.

## Feedback to the Shelter board
When a behaviour task is marked Done, its note, initials and time show on that animal's card on `shelter-board.html`, matched by animal ID. Open behaviour tasks can show as a small badge on the same card. Nothing is shown for IDs the board does not already list.

## Data
New table `behaviour_tasks`: id, created_at, kind, animal_id, location, lane (`incoming`, `tl`, `cat`, `dog`), due_window (`30_60m`, `today`, `48h`), reason, note, courthold, flagged_by (initials), status (`open`/`done`), done_at, done_note, done_by, lane history (jsonb). RLS and passcode access follow the nurse_requests pattern. The vet request reuses `tasks`; the courthold flag and request type travel in its existing fields (details settled in the plan).

## Phasing
- **A (this spec):** migration, `behaviour.html`, staff behaviour bar, vet request banner, Shelter board feedback, initials, tests with fictional animals only.
- **B (after A is working):** a **"Send to Behaviour"** button on each animal in Sick & Injured, Processing and Surgery. The vet adds a reason and initials; the animal ID, location and the **whole current note** go to the Incoming strip. Needs a new request shape in the Edge Function (same LDH code check, confirmed send with Sent ✓ / NOT SENT and Resend, as in Admission AA). Re-sending after an edit updates the card instead of duplicating it. **When the behaviour task is ticked Done, the attached clinical note is deleted from the database** (the Done note and initials stay). Real notes in the database need IT sign-off before go-live; fictional animals only until then.

## Privacy
Animal IDs and behaviour notes are patient data. Fictional animals only until IT sign-off; no real codes or patient text in public repos, tests or commits. No microchip numbers.

## Out of scope
Named-person assignment (lanes only), notifications/sounds, stats rings for behaviour, auto-routing by species.
