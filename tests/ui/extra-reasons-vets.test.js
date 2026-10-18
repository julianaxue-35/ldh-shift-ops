// Vet board: a case flagged again for a different reason lists every reason on its card.
const { open } = require('./harness');
const t = require('./check')('extra-reasons-vets');
(async () => {
  const seed = { tasks: [{ id: 'x1', title: 'R-1', location: 'Pound 2 / 20', shift: 'sick_injured', type: 'shelter', urgency: 'routine', done: false, condition: 'vomiting', problem: 'twice', created_at: new Date(Date.now() - 3600e3).toISOString(),
    extra_reasons: [{ at: new Date().toISOString(), by: 'Shelter Staff', condition: 'diarrhoea', problem: 'watery since lunch', red_flags: [], urgency: 'routine' }] }] };
  const v = await open(seed, 'vets.html');
  try {
    const card = (await v.page.textContent('.attn-item[data-id="x1"]')).replace(/\s+/g, ' ');
    t.ok(/also flagged/i.test(card) && /Diarrhoea/i.test(card) && /watery since lunch/.test(card), 'the vet card lists the extra reason: ' + card.slice(0, 220));
    t.ok(/Vomiting/.test(card) && /twice/.test(card), 'and shows the first reason in full (suspected condition + detail)');
    t.ok(v.errors.length === 0, 'no page errors: ' + v.errors.join('; '));
  } finally { await v.browser.close(); }
  t.done();
})();
