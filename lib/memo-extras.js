/* Memo board extras (2026-10-28), shared by the Vets and Nurses pages:
   - "Next clinic meeting" date, kept in one shared row so everyone sees the same date
   - "Tick all off" for after the meeting (marks every open memo done in one go; they stay under "completed") */
(function (g) {
  var TABLE = 'clinic_meeting';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function label(isoDate, today) {
    if (!isoDate) return { text: 'not set', past: false };
    var d = new Date(isoDate + 'T00:00:00');
    var text = d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    return { text: text, past: isoDate < iso(today || new Date()) };
  }
  // cfg: { sb, el, getOpenCount(), reload() }
  function mount(cfg) {
    var el = cfg.el, date = null, open = false;
    el.innerHTML = '<div class="memo-meet" style="display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;margin:0 0 10px">'
      + '<span>Next clinic meeting: <b data-md></b></span>'
      + '<span data-md-note style="font-size:.78rem;color:#c0392b"></span>'
      + '<button type="button" class="secondary" data-md-edit style="padding:4px 10px;font-size:.75rem">Change</button>'
      + '<span data-md-editor style="display:none;gap:6px;align-items:center"><input type="date" data-md-input style="width:auto;margin:0">'
      + '<button type="button" data-md-save style="padding:4px 10px;font-size:.75rem">Save</button>'
      + '<button type="button" class="secondary" data-md-clear style="padding:4px 10px;font-size:.75rem">Clear</button></span>'
      + '<button type="button" class="secondary" data-tick-all style="padding:4px 10px;font-size:.75rem;margin-left:auto">Tick all off</button>'
      + '</div>';
    var q = function (s) { return el.querySelector(s); };
    function paint() {
      var l = label(date);
      q('[data-md]').textContent = l.text;
      q('[data-md-note]').textContent = l.past ? 'This date has passed: set the next one.' : '';
      q('[data-md-editor]').style.display = open ? 'inline-flex' : 'none';
      q('[data-md-edit]').style.display = open ? 'none' : '';
      var n = cfg.getOpenCount ? cfg.getOpenCount() : 0;
      q('[data-tick-all]').style.display = n ? '' : 'none';
      q('[data-tick-all]').textContent = 'Tick all ' + n + ' off';
    }
    function save(v) {
      return Promise.resolve(cfg.sb.from(TABLE).upsert({ id: 1, next_date: v || null, updated_at: new Date().toISOString() })).then(function (r) {
        if (r.error) { alert('Could not save the meeting date: ' + r.error.message); return; }
        date = v || null; open = false; paint(); if (cfg.reload) cfg.reload();
      });
    }
    q('[data-md-edit]').addEventListener('click', function () { open = true; q('[data-md-input]').value = date || ''; paint(); q('[data-md-input]').focus(); });
    q('[data-md-save]').addEventListener('click', function () { var v = q('[data-md-input]').value; if (!v) { alert('Pick the date, or press Clear.'); return; } save(v); });
    q('[data-md-clear]').addEventListener('click', function () { save(null); });
    q('[data-tick-all]').addEventListener('click', function () {
      var n = cfg.getOpenCount ? cfg.getOpenCount() : 0; if (!n) return;
      if (!confirm('Tick off all ' + n + ' open memo' + (n > 1 ? 's' : '') + '? Do this once the clinic meeting has covered them. They stay under "completed".')) return;
      Promise.resolve(cfg.sb.from('memos').update({ done: true, done_at: new Date().toISOString() }).eq('done', false)).then(function (r) {
        if (r.error) alert('Could not tick the memos off: ' + r.error.message);
        if (cfg.reload) cfg.reload();
      });
    });
    paint();
    return { setDate: function (v) { date = v || null; if (!open) paint(); }, refresh: paint };
  }
  // Reads the shared date; null when it is not set or the table has not been created yet.
  function load(sb) {
    return Promise.resolve(sb.from(TABLE).select('*').eq('id', 1)).then(function (r) { return r.error || !r.data || !r.data.length ? null : (r.data[0].next_date || null); }, function () { return null; });
  }
  g.MemoExtras = { mount: mount, load: load, label: label, esc: esc };
})(typeof self !== 'undefined' ? self : this);
