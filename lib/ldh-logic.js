/* LDH Shift Ops — pure logic (no DOM, no network).
   Browser: global LDHLogic. Node: module.exports (for unit tests). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LDHLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const HOUR = 3600 * 1000, MIN = 60 * 1000;

  const TIER_LABELS = { red_flag: 'Red flag', urgent: 'Urgent', routine: 'Routine' };
  const TIER_TARGETS = { red_flag: 'within 2 h', urgent: 'within 12–24 h', routine: 'within 24–48 h' };
  const RED_FLAGS = [
    { key: 'not_eating', label: 'Not eating' },
    { key: 'laboured_breathing', label: 'Laboured breathing' },
    { key: 'bleeding', label: 'Bleeding' },
    { key: 'cant_stand', label: "Can't stand / collapsed" },
    { key: 'repeated_vomiting', label: 'Repeated vomiting' }
  ];
  const LOCATIONS = ['Cat Room 1', 'Cat Room 2', 'Cat Room 3', 'Adoption 1', 'Adoption 2', 'FIR Room',
    'Cat Isolation ward', 'Pound 1', 'Pound 2', 'Pound 3', 'Pound 4', 'Transport'];

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
    const dueAt = new Date(req.arrived_at).getTime() + 3 * HOUR;
    const level = now >= dueAt ? 'red' : (dueAt - now <= 30 * MIN ? 'amber' : 'ok');
    return { level, dueAt, label: now >= dueAt ? 'overdue ' + fmtDuration(now - dueAt) : fmtDuration(dueAt - now) + ' left' };
  }

  // Counts of each reported condition for a set of flagged tasks, plus a per-space breakdown of the flagged ones.
  function summariseConditions(rows) {
    const counts = { none: 0 };
    SIGN_KEYS.forEach(k => { counts[k] = 0; });
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

  return { RED_FLAGS, TIER_LABELS, TIER_TARGETS, LOCATIONS, tierFromFlags, normTier, statusOf, sortQueue,
    fmtDuration, localISO, addDaysISO, doseSlots, slotLabel, doseLevel, vaccStatus, courseProgress,
    splitMemos, CONDITION_LABELS, summariseConditions,
    SIGN_KEYS, spaceOf, windowStart, buildSurvey, baselineStatus };
});
