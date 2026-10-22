/* LDH Shift Ops: the one "Send a request" card (2026-10-22).
   The shelter staff page has it inline (index.html). The Vets, Nurses and Behaviour pages use this shared copy, so every
   page asks in the same order: WHAT, animal, space, pen / detail, needed within, extras, reason / note, then Send.
   Three recipients, each with its own categories:
     vets       from nurses:     a task for the vets (check an animal / interpret results / upload results)
                from behaviour:  shelter stress medication / post adoption med pack / other (+ courthold)
     nurses     (from vets):     a treatment course, or a one-animal task (FIV, bloods, microchip, ear swab, IVFT, ...)
     behaviour:                  courthold reassessment, surrender history, aggression / incident review, behaviour review, other
   SendCard.mount(el, cfg) draws the card in place; SendCard.openModal(cfg) shows it in a window (the Nurses page has two
   columns, so it opens it from a button). Needs LDHLogic and OpsCore on the page.
   cfg: { sb, tabs:['vets','nurses','behaviour'], vetsFrom:'nurse'|'behaviour', initials:'AB' (prefill),
          saveInitials(v), onSent(tab), onClose() } */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.SendCard = factory(root);
})(typeof self !== 'undefined' ? self : this, function (g) {
  var esc = function (x) { return String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var TAB_NAMES = { vets: 'Vets', nurses: 'Nurses', behaviour: 'Behaviour' };
  var CSS = '.sc-card{position:relative}.sc-head{display:flex;gap:14px;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;margin:4px 0 14px}'
    + '.sc-to{display:flex;gap:6px;flex-wrap:wrap}.sc-tab{width:auto;background:var(--card-bg,#fff);color:var(--ink,#222);border:2px solid var(--border,#d6d9e0);box-shadow:none;font-weight:700;padding:10px 22px;border-radius:12px;cursor:pointer}'
    + '.sc-tab[data-sc="vets"][aria-selected="true"]{background:var(--blue,#4a6cf7);border-color:var(--blue,#4a6cf7);color:#fff}.sc-tab[data-sc="nurses"][aria-selected="true"]{background:#1c7387;border-color:#1c7387;color:#fff}.sc-tab[data-sc="behaviour"][aria-selected="true"]{background:#7c5cbf;border-color:#7c5cbf;color:#fff}'
    + '.sc-who{display:flex;flex-direction:column;gap:4px;font-size:.72rem;font-weight:700;color:var(--muted,#667);margin:0}.sc-who input{width:110px;margin:0}'
    + '.sc-panel{border-left:5px solid var(--border,#d6d9e0);padding:10px 14px;border-radius:0 12px 12px 0}.sc-panel[hidden]{display:none}'
    + '.sc-panel[data-to="vets"]{border-left-color:var(--blue,#4a6cf7)}.sc-panel[data-to="nurses"]{border-left-color:#2a9db5;background:#eef8fb}.sc-panel[data-to="behaviour"]{border-left-color:#7c5cbf;background:#f6f1fd}'
    + '.sc-lead{font-size:.82rem;color:var(--muted,#667);margin:0 0 10px}.sc-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;align-items:end}'
    + '.sc-form label{font-size:.72rem;font-weight:700;color:var(--muted,#667);display:flex;flex-direction:column;gap:4px;margin:0}.sc-form .sc-wide{grid-column:1/-1}'
    + '.sc-send{margin-top:12px;color:#fff}.sc-panel[data-to="vets"] .sc-send{background:var(--blue,#4a6cf7)}.sc-panel[data-to="nurses"] .sc-send{background:#1c7387}.sc-panel[data-to="behaviour"] .sc-send{background:#7c5cbf}'
    + '.sc-msg{margin:8px 0 0;font-size:.85rem;min-height:1.1em}.sc-msg.err{color:#c0392b}.sc-msg.ok{color:#1e8e4e}.sc-tick{flex-direction:row!important;align-items:center;gap:6px!important;font-size:.85rem!important}.sc-tick input{width:auto!important;margin:0}'
    + '.sc-modal-x{position:absolute;right:10px;top:8px;background:transparent;border:none;box-shadow:none;font-size:1.5rem;width:auto;padding:0 6px;cursor:pointer;color:var(--muted,#667)}'
    + '.sc-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:300;display:flex;align-items:flex-start;justify-content:center;padding:24px 12px;overflow:auto}.sc-overlay .sc-card{background:var(--card-bg,#fff);border-radius:14px;max-width:760px;width:100%;padding:18px 18px 16px}';
  function injectCss() {
    if (!g.document || g.document.getElementById('send-card-css')) return;
    var st = g.document.createElement('style'); st.id = 'send-card-css'; st.textContent = CSS; g.document.head.appendChild(st);
  }
  function L() { return g.LDHLogic; }
  function opts(map, skip) { return Object.keys(map).filter(function (k) { return !skip || skip.indexOf(k) === -1; }).map(function (k) { return '<option value="' + esc(k) + '">' + esc(map[k]) + '</option>'; }).join(''); }
  function roomOpts() { return L().LOCATIONS.map(function (l) { return '<option>' + esc(l) + '</option>'; }).join(''); }
  var COURSE = 'course';

  function panelHtml(to, cfg) {
    var common = function (what, extra, notePh, noteLabel) {
      return '<div class="sc-form">'
        + '<label>What<select data-f="kind">' + what + '</select></label>'
        + '<label>Animal ID<input data-f="animal" placeholder="Animal ID"></label>'
        + '<label>Space<select data-f="room">' + roomOpts() + '</select></label>'
        + '<label>Pen / detail<input data-f="pen" placeholder="Pen #" maxlength="40"></label>'
        + extra
        + '<label class="sc-wide">' + noteLabel + '<input data-f="note" placeholder="' + esc(notePh) + '"></label></div>';
    };
    if (to === 'behaviour') {
      return '<p class="sc-lead">For the behaviour team: courthold reassessment, owner surrender history with concerns, aggression / incident review or a behaviour review.</p>'
        + common(opts(L().BEHAVIOUR_KINDS),
          '<label>Needed within<select data-f="window">' + opts(L().BEHAVIOUR_WINDOWS) + '</select></label>',
          'Why are you flagging this animal?', 'Reason (required for reviews)')
        + '<label class="sc-tick"><input type="checkbox" data-f="tl"> Send straight to the Behaviour TL</label>';
    }
    if (to === 'vets' && cfg.vetsFrom === 'behaviour') {
      return '<p class="sc-lead">Goes onto the vet board: dispense shelter stress medication, a post adoption med pack, or something else.</p>'
        + common(opts(L().BEHAVIOUR_VET_TYPES), '<label class="sc-tick"><input type="checkbox" data-f="courthold"> Courthold</label>', 'optional', 'Reason / note');
    }
    if (to === 'vets') {
      return '<p class="sc-lead">A task for the vets. Goes onto the vet board.</p>'
        + common('<option value="other">Task for the vets (describe in the note)</option><option value="interpret">' + esc(L().BACK_ACTIONS.interpret) + '</option><option value="upload">' + esc(L().BACK_ACTIONS.upload) + '</option>',
          '<label>Needed within<select data-f="window">' + Object.keys(L().BACK_WINDOWS).map(function (k) { return '<option value="' + esc(k) + '"' + (k === '12_24h' ? ' selected' : '') + '>' + esc(L().BACK_WINDOWS[k]) + '</option>'; }).join('') + '</select></label>',
          'e.g. please check the eye, it looks worse', 'Reason / note');
    }
    // nurses
    // Dispense medication first (a plain task: animal, space, pen, which medication in the note), then a treatment course (given on a schedule), then the other one-animal tasks
    var what = '<option value="dispense">' + esc(L().MISC_TASK_LABELS.dispense) + '</option><option value="' + COURSE + '">Treatment course (times a day, for days)</option>' + opts(L().MISC_TASK_LABELS, ['med_label', 'dispense']);
    return '<p class="sc-lead">For the nurses: <b>dispense medication</b> (say which medication in the note), a treatment course given on a schedule, or one task for one animal (bloods, ear swab, FIV test, a cat needing IVFT, microchip, UV, treatment check).</p>'
      + common(what,
        '<label class="sc-course">Treatment<input data-f="treatment" maxlength="80" placeholder="e.g. flush dental extraction site"></label>'
        + '<label class="sc-course">Times a day<select data-f="times"><option>1</option><option>2</option><option>3</option><option>4</option></select></label>'
        + '<label class="sc-course">For how many days<input data-f="days" type="number" min="1" max="30" value="7"></label>'
        + '<label class="sc-course">Start date<input data-f="start" type="date"></label>',
        'e.g. meloxicam 0.5 ml with food (Dispense medication), or before surgery tomorrow', 'Reason / note (say which medication for Dispense)');
  }
  function html(cfg) {
    var tabs = cfg.tabs;
    return '<div class="sc-card" data-sc-card>'
      + '<div class="sc-head"><div class="sc-to" role="tablist" aria-label="Who is this request for?">'
      + tabs.map(function (t, i) { return '<button type="button" role="tab" class="sc-tab" data-sc="' + t + '" aria-selected="' + (i === 0) + '">' + TAB_NAMES[t] + '</button>'; }).join('')
      + '</div><label class="sc-who">Your initials<input data-f="initials" maxlength="4" placeholder="e.g. AB" autocomplete="off" value="' + esc(cfg.initials || '') + '"></label></div>'
      + tabs.map(function (t, i) { return '<div class="sc-panel" data-to="' + t + '"' + (i === 0 ? '' : ' hidden') + '>' + panelHtml(t, cfg)
        + '<button type="button" class="sc-send" data-send="' + t + '">Send to ' + TAB_NAMES[t].toLowerCase() + '</button><p class="sc-msg" data-msg></p></div>'; }).join('')
      + '</div>';
  }

  // The same place text each page already used: "room / pen"; Offsite, Pathway and Vet clinic take a detail instead of a pen.
  function place(room, pen, dash) {
    var off = L().OFFSITE_NAMES.indexOf(room) !== -1;
    return { location: !pen ? room : off ? (dash ? room + ' — ' + pen : room) : room + ' / ' + pen, detail: off ? pen : '', off: off };
  }
  function cleanInit(v) { return String(v || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4); }

  function wire(el, cfg) {
    var card = el.querySelector('[data-sc-card]');
    var q = function (panel, f) { return panel.querySelector('[data-f="' + f + '"]'); };
    var who = card.querySelector('.sc-who [data-f="initials"]');
    who.addEventListener('input', function () { who.value = cleanInit(who.value); });
    var panels = Array.prototype.slice.call(card.querySelectorAll('.sc-panel')), tabs = Array.prototype.slice.call(card.querySelectorAll('.sc-tab'));
    function show(to) {
      tabs.forEach(function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-sc') === to)); });
      panels.forEach(function (p) { p.hidden = p.getAttribute('data-to') !== to; });
    }
    tabs.forEach(function (b) { b.addEventListener('click', function () { show(b.getAttribute('data-sc')); }); });
    panels.forEach(function (p) {
      var room = q(p, 'room'), pen = q(p, 'pen');
      var syncRoom = function () { var off = L().OFFSITE_NAMES.indexOf(room.value) !== -1; pen.placeholder = off ? 'Detail, e.g. foster name or ward' : 'Pen #'; };
      room.addEventListener('change', syncRoom); syncRoom();
      if (p.getAttribute('data-to') === 'nurses') {
        var kind = q(p, 'kind'), start = q(p, 'start');
        start.value = L().localISO(new Date());
        var syncKind = function () { Array.prototype.forEach.call(p.querySelectorAll('.sc-course'), function (x) { x.style.display = kind.value === COURSE ? '' : 'none'; }); };
        kind.addEventListener('change', syncKind); syncKind();
      }
    });
    var busy = false;
    card.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-send]'); if (!btn || busy) return;
      var to = btn.getAttribute('data-send'), p = card.querySelector('.sc-panel[data-to="' + to + '"]'), msg = p.querySelector('[data-msg]');
      var fail = function (m) { msg.className = 'sc-msg err'; msg.textContent = m; };
      msg.className = 'sc-msg'; msg.textContent = '';
      var val = function (f) { var x = q(p, f); return x ? String(x.value).trim() : ''; };
      var animal = val('animal'), who2 = cleanInit(who.value);
      if (!animal) return fail('Enter the animal ID.');
      if (!who2) { who.focus(); return fail('Enter your initials, so the team can see who asked.'); }
      var pl = place(val('room'), val('pen'), to === 'behaviour');
      var work;
      if (to === 'behaviour') {
        var kindB = val('kind'), reason = val('note');
        var bad = L().behaviourValidate({ kind: kindB, animalId: animal, location: pl.location, reason: reason });
        if (bad) return fail(bad);
        var lane = q(p, 'tl').checked ? 'tl' : 'incoming';
        work = cfg.sb.from('behaviour_tasks').insert({ kind: kindB, animal_id: animal, location: pl.location, lane: lane, due_window: val('window'),
          reason: reason || null, courthold: kindB === 'courthold', flagged_by: who2,
          history: [{ at: new Date().toISOString(), by: who2, from: 'new', to: lane }] }).then(function (r) { return r.error; });
      } else if (to === 'vets') {
        var row;
        if (cfg.vetsFrom === 'behaviour') {
          row = L().behaviourVetRequest({ type: val('kind'), animalId: animal, location: place(val('room'), val('pen')).location, locationDetail: pl.detail,
            courthold: q(p, 'courthold').checked, note: val('note'), initials: who2 });
        } else {
          var act = val('kind'), note = val('note');
          if (act === 'other' && !note) return fail('Write the task for the vets in the note.');
          var pv = place(val('room'), val('pen'));
          row = L().nurseAskTask({ animalId: animal, location: pv.location, locationDetail: pl.detail, text: note || L().BACK_ACTIONS[act], action: act, window: val('window'), initials: who2 });
        }
        work = g.OpsCore.sendTaskToVets(cfg.sb, row);
      } else {
        var kindN = val('kind'), pn = place(val('room'), val('pen'));
        if (kindN === COURSE) {
          var treatment = val('treatment'), times = parseInt(val('times'), 10), days = parseInt(val('days'), 10), startD = val('start') || L().localISO(new Date());
          if (!treatment) return fail('Enter the treatment.');
          if (!days || days < 1 || days > 30) return fail('Days must be between 1 and 30.');
          work = cfg.sb.from('nurse_treatments').insert({ animal_id: animal, location: pn.location, treatment: treatment, times_per_day: times, days: days, start_date: startD, requested_by: who2 }).select().single()
            .then(function (r) {
              if (r.error) return r.error;
              var slots = L().doseSlots(startD, times, days).map(function (s) { return Object.assign({ treatment_id: r.data.id }, s); });
              return cfg.sb.from('nurse_treatment_doses').insert(slots).then(function (d) {
                if (!d.error) return null;
                return cfg.sb.from('nurse_treatments').delete().eq('id', r.data.id).then(function () { return d.error; });   // never leave a course without its doses
              });
            });
        } else {
          if ((kindN === 'dispense' || kindN === 'other') && !val('note')) return fail(kindN === 'dispense' ? 'Write which medication to dispense in the note.' : 'Describe the task in the note.');
          work = cfg.sb.from('noga_requests').insert({ animal_id: animal, location: pn.location, location_detail: pn.detail || null, task: kindN, note: val('note') || null, added_by: who2 }).then(function (r) { return r.error; });
        }
      }
      busy = true; btn.disabled = true; msg.textContent = 'Sending…';
      Promise.resolve(work).then(function (error) {
        busy = false; btn.disabled = false;
        if (error) return fail('Could not send: ' + (error.message || error));
        if (cfg.saveInitials) cfg.saveInitials(who2);
        ['animal', 'pen', 'note', 'treatment'].forEach(function (f) { var x = q(p, f); if (x) x.value = ''; });
        var ch = q(p, 'courthold'); if (ch) ch.checked = false;
        msg.className = 'sc-msg ok'; msg.textContent = 'Sent to the ' + TAB_NAMES[to].toLowerCase() + '.';
        if (cfg.onSent) cfg.onSent(to);
      }, function (err) { busy = false; btn.disabled = false; fail('Could not send: ' + (err && err.message || err)); });
    });
    return { show: show };
  }
  function mount(el, cfg) {
    injectCss();
    cfg = Object.assign({ tabs: ['vets', 'nurses', 'behaviour'], vetsFrom: 'nurse' }, cfg);
    el.innerHTML = html(cfg);
    return wire(el, cfg);
  }
  function openModal(cfg) {
    injectCss();
    Array.prototype.forEach.call(g.document.querySelectorAll('.sc-overlay'), function (o) { o.remove(); });
    var ov = g.document.createElement('div'); ov.className = 'sc-overlay';
    var inner = g.document.createElement('div'); ov.appendChild(inner); g.document.body.appendChild(ov);
    var closeSoon = null;
    var done = Object.assign({}, cfg, { onSent: function (to) { if (cfg.onSent) cfg.onSent(to); closeSoon = setTimeout(function () { close(); }, 1200); } });   // the confirmation shows for a moment, then the window goes
    var api = mount(inner, done);
    var x = g.document.createElement('button'); x.type = 'button'; x.className = 'sc-modal-x'; x.setAttribute('aria-label', 'Close'); x.innerHTML = '&times;';
    inner.querySelector('[data-sc-card]').appendChild(x);
    var close = function () { if (closeSoon) clearTimeout(closeSoon); ov.remove(); if (cfg.onClose) cfg.onClose(); };
    x.addEventListener('click', close);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    return Object.assign({ close: close }, api);
  }
  return { mount: mount, openModal: openModal, html: html };
});
