/* LDH Shift Ops: the Behaviour team's plan, fed back to the page that asked (2026-10-22).
   A task given to Behaviour from the Vets page (or a vet's shift tool) is fed back on the Vets page; one given from the Nurses page
   is fed back on the Nurses page. While it is open the card says where it is up to; when Behaviour ticks Done, the plan (their note,
   who and when) shows for 24 hours (the database removes finished tasks then) and the page rings. Never reads the attached medical note.
   BehaviourFeedback.mount(el, { sb, role:'vets'|'nurses', onDone(newlyDoneRows) }) -> { refresh() } */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.BehaviourFeedback = factory(root);
})(typeof self !== 'undefined' ? self : this, function (g) {
  var esc = function (x) { return String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var COLS = 'id,created_at,kind,animal_id,location,lane,status,done_at,done_note,done_by,flagged_by,requested_by_role';
  var DAY = 24 * 3600 * 1000;
  function where(r) {
    var L = g.LDHLogic;
    return r.lane === 'incoming' ? 'waiting to be picked up by the Behaviour team' : 'with the ' + String((L.BEHAVIOUR_LANES && L.BEHAVIOUR_LANES[r.lane]) || r.lane).toLowerCase();
  }
  function html(rows, now) {
    var L = g.LDHLogic, hm = function (iso) { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };
    var done = rows.filter(function (r) { return r.status === 'done' && now - new Date(r.done_at || r.created_at).getTime() <= DAY; })
      .sort(function (a, b) { return new Date(b.done_at || 0) - new Date(a.done_at || 0); });
    var open = rows.filter(function (r) { return r.status === 'open'; }).sort(function (a, b) { return new Date(a.created_at) - new Date(b.created_at); });
    if (!done.length && !open.length) return '';
    var kind = function (r) { return esc((L.BEHAVIOUR_KINDS && L.BEHAVIOUR_KINDS[r.kind]) || r.kind); };
    return '<h2>Behaviour team plans</h2><p class="subtle" style="margin:-8px 0 8px;">What the Behaviour team decided for the animals you asked about. Plans stay here for 24 hours.</p>'
      + done.map(function (r) {
        return '<div class="bf-row bf-done" data-id="' + esc(r.id) + '" style="padding:8px 0;border-top:1px solid var(--border);"><div class="aname" style="font-size:0.92rem;"><b>' + esc(r.animal_id) + '</b> <span class="ameta">' + esc(r.location) + ' · ' + kind(r)
          + ' · done' + (r.done_by ? ' by ' + esc(r.done_by) : '') + (r.done_at ? ' at ' + esc(hm(r.done_at)) : '') + '</span></div>'
          + '<div class="bf-plan" style="margin-top:4px;padding:8px 10px;border-radius:8px;background:rgba(124,92,191,.10);border-left:4px solid #7c5cbf;white-space:pre-wrap;">' + (r.done_note ? esc(r.done_note) : '<i>No note was written.</i>') + '</div></div>';
      }).join('')
      + open.map(function (r) {
        return '<div class="bf-row bf-open" data-id="' + esc(r.id) + '" style="padding:8px 0;border-top:1px solid var(--border);"><b>' + esc(r.animal_id) + '</b> <span class="ameta">' + esc(r.location) + ' · ' + kind(r) + ' · ' + esc(where(r)) + (r.flagged_by ? ' · asked by ' + esc(r.flagged_by) : '') + '</span></div>';
      }).join('');
  }
  function mount(el, cfg) {
    var seen = null;   // ids of finished tasks already noticed; the first load only fills it, so nothing old rings
    function refresh() {
      return Promise.resolve(cfg.sb.from('behaviour_tasks').select(COLS).eq('requested_by_role', cfg.role).order('created_at', { ascending: true })).then(function (res) {
        if (!res || res.error) { el.style.display = 'none'; return; }   // the database update has not been run yet
        var rows = res.data || [], now = Date.now();
        var doneIds = rows.filter(function (r) { return r.status === 'done' && now - new Date(r.done_at || r.created_at).getTime() <= DAY; }).map(function (r) { return r.id; });
        if (seen === null) seen = new Set(doneIds);
        else {
          var fresh = rows.filter(function (r) { return doneIds.indexOf(r.id) !== -1 && !seen.has(r.id); });
          doneIds.forEach(function (id) { seen.add(id); });
          if (fresh.length && cfg.onDone) cfg.onDone(fresh);
        }
        var h = html(rows, now);
        el.innerHTML = h; el.style.display = h ? '' : 'none';
      }, function () { el.style.display = 'none'; });
    }
    return { refresh: refresh };
  }
  return { mount: mount, html: html };
});
