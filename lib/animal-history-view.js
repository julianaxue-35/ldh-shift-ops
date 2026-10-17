/* LDH Shift Ops — "Animal history" lookup (2026-10-17). Type an animal ID, see everything flagged for it in the last
   3 months: problem, suspected condition, outcome, treatment, plan and vet note. Browser: global AnimalHistoryView.
   Node: module.exports (html() only). Queries the database directly — the pages' cached task list only holds the
   newest rows, so an animal flagged days ago would otherwise be missing. */
(function (root, factory) {
  const logic = (typeof module === 'object' && module.exports) ? require('./ldh-logic.js') : root.LDHLogic;
  if (typeof module === 'object' && module.exports) module.exports = factory(logic);
  else root.AnimalHistoryView = factory(logic);
})(typeof self !== 'undefined' ? self : this, function (L) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TYPE_LABELS = { shelter: 'Shelter request', foster: 'Foster request', rescue: 'Rescue request', medication: 'Medication' };
  const day = iso => new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  const time = iso => new Date(iso).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
  const line = (label, v) => (v && String(v).trim()) ? `<div class="ah-line"><b>${label}:</b> ${esc(v)}</div>` : '';

  function outcome(e) {
    if (e.fromLogOnly) return 'Case record no longer held — only the date, place and reason were kept.';
    if (e.stage === 'completed') return 'Completed ' + (e.completed_at ? day(e.completed_at) : '') + (e.needs_medication && e.med_done_by ? ' — meds by ' + e.med_done_by : '');
    if (e.stage === 'waiting_medication') return 'Vet check done — waiting on medication';
    if (e.stage === 'picked_up') return 'Picked up by a vet — not finished yet';
    return 'Still open — waiting for a vet';
  }

  function entryHtml(e) {
    const loc = L.OFFSITE_NAMES.includes(e.location) && e.location_detail ? e.location + ' — ' + e.location_detail : e.location;
    const signs = (e.red_flags || []).map(k => L.signLabel(k)).join(', ');
    return `<div class="ah-entry">
      <div class="ah-head"><b>${esc(e.title)}</b> · flagged ${esc(day(e.flagged_at))}, ${esc(time(e.flagged_at))} · ${esc(loc || 'location not recorded')}${TYPE_LABELS[e.type] ? ' · ' + esc(TYPE_LABELS[e.type]) : ''}</div>
      ${line('Problem', e.problem)}
      ${e.condition ? line('Suspected condition', L.CONDITION_LABELS[e.condition] || e.condition) : ''}
      ${line('Emergency signs', signs)}
      <div class="ah-line"><b>Outcome:</b> ${esc(outcome(e))}</div>
      ${line('Treatment', e.treatment)}
      ${line('Plan', e.plan)}
      ${line('Vet note', e.note)}
    </div>`;
  }

  function html(entries, query) {
    if (!entries.length) return `<p class="empty-state">Nothing flagged for “${esc(query)}” in the last 3 months.</p>`;
    const n = entries.length;
    return `<p class="subtle" style="margin:0 0 10px;">${n} flag${n === 1 ? '' : 's'} in the last 3 months, newest first.</p>` + entries.map(entryHtml).join('');
  }

  // "%a%1%2%3%": tolerant of spaces/dashes in the stored ID; the exact match is then made in JS by LDHLogic.animalHistory.
  function likePattern(q) {
    return '%' + Array.from(L.normId(q)).map(c => c.replace(/[\\%_]/g, m => '\\' + m)).join('%') + '%';
  }

  async function lookup(sb, query) {
    const since = new Date(Date.now() - 92 * 86400000).toISOString();
    const pat = likePattern(query);
    const [tr, hr] = await Promise.all([
      sb.from('tasks').select('*').ilike('title', pat).gte('created_at', since).order('created_at', { ascending: false }).limit(200),
      sb.from('flag_history').select('*').ilike('title', pat).gte('flagged_at', since).order('flagged_at', { ascending: false }).limit(200)
    ]);
    if (tr.error) throw new Error(tr.error.message);
    return L.animalHistory(tr.data || [], hr.error ? [] : (hr.data || []), query, Date.now());
  }

  // Wires an input to a results box: looks up 350 ms after typing stops; a stale answer never overwrites a newer one.
  function attach(opts) {
    const input = opts.input, out = opts.out, card = opts.card;
    let timer = null, seq = 0;
    function run() {
      const q = input.value.trim(), my = ++seq;
      if (L.normId(q).length < 2) { if (card) card.style.display = 'none'; out.innerHTML = ''; return; }
      if (card) card.style.display = '';
      out.innerHTML = '<p class="subtle">Looking up…</p>';
      lookup(opts.sb(), q).then(entries => { if (my === seq) out.innerHTML = html(entries, q); })
        .catch(err => { if (my === seq) out.innerHTML = '<p class="empty-state">Could not look up that animal: ' + esc(err.message) + '</p>'; });
    }
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 350); });
    return { run };
  }

  return { html, entryHtml, likePattern, lookup, attach };
});
