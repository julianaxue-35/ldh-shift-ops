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
  var CSS = '#send-request.card{padding:0;overflow:clip}.sc-overlay .sc-banner{padding-right:56px}.sc-card{position:relative;overflow:clip;padding:0!important}'
    + '.sc-banner{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:18px 26px;color:#fff;background:linear-gradient(110deg,#1E2238 0%,#2d2f8f 100%)}'
    + '.sc-banner .eyebrow{font-size:.66rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#a9b4ff}.sc-banner h2{margin:2px 0 0;font-size:1.2rem;color:#fff}'
    + '.sc-body{padding:22px 26px 26px}'
    + '.sc-sec{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin:0 0 12px;font-size:.78rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--ink,#1e2238)}.sc-sec .hint{font-weight:600;font-size:.68rem;color:var(--muted,#667)}'
    + '.sc-divider{border:none;border-top:1px solid var(--border,#d6d9e0);margin:22px 0 20px}'
    + '.sc-who{display:inline-flex;flex-direction:row;align-items:center;gap:8px;margin:0;padding:6px 8px 6px 14px;border-radius:12px;background:#fff;border:1px solid transparent;font-size:.78rem;font-weight:600;color:var(--muted,#667)}'
    + '.sc-who input{width:4.6ch;min-width:0;margin:0;padding:4px 8px;text-align:center;border:1px solid var(--border,#d6d9e0);border-radius:8px;background:#fff;font-size:.85rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--ink,#1e2238)}'
    + '.sc-who:has(input:placeholder-shown){background:#fff1de;border-color:#ff9f43;color:#8a5000}.sc-who:has(input:placeholder-shown) input{border-color:#ff9f43}'
    + '.sc-who input:focus{outline:none;border-color:var(--blue,#4a6cf7);box-shadow:0 0 0 3px rgba(74,108,247,.18)}'
    + '.sc-head{margin:0}.sc-to{display:grid;grid-template-columns:repeat(var(--n,3),minmax(0,1fr));gap:14px}'
    + '.sc-tab{position:relative;width:auto;background:#fff;color:var(--ink,#1e2238);border:1.5px solid var(--border,#d6d9e0);box-shadow:none;text-align:left;font-weight:700;font-size:.95rem;line-height:1.3;padding:58px 18px 16px;border-radius:14px;cursor:pointer;transition:border-color .15s,background .15s,box-shadow .15s;'
    + 'background-image:radial-gradient(circle,#c4c9d8 0 4px,transparent 5px);background-repeat:no-repeat;background-position:right 16px top 16px;background-size:14px 14px}'
    + '.sc-tab::before{position:absolute;left:16px;top:14px;width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.05rem;background:#eef0fb}'
    + '.sc-tab[data-sc="vets"]::before{content:"\\1FA7A"}.sc-tab[data-sc="nurses"]::before{content:"\\1F489";background:#e6f4f7}.sc-tab[data-sc="behaviour"]::before{content:"\\1F415";background:#f1ebfb}'
    + '.sc-tab::after{content:attr(data-sub);display:block;font-weight:400;font-size:.78rem;color:var(--muted,#667);margin-top:2px}'
    + '.sc-tab:hover{border-color:rgba(30,34,56,.3)}.sc-tab:focus-visible{outline:2px solid var(--blue,#4a6cf7);outline-offset:2px}'
    + '.sc-tab[data-sc="vets"]{--c:#4338ca}.sc-tab[data-sc="nurses"]{--c:#1c7387}.sc-tab[data-sc="behaviour"]{--c:#7c5cbf}'
    + '.sc-tab[aria-selected="true"]{background-color:#f5f6ff;border-color:var(--c);box-shadow:0 0 0 1px var(--c),0 4px 14px rgba(30,34,56,.08);background-image:radial-gradient(circle,var(--c) 0 5px,transparent 6px)}'
    + '.sc-tab[data-sc="nurses"][aria-selected="true"]{background-color:#f1f9fb}.sc-tab[data-sc="behaviour"][aria-selected="true"]{background-color:#f8f5fd}'
    + '.sc-panel{padding:0}.sc-panel[hidden]{display:none}'
    + '.sc-lead{font-size:.85rem;color:var(--muted,#667);margin:0 0 14px}.sc-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 22px;align-items:start}'
    + '.sc-form label{font-size:.82rem;font-weight:600;color:var(--ink,#1e2238);display:flex;flex-direction:column;gap:6px;margin:0}.sc-form .req{color:#d03b3b}.sc-form .sc-wide{grid-column:1/-1}'
    + '.sc-form input,.sc-form select,.sc-form textarea{background:#f5f7fa;margin:0}.sc-form textarea{min-height:84px;resize:vertical;font:inherit}'
    + '.sc-panel input:focus,.sc-panel select:focus,.sc-panel textarea:focus{outline:none;border-color:var(--blue,#4a6cf7);box-shadow:0 0 0 3px rgba(74,108,247,.18)}'
    + '.sc-send{position:sticky;bottom:16px;z-index:5;margin-top:18px;padding:14px 36px;font-size:1rem;border-radius:12px;color:#fff;box-shadow:0 6px 18px rgba(30,34,56,.28);transition:transform .08s,box-shadow .15s,filter .15s}.sc-send:hover{filter:brightness(1.12);box-shadow:0 8px 22px rgba(30,34,56,.34)}.sc-send:active{transform:translateY(1px) scale(.99);filter:brightness(.95)}.sc-send:focus-visible{outline:3px solid #fff;box-shadow:0 0 0 6px var(--blue,#4a6cf7)}.sc-panel[data-to="vets"] .sc-send{background:#4338ca}.sc-panel[data-to="nurses"] .sc-send{background:#1c7387}.sc-panel[data-to="behaviour"] .sc-send{background:#7c5cbf}'
    + '.sc-msg{margin:8px 0 0;font-size:.85rem;min-height:1.1em}.sc-msg.err{color:#c0392b}.sc-msg.ok{color:#1e8e4e}.sc-tick{flex-direction:row!important;align-items:center;gap:6px!important;font-size:.85rem!important;margin-top:12px!important}.sc-tick input{width:auto!important;margin:0}'
    + '.sc-modal-x{position:absolute;right:10px;top:10px;background:transparent;border:none;box-shadow:none;font-size:1.5rem;width:auto;padding:0 6px;cursor:pointer;color:#fff;z-index:2}'
    + '.sc-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:300;display:flex;align-items:flex-start;justify-content:center;padding:24px 12px;overflow:auto}.sc-overlay .sc-card{background:var(--card-bg,#fff);border-radius:14px;max-width:820px;width:100%}'
    + '@media (max-width:760px){.sc-body{padding:16px 16px 20px}.sc-banner{padding:14px 16px}.sc-to{grid-template-columns:minmax(0,1fr)}.sc-form{grid-template-columns:minmax(0,1fr)}}';
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
        + '<label>What type of request?<select data-f="kind">' + what + '</select></label>'
        + '<label><span>Animal ID <span class="req">*</span></span><input data-f="animal" placeholder="e.g. 1176455"></label>'
        + '<label>Location / Space<select data-f="room">' + roomOpts() + '</select></label>'
        + '<label>Pen / Detail #<input data-f="pen" placeholder="Pen #" maxlength="40"></label>'
        + extra
        + '<label class="sc-wide">' + noteLabel + '<textarea data-f="note" rows="3" placeholder="' + esc(notePh) + '"></textarea></label></div>';
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
        + common('<option value="interpret">' + esc(L().BACK_ACTIONS.interpret) + '</option><option value="upload">' + esc(L().BACK_ACTIONS.upload) + '</option><option value="other">Other (describe the task in the note)</option>',
          '<label>Needed within<select data-f="window">' + Object.keys(L().BACK_WINDOWS).map(function (k) { return '<option value="' + esc(k) + '"' + (k === '12_24h' ? ' selected' : '') + '>' + esc(L().BACK_WINDOWS[k]) + '</option>'; }).join('') + '</select></label>',
          'e.g. please check the eye, it looks worse', 'Reason / note');
    }
    // nurses
    // Dispense medication first (a plain task: animal, space, pen, which medication in the note), then a treatment course (given on a schedule), then the other one-animal tasks
    var what = '<option value="dispense">' + esc(L().MISC_TASK_LABELS.dispense) + '</option><option value="' + COURSE + '">Treatment course (times a day, for days)</option>' + opts(L().MISC_TASK_LABELS, ['med_label', 'dispense', 'treatment']);
    return '<p class="sc-lead">For the nurses: <b>dispense medication</b> (say which medication in the note), a treatment course given on a schedule, or one task for one animal (bloods, ear swab, FIV test, a cat needing IVFT, microchip, UV, treatment check).</p>'
      + common(what,
        '<label class="sc-course">Treatment<input data-f="treatment" maxlength="80" placeholder="e.g. flush dental extraction site"></label>'
        + '<label class="sc-course">Times a day<select data-f="times"><option>1</option><option>2</option><option>3</option><option>4</option></select></label>'
        + '<label class="sc-course">For how many days<input data-f="days" type="number" min="1" max="30" value="7"></label>'
        + '<label class="sc-course">Start date<input data-f="start" type="date"></label>',
        'e.g. meloxicam 0.5 ml with food (Dispense medication), or before surgery tomorrow', 'Reason / note (say which medication for Dispense)');
  }
  var TAB_SUBS = { vets: 'Medical exam &amp; diagnosis', nurses: 'Treatments and vaccines', behaviour: 'Behaviour assessment' };
  function html(cfg) {
    var tabs = cfg.tabs, init = esc(cfg.initials || '');
    return '<div class="sc-card" data-sc-card>'
      + '<div class="sc-banner"><div><div class="eyebrow">New submission</div><h2>Send a request</h2></div>'
      + '<label class="sc-who' + (init ? '' : ' empty') + '" title="Remembered on this device">Initials:<input data-f="initials" maxlength="4" placeholder="AB" autocomplete="off" aria-label="Your initials" value="' + init + '"></label></div>'
      + '<div class="sc-body">'
      + '<div class="sc-sec"><span>1. Who is this request for?</span><span class="hint">Select recipient</span></div>'
      + '<div class="sc-head"><div class="sc-to" role="tablist" aria-label="Who is this request for?" style="--n:' + tabs.length + '">'
      + tabs.map(function (t, i) { return '<button type="button" role="tab" class="sc-tab" data-sc="' + t + '" data-sub="' + TAB_SUBS[t] + '" aria-selected="' + (i === 0) + '">' + TAB_NAMES[t] + '</button>'; }).join('')
      + '</div></div><hr class="sc-divider"><div class="sc-sec"><span>2. Request &amp; location details</span></div>'
      + tabs.map(function (t, i) { return '<div class="sc-panel" data-to="' + t + '"' + (i === 0 ? '' : ' hidden') + '>' + panelHtml(t, cfg)
        + '<button type="button" class="sc-send" data-send="' + t + '">Send to ' + TAB_NAMES[t].toLowerCase() + '</button><p class="sc-msg" data-msg></p></div>'; }).join('')
      + '</div></div>';
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
    var paintWho = function () { who.parentNode.classList.toggle('empty', !who.value); };
    who.addEventListener('input', function () { who.value = cleanInit(who.value); paintWho(); });
    who.addEventListener('change', paintWho); paintWho(); setTimeout(paintWho, 600);
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
          reason: reason || null, courthold: kindB === 'courthold', flagged_by: who2, requested_by_role: cfg.role || null,
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
        if (g.OpsCore && g.OpsCore.toast) g.OpsCore.toast();
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
