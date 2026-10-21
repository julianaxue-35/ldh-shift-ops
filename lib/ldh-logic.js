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
  // 2026-10-15: urgent cat-birthing flag. The chosen reason is stored in red_flags (so the case is Red flag tier,
  // like any emergency sign) but is NOT shown as a tick-box in the general emergency list.
  const BIRTHING_SIGNS = [
    { key: 'birth_neonates', label: 'Dying / non-thriving neonates' },
    { key: 'birth_discharge', label: 'Abnormal discharge from birthing' },
    { key: 'birth_mum_distress', label: 'Mum in distress — open-mouth breathing / vocalising' }
  ];
  // Miscellaneous tasks for the Welfare nurse (the old "NO-GA required" list). Keys are what noga_requests.task stores.
  const MISC_TASK_LABELS = { blood: 'Blood test', ear_swab: 'Ear swab', fiv_test: 'FIV test', ivft: 'Flu cat — needs IVFT',
    microchip: 'Microchip', uv: 'UV lamp check', treatment: 'Treatment check / due', med_label: 'Medication label to make', other: 'Other' };
  // 2026-10-16: a nurse finishes a task (FIV test, bloods...) and sends the result back to the vets. It lands on the
  // vet board as an ordinary 'shelter' request: "Within 2 hours" = Emergency column, "Within 12-24 hours" = Urgent column.
  const BACK_ACTIONS = { interpret: 'Interpret results', upload: 'Upload results to ShelterMate', other: 'Other (see comment)' };
  const BACK_WINDOWS = { '2h': 'Within 2 hours', '12_24h': 'Within 12–24 hours' };
  function returnedResultTask(o) {
    const act = BACK_ACTIONS[o.action] || BACK_ACTIONS.other;
    return {
      title: o.animalId, location: o.location, location_detail: o.locationDetail || null,
      shift: 'sick_injured', type: 'shelter', urgency: o.window === '2h' ? 'red_flag' : 'urgent', red_flags: [],
      needs_medication: false, sm_number: null, condition: null, done: false,
      problem: 'Result back from nurse — ' + o.taskLabel + ': ' + o.result + '. Vet to: ' + act.charAt(0).toLowerCase() + act.slice(1) + '.'
    };
  }
  // A nurse asks a vet to do something (not a result coming back): lands on the vet board as an ordinary shelter request.
  function nurseAskTask(o) {
    const act = BACK_ACTIONS[o.action] || BACK_ACTIONS.other;
    return {
      title: o.animalId, location: o.location, location_detail: o.locationDetail || null,
      shift: 'sick_injured', type: 'shelter', urgency: o.window === '2h' ? 'red_flag' : 'urgent', red_flags: [],
      needs_medication: false, sm_number: null, condition: null, done: false,
      problem: 'Task for vets from nurse \u2014 ' + o.text.replace(/[.\s]+$/, '') + '.' + (o.action && o.action !== 'other' ? ' Vet to: ' + act.charAt(0).toLowerCase() + act.slice(1) + '.' : '') + (o.initials ? ' (sent by ' + o.initials + ')' : '')
    };
  }
  // How many nurse results have been added to this case (a second send-back to an already-open case appends to
  // its problem text, so the vets page uses this count — not just the id — to notice something new).
  function returnedResultCount(t) {
    return t && t.type === 'shelter' && t.problem ? (String(t.problem).match(/Result back from nurse/g) || []).length : 0;
  }
  const RED_FLAGS = EMERGENCY_SIGNS;   // alias: older callers (tierFromFlags users) keep working
  // Old records keep their old keys; they must still display.
  const LEGACY_SIGN_LABELS = { not_eating: 'Not eating', laboured_breathing: 'Laboured breathing', bleeding: 'Bleeding',
    cant_stand: "Can't stand / collapsed", repeated_vomiting: 'Repeated vomiting' };
  function signLabel(key) {
    const f = EMERGENCY_SIGNS.find(s => s.key === key) || BIRTHING_SIGNS.find(s => s.key === key);
    if (f) return f.label;
    return Object.prototype.hasOwnProperty.call(LEGACY_SIGN_LABELS, key) ? LEGACY_SIGN_LABELS[key] : key;
  }
  const LOCATIONS = ['Cat Room 1', 'Cat Room 2', 'Cat Room 3', 'Adoption 1', 'Adoption 2', 'FIR Room',
    'Cat Isolation ward', 'Pound 1', 'Pound 2', 'Pound 3', 'Pound 4', 'Transport', 'Rabbit Room', 'Pathway', 'Offsite'];
  // 'Pathway' = foster requests (default room for foster type, 2026-10-09). It has no cages, so like Offsite
  // it is never a heat-map space and never an "unmapped space" warning.
  const OFFSITE_NAMES = ['Offsite', 'Pathway'];   // not a heat-map space; never an "unmapped space" warning
  const CHLORSIG_OPTIONS = [{ label: 'Chlorsig — left eye (L)' }, { label: 'Chlorsig — right eye (R)' }, { label: 'Chlorsig — both eyes' }];

  // Reported SIGNS staff can flag (diagnoses such as Giardia are not signs). Order is the display order.
  const SIGN_KEYS = ['cat_flu', 'kennel_cough', 'diarrhoea', 'vomiting', 'eye_condition', 'skin_condition', 'wounds_injury', 'other'];
  const CONDITION_LABELS = {
    cat_flu: 'Cat flu (URI)', kennel_cough: 'Kennel cough', diarrhoea: 'Diarrhoea / GI upset', vomiting: 'Vomiting',
    eye_condition: 'Eye condition', skin_condition: 'Skin condition', wounds_injury: 'Wounds / injury / trauma',
    other: 'Other', none: 'None flagged'
  };

  function tierFromFlags(flags) { return Array.isArray(flags) && flags.length ? 'red_flag' : 'routine'; }
  // Staff can pick how urgent a case is; emergency signs can only raise it, never lower it.
  const PICK_RANK = { routine: 0, urgent: 1, red_flag: 2 };
  function pickTier(chosen, flags) {
    const a = normTier(chosen), b = tierFromFlags(flags);
    return PICK_RANK[a] >= PICK_RANK[b] ? a : b;
  }
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
  // The "shelter check requests" ring: requests raised by staff (not the routine list checks) that were completed today or
  // are still open and were raised today; `older` = open ones raised on earlier days (still waiting, not in today's count).
  function requestRing(tasks, now) {
    const reqs = (tasks || []).filter(isRequest);
    const today = todayTasks(reqs, now);
    return { done: today.filter(t => t.done).length, total: today.length, older: carriedOver(reqs, now).length };
  }
  function caseList(tasks, now) {
    const requests = tasks.filter(isRequest);
    const doneAt = (t) => new Date(t.completed_at || t.created_at).getTime();
    const open = sortQueue(requests.filter(t => !t.done), now);
    const completed = requests.filter(t => t.done && now - doneAt(t) <= 24 * HOUR).sort((a, b) => doneAt(b) - doneAt(a));
    return { open, completed };
  }

  /* ---------- Shelter board (2026-10-09) ----------
     The board groups flagged cases by ROOM, in the order shelter staff walk it. A case's location text can
     arrive in several spellings (the dashboard form writes "Cat Room 1 / 12"; the offline tools and booking
     sheets say "CR1-12", "CR1/12", "RR-1", "Rabbit Room - 1"), so boardRoomOf() reads all of them. */
  const BOARD_ROOMS = [
    { code: 'CR1', db: 'Cat Room 1', grp: 'Cats', aliases: ['cr1', 'catroom1'] },
    { code: 'CR2', db: 'Cat Room 2', grp: 'Cats', aliases: ['cr2', 'catroom2'] },
    { code: 'CA1', db: 'Adoption 1', grp: 'Cats', aliases: ['ca1', 'adoption1'] },
    { code: 'CA2', db: 'Adoption 2', grp: 'Cats', aliases: ['ca2', 'adoption2'] },
    { code: 'FIR', db: 'FIR Room', grp: 'Cats', aliases: ['fir', 'firroom'] },
    { code: 'CR3', db: 'Cat Room 3', grp: 'Cats', aliases: ['cr3', 'catroom3'] },
    { code: 'ISO', db: 'Cat Isolation ward', grp: 'Cats', aliases: ['iso', 'isolation', 'catisolation', 'catisolationward'] },
    { code: 'TRANSPORT', db: 'Transport', grp: 'Transport & Pounds', aliases: ['transport'] },
    { code: 'P1', db: 'Pound 1', grp: 'Transport & Pounds', aliases: ['p1', 'pound1'] },
    { code: 'P2', db: 'Pound 2', grp: 'Transport & Pounds', aliases: ['p2', 'pound2'] },
    { code: 'P3', db: 'Pound 3', grp: 'Transport & Pounds', aliases: ['p3', 'pound3'] },
    { code: 'P4', db: 'Pound 4', grp: 'Transport & Pounds', aliases: ['p4', 'pound4'] },
    { code: 'RABBIT', db: 'Rabbit Room', grp: 'Other', aliases: ['rr', 'rabbitroom', 'rabbit', 'rabbits'] },
    { code: 'PATHWAY', db: 'Pathway', grp: 'Other', aliases: ['pathway', 'pathways', 'foster'] },
    { code: 'OTHER', db: null, grp: 'Other', aliases: [] }
  ];
  function boardRoomOf(location) {
    const raw = String(location || '').trim();
    if (!raw) return { code: 'OTHER', pen: '' };
    const head = raw.split('—')[0].trim();                       // "Offsite — foster name" -> "Offsite"
    const m = head.match(/^(.*?)\s*[\/–-]\s*(\d+[A-Za-z]?)\s*$/);   // "<room> / <pen>", "CR1-30", "RR-1"
    const roomText = (m ? m[1] : head).toLowerCase().replace(/[^a-z0-9]/g, '');
    const pen = m ? m[2] : '';
    const hit = BOARD_ROOMS.find(r => r.aliases.includes(roomText));
    if (hit) return { code: hit.code, pen };
    const sp = !m && head.match(/^(.*\S)\s+(\d+[A-Za-z]?)$/);                 // "rr 4", "CR1 30" (no dash)
    if (sp) {
      const h2 = BOARD_ROOMS.find(r => r.aliases.includes(sp[1].toLowerCase().replace(/[^a-z0-9]/g, '')));
      if (h2) return { code: h2.code, pen: sp[2] };
    }
    return { code: 'OTHER', pen: pen || raw };
  }
  // "Flagged before" (2026-10-09): earlier flags for the same animal ID, newest first, from the flag_history
  // log (last 3 months only). The flag being shown right now is left out — its own log line has the same time
  // as the case's created_at — so only genuinely EARLIER flags count.
  const FLAG_HISTORY_DAYS = 92;
  function flagsBefore(history, task, now) {
    const cutoff = (now || Date.now()) - FLAG_HISTORY_DAYS * 86400000;
    const here = new Date(task.created_at).getTime();
    return (history || [])
      .filter(h => h.title === task.title)
      .filter(h => { const at = new Date(h.flagged_at).getTime(); return at >= cutoff && at < here - 1000; })
      .sort((a, b) => new Date(b.flagged_at) - new Date(a.flagged_at));
  }
  // "Flagged before 2× — 28 Sep: vomiting · 14 Sep: sneezing" (newest 3 shown, rest counted)
  function flagHistoryText(entries) {
    if (!entries || !entries.length) return '';
    const day = h => new Date(h.flagged_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
    const shown = entries.slice(0, 3).map(h => day(h) + (flagReason(h) ? ': ' + flagReason(h) : '')).join(' · ');
    return 'Flagged before ' + entries.length + '× — ' + shown + (entries.length > 3 ? ' · +' + (entries.length - 3) + ' more' : '');
  }
  // 2026-10-19: every reason an animal was flagged for in this pen: the first flag, then any added later by other staff.
  function reasonText(r) {
    const parts = [];
    if (r.condition) parts.push(CONDITION_LABELS[r.condition] || r.condition);
    if (r.problem && String(r.problem).trim()) parts.push(String(r.problem).trim());
    if (Array.isArray(r.red_flags) && r.red_flags.length) parts.push('signs: ' + r.red_flags.map(signLabel).join(', '));
    return parts.join(' \u2014 ');
  }
  function reasonsOf(t) {
    const out = [{ text: reasonText(t), at: t.created_at, by: '', extra: false }];
    (Array.isArray(t.extra_reasons) ? t.extra_reasons : []).forEach(x => out.push({ text: reasonText(x), at: x.at, by: x.by || '', extra: true }));
    return out;
  }
  // The update that adds one more reason to an open case: signs are combined and urgency only ever goes up.
  function mergeReason(task, entry) {
    const flags = Array.from(new Set((task.red_flags || []).concat(entry.red_flags || [])));
    const rank = { routine: 0, urgent: 1, red_flag: 2 };
    const a = normTier(task.urgency), b = pickTier(entry.urgency, entry.red_flags || []);
    return {
      extra_reasons: (Array.isArray(task.extra_reasons) ? task.extra_reasons : []).concat([entry]),
      red_flags: flags,
      urgency: rank[a] >= rank[b] ? a : b
    };
  }
  function flagReason(h) { return (h.reason && String(h.reason).trim()) || (h.condition ? (CONDITION_LABELS[h.condition] || h.condition) : ''); }

  // 2026-10-17: Animal history lookup. Everything flagged for an animal in the last 3 months (FLAG_HISTORY_DAYS): the
  // case rows (problem, treatment, plan, vet note) plus any flag-log line whose case row no longer exists. Routine
  // list entries (check_recheck) are not flags, so they are left out. IDs match ignoring case and spaces.
  function normId(s) { return String(s == null ? '' : s).replace(/\s+/g, '').toLowerCase(); }
  function animalHistory(tasks, log, query, now) {
    const q = normId(query);
    if (!q) return [];
    const at = now || Date.now(), cutoff = at - FLAG_HISTORY_DAYS * 86400000;
    const inRange = iso => { const t = new Date(iso).getTime(); return t >= cutoff && t <= at + 60000; };
    const rows = (tasks || []).filter(t => isRequest(t) && normId(t.title).includes(q) && inRange(t.created_at))
      .map(t => ({ id: t.id, title: t.title, flagged_at: t.created_at, location: t.location, location_detail: t.location_detail, type: t.type,
        condition: t.condition, problem: t.problem, red_flags: t.red_flags || [], stage: stageOf(t, at), completed_at: t.completed_at,
        note: t.note, treatment: t.treatment, plan: t.plan, needs_medication: !!t.needs_medication, med_done_by: t.med_done_by }));
    const haveTask = new Set(rows.map(r => r.id));
    const logged = (log || []).filter(h => !haveTask.has(h.task_id) && normId(h.title).includes(q) && inRange(h.flagged_at))
      .map(h => ({ id: 'log-' + h.task_id + '-' + h.flagged_at, title: h.title, flagged_at: h.flagged_at, location: h.location, condition: h.condition,
        problem: flagReason(h) || null, red_flags: [], fromLogOnly: true }));
    return rows.concat(logged).sort((a, b) => new Date(b.flagged_at) - new Date(a.flagged_at));
  }

  // Staff-facing stage for the board: waiting / seen (vet has it and a plan may be written) / meds / done.
  function boardStage(task, now) {
    const st = stageOf(task, now);
    if (st === 'completed') return 'done';
    if (st === 'waiting_medication') return 'meds';
    if (st === 'picked_up') return 'seen';
    return 'wait';
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

  // 2026-09-30: nurse requests widened past vaccination-only (FIV test, blood
  // test, microchip too — see `kind`), and the old fixed "2 hours from
  // arrival" clock became a per-request choice (`due_window`). 'today' is
  // an absolute end-of-day deadline (device-local midnight), not a duration
  // from arrival, so it needs its own branch; '24_48h' mirrors the existing
  // "routine" task tier elsewhere in this file (amber at 24h, red at 48h)
  // for the same vocabulary across the dashboard. Old rows with no
  // `due_window` (or callers not yet passing one) default to '2h', the
  // original behaviour.
  function nurseRequestStatus(req, now) {
    if (req.done_count >= req.animal_count) return { level: 'done', label: 'complete' };
    const arrivedAt = new Date(req.arrived_at).getTime();
    const elapsed = now - arrivedAt;
    const win = req.due_window || '2h';
    let dueAt, level;
    if (win === 'today') {
      // Anchored on arrival, NOT on `now` — a due-by-midnight instant must
      // stay fixed once computed. Deriving it from `now` instead would keep
      // recomputing "midnight of tomorrow relative to whenever this is next
      // checked", which can never actually go overdue (caught by testing
      // the after-midnight case directly, not assumed).
      dueAt = windowStart('today', arrivedAt + 24 * HOUR).getTime();   // midnight at the end of the arrival day
      level = now >= dueAt ? 'red' : (dueAt - now <= 2 * HOUR ? 'amber' : 'ok');
    } else if (win === '24_48h') {
      dueAt = arrivedAt + 48 * HOUR;
      level = elapsed >= 48 * HOUR ? 'red' : (elapsed >= 24 * HOUR ? 'amber' : 'ok');
    } else {
      dueAt = arrivedAt + 2 * HOUR;
      level = now >= dueAt ? 'red' : (dueAt - now <= 30 * MIN ? 'amber' : 'ok');
    }
    return { level, dueAt, label: now >= dueAt ? 'overdue ' + fmtDuration(now - dueAt) : fmtDuration(dueAt - now) + ' left' };
  }

  // Scheduled arrival (2026-09-26): a request logged ahead of time
  // (arrived_at still null, expected_at in the future) shows a countdown TO
  // arrival instead of nurseRequestStatus's "time left" — that clock
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
    if (key === 'quarter') return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);
    if (key === 'year') return new Date(d.getFullYear(), 0, 1);
    const days = { '3d': 3, '7d': 7, '30d': 30 }[key] || 3;
    return new Date(now - days * 24 * HOUR);
  }

  // 2026-09-29: the shift-progress rings/cards (index.html, vets.html) read
  // `tasks` directly with no date scoping at all — a row lives forever unless
  // someone deletes it (see feedback that the dashboard "never restarts").
  // Fix without touching the DB: a task still counts toward today's total
  // while it's open (an unresolved case shouldn't vanish at midnight), but a
  // COMPLETED task only counts once — on the day it was actually completed —
  // so yesterday's finished cases age out of today's ring instead of
  // inflating it forever. `now` is the caller's own Date.now()/local clock,
  // matching every other "today" in this codebase (device-local, not UTC).
  function todayTasks(tasks, now) {
    const start = windowStart('today', now).getTime();
    const by = new Map();
    tasks.forEach(t => {
      // 2026-10-16: counts were ~80 for Sick & Injured because every unfinished row from EARLIER days stayed in
      // today's total forever. Now a task is "today's" only if it was completed today, or is still open AND
      // was added today. Older unfinished rows are reported separately (carriedOver) instead.
      const stamp = t.done ? new Date(t.completed_at || t.created_at).getTime() : new Date(t.created_at).getTime();
      if (!(stamp >= start)) return;
      // One animal = one check per shift per day, however many rows it has (a different location spelling on a
      // second load, extra spaces or different capitalisation in the ID). A finished row wins over an open one.
      const k = animalKey(t), prev = by.get(k);
      if (!prev || (t.done && !prev.done)) by.set(k, t);
    });
    return Array.from(by.values());
  }
  function animalKey(t) { return String(t.shift) + '|' + String(t.title || '').replace(/\s+/g, '').toUpperCase(); }
  // Unfinished rows added before today — not in today's count, but still open (shown as "N older still open").
  function carriedOver(tasks, now) {
    const start = windowStart('today', now).getTime();
    const today = new Set(todayTasks(tasks, now).map(animalKey));
    const by = new Map();
    tasks.forEach(t => {
      if (t.done || !(new Date(t.created_at).getTime() < start)) return;
      const k = animalKey(t);
      if (!today.has(k)) by.set(k, t);
    });
    return Array.from(by.values());
  }

  // Monthly/quarterly/yearly completed-count totals, for shelter staff to see
  // how much has actually been done beyond just today (2026-09-29 ask).
  // `rows` = completed tasks for the year so far ({shift, completed_at}) —
  // both index.html and stats.html already fetch (or can fetch) exactly this
  // shape, so the same rows can feed both the daily-progress fix above and
  // these period totals without a second query on either page.
  function periodTotals(rows, now) {
    const bounds = { month: windowStart('month', now).getTime(), quarter: windowStart('quarter', now).getTime(), year: windowStart('year', now).getTime() };
    const blank = () => ({ processing: 0, sick_injured: 0, surgery: 0, total: 0 });
    const out = { month: blank(), quarter: blank(), year: blank() };
    rows.forEach(r => {
      if (!r.completed_at) return;
      const t = new Date(r.completed_at).getTime();
      ['month', 'quarter', 'year'].forEach(key => {
        if (t < bounds[key]) return;
        if (Object.prototype.hasOwnProperty.call(out[key], r.shift)) out[key][r.shift]++;
        out[key].total++;
      });
    });
    return out;
  }

  // ---- Nurse activity (2026-10-19): daily average of tasks completed, per nurse role, for the week / month / quarter /
  // year so far. `rows` = [{day:'YYYY-MM-DD', role:'welfare'|'processing', n}] (one row per day and role). The average is
  // per WORKING day (a day with at least one task done), so weekends and days off don't pull it down. No targets.
  function localDayKey(d) {
    const x = new Date(d);
    return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
  }
  function weekStartMonday(now) {
    const d = new Date(now); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  }
  function nurseStats(rows, now) {
    const today = localDayKey(now);
    const starts = { week: localDayKey(weekStartMonday(now)), month: localDayKey(windowStart('month', now)), quarter: localDayKey(windowStart('quarter', now)), year: localDayKey(windowStart('year', now)) };
    const out = {};
    ['welfare', 'processing'].forEach(role => {
      const mine = (rows || []).filter(r => r.role === role && r.day <= today);
      const o = { today: mine.filter(r => r.day === today).reduce((a, r) => a + Number(r.n), 0) };
      Object.keys(starts).forEach(p => {
        const inP = mine.filter(r => r.day >= starts[p] && Number(r.n) > 0);
        const total = inP.reduce((a, r) => a + Number(r.n), 0);
        const days = new Set(inP.map(r => r.day)).size;
        o[p] = { total, days, avg: days ? round1(total / days) : 0 };
      });
      out[role] = o;
    });
    return out;
  }

  // ---- Admission AA progress (2026-10-19): rows = [{day:'YYYY-MM-DD', cat:'notes'|'charts'|'tasks', n}]. Totals for the week / month /
  // quarter / year so far, and the average per working day (a day with something completed). No targets.
  function aaStats(rows, now) {
    const today = localDayKey(now);
    const starts = { week: localDayKey(weekStartMonday(now)), month: localDayKey(windowStart('month', now)), quarter: localDayKey(windowStart('quarter', now)), year: localDayKey(windowStart('year', now)) };
    const out = {};
    ['notes', 'charts', 'tasks'].forEach(cat => {
      const mine = (rows || []).filter(r => r.cat === cat && r.day <= today);
      const o = { today: mine.filter(r => r.day === today).reduce((a, r) => a + Number(r.n), 0) };
      Object.keys(starts).forEach(p => {
        const inP = mine.filter(r => r.day >= starts[p] && Number(r.n) > 0);
        const total = inP.reduce((a, r) => a + Number(r.n), 0), days = new Set(inP.map(r => r.day)).size;
        o[p] = { total, days, avg: days ? round1(total / days) : 0 };
      });
      out[cat] = o;
    });
    return out;
  }

  // ---- Surgery breakdown (2026-10-19): cats / dogs / rabbits, routine (spey / castrate) vs non-routine (everything
  // else: amputation, dental ...), for the week / month / quarter / year so far. `rows` = [{done_at, species, routine}].
  function surgeryBreakdown(rows, now) {
    const starts = { week: weekStartMonday(now).getTime(), month: windowStart('month', now).getTime(), quarter: windowStart('quarter', now).getTime(), year: windowStart('year', now).getTime() };
    const blank = () => ({ cat: { routine: 0, other: 0 }, dog: { routine: 0, other: 0 }, rabbit: { routine: 0, other: 0 }, other: { routine: 0, other: 0 }, routine: 0, nonRoutine: 0, total: 0 });
    const out = { week: blank(), month: blank(), quarter: blank(), year: blank() };
    (rows || []).forEach(r => {
      const t = new Date(r.done_at).getTime();
      const sp = Object.prototype.hasOwnProperty.call(out.year, r.species) && ['cat', 'dog', 'rabbit'].includes(r.species) ? r.species : 'other';
      Object.keys(starts).forEach(p => {
        if (t < starts[p] || t > now + 60000) return;
        out[p][sp][r.routine ? 'routine' : 'other']++;
        out[p][r.routine ? 'routine' : 'nonRoutine']++;
        out[p].total++;
      });
    });
    return out;
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

  /* ---------- Admission AA (2026-10-17) ----------
     Items the nurses send for the Admission AA to enter in ShelterMate. Ticked = deleted, so there is no "done" state here. */
  const AA_KINDS = { fiv: 'FIV result', microchip: 'Microchip', uv: 'UV result', microchip_uv: 'Microchip + UV', vaccination: 'Vaccination update',
    processing_note: 'Processing notes', si_note: 'Sick & injured notes', med_chart: 'Medication chart' };
  const AA_HOURS = 24;

  // Litters (2026-10-19): "1170123 - 1170130" is every animal from 1170123 to 1170130; "1170123,124,126 - 130" is
  // 1170123, 1170124 and 1170126 to 1170130 (a shorter number borrows the front of the one before it). Anything that is
  // not a number range (e.g. "T-100") is one ID. Returns {ids, error}; a range over MAX_LITTER animals is refused.
  const MAX_LITTER = 40;
  function expandAnimalIds(text) {
    const src = String(text == null ? '' : text).replace(/(\d)\s*[-\u2013\u2014]\s*(\d)/g, '$1-$2');
    const ids = [], seen = new Set();
    let lastFull = '';                       // the most recent complete number, whose front a short number borrows
    const add = (id) => { id = id.toUpperCase(); if (id && !seen.has(id)) { seen.add(id); ids.push(id); } };
    const tail = (id) => { const m = /^(.*?)(\d+)$/.exec(id); return m ? { pre: m[1], num: m[2] } : null; };
    // a digits-only token shorter than the last full number borrows that number's leading digits
    const resolve = (tok) => {
      if (/^\d+$/.test(tok) && lastFull) { const t = tail(lastFull); if (t && tok.length < t.num.length) return t.pre + t.num.slice(0, t.num.length - tok.length) + tok; }
      return tok;
    };
    for (const raw of src.split(/[\s,;]+/)) {
      const tok = raw.trim();
      if (!tok) continue;
      const rg = /^(.*\d)-(\d+)$/.exec(tok);
      if (rg) {
        const from = resolve(rg[1]), tf = tail(from);
        let to = rg[2];
        if (to.length < tf.num.length) to = tf.pre + tf.num.slice(0, tf.num.length - to.length) + to; else to = tf.pre + to;
        const a = BigInt(tf.num), b = BigInt(tail(to).num);
        if (b < a) return { ids: [], error: `"${tok}" counts backwards: put the lower number first.` };
        if (b - a + 1n > BigInt(MAX_LITTER)) return { ids: [], error: `"${tok}" is more than ${MAX_LITTER} animals: check the numbers.` };
        for (let n = a; n <= b; n++) add(tf.pre + String(n).padStart(tf.num.length, '0'));
        lastFull = from;
        continue;
      }
      const id = resolve(tok);
      add(id);
      if (id === tok) lastFull = tok;
    }
    return { ids, error: '' };
  }
  function parseAnimalIds(text) { return expandAnimalIds(text).ids; }

  function aaBuildItem(f) {
    if (!AA_KINDS[f.kind]) return { error: 'Choose what you are sending (the type).' };
    const expanded = expandAnimalIds(f.idsText);
    if (expanded.error) return { error: expanded.error };
    const ids = expanded.ids;
    if (!ids.length) return { error: 'Enter at least one animal ID.' };
    if (f.kind !== 'vaccination' && f.kind !== 'uv' && ids.length > 1) return { error: 'Send one animal at a time for this type (only vaccination updates and UV results can list several).' };
    const initials = String(f.initials || '').trim().toUpperCase().slice(0, 4);
    if (!initials) return { error: 'Enter your initials first.' };
    const text = v => String(v == null ? '' : v).trim();
    let payload;
    if (f.kind === 'fiv' || f.kind === 'uv') {
      if (!text(f.result)) return { error: 'Enter the result.' };
      payload = { result: text(f.result) };
    } else if (f.kind === 'microchip' || f.kind === 'microchip_uv') {
      const chip = String(f.chipNumber == null ? '' : f.chipNumber).replace(/[\s-]/g, '');
      if (!/^\d{9,15}$/.test(chip)) return { error: 'The microchip number must be 9 to 15 digits (spaces are fine).' };
      payload = { chip_number: chip, implanter: initials };
      if (f.kind === 'microchip_uv') {
        if (!text(f.uvResult)) return { error: 'Enter the UV result.' };
        payload.uv_result = text(f.uvResult);
      }
    } else {
      if (!text(f.vaccine)) return { error: 'Enter the vaccine given.' };
      payload = { vaccine: text(f.vaccine), date: text(f.vaccDate) };
    }
    return { row: { kind: f.kind, animal_ids: ids, payload, sent_by: initials } };
  }

  function aaSummary(item) {
    const p = item.payload || {};
    const n = (item.animal_ids || []).length;
    switch (item.kind) {
      case 'fiv': return p.result || '';
      case 'uv': return 'UV: ' + (p.result || '');
      case 'microchip': return `Chip ${p.chip_number} · implanted by ${p.implanter}`;
      case 'microchip_uv': return `Chip ${p.chip_number} · implanted by ${p.implanter} · UV: ${p.uv_result}`;
      case 'vaccination': return `${p.vaccine} given${p.date ? ' ' + p.date : ''} · ${n} animal${n === 1 ? '' : 's'}`;
      case 'processing_note':
      case 'si_note': {
        const lines = String(p.text || '').split('\n').filter(l => l.trim()).length;
        return `Notes to enter in ShelterMate (${lines} line${lines === 1 ? '' : 's'})`;
      }
      case 'med_chart': {
        const m = (p.lines || []).length;
        return `Medication chart (${m} medication${m === 1 ? '' : 's'})`;
      }
      default: return '';
    }
  }

  function aaCountdown(item, nowMs) {
    const total = AA_HOURS * 3600000;
    let sent = new Date(item.sent_at).getTime();
    if (!isFinite(sent) || sent > nowMs) sent = nowMs;           // bad/future timestamp: treat as just sent
    const left = total - (nowMs - sent);
    const hm = ms => `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
    if (left <= 0) return { msLeft: 0, overdue: true, overdueMs: -left, level: 'red', label: 'Overdue by ' + hm(-left) };
    return { msLeft: left, overdue: false, overdueMs: 0, level: left <= 4 * 3600000 ? 'amber' : 'ok', label: hm(left) + ' left' };
  }

  function aaChangeKey(item) { return item.id + '|' + (item.updated_at || ''); }

  const aaIsPriority = item => !!(item && item.payload && item.payload.priority === true);
  function aaSortItems(items, nowMs) {
    return items.slice().sort((a, b) => {
      if (aaIsPriority(a) !== aaIsPriority(b)) return aaIsPriority(a) ? -1 : 1;          // priority first, then overdue, then oldest
      const ca = aaCountdown(a, nowMs), cb = aaCountdown(b, nowMs);
      if (ca.overdue !== cb.overdue) return ca.overdue ? -1 : 1;
      return new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime();
    });
  }

  return { AA_KINDS, AA_HOURS, parseAnimalIds, expandAnimalIds, aaIsPriority, aaBuildItem, aaSummary, aaCountdown, aaSortItems, aaChangeKey, BOARD_ROOMS, boardRoomOf, boardStage, flagsBefore, flagReason, normId, animalHistory, flagHistoryText, RED_FLAGS, EMERGENCY_SIGNS, BIRTHING_SIGNS, MISC_TASK_LABELS, BACK_ACTIONS, BACK_WINDOWS, returnedResultTask, nurseAskTask, returnedResultCount, signLabel, OFFSITE_NAMES, CHLORSIG_OPTIONS, stageOf, caseList, isRequest, medCopyText, TIER_LABELS, TIER_TARGETS, LOCATIONS, tierFromFlags, requestRing, pickTier, nurseStats, aaStats, surgeryBreakdown, normTier, reasonsOf, reasonText, mergeReason, statusOf, sortQueue,
    fmtDuration, localISO, addDaysISO, doseSlots, slotLabel, doseLevel, nurseRequestStatus, arrivalStatus, needsArrivalWarning, courseProgress,
    splitMemos, CONDITION_LABELS, summariseConditions,
    SIGN_KEYS, spaceOf, windowStart, buildSurvey, baselineStatus, todayTasks, carriedOver, periodTotals };
});
