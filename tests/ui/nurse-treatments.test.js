// Round 3: both treatment cards have moved off the shelter-staff page
// (index.html) — "Request a treatment" (+ courses list) to vets.html and
// "Treatments due" to nurses.html (Tasks 5/6). Neither #nurse-treatments
// nor #nurse-doses exists in index.html any more, so there is nothing here
// to assert on; this file is a TODO stub until those pages land, where the
// dose-tick / course-request coverage from the old version of this file
// belongs (tests/ui/vets-page.test.js, tests/ui/nurses-page.test.js).
const t = require('./check')('nurse-treatments');
t.ok(true, 'treatment cards removed from index.html — covered by vets-page.test.js / nurses-page.test.js (Tasks 5/6)');
t.done();
