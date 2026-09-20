# LDH Shift Ops — Floor / Vet desk redesign, with disease surveillance

Date: 2026-09-20. Status: design for review (no implementation started).

## 1. Purpose and audience
The dashboard is a **live coordination tool for floor staff and vets**, not a leadership report.
Two views of one dataset:

- **Floor** — AAs, foster, rescue (the "Shelter Staff" view today).
- **Vet desk** — vets and nurses (the "Vet / Nurse" view today).

Problems it must fix (from Juliana): poor communication between the vet team and other departments;
vets cannot triage what is urgent; tasks get forgotten; AAs do not know an animal's plan after a
check; vets and nurses need one place to pick things up and flag difficult cases for rounds.
It must also work as a **disease surveillance tool**.

## 2. Principles
1. **Passive over manual.** Derive values from text people already type; avoid new input fields.
2. **Privacy.** Only operational metadata goes to the cloud. No clinical narrative, no microchip
   numbers, plan line is a short excerpt only. Council-seized animals need no special handling (staff
   only ever see an animal ID). **A plan line expires 24 hours after it is sent.**
3. **Emergencies are radioed.** The board is not the emergency channel; it must say so.
4. **Never block a vet.** Anything optional (diagnosis tag, rounds flag) must not gate closing a case.
5. **Data before thresholds.** No high/outbreak cut-offs until a baseline exists.

## 3. Triage
Two time-based tiers replace Urgent / Soon / Routine:

- **Check within 2 hours** — any red flag ticked (not eating, laboured breathing, bleeding, can't
  stand, repeated vomiting; list editable).
- **Routine: check within 24–48 hours** — no red flags. Colour by time since flagged and still not
  seen: under 24 h normal; 24–48 h (day 2) **amber**; 48 h onward (day 3) **red**.

Each case stores `flagged_at` and, for red-flag cases, `due_by` (2 h). Red-flag cards show a
countdown; routine cards use the day-based colours above. Red/overdue cases sort to the top and
appear in the shift-change sweep.
The flag form shows "Emergency? Radio the vet." Radioed cases can be logged afterwards with one
optional tap so surveillance counts stay complete.

## 4. Floor view
- **Flag an animal:** animal ID, space (dropdown incl. Cat Isolation ward), pen, reported sign,
  red-flag checklist, computed tier shown before submit.
- **Animals by room:** status (flagged → seen → plan → done). After a vet registers the animal in
  Sick & Injured, the **auto one-liner plan** appears.
- Surveillance heat map and an isolation list.
- **Nurse requests** can be logged here (section 6).

## 5. Vet desk view
- **Triage queue:** sorted by tier, then time remaining; each card shows which red flags set it.
- **"I've got this"** claim, with initials and time from the roster, for vets and nurses.
- **Unseen-too-long alert** and a **shift-change sweep** (everything open, overdue, or unclaimed),
  plus a generated handover summary.
- **Rounds flag:** "discuss at rounds" (mortality | medicine) with a one-line reason.
  Flagged cases also post an automatic **memo** on the vet memo board.
- **Memos:** every memo has a tick-off box. Ticking removes it from the active board (kept, hidden;
  "show completed" link; delete for mistakes). Ticking a rounds case as discussed updates its memo.

## 6. Nurse requests (new board)
For groups of animals, not single cases — e.g. "FIR: 8 cats to vaccinate", "Transport: 1 dog awaiting
vaccine". Fields: space, species, count, note, **arrived_at** ("Arrived now" button, editable),
`due_by = arrived_at + 3 h`, `done_count`, claimed-by. Card: "5 of 8 vaccinated", 3-hour countdown
(amber/red), claim button. Overdue requests appear in the sweep. Other nurse tasks can reuse the board
with no default clock.

## 6b. Nurse treatment reminders (new)
A vet asks a nurse to provide a treatment to an animal in the ward — e.g. "flush the dental
extraction site, twice daily for 7 days". Fields: animal ID, space, treatment, **times per day**,
**number of days**, requested-by. The board expands this into dose slots (7 days × 2 = 14 ticks).
Nurses see **today's treatments due, grouped by space**, and tick each dose (initials + time). A dose
not ticked by the end of its day is shown overdue and appears in the shift-change sweep. Vets can
see progress ("9 of 14 done") and stop a course early. Request method: see open question 5.

## 7. Disease surveillance
**Locations** live in a `locations` table (name, group, cages), seeded from the Summer Peak workbook
(CB, 23 Aug 2026): Cat Room 1/2/3/FIR = 30/24/10/32; Cat Adoptions 1/2 = 16/16; Cat Isolation ward = 6;
Pound 1/2/3/4 = 30/26/60/9; Dog Transport = 10. Groups: Cat rooms, Cat adoption, Isolation, Pounds,
Transport.

**Two layers, kept separate:**
1. **Reported signs** (chosen at flagging): cat flu signs (URI), kennel cough, diarrhoea / GI upset,
   vomiting, eye condition, skin condition, wounds / injury, other. (Giardia etc. are diagnoses, not
   signs, so they are not offered here.)
2. **Vet-diagnosed conditions**: Giardia, FURI / FURTI, RW (ringworm), CIRDC / KC. Sources:
   - **Sick & Injured:** Assessment lines only.
   - **Processing:** the vet-visible problem **titles** only (exam-finding notes, custom problems),
     never the auto-generated DDx sentences (those contain words like "CIRDC complex" and would give
     false positives). The structured **UV lamp = POSITIVE** result is captured as **"RW (UV+)"**,
     a screening result shown as its own tag until the vet writes RW.
   - **Any line containing "DDx" is ignored** (a skin-lesion differential must not count as
     ringworm). Diarrhoea and vomiting are not read here (they are signs). Parvo / panleukopenia can
     be added later. A finding is counted once per animal.

**Rate:** per space and per sign = distinct animals reported in the last **3 days** ÷ cages,
as a percentage (each animal counted once). Cages are capacity, not occupancy, so an under-filled
space reads low; the screen says so.

**Baseline, not thresholds.** The heat map is neutral (no red/"outbreak") and shows a
"building baseline, day X of 30" banner. A nightly `pg_cron` job stores a snapshot per space and
sign. After ~30 days Juliana and Claude review typical values, range and seasonal movement and set
thresholds from the data; below-baseline is shown as improvement. No rate-based alerts until then.
Caveat stated on screen: the tool measures the **reported** rate (animals someone flagged), which
will read lower than vet-exam prevalence; do not reuse existing prevalence figures as thresholds.

**Views:** heat map (one tile per space: rate, count, leading sign), group summary, ranked signs, and a
smaller vet-diagnosed list, with period switch (today / 7 d / 30 d / a month).

**Export:** one-click **Export report** = an A4 print layout of all surveillance graphs for the chosen
period (save as PDF from the print dialog). A small "download case list (CSV)" link stays as a raw
backup.

## 8. Data changes (Supabase)
- `tasks`: add `sign`, `red_flags`, `due_by`, `first_seen_at`, `claimed_by`, `claimed_at`,
  `rounds_flag`, `rounds_reason`, `rounds_done`, `plan_line`, `diagnosed` (text[]).
- `tasks` also gets `plan_line_at` (plan lines are hidden 24 h after it).
- New `locations`, `nurse_requests`, `nurse_treatments` + `nurse_treatment_doses`,
  `surveillance_snapshots`.
- `memos`: add `done`, `done_at`, `source` (e.g. rounds); add UPDATE/DELETE policies (currently
  select/insert only).
- Nightly `pg_cron` snapshot job (Melbourne time; cron runs in UTC).
- Roster: existing `roster` (with `foster_consult`) supplies initials for claims.
- `sick-injured.html` sync additionally sends `diagnosed` and `plan_line` (assessment text, DDx
  lines excluded) and first-seen time. **`processing.html` also sends `diagnosed`** (problem titles +
  UV lamp result, per section 7). Surgery tool unchanged.

## 9. Build stages (each releasable on its own)
1. Time-based triage, red flags, Vet desk queue, claim, unseen alerts, shift-change sweep, **memo
   tick-off**, the **nurse requests board** (vaccination) and **nurse treatment reminders**.
2. Surveillance: `locations`, heat map, ranked signs, snapshots/baseline, Export report.
3. Auto plan line on the Floor + vet-diagnosed sync from Sick & Injured.
4. Rounds list with auto-memo, handover summary, isolation board.

## 10. Testing
Real-Postgres (PGlite) check of every migration incl. RLS; browser tests with a stubbed Supabase
client for each view; a short trial on live Supabase with fake animals before each stage goes to
the floor; verifier for the "DDx ignored" rule and the rate calculation against hand-worked examples.

## 11. Open questions
1. Confirm the routine colours: normal under 24 h, amber 24–48 h, red from 48 h.
2. Should **UV positive** count as ringworm in the surveillance rate, or stay a separate "RW (UV+)" tag?
3. Red-flag list wording; how long a case can sit unseen before it alerts (red-flag cases: 2 h).
4. Any other nurse tasks beyond vaccination and ward treatments.
5. **How vets request a nurse treatment:** (a) a form on the Vet desk, (b) a button inside Sick &
   Injured / Processing pre-filled with ID and location, or (c) both, starting with (a).
6. Roster initials import is a separate small task (screenshot pending).
