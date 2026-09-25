/* LDH Shift Ops — pure logic (no DOM, no network).
   Browser: global LDHLogic. Node: module.exports (for unit tests). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LDHLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const HOUR = 3600 * 1000, MIN = 60 * 1000;

  const TIER_LABELS = { red_flag: 'Emergency', urgent: 'Urgent', routine: 'Request checks' };
  const TIER_TARGETS = { red_flag: 'within 2 h', urgent: 'within 12–24 h', routine: 'within 24–48 h' };
  const EMERGENCY_SIGNS = [
    { key: 'not_eating_48h', label: 'Not eating > 48 hours' },
    { key: 'not_urinating_36h', label: 'Not urinating > 36 hours' },
    { key: 'bleeding_wound', label: "Bleeding wound (large cut / can't stop the bleeding)" },
    { key: 'not_defecated_72h', label: 'Not defecated > 72 hours' },
    { key: 'vomited_multiple', label: 'Vomited multiple piles' }
  ];
  const RED_FLAGS = EMERGENCY_SIGNS;   // alias: older callers (tierFromFlags users) keep working
  // Old records keep their old keys; they must still display.
  const LEGACY_SIGN_LABELS = { not_eating: 'Not eating', laboured_breathing: 'Laboured breathing', bleeding: 'Bleeding',
    cant_stand: "Can't stand / collapsed", repeated_vomiting: 'Repeated vomiting' };
  function signLabel(key) {
    const f = EMERGENCY_SIGNS.find(s => s.key === key);
    if (f) return f.label;
    return Object.prototype.hasOwnProperty.call(LEGACY_SIGN_LABELS, key) ? LEGACY_SIGN_LABELS[key] : key;
  }
  const LOCATIONS = ['Cat Room 1', 'Cat Room 2', 'Cat Room 3', 'Adoption 1', 'Adoption 2', 'FIR Room',
    'Cat Isolation ward', 'Pound 1', 'Pound 2', 'Pound 3', 'Pound 4', 'Transport', 'Offsite'];
  const OFFSITE_NAMES = ['Offsite'];   // not a heat-map space; never an "unmapped space" warning
  const CHLORSIG_OPTIONS = [{ label: 'Chlorsig — left eye (L)' }, { label: 'Chlorsig — right eye (R)' }, { label: 'Chlorsig — both eyes' }];

  // Reported SIGNS staff can flag (diagnoses such as Giardia are not signs). Order is the display order.
  const SIGN_KEYS = ['cat_flu', 'kennel_cough', 'diarrhoea', 'vomiting', 'eye_condition', 'skin_condition', 'wounds_injury', 'other'];
  const CONDITION_LABELS = {
    cat_flu: 'Cat flu (URI)', kennel_cough: 'Kennel cough', diarrhoea: 'Diarrhoea / GI upset', vomiting: 'Vomiting',
    eye_condition: 'Eye condition', skin_condition: 'Skin condition', wounds_injury: 'Wounds / injury / trauma',
    other: 'Other', none: 'None flagged'
  };

  function tierFromFlags(flags) { return Array.isArray(flags) && flags.length ? 'red_flag' : 'routine'; }
  function normTier(t) { return t === 'soon' ? 'urgent' : (TIER_LABELS[t] ? t : 'routine'); }

  function fmtDuration(ms) {
    const m = Math.floor(Math.abs(ms) / MIN);
    const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
    if (d) return d + 'd ' + h + 'h';
    if (h) return h + 'h ' + mm + 'm';
    return mm + 'm';
  }

  function statusOf(task, now) {
    const tier = normTier(task.urgency);
    if (task.done || task.claimed_at) {
      return { tier, level: 'seen', dueAt: null, label: task.claimed_at ? 'claimed' : 'done' };
    }
    const created = new Date(task.created_at).getTime();
    const elapsed = now - created;
    let dueAt, level;
    if (tier === 'red_flag') {
      dueAt = created + 2 * HOUR;
      level = now >= dueAt ? 'red' : (dueAt - now <= 30 * MIN ? 'amber' : 'ok');
    } else if (tier === 'urgent') {
      dueAt = created + 24 * HOUR;
      level = elapsed >= 24 * HOUR ? 'red' : (elapsed >= 12 * HOUR ? 'amber' : 'ok');
    } else {
      dueAt = created + 48 * HOUR;
      level = elapsed >= 48 * HOUR ? 'red' : (elapsed >= 24 * HOUR ? 'amber' : 'ok');
    }
    const label = now >= dueAt ? 'overdue ' + fmtDuration(now - dueAt) : fmtDuration(dueAt - now) + ' left';
    return { tier, level, dueAt, label };
  }

  const LEVEL_RANK = { red: 0, amber: 1, ok: 2, seen: 3 };
  const TIER_RANK = { red_flag: 0, urgent: 1, routine: 2 };
  function sortQueue(tasks, now) {
    return tasks.slice().sort((a, b) => {
      const sa = statusOf(a, now), sb = statusOf(b, now);
      // Highest tier first (Red flag, Urgent, Routine); inside a tier, overdue before amber before ok,
      // picked-up/done last; then oldest first. (Juliana's rule, 2026-09-21.)
      return TIER_RANK[sa.tier] - TIER_RANK[sb.tier]
        || LEVEL_RANK[sa.level] - LEVEL_RANK[sb.level]
        || new Date(a.created_at) - new Date(b.created_at);
    });
  }

  function stageOf(task, now) {
    if (task.done) return 'completed';
    if (task.needs_medication && task.vet_done_at) return 'waiting_medication';
    if (task.claimed_at) return 'picked_up';
    return 'flagged';
  }

  // Only tasks actually submitted through the dashboard's own flag form belong
  // in the case queue. Every animal on today's offline-tool list also lands in
  // `tasks` (so the completion donut can show "X of Y done"), but the sync
  // never sets `type` — it keeps the column default 'check_recheck' — while
  // the flag form always sends one of shelter/foster/rescue/medication. That
  // difference is what tells a real request apart from a routine list entry
  // (2026-09-26: she found synced-but-never-flagged animals piling up in the
  // "Request checks" column — they must stay out of the queue, but keep
  // counting toward the donut/progress numbers, which read TASKS directly).
  function isRequest(t) { return t.type !== 'check_recheck'; }
  function caseList(tasks, now) {
    const requests = tasks.filter(isRequest);
    const doneAt = (t) => new Date(t.completed_at || t.created_at).getTime();
    const open = sortQueue(requests.filter(t => !t.done), now);
    const completed = requests.filter(t => t.done && now - doneAt(t) <= 24 * HOUR).sort((a, b) => doneAt(b) - doneAt(a));
    return { open, completed };
  }

  function medCopyText(t) {
    const off = OFFSITE_NAMES.includes(t.location);
    const loc = off ? (t.location_detail ? t.location + ' — ' + t.location_detail : t.location) : t.location;
    return `${t.title} | SM ${t.sm_number || '—'} | ${loc}\n${t.med_label || ''}`;
  }

  function localISO(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function addDaysISO(iso, n) {
    const [y, m, d] = iso.split('-').map(Number);
    return localISO(new Date(y, m - 1, d + n));
  }
  function doseSlots(startISO, timesPerDay, days) {
    const out = [];
    for (let day = 1; day <= days; day++) {
      for (let slot = 1; slot <= timesPerDay; slot++) {
        out.push({ day_no: day, slot_no: slot, due_date: addDaysISO(startISO, day - 1) });
      }
    }
    return out;
  }
  const SLOT_NAMES = { 1: ['Daily'], 2: ['AM', 'PM'], 3: ['Morning', 'Midday', 'Evening'], 4: ['Early AM', 'Late AM', 'Afternoon', 'Evening'] };
  function slotLabel(timesPerDay, slot) { return (SLOT_NAMES[timesPerDay] || [])[slot - 1] || ('Dose ' + slot); }
  function doseLevel(dose, todayISO) {
    if (dose.done_at) return 'done';
    if (dose.due_date < todayISO) return 'overdue';
    if (dose.due_date === todayISO) return 'due';
    return 'later';
  }
  function courseProgress(doses) {
    return { done: doses.filter(d => d.done_at).length, total: doses.length };
  }

  function vaccStatus(req, now) {
    if (req.done_count >= req.animal_count) return { level: 'done', label: 'complete' };
    const dueAt = new Date(req.arrived_at).getTime() + 2 * HOUR;
    const level = now >= dueAt ? 'red' : (dueAt - now <= 30 * MIN ? 'amber' : 'ok');
    return { level, dueAt, label: now >= dueAt ? 'overdue ' + fmtDuration(now - dueAt) : fmtDuration(dueAt - now) + ' left' };
  }

  // Scheduled arrival (2026-09-26): a request logged ahead of time
  // (arrived_at still null, expected_at in the future) shows a countdown TO
  // arrival instead of vaccStatus's "time left to vaccinate" — that clock
  // only starts once someone marks it arrived. Past the expected time with
  // nobody confirming arrival, it goes to a red "overdue arrival" state
  // (her call: never auto-starts the vaccinate clock on its own).
  const ARRIVAL_WARNING_WINDOW = 15 * MIN;
  function arrivalStatus(req, now) {
    if (req.arrived_at) return null;
    const expAt = new Date(req.expected_at).getTime();
    if (now >= expAt) return { level: 'red', label: 'overdue arrival by ' + fmtDuration(now - expAt), overdue: true };
    const level = expAt - now <= ARRIVAL_WARNING_WINDOW ? 'amber' : 'ok';
    return { level, label: 'arriving in ' + fmtDuration(expAt - now), overdue: false };
  }
  // True exactly while a scheduled (not-yet-arrived) request is within the
  // warning window before its expected time — the moment nurses.html should
  // show the banner + ding, once per request (caller tracks "already warned").
  function needsArrivalWarning(req, now) {
    if (req.arrived_at || !req.expected_at) return false;
    const msLeft = new Date(req.expected_at).getTime() - now;
    return msLeft > 0 && msLeft <= ARRIVAL_WARNING_WINDOW;
  }

  // Counts of each reported condition for a set of flagged tasks, plus a per-space breakdown of the flagged ones.
  function summariseConditions(rows) {
    const counts = {};
    SIGN_KEYS.forEach(k => { counts[k] = 0; });
    counts.none = 0;   // last, so exports list "None flagged" after the signs
    rows.forEach(t => { counts[t.condition && Object.prototype.hasOwnProperty.call(counts, t.condition) ? t.condition : 'none']++; });
    const flagged = rows.filter(t => t.condition).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const byLocation = {};
    flagged.forEach(t => {
      const loc = t.location || '(no location)';
      byLocation[loc] = byLocation[loc] || {};
      byLocation[loc][t.condition] = (byLocation[loc][t.condition] || 0) + 1;
    });
    return { counts, flagged, byLocation, flaggedTotal: flagged.length, total: rows.length };
  }

  function spaceOf(location) { return String(location || '').split('/')[0].trim(); }

  function windowStart(key, now) {
    const d = new Date(now);
    if (key === 'today') { d.setHours(0, 0, 0, 0); return d; }
    if (key === 'month') return new Date(d.getFullYear(), d.getMonth(), 1);
    const days = { '3d': 3, '7d': 7, '30d': 30 }[key] || 3;
    return new Date(now - days * 24 * HOUR);
  }

  const round1 = (x) => Math.round(x * 10) / 10;

  // Rates for the heat map. A CASE = one animal (tasks.title) with one flagged sign since `since`: an animal is counted once
  // for the same sign, but an animal with two different signs is two cases (Juliana's rule).
  function buildSurvey(tasks, locations, since) {
    const spaces = locations.slice().sort((a, b) => a.sort - b.sort)
      .map(l => ({ name: l.name, grp: l.grp, cages: l.cages, cases: new Set(), by: {} }));
    const idx = {}; spaces.forEach(s => { idx[s.name] = s; });
    const signAnimals = {}, allCases = new Set(), unmapped = new Set();
    tasks.forEach(t => {
      if (!t.condition || new Date(t.created_at) < since) return;
      const animal = t.title, caseKey = animal + '|' + t.condition;   // a case = one animal with one sign
      (signAnimals[t.condition] = signAnimals[t.condition] || new Set()).add(animal);
      allCases.add(caseKey);
      const sp = idx[spaceOf(t.location)];
      if (!sp && OFFSITE_NAMES.includes(spaceOf(t.location).split('—')[0].trim())) return;   // offsite: neither a space nor a warning
      if (!sp) { unmapped.add(animal); return; }
      sp.cases.add(caseKey);
      (sp.by[t.condition] = sp.by[t.condition] || new Set()).add(animal);
    });
    const outSpaces = spaces.map(s => {
      let leading = null, max = 0;
      SIGN_KEYS.concat(Object.keys(s.by)).forEach(k => { if (s.by[k] && s.by[k].size > max) { max = s.by[k].size; leading = k; } });
      const by = {}; Object.keys(s.by).forEach(k => { by[k] = s.by[k].size; });
      return { name: s.name, grp: s.grp, cages: s.cages, cases: s.cases.size,
        rate: s.cages ? round1(s.cases.size / s.cages * 100) : null, leading, by };
    });
    const groups = [];
    outSpaces.forEach(s => {
      let g = groups.find(x => x.name === s.grp);
      if (!g) { g = { name: s.grp, cases: 0, cages: 0, rate: null }; groups.push(g); }
      g.cases += s.cases; g.cages += s.cages;
    });
    groups.forEach(g => { g.rate = g.cages ? round1(g.cases / g.cages * 100) : null; });
    const totalCases = allCases.size;
    const ranked = Object.keys(signAnimals)
      .map(k => ({ key: k, animals: signAnimals[k].size, share: totalCases ? Math.round(signAnimals[k].size / totalCases * 100) : 0 }))
      .sort((a, b) => b.animals - a.animals || SIGN_KEYS.indexOf(a.key) - SIGN_KEYS.indexOf(b.key));
    return { spaces: outSpaces, groups, ranked, totalCases, unmapped: unmapped.size, since };
  }

  function baselineStatus(dates, target) {
    const of = target || 365, days = new Set(dates).size;   // a full year: disease varies with the season
    return { day: Math.min(days, of), of, done: days >= of, days };
  }

  function splitMemos(memos) {
    return { active: memos.filter(m => !m.done), completed: memos.filter(m => m.done) };
  }

  return { RED_FLAGS, EMERGENCY_SIGNS, signLabel, OFFSITE_NAMES, CHLORSIG_OPTIONS, stageOf, caseList, isRequest, medCopyText, TIER_LABELS, TIER_TARGETS, LOCATIONS, tierFromFlags, normTier, statusOf, sortQueue,
    fmtDuration, localISO, addDaysISO, doseSlots, slotLabel, doseLevel, vaccStatus, arrivalStatus, needsArrivalWarning, courseProgress,
    splitMemos, CONDITION_LABELS, summariseConditions,
    SIGN_KEYS, spaceOf, windowStart, buildSurvey, baselineStatus };
});
