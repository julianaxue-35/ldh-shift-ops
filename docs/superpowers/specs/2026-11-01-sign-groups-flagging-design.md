# Sign groups for flagging animals — design

Date: 2026-11-01. Author: Juliana (decisions) / Claude (write-up). Status: draft for review.

## Intent
Shelter staff flag animals for a vet from `index.html` ("Send a request" → Vets). Today they pick ONE "Suspected condition" from a short dropdown (cat flu, kennel cough, diarrhoea, vomiting, eye, skin, wounds, other, plus the separate cat-birthing option). Real animals often show signs from more than one body system, and the list misses whole systems (urinary, MSK, neuro, ears, neonatal). Replace it with **sign groups by body system**, tickable more than once per animal, so the disease-tracking graphs reflect what staff actually see.

## Goals
- Staff can tick several sign groups on one flag.
- Groups are organised by system, with a few example signs in each label so staff know what belongs.
- The disease-tracking graphs, heat map, stats CSV and vet/nurse/shelter-board cards all count and show the NEW groups.
- Old flags still open and display correctly (nothing silently fails to load).
- A collapsible "differentials" reference per group that staff can read but that does not bloat the picker.

## Non-goals
- No urgent tier and no "emergency banner" for these signs. The form already has an Emergency signs section (red-flag chips) and an urgency picker; anything emergent is brought to the clinic through those. Do not duplicate it.
- No "general/systemic" group. Lethargy, weight loss, "not right" go in **Other** (free text). Staff find system-grouping them too hard.
- No separate reproductive group. The existing **Cat birthing — urgent check** option stays as it is (not a surveillance condition).
- No treatment advice anywhere. Differentials only; no fracture/neoplasia listed by default.
- No per-sign (individual sign) storage. Staff tick groups; specific signs go in the existing free-text "Reason / clinical notes".

## The groups (decided)
Keys are stored values. Order = display order.

| Key | Label (picker) | Example signs shown in label / help |
|---|---|---|
| `respiratory` | Respiratory signs | sneezing, nasal/eye discharge, coughing (incl. honking cough), retching after coughing, laboured/open-mouth/noisy breathing |
| `gi` | GI signs (incl. mouth) | vomiting, diarrhoea, blood/mucus in stool, straining, no stool for 3 days; drooling, pawing at mouth, dropping food, mouth ulcers, bad breath |
| `urinary` | Urinary signs | inappropriate elimination, blood spots in litter tray, frequent/infrequent urination, not urinating, straining or crying in tray, genital licking |
| `skin` | Skin signs | lesions, itchiness, hair loss, scabs, redness, ringworm-like circles, fleas/parasites seen |
| `msk` | MSK signs | limping, not walking normally, stiffness, reluctant to jump, swollen joints |
| `neuro` | Neurological signs | tremors, seizures, head tilt, circling, wobbling, bumping into things, facial twitching |
| `eyes` | Eye signs | discharge, squinting, redness, cloudy eye, third eyelid showing, swelling |
| `ears` | Ear signs | head shaking, scratching, discharge, smell, head tilt, swelling |
| `wounds_pain_swelling` | Wounds / pain / swelling | bite wounds, abscess, lumps, swollen limbs, painful belly, bleeding, bruising, petechiae |
| `neonatal` | Kitten / puppy (neonatal) signs | fading, not nursing, cold, crying constantly. Show only for young animals if age is known; otherwise always show |
| `other` | Other | anything else, incl. lethargy, weight loss, "not right" |

One **Respiratory signs** group covers cat flu, kennel cough and lower-respiratory signs (Juliana, 1 Nov: animal attendants can only flag signs, they cannot diagnose cat flu or kennel cough). No species gating is needed for it.

Existing, unchanged: `cat_birthing` (picker option + birthing-reason sub-select; not counted in surveillance). "None / not sure" = no ticks.

## Display order
The order shown on the flag form is not the table order above (that order, `SIGN_GROUPS`, still drives colours, primary condition and the SQL trigger). The form shows **Respiratory, GI, Wounds / pain / swelling** first, always; the other groups follow by how often they were reported in the last 90 days (from `flag_history`, most reported first, ties in table order); **Other** is always last. The count is computed passively, at most once a day per device (one paged read, only the needed columns, practice animals skipped), stored in the browser (`ldh:signOrder:v1`) and applied at the next page load, so chips never move while someone is using the form. If the read fails the default or previous order is kept. A stored order missing a group or holding an unknown key is repaired so all 11 always show.

## Behaviour
- Picker is a tick list (chips or checkboxes), one chip per group. It replaces the single `<select id="req-condition">`. Cat birthing stays reachable (builder: keep it as a separate control or a distinguished chip; ticking it keeps today's behaviour exactly).
- Each group has a small "differentials" disclosure (collapsed by default). Content is a short list of differentials only, per group. Draft content is written by Claude and signed off by Juliana before release; mark it "for reference, not a diagnosis".
- A flag can carry 0..n groups. Everything that used to read a single `condition` now reads a list.
- If the same animal is flagged again in the same pen, the existing "extra reason" merge still applies; groups from the new flag are added to the case's list (no duplicates).

## Data and compatibility (decided direction; details to builder)
- Add a list column (e.g. `tasks.conditions text[]`), keep the existing `condition` column as the first/primary group so older readers and old rows keep working. Update the `condition` check constraint to allow the new keys AND the legacy keys.
- Old data is KEPT, never wiped or rewritten (Juliana, 1 Nov). Stored rows keep their raw keys; the old categories are removed from the picker, and at READ time they fold into the new groups (Juliana, 1 Nov): `cat_flu` and `kennel_cough` → `respiratory`, `vomiting` and `diarrhoea` → `gi`, `eye_condition` → `eyes`, `skin_condition` → `skin`, `wounds_injury` → `wounds_pain_swelling`, `other` → `other`. A past animal with both vomiting and diarrhoea is one GI case. Load-time normalisation: an old row with only `condition` is read as `conditions = [condition]`.
- Respiratory is read per species. The existing Cats / Dogs / Rabbits tabs of the surveillance board already separate it; all-species exports (stats CSV) get a Species column derived from the room.
- Surveillance (graphs, heat map, donut, snapshots table, `flag_history`, stats CSV) counts by the 11 groups, old and new flags alike. Old `surveillance_snapshots` rows are left as they are (they only count baseline nights). Card text for an old flag now says the group name (e.g. "GI signs") instead of "Vomiting"; the original wording stays in the flag's notes.
- Stay within the Supabase FREE plan: no new tables if avoidable, no heavier queries than today.

## Anti-goals (would make this a failure even if it technically works)
- Old flags or past graph data silently disappearing or showing raw keys.
- The picker getting so long staff stop using it.
- A second, different urgent/emergency mechanism.
- Any treatment or "recommended action" text in the differentials.

## Left to the builder
- Chip layout, neonatal age gating, exact wording of group help text (keep the example signs above), colours (surveillance has a fixed per-condition colour order; extend it for the new groups without changing existing colours more than needed).
- Migration SQL, test updates, `APP_VERSION`/cache-tag bumps, FAQ text updates (`index.html`, `nurses.html`, `vets.html` mention "Suspected condition").
- Where legacy categories sit in chart order/colours (suggest after the new groups, existing colours kept).
- Differentials draft content for Juliana to review.

## Delivery
Branch off the current work, PR for review. Juliana runs the migration (copy it to the clipboard when giving it to her) and redeploys nothing else unless the Edge Function changes.

## Calls made after the builder check (Claude's calls, to be confirmed)
- **Primary `condition`** = the first group in display order among those ticked (deterministic). Old pages that still send one `condition` keep working; legacy keys stay allowed in the constraint permanently.
- **Other tools:** the Edge Function `flag_check` returns `condition` to the offline Sick & Injured tool (`ldh-shift-tools/sick-injured.html` prints it in the consult note). So the function also returns `conditions`, and S&I gets the label map so a new key never shows raw (e.g. "gi"). That is a second PR in `ldh-shift-tools` plus an Edge Function redeploy (paste whole file). Processing and Surgery do not use the dashboard `condition`.
- **Counting:** "any" stays distinct animal+group cases, as today; an animal with two groups counts once under each group.
- **Editing:** groups are only added (re-flag merge), never removed; vets don't edit them. The count for a past day is whatever was flagged that day.
- **Cat birthing** stays a separate control and may be combined with ticked groups; its urgent behaviour is unchanged, and the ticked groups still count.
- **Delivery order:** run the migration first, then merge the front end; the mixed old/new page period is safe because old pages only send a legacy `condition`. Past surveillance data is left as is (no backfill).
