# The one request card on the Vets, Nurses and Behaviour pages

Date: 2026-10-22 · Builds on `2026-10-21-one-request-form-design.md` (staff page card, merged).

Every page now asks for a request the same way: **What**, animal ID, space, pen / detail, needed within, extras, reason / note, **Send**. One shared file, `lib/send-card.js`, draws it.

| Page | Card | Tabs | Replaces |
|---|---|---|---|
| Vets | inline, top of the page | Nurses, Behaviour | "Request a treatment to nurse", "Request a nurse task", "Task for behaviour" |
| Nurses | **Send a request** button per column opens it in a window (initials come from that column) | Vets, Behaviour | "Task for vets", "Task for behaviour" |
| Behaviour | inline, top of the page | Vets | the "Request to vets" banner |

Categories (What): Nurses tab = Treatment course (times a day, days, start) + one-animal tasks (blood, ear swab, FIV, cat in fluids IVFT, microchip, UV, treatment check, other). Vets tab from nurses = task for the vets (needs a note) / interpret results / upload results; from behaviour = shelter stress medication / post adoption med pack / other, with a Courthold tick. Behaviour tab = the five behaviour kinds.

Initials are required on these pages (the receiving team sees who asked). Vet clinic / Offsite / Pathway take a detail instead of a pen. A request to the vets goes through `OpsCore.sendTaskToVets` (reopens or adds to an existing case for the same animal and pen). The old `Task for behaviour` window in `ops-core.js` is gone.

No database change. The shelter staff page keeps its own inline copy of the card (initials optional for Vets and Nurses there).
