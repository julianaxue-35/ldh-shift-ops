# Tests (dev only)
- Node suites: `logic`, `migration`, `surveillance-migration`, `consistency`, `surveillance-view` (all in `tests/*.test.mjs`). `node --test tests/*.test.mjs` runs them all.
- The two migration suites need PGlite (`cd tests && npm install` once).
- Browser: needs Playwright. On Juliana's Mac it is at
  `~/.npm/_npx/e41f203b7505f1fb/node_modules` (find with `find ~/.npm/_npx -maxdepth 4 -iname playwright -type d`).
  Run: `NODE_PATH=<that path> node tests/ui/run-all.js`
Never point tests at the live Supabase project; the browser tests use an in-memory stub.
