// Vet board: Select all (everything, or one column) for batch pick-up, instead of ticking case by case.
const { open } = require('./harness');
const t = require('./check')('vets-select-all');
(async () => {
  const mk = (title, urgency, extra) => Object.assign({ title, location: 'Pound 1', shift: 'sick_injured', type: 'shelter', urgency, done: false, created_at: new Date().toISOString() }, extra || {});
  const seed = { tasks: [
    mk('E-1', 'red_flag'), mk('E-2', 'red_flag'),
    mk('U-1', 'urgent'), mk('U-2', 'urgent'), mk('U-3', 'urgent'),
    mk('R-1', 'routine'), mk('R-2', 'routine', { type: 'medication', needs_medication: true }),
    mk('P-1', 'urgent', { claimed_at: new Date().toISOString(), claimed_by: 'vet' })     // already picked up: cannot be selected again
  ] };
  const v = await open(seed, 'vets.html');
  try {
    const checks = async () => v.page.$$eval('.pickup-check:checked', cs => cs.length);
    const total = await v.page.locator('.pickup-check').count();
    t.ok(await v.page.isVisible('#select-all-btn') && /Select all/.test(await v.page.textContent('#select-all-btn')), 'a Select all button sits above the cases');
    t.ok(await v.page.locator('.pickup-check').count() === 6 || total >= 5, 'cases that can be picked up have tick boxes (' + total + ')');

    await v.page.click('#select-all-btn');
    t.ok(await checks() === total, 'Select all ticks every case that can be picked up: ' + await checks() + ' of ' + total);
    t.ok(await v.page.isVisible('#batch-pickup-bar') && (await v.page.textContent('#batch-pickup-count')) === String(total), 'the pick-up bar counts them: ' + await v.page.textContent('#batch-pickup-count'));
    t.ok(/Unselect all/.test(await v.page.textContent('#select-all-btn')), 'the button now offers to unselect');
    await v.page.click('#select-all-btn');
    t.ok(await checks() === 0 && await v.page.isHidden('#batch-pickup-bar'), 'pressing it again clears everything');

    // one column at a time
    const urgentCount = await v.page.locator('#board-urgent .pickup-check').count();
    await v.page.click('.col-select-all[data-col="board-urgent"]');
    t.ok(await v.page.locator('#board-urgent .pickup-check:checked').count() === urgentCount && await v.page.locator('#board-redflag .pickup-check:checked').count() === 0, 'a column\'s Select all ticks only that column (' + urgentCount + ')');
    await v.page.click('.col-select-all[data-col="board-redflag"]');
    t.ok(await checks() === urgentCount + await v.page.locator('#board-redflag .pickup-check').count(), 'columns add up');
    await v.page.locator('#board-urgent .pickup-check').first().uncheck();
    t.ok(/Select all/.test(await v.page.textContent('.col-select-all[data-col="board-urgent"]')) && !/Unselect/.test(await v.page.textContent('.col-select-all[data-col="board-urgent"]')), 'after unticking one, the column offers Select all again');

    // the type filter narrows what Select all means
    await v.page.click('#select-all-btn');                       // clear / set as needed
    await v.page.click('#select-all-btn');
    await v.page.click('#type-filter-bar [data-type="medication"]');
    await v.page.click('#select-all-btn');
    t.ok(await checks() === await v.page.locator('.pickup-check').count() && await checks() <= 1, 'with the Medication filter on, Select all only takes what is showing');
    t.ok(v.errors.length === 0, 'no page errors: ' + v.errors.join('; '));
  } finally { await v.browser.close(); }
  t.done();
})();
