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
   numbers, plan line is a short excerpt only. Council-seized animals: plan line hidden on the Floor
   (default, to be confirmed).
3. **Emergencies are radioed.** The board is not the emergency channel; it must say so.
4. **Never block a vet.** Anything optional (diagnosis tag, rounds flag) must not gate closing a case.
5. **Data before thresholds.** No high/outbreak cut-offs until a baseline exists.

## 3. Triage
Two time-based tiers replace Urgent / Soon / Routine:

- **Check within 12 hours** — any red flag ticked (not eating, laboured breathing, bleeding, can't
  stand, repeated vomiting; list editable).
- **Can wait 24–48 hours** — no red flags.

Each case stores `due_by` (12 h, or 48 h, from flagging). Cards show a countdown; amber when short,
red when overdue. Overdue cases sort to the top and appear in the shift-change sweep.
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

## 7. Disease surveillance
**Locations** live in a `locations` table (name, group, cages), seeded from the Summer Peak workbook
(CB, 23 Aug 2026): Cat Room 1/2/3/FIR = 30/24/10/32; Cat Adoptions 1/2 = 16/16; Cat Isolation ward = 6;
Pound 1/2/3/4 = 30/26/60/9; Dog Transport = 10. Groups: Cat rooms, Cat adoption, Isolation, Pounds,
Transport.

**Two layers, kept separate:**
1. **Reported signs** (chosen at flagging): cat flu signs (URI), kennel cough, diarrhoea / GI upset,
   vomiting, eye condition, skin condition, wounds / injury, other. (Giardia etc. are diagnoses, not
   signs, so they are not offered here.)
2. **Vet-diagnosed conditions**, read from Sick & Injured **Assessment lines only**: Giardia,
   FURI / FURTI, RW (ringworm), CIRDC / KC. **Any line containing "DDx" is ignored** (a skin-lesion
   differential must not count as ringworm). Diarrhoea and vomiting are not read here. Parvo /
   panleukopenia can be added to the list later.

**Rate:** per space and per sign = distinct animals reported in the last N days (default 7) ÷ cages,
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
- New `locations`, `nurse_requests`, `surveillance_snapshots`.
- `memos`: add `done`, `done_at`, `source` (e.g. rounds); add UPDATE/DELETE policies (currently
  select/insert only).
- Nightly `pg_cron` snapshot job (Melbourne time; cron runs in UTC).
- Roster: existing `roster` (with `foster_consult`) supplies initials for claims.
- `sick-injured.html` sync additionally sends `diagnosed` and `plan_line` (assessment text, DDx
  lines excluded) and first-seen time. Processing and Surgery tools unchanged.

## 9. Build stages (each releasable on its own)
1. Time-based triage, red flags, Vet desk queue, claim, unseen alerts, shift-change sweep, **memo
   tick-off**, and the **nurse requests board**.
2. Surveillance: `locations`, heat map, ranked signs, snapshots/baseline, Export report.
3. Auto plan line on the Floor + vet-diagnosed sync from Sick & Injured.
4. Rounds list with auto-memo, handover summary, isolation board.

## 10. Testing
Real-Postgres (PGlite) check of every migration incl. RLS; browser tests with a stubbed Supabase
client for each view; a short trial on live Supabase with fake animals before each stage goes to
the floor; verifier for the "DDx ignored" rule and the rate calculation against hand-worked examples.

## 11. Open questions
- Council-seized animals: confirm plan line is hidden on the Floor.
- "Reported in the last 7 days" window — confirm after baseline data exists.
- Red-flag list wording, and unseen-too-long thresholds.
- Which other nurse tasks (if any) should reuse the requests board.
- Roster initials import is a separate small task (screenshot pending).
