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

  const CONDITION_LABELS = {
    cat_flu: 'Cat flu (URI)', kennel_cough: 'Kennel cough', diarrhoea: 'Diarrhoea / GI upset',
    wounds_injury: 'Wounds / injury / trauma', other: 'Other', none: 'None flagged'
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
      return LEVEL_RANK[sa.level] - LEVEL_RANK[sb.level]
        || TIER_RANK[sa.tier] - TIER_RANK[sb.tier]
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

  function splitMemos(memos) {
    return { active: memos.filter(m => !m.done), completed: memos.filter(m => m.done) };
  }

  return { RED_FLAGS, TIER_LABELS, TIER_TARGETS, LOCATIONS, tierFromFlags, normTier, statusOf, sortQueue,
    fmtDuration, localISO, addDaysISO, doseSlots, slotLabel, doseLevel, vaccStatus, courseProgress,
    splitMemos, CONDITION_LABELS };
});
