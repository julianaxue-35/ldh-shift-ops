/* Edit a request after it has been sent (2026-11-18). One shared box for every dashboard page: a card draws an Edit button with
   RequestEdit.btn(table, id), and a single click handler here opens the box, reads the row fresh from the database, saves the
   changes, and tells the page to reload. Anyone on the dashboard can edit (same access as the rest of the pages).
   Tables: nurse_requests (vaccination etc.), nurse_treatments (a course), noga_requests (nurse tasks), behaviour_tasks, tasks (vet board).
   Browser only: global RequestEdit. Needs LDHLogic (LOCATIONS, OFFSITE_NAMES) and the Supabase client passed to init(). */
(function (g) {
  'use strict';
  var SB = null, AFTER = null;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // What each table lets you change. loc = how the place is stored: 'text' = one text "room / pen"; 'split' = location + location_detail
  // (Offsite/Pathway/Vet clinic keep their detail in its own column, like the Send a request card does).
  var CFG = {
    nurse_requests: { title: 'Edit nurse request', loc: 'text', fields: [
      { k: 'species', label: 'Species', type: 'select', opts: [['cat', 'Cats'], ['dog', 'Dogs']] },
      { k: 'animal_count', label: 'How many', type: 'number', min: 1 },
      { k: 'due_window', label: 'Needed within', type: 'select', opts: [['2h', 'Within 2 hours'], ['today', 'Within today'], ['24_48h', 'Within 24–48 hours']] },
      { k: 'note', label: 'Reason / note', type: 'text', wide: true }] },
    nurse_treatments: { title: 'Edit treatment', loc: 'text', fields: [
      { k: 'treatment', label: 'Treatment', type: 'text', wide: true, required: true }] },
    noga_requests: { title: 'Edit nurse task', loc: 'split', fields: [
      { k: 'note', label: 'Reason / note', type: 'text', wide: true }] },
    behaviour_tasks: { title: 'Edit behaviour request', loc: 'text', fields: [
      { k: 'reason', label: 'Reason', type: 'text', wide: true }] },
    tasks: { title: 'Edit vet case location', loc: 'split', fields: [] }
  };

  function rooms() { return (g.LDHLogic && g.LDHLogic.LOCATIONS) || []; }
  function offsite() { return (g.LDHLogic && g.LDHLogic.OFFSITE_NAMES) || []; }

  // "Cat Room 1 / 4" -> { room: 'Cat Room 1', pen: '4' }; "Offsite — Foster" -> Offsite + Foster. No match: the whole text is kept as a
  // 'current' choice, so saving without touching the place never changes it.
  function splitPlace(loc, detail) {
    loc = String(loc || '');
    var list = rooms();
    if (list.indexOf(loc) !== -1) return { room: loc, pen: detail || '', custom: '' };
    for (var i = 0; i < list.length; i++) {
      var l = list[i];
      if (loc.indexOf(l + ' / ') === 0) return { room: l, pen: loc.slice(l.length + 3), custom: '' };
      if (loc.indexOf(l + ' — ') === 0) return { room: l, pen: loc.slice(l.length + 3), custom: '' };
    }
    return { room: '', pen: '', custom: loc };
  }
  // Same rule as the Send a request card: "room / pen"; Offsite-type spaces take a detail instead of a pen.
  function joinPlace(room, pen, mode) {
    var off = offsite().indexOf(room) !== -1;
    if (mode === 'split') return off ? { location: room, location_detail: pen || null } : { location: !pen ? room : room + ' / ' + pen, location_detail: null };
    return { location: !pen ? room : off ? room + ' — ' + pen : room + ' / ' + pen };
  }

  function btn(table, id, label) {
    return '<button type="button" class="secondary req-edit-btn" data-redit="' + esc(table) + '" data-id="' + esc(id) + '">' + esc(label || 'Edit') + '</button>';
  }

  function fieldHtml(f, row) {
    var v = row[f.k] == null ? '' : row[f.k], id = 'rq-f-' + f.k, h = '<label' + (f.wide ? ' style="grid-column:1/-1"' : '') + '>' + esc(f.label);
    if (f.type === 'select') h += '<select id="' + id + '">' + f.opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(v) === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>';
    else if (f.type === 'number') h += '<input id="' + id + '" type="number" min="' + (f.min || 0) + '" value="' + esc(v) + '">';
    else h += '<input id="' + id + '" type="text" maxlength="400" value="' + esc(v) + '">';
    return h + '</label>';
  }

  function open(table, id) {
    var cfg = CFG[table]; if (!cfg || !SB) return;
    SB.from(table).select('*').eq('id', id).limit(1).then(function (res) {
      var row = res && res.data && res.data[0];
      if (!row) { g.alert('That request could not be found. It may have been finished or removed.'); return; }
      render(table, cfg, row);
    }, function () { g.alert('Could not open the request (no connection).'); });
  }

  function render(table, cfg, row) {
    var sp = splitPlace(row.location, row.location_detail);
    var roomSel = '<select id="rq-room">' + (sp.custom ? '<option value="__keep__" selected>' + esc(sp.custom) + ' (current)</option>' : '')
      + rooms().map(function (l) { return '<option' + (l === sp.room ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join('') + '</select>';
    var o = g.document.createElement('div');
    o.className = 'oc-modal-overlay';
    o.style.cssText = 'position:fixed;inset:0;z-index:9500;display:flex;align-items:center;justify-content:center;background:rgba(30,34,56,0.45);padding:12px;overflow-y:auto';
    o.innerHTML = '<div class="oc-modal" style="max-width:460px;width:100%;background:var(--card-bg,#fff);border-radius:14px;padding:20px;max-height:92vh;overflow-y:auto">'
      + '<p class="oc-modal-text" style="font-weight:700;font-size:1rem;margin:0 0 4px">' + esc(cfg.title) + '</p>'
      + (row.animal_id || row.title ? '<p style="font-size:.82rem;margin:0 0 12px;color:var(--muted,#6B7280)">Animal ' + esc(row.animal_id || row.title) + '</p>' : '<p style="margin:0 0 12px"></p>')
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:.78rem;font-weight:700">'
      + '<label>Location / Space' + roomSel + '</label>'
      + '<label>Pen / Detail #<input id="rq-pen" type="text" maxlength="40" value="' + esc(sp.pen) + '" placeholder="Pen #"></label>'
      + cfg.fields.map(function (f) { return fieldHtml(f, row); }).join('')
      + '</div><p class="oc-modal-error" id="rq-err" style="display:none;margin:10px 0 0;color:#D03B3B;font-size:.82rem"></p>'
      + '<div class="oc-modal-actions" style="display:flex;gap:8px;margin-top:14px"><button type="button" class="oc-modal-cancel" id="rq-cancel">Cancel</button><button type="button" class="oc-modal-submit" id="rq-save">Save changes</button></div></div>';
    g.document.body.appendChild(o);
    var q = function (s) { return o.querySelector(s); };
    q('#rq-cancel').addEventListener('click', function () { o.remove(); });
    q('#rq-save').addEventListener('click', function () {
      var err = q('#rq-err'), save = q('#rq-save'); err.style.display = 'none';
      var patch = {}, roomV = q('#rq-room').value, penV = q('#rq-pen').value.trim();
      if (roomV === '__keep__') { if (penV) patch.location = sp.custom + ' / ' + penV; }
      else Object.assign(patch, joinPlace(roomV, penV, cfg.loc));
      var bad = '';
      cfg.fields.forEach(function (f) {
        var v = q('#rq-f-' + f.k).value.trim();
        if (f.required && !v) bad = f.label + ' cannot be empty.';
        if (f.type === 'number') {
          var n = parseInt(v, 10);
          if (!(n >= (f.min || 0))) bad = f.label + ' must be a number.'; else patch[f.k] = n;
          if (table === 'nurse_requests' && f.k === 'animal_count' && n < (row.done_count || 0)) bad = 'Already ' + row.done_count + ' done, so the count cannot be lower than that.';
        } else patch[f.k] = v === '' && !f.required ? null : v;
      });
      if (bad) { err.textContent = bad; err.style.display = 'block'; return; }
      // only send what actually changed
      Object.keys(patch).forEach(function (k) { if (String(patch[k] == null ? '' : patch[k]) === String(row[k] == null ? '' : row[k])) delete patch[k]; });
      if (!Object.keys(patch).length) { o.remove(); return; }
      save.disabled = true; save.textContent = 'Saving...';
      SB.from(table).update(patch).eq('id', row.id).select().then(function (r) {
        if (r.error) { save.disabled = false; save.textContent = 'Save changes'; err.textContent = r.error.code === '23505' ? 'A request for this animal in that place already exists, so it cannot be moved there.' : 'Could not save: ' + r.error.message; err.style.display = 'block'; return; }
        if (!r.data || !r.data.length) { save.disabled = false; save.textContent = 'Save changes'; err.textContent = 'It was not saved (the request may have been finished). Close this and check the list.'; err.style.display = 'block'; return; }
        o.remove();
        if (AFTER) AFTER();
      }, function () { save.disabled = false; save.textContent = 'Save changes'; err.textContent = 'No connection. Try again.'; err.style.display = 'block'; });
    });
  }

  function init(sb, afterSave) {
    SB = sb; AFTER = afterSave || null;
    if (init.done) return; init.done = true;
    g.document.addEventListener('click', function (e) {
      var b = e.target && e.target.closest && e.target.closest('[data-redit]'); if (!b) return;
      e.preventDefault(); e.stopPropagation();
      open(b.getAttribute('data-redit'), b.getAttribute('data-id'));
    }, true);
  }

  g.RequestEdit = { init: init, btn: btn, splitPlace: splitPlace, joinPlace: joinPlace, CFG: CFG };
  if (typeof module !== 'undefined' && module.exports) module.exports = g.RequestEdit;
})(typeof window !== 'undefined' ? window : globalThis);
