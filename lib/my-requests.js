/* "My requests" at the top of every dashboard page (2026-11-25).
   My requests = what was sent under the initials in the box, over the last 7 days, from all five request tables. Open ones can be
   edited (the shared Edit box, request-edit.js). There are no replies. Read only when the window is opened, to save data.
   MyRequests.mount({ sb, initials: () => 'JX' | ['JX','AB'] }) */
(function (g) {
  'use strict';
  var esc = function (x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var cap = function (x) { x = String(x || '').replace(/_/g, ' '); return x.charAt(0).toUpperCase() + x.slice(1); };
  // sender: the column that holds who asked. text: what to show. done: finished or stopped. locked: picked up, so no editing.
  var SOURCES = [
    { table: 'tasks', to: 'Vets', sender: 'problem', animal: 'title', text: function (r) { return String(r.problem || '').replace(/\s*\(sent by [^)]*\)/i, ''); },
      done: function (r) { return !!r.done; }, locked: function (r) { return !!r.claimed_at; } },
    { table: 'nurse_requests', to: 'Nurses', sender: 'created_by', animal: 'animal_id', text: function (r) { return cap(r.kind) + (r.note ? ' — ' + String(r.note).replace(/(\s*—\s*)?sent by .*$/i, '') : ''); },
      done: function (r) { return (r.done_count || 0) >= (r.animal_count || 1); } },
    { table: 'noga_requests', to: 'Nurses', sender: 'added_by', animal: 'animal_id', text: function (r) { return cap(r.task) + (r.note ? ' — ' + r.note : ''); }, done: function (r) { return !!r.done; } },
    { table: 'nurse_treatments', to: 'Nurses', sender: 'requested_by', animal: 'animal_id', text: function (r) { return r.treatment; }, done: function (r) { return !!r.stopped; } },
    { table: 'behaviour_tasks', to: 'Behaviour', sender: 'flagged_by', animal: 'animal_id', text: function (r) { return cap(r.kind) + (r.reason ? ' — ' + r.reason : ''); },
      done: function (r) { return !!r.status && r.status !== 'open'; } }
  ];
  // exact match on the initials: "JX", "Shelter Staff (JX)" or "... (sent by JX)"
  function sentBy(source, row, ini) {
    var v = String(row[source.sender] || '').toUpperCase();
    if (source.table === 'tasks') return v.indexOf('(SENT BY ' + ini + ')') !== -1;
    return v === ini || v.indexOf('(' + ini + ')') !== -1;
  }

  var CFG = null, box = null;
  function who() {
    return [].concat(CFG.initials() || []).map(function (x) { return String(x || '').trim().toUpperCase(); }).filter(function (x, i, a) { return /^[A-Z]{1,4}$/.test(x) && a.indexOf(x) === i; });
  }
  function fetchAll(list) {
    var since = new Date(Date.now() - 7 * 86400000).toISOString(), jobs = [];
    SOURCES.forEach(function (s) {
      list.forEach(function (ini) {
        jobs.push(Promise.resolve(CFG.sb.from(s.table).select('*').ilike(s.sender, '%' + ini + '%').gte('created_at', since).order('created_at', { ascending: false }).limit(60))
          .then(function (r) { return { s: s, error: r.error, rows: (r.data || []).filter(function (row) { return sentBy(s, row, ini); }) }; }));
      });
    });
    return Promise.all(jobs);
  }
  var picked = '';   // when a page holds two different sets of initials (nurses), whose list is showing
  function paint() {
    if (!box) return;
    var body = box.querySelector('[data-body]'), all = who(), list = all.length > 1 ? [all.indexOf(picked) !== -1 ? picked : all[0]] : all;
    if (!list.length) { body.innerHTML = '<p>Type your initials in the initials box first, so your requests can be found.</p>'; return; }
    body.innerHTML = '<p>Loading…</p>';
    fetchAll(list).then(function (results) {
      if (!box) return;
      var items = [], failed = false, seen = {};
      results.forEach(function (res) {
        if (res.error) failed = true;
        res.rows.forEach(function (row) { var k = res.s.table + row.id; if (!seen[k]) { seen[k] = 1; items.push({ s: res.s, row: row }); } });
      });
      items.sort(function (a, b) { return (a.s.done(a.row) - b.s.done(b.row)) || String(b.row.created_at).localeCompare(String(a.row.created_at)); });
      var choose = all.length > 1 ? '<label class="mr-who">Whose requests? <select data-who>' + all.map(function (x) { return '<option' + (x === list[0] ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + '</select></label>' : '';
      body.innerHTML = choose + '<p class="mr-note">Sent as ' + esc(list[0]) + ' in the last 7 days.</p>'
        + (failed ? '<p class="mr-err">Some requests could not be loaded. Close this and try again.</p>' : '')
        + (items.map(function (it) {
          var done = it.s.done(it.row), locked = !done && it.s.locked && it.s.locked(it.row);
          var when = new Date(it.row.created_at).toLocaleString('en-AU', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
          return '<div class="mr-item"><div><b>' + esc(it.row[it.s.animal]) + '</b> · ' + esc(it.row.location || '') + ' <span class="mr-tag">' + it.s.to + '</span> <span class="mr-tag ' + (done ? 'done' : 'wait') + '">'
            + (done ? 'Done' : locked ? 'Picked up' : 'Waiting') + '</span></div><div>' + esc(it.s.text(it.row)) + '</div><div class="mr-note">' + esc(when) + '</div>'
            + (!done && !locked && g.RequestEdit ? g.RequestEdit.btn(it.s.table, it.row.id, 'Edit') : '') + '</div>';
        }).join('') || (failed ? '' : '<p>Nothing sent under these initials yet.</p>'));
    }, function () { if (box) body.innerHTML = '<p class="mr-err">No connection. Close this and try again.</p>'; });
  }
  function close() { if (box) { box.remove(); box = null; } }
  function openMine() {
    close();
    box = g.document.createElement('div'); box.className = 'mr-overlay';
    box.innerHTML = '<div class="mr-card" role="dialog" aria-label="My requests"><div class="mr-head"><h2>My requests</h2><button type="button" class="secondary" data-close>Close</button></div><div data-body></div></div>';
    box.addEventListener('click', function (e) { if (e.target === box || e.target.closest('[data-close]')) close(); });
    box.addEventListener('change', function (e) { if (e.target.matches('[data-who]')) { picked = e.target.value; paint(); } });
    g.document.body.appendChild(box);
    paint();
  }
  var CSS = '.mr-bar{margin:0 0 16px}.mr-bar button{width:100%;margin:0;padding:15px 10px;font-size:1rem;font-weight:800;border-radius:12px;cursor:pointer;border:1.5px solid #1E2238}.mr-who{display:flex;gap:8px;align-items:center;font-weight:700}.mr-who select{width:auto;margin:0}'
    + '.mr-bar button{background:#fff;color:#1E2238}'
    + '.mr-overlay{position:fixed;inset:0;z-index:9000;background:rgba(30,34,56,.45);display:flex;justify-content:center;align-items:flex-start;padding:24px 12px;overflow:auto}'
    + '.mr-card{background:#fff;color:#1E2238;border-radius:14px;padding:18px;width:100%;max-width:560px}.mr-head{display:flex;justify-content:space-between;align-items:center;gap:10px}.mr-head h2{margin:0;font-size:1.15rem}.mr-head button{width:auto;margin:0}'
    + '.mr-item{border-top:1px solid rgba(30,34,56,.12);padding:10px 0;overflow-wrap:anywhere}.mr-item button{width:auto;margin:6px 0 0}.mr-note{color:#6B7280;font-size:.8rem}.mr-err{color:#D03B3B}'
    + '.mr-tag{display:inline-block;border-radius:6px;padding:0 7px;font-size:.72rem;font-weight:700;background:#eef0fb}.mr-tag.wait{background:#fff1de;color:#8a5000}.mr-tag.done{background:#e3f4ea;color:#1c7a4c}';

  function mount(cfg) {
    CFG = cfg;
    var doc = g.document, main = doc.querySelector('main');
    if (!main || doc.querySelector('.mr-bar')) return;
    var st = doc.createElement('style'); st.textContent = CSS; doc.head.appendChild(st);
    var bar = doc.createElement('div'); bar.className = 'mr-bar';
    bar.innerHTML = '<button type="button" data-mr="mine">My requests</button>';
    var head = main.querySelector('.page-head');
    if (head && head.parentNode === main) main.insertBefore(bar, head.nextSibling); else main.insertBefore(bar, main.firstChild);
    var button = bar.firstChild;
    button.addEventListener('click', openMine);
    // the button names whose list it is, so a shared tablet shows at once when the initials are someone else's
    var label = function () { var list = who(); button.textContent = 'My requests' + (list.length ? ' (' + list.join(', ') + ')' : ''); };
    doc.addEventListener('input', label); doc.addEventListener('change', label); label(); g.setTimeout(label, 600);
    // after the Edit box closes, show the saved version
    new g.MutationObserver(function (list) {
      list.forEach(function (m) { Array.prototype.forEach.call(m.removedNodes, function (n) { if (n.classList && n.classList.contains('oc-modal-overlay') && box) paint(); }); });
    }).observe(doc.body, { childList: true });
  }
  g.MyRequests = { mount: mount };
})(typeof self !== 'undefined' ? self : this);
