# Tests (dev only)
- Node suites: `logic`, `migration`, `round3-migration`, `scheduled-arrival-migration`, `surveillance-migration`, `consistency`, `surveillance-view`, `admission-aa-migration` (all in `tests/*.test.mjs`). `node --test tests/*.test.mjs` runs them all.
- The four migration suites (`migration`, `round3-migration`, `scheduled-arrival-migration`, `surveillance-migration`) need PGlite (`cd tests && npm install` once).
- Browser (`tests/ui/*.test.js`): needs Playwright. On Juliana's Mac it is at
  `~/.npm/_npx/e41f203b7505f1fb/node_modules` (find with `find ~/.npm/_npx -maxdepth 4 -iname playwright -type d`).
  Run: `NODE_PATH=<that path> node tests/ui/run-all.js`, or
  `NODE_PATH=<that path> node --test tests/ui/*.test.js`.
  Covers all three dashboard pages — `index.html` (shelter staff), `vets.html` and `nurses.html` — plus `stats.html`:
  `ops-core.test.js` (shared login/passcode/nav helper), `vets-page.test.js`, `nurses-page.test.js`, `stats-page.test.js`,
  and the shelter-staff/shared-behaviour suites `flag-form.test.js`, `vet-board.test.js`, `nurse-requests.test.js`,
  `nurse-treatments.test.js`, `disease-watch.test.js`, `memos.test.js`, and the Admission AA suites `admission-aa.test.js` and `nurses-send-aa.test.js`.
Never point tests at the live Supabase project; the browser tests use an in-memory stub.
- Behaviour page (Oct 21): `behaviour-logic` + `behaviour-migration` (node), and UI `behaviour-page`, `behaviour-vet-request`, `staff-behaviour-bar`, `staff-initials`, `behaviour-board`, `task-for-behaviour`, `behaviour-mobile`.
- Behaviour Phase B (Oct 21): `behaviour-attached-note-migration` + `behaviour-edge-validate` (node), UI `behaviour-attached-note`, `faq-phase-b`. The tools side (`ldh-shift-tools`) has `behaviour-send.test.mjs` and `behaviour-send-ui.test.js`.
- One request card (Oct 21): UI `send-request-card` (tabs, same field order, Vet clinic); `staff-initials`, `staff-behaviour-bar`, `nurse-requests` updated for the tabs.
- Request card categories (Oct 22): UI `send-request-categories` (Other for vets, one-animal nurse tasks, vaccination only on arrival); `behaviour-alert` and `vets-behaviour-alert` (banner, sound and tab flash).
- Counts survive deletion (Oct 22): node `done-counts-migration` (0030: nurse task log + 24 h clean-up, Behaviour done log, both counts-only), `behaviour-logic` (behaviourStats); UI `behaviour-stats` (ring and totals).
- Dispense medication + one nurse box (Oct 22): node `dispense-migration` (0031); UI `send-request-categories` (staff Nurses tab = vaccination only; vets-page Dispense medication), `nurse-ask-vet` / `send-card-pages` (one box above the nurse columns).
- Behaviour trainer lane + page passcode (Oct 22): node `behaviour-passcode-migration` (0032), `behaviour-logic` (lane choices); UI `behaviour-trainer` (lane, move, add, passcode gate); `behaviour-page`, `behaviour-attached-note` updated for the trainer option. The test harness knows a seeded `behaviour` passcode.
- Completed lists (Oct 22): node `behaviour-completed-migration` (0033: finished cases kept 24 h); UI `completed-put-back` (Behaviour Completed list + Put back; Nurses Put back).
- Behaviour plans fed back (Oct 22): UI `behaviour-feedback` (vets / nurses cards, ring on Done, requester stamped by every sender); node `behaviour-edge-validate` (row carries requested_by_role); migration 0034.
- Shared card on the other pages (Oct 22): `lib/send-card.js`; UI `send-card-pages` (field order on Vets and Nurses pages), `behaviour-vet-request`, `nurse-ask-vet`, `task-for-behaviour`, `vet-initials`, `vet-nurse-pen`, `vets-new-task-first` rewritten for it.
