// Vet board: a case flagged again for a different reason lists every reason on its card.
const { open } = require('./harness');
const t = require('./check')('extra-reasons-vets');
(async () => {
  const seed = { tasks: [{ id: 'x1', title: 'R-1', location: 'Pound 2 / 20', shift: 'sick_injured', type: 'shelter', urgency: 'routine', done: false, condition: 'vomiting', problem: 'twice', created_at: new Date(Date.now() - 3600e3).toISOString(),
    extra_reasons: [{ at: new Date().toISOString(), by: 'Shelter Staff', condition: 'diarrhoea', problem: 'watery since lunch', red_flags: [], urgency: 'routine' }] }] };
  const v = await open(seed, 'vets.html');
  try {
    const card = (await v.page.textContent('.attn-item[data-id="x1"]')).replace(/\s+/g, ' ');
    t.ok(/also flagged/i.test(card) && /GI signs/.test(card) && /watery since lunch/.test(card), 'the vet card lists the extra reason: ' + card.slice(0, 220));
    t.ok(/GI signs/.test(card) && /twice/.test(card) && !/Vomiting|Diarrhoea/.test(card), 'and shows the first reason in full (old vomiting key reads as GI signs + detail)');
    // sign groups: a two-group card lists both labels; an old single key reads as its group
    const seedG = { tasks: [
      { id: 'g1', title: 'G-1', location: 'Pound 2 / 3', shift: 'sick_injured', type: 'shelter', urgency: 'routine', done: false, conditions: ['gi', 'urinary'], condition: 'gi', created_at: new Date(Date.now() - 3600e3).toISOString() },
      { id: 'g2', title: 'G-2', location: 'Pound 2 / 4', shift: 'sick_injured', type: 'shelter', urgency: 'routine', done: false, condition: 'vomiting', created_at: new Date(Date.now() - 3600e3).toISOString() }] };
    const v2 = await open(seedG, 'vets.html');
    try {
      const c1 = (await v2.page.textContent('.attn-item[data-id="g1"]')).replace(/\s+/g, ' ');
      const c2 = (await v2.page.textContent('.attn-item[data-id="g2"]')).replace(/\s+/g, ' ');
      t.ok(/GI signs, Urinary signs/.test(c1), 'a card with two groups shows both labels: ' + c1.slice(0, 160));
      t.ok(/GI signs/.test(c2) && !/Vomiting/.test(c2), 'a legacy vomiting card shows GI signs');
      t.ok(v2.errors.length === 0, 'no page errors: ' + v2.errors.join('; '));
    } finally { await v2.browser.close(); }
    t.ok(v.errors.length === 0, 'no page errors: ' + v.errors.join('; '));
  } finally { await v.browser.close(); }
  t.done();
})();
