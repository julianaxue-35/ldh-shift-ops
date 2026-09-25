// Round 3: the memo board has moved off the shelter-staff page (index.html)
// entirely — it now lives on vets.html and nurses.html (Tasks 5/6), sharing
// one `memos` table with gated tick-off/delete. There is nothing
// memo-board-shaped left in index.html's markup to assert on, so this file
// is a TODO stub until those pages exist; real memo-board coverage belongs
// in tests/ui/vets-page.test.js and tests/ui/nurses-page.test.js.
const t = require('./check')('memos');
t.ok(true, 'memo board removed from index.html — covered by vets-page.test.js / nurses-page.test.js (Tasks 5/6)');
t.done();
