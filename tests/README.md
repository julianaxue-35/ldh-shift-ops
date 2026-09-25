# Tests (dev only)
- Node suites: `logic`, `migration`, `round3-migration`, `scheduled-arrival-migration`, `surveillance-migration`, `consistency`, `surveillance-view` (all in `tests/*.test.mjs`). `node --test tests/*.test.mjs` runs them all.
- The four migration suites (`migration`, `round3-migration`, `scheduled-arrival-migration`, `surveillance-migration`) need PGlite (`cd tests && npm install` once).
- Browser (`tests/ui/*.test.js`): needs Playwright. On Juliana's Mac it is at
  `~/.npm/_npx/e41f203b7505f1fb/node_modules` (find with `find ~/.npm/_npx -maxdepth 4 -iname playwright -type d`).
  Run: `NODE_PATH=<that path> node tests/ui/run-all.js`, or
  `NODE_PATH=<that path> node --test tests/ui/*.test.js`.
  Covers all three dashboard pages — `index.html` (shelter staff), `vets.html` and `nurses.html` — plus `stats.html`:
  `ops-core.test.js` (shared login/passcode/nav helper), `vets-page.test.js`, `nurses-page.test.js`, `stats-page.test.js`,
  and the shelter-staff/shared-behaviour suites `flag-form.test.js`, `vet-board.test.js`, `nurse-requests.test.js`,
  `nurse-treatments.test.js`, `disease-watch.test.js`, `memos.test.js`.
Never point tests at the live Supabase project; the browser tests use an in-memory stub.
