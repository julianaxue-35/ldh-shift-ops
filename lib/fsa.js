/* LDH Shift Ops — Feline Spectrum Assessment (FSA) logic for the FIR room page (fir.html).
   Browser: global FSA. Node: module.exports (pure functions, no DOM).

   Source: the FSA score sheets (5 pages) and the Points Scoring chart.
   Day numbering: Day 0 = the day the cat arrives. The scale's "Day 2 AM" is our Day 1 AM and its "Day 3 AM" is our Day 2 AM.
   Four assessments: Day 1 AM, Day 1 PM, Day 2 AM, Day 2 PM. Only the two AM assessments carry points. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FSA = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const W = 'white', G = 'gray';   // white = square (one-and-done), gray = circle (affiliative)
  const it = (key, label, kind) => ({ key, label, kind });
  const FRONT = [it('play', 'Play', W), it('touch', 'Touch', W), it('rub', 'Rub', W), it('chirp', 'Chirp', W), it('knead', 'Knead', W), it('atfront', 'At front of cage', W),
    it('reach', 'Reach', G), it('underside', 'Show underside', G), it('sniff', 'Sniff', G), it('approach', 'Approach', G)];
  const STROKE = [it('play', 'Play', W), it('touch', 'Touch', W), it('rub', 'Rub', W), it('knead', 'Knead', W), it('reach', 'Reach', G), it('underside', 'Show underside', G), it('sniff', 'Sniff', G)];

  const SECTIONS = [
    { key: 'A', title: 'A: Greet', how: 'Stand 1 foot in front of the cage, body slightly angled, making indirect eye contact. Hold hand out, palm up, then speak a "baby talk" phrase. Example phrase: "Hi Kitty. Whatcha doin\'? What a pretty kitty…whatcha doin\'? Come here."',
      groups: [{ key: 'all', label: '', items: FRONT }] },
    { key: 'B', title: 'B: Crack door', how: 'Stand 1 foot in front of the cage, making indirect eye contact, body slightly at an angle but still facing the cat door and say, "Hi, Kitty!" in a friendly, soft voice. Hand is held on the handle for 30 seconds. Crack door open 1-2 inches then immediately close.',
      note: 'Place hand on or near handle of the cage door.', groups: [{ key: 'all', label: '', items: FRONT }] },
    { key: 'C', title: 'C: Toy', how: 'Stand 1 ft in front of the cage, body slightly angled, making indirect eye contact. A string attached to the pole is threaded through the cage bars and jiggled just inside the door of the cage to coax the cat to play for 30 seconds.',
      groups: [{ key: 'all', label: '', items: [it('play', 'Play', W), it('touch', 'Touch', W), it('rub', 'Rub', W), it('chirp', 'Chirp', W), it('knead', 'Knead', W), it('atfront', 'At front of cage', W), it('tailup', 'Tail up', W),
        it('reach', 'Reach', G), it('underside', 'Show underside', G), it('sniff', 'Sniff', G), it('approach', 'Approach', G), it('yawn', 'Yawn', G), it('groom', 'Groom / shake body', G), it('standing', 'Standing', G), it('moving', 'Still moving', G)] }] },
    { key: 'D', title: 'D: Wand', how: 'Stand in front of cage, body angled, indirect eye contact. Slowly extend wand to cat through bars. When 2-3 in from face, allow cat to sniff (5 sec). Try to pet on cheek (10 sec). Put wand 2-3 in from face to allow sniffing again (5 sec). Try to pet on cheek (10 sec). Trace wand along side of neck to top of shoulders then apply pressure (10 sec).',
      groups: [
        { key: 'any', label: 'Any time', items: [it('chirp', 'Chirp', W), it('atfront', 'At front of cage', W), it('approach', 'Approach', G), it('yawn', 'Yawn', G), it('groom', 'Groom / shake body', G)] },
        { key: 'stroking', label: 'While stroking', items: STROKE },
        { key: 'pressing', label: 'While pressing', items: STROKE }] }
  ];

  // Four assessments, in the order they happen. Points only on the AM ones.
  const SESSIONS = [
    { id: 's1', day: 1, ampm: 'AM', points: 'd1', label: 'Day 1 AM' },
    { id: 's2', day: 1, ampm: 'PM', points: null, label: 'Day 1 PM' },
    { id: 's3', day: 2, ampm: 'AM', points: 'd2', label: 'Day 2 AM' },
    { id: 's4', day: 2, ampm: 'PM', points: null, label: 'Day 2 PM' }
  ];

  // Yes/No points questions. The staff tick yes or no; the points are added in the background.
  // scope = where the tool looks to SUGGEST an answer for an "affiliative behaviours" question (a box ticked in that part); staff still confirm.
  const QUESTIONS = {
    d1: [
      { id: 'a_noeat', section: 'A', points: 7, text: 'Cat did NOT eat (overnight), or you cannot tell' },
      { id: 'a_aff', section: 'A', points: 9, text: 'Affiliative behaviours at any time during Greet', scope: 'A' },
      { id: 'b_lick', section: 'B', points: 7, text: 'Cat licks lips or nose' },
      { id: 'c_head', section: 'C', points: 11, text: 'Cat’s head is facing forward, or you cannot tell, at the end of Toy' },
      { id: 'c_attn', section: 'C', points: 5, text: 'Cat paid attention to the toy more than 50% of the time' },
      { id: 'd_sniff', section: 'D', points: 4, text: 'Cat sniffs the wand on first presentation' },
      { id: 'd_press', section: 'D', points: 7, text: 'Affiliative behaviours during pressing', scope: 'D.pressing' }
    ],
    d2: [
      { id: 'a_eye', section: 'A', points: 7, text: 'Eye contact is less than 50% of the time, or you cannot tell' },
      { id: 'b_alert', section: 'B', points: 9, text: 'Cat is NOT alert, is semi-alert, or you cannot tell' },
      { id: 'b_back', section: 'B', points: 9, text: 'Cat withdraws, or is already at the back of the cage' },
      { id: 'c_aff', section: 'C', points: 9, text: 'Affiliative behaviours at any time during Toy', scope: 'C' },
      { id: 'd_head', section: 'D', points: 5, text: 'Head location is at the front or middle of the cage' },
      { id: 'd_stroke', section: 'D', points: 7, text: 'Affiliative behaviours during stroking', scope: 'D.stroking' },
      { id: 'd_sniff', section: 'D', points: 5, text: 'Cat sniffs the wand on first presentation' }
    ]
  };
  const MAX_POINTS = { d1: 50, d2: 51 };

  const OUTCOMES = {
    1: { n: 1, label: 'Extremely likely to be socialised', blurb: 'Cats over the cut-offs on both mornings are very likely to be more socialised.' },
    2: { n: 2, label: 'Likely to be socialised', blurb: 'More likely to be socialised, though some less socialised cats fit here. Some may turn out to be socialised with a bit of time and behaviour modification.' },
    3: { n: 3, label: 'Unlikely to be socialised', blurb: 'More likely to be less socialised, although a few more socialised cats score in this range.' },
    4: { n: 4, label: 'Extremely unlikely to be socialised', blurb: 'Very likely to be less socialised. A few very withdrawn, frightened cats can still turn out to be more socialised.' }
  };
  const PLANS = ['Behaviour modification', 'General population adoption', 'Behavioural euthanasia'];
  const FAS_OPTIONS = [{ v: '1', label: '1 (Slight)' }, { v: '2', label: '2 (Mild)' }, { v: '3', label: '3 (Moderate)' }, { v: '4', label: '4 (High)' }, { v: '5', label: '5 (Extreme)' }];

  const tickId = (sec, grp, item) => sec + '.' + grp + '.' + item;
  const sessionDef = (id) => SESSIONS.find(s => s.id === id);

  // ---- counting the boxes ----
  function sectionCounts(session, secKey) {
    const ticks = (session && session.ticks) || {};
    const sec = SECTIONS.find(s => s.key === secKey);
    let white = 0, gray = 0;
    sec.groups.forEach(g => g.items.forEach(i => { if (ticks[tickId(sec.key, g.key, i.key)]) { if (i.kind === W) white++; else gray++; } }));
    return { white, gray };
  }
  function sessionCounts(session) {
    let white = 0, gray = 0;
    SECTIONS.forEach(s => { const c = sectionCounts(session, s.key); white += c.white; gray += c.gray; });
    return { white, gray };
  }
  // Cumulative check-marks across all four assessments (the cumulative table on the sheet).
  function cumulative(sessions) {
    const rows = SESSIONS.map(def => Object.assign({ id: def.id, label: def.label, done: !!(sessions && sessions[def.id] && sessions[def.id].doneAt) }, sessionCounts(sessions && sessions[def.id])));
    return { rows, white: rows.reduce((n, r) => n + r.white, 0), gray: rows.reduce((n, r) => n + r.gray, 0) };
  }
  // A white box ticked at any time = early graduate (social); 4+ grey circles in total = early graduate; otherwise full points scoring.
  function graduation(sessions) {
    const c = cumulative(sessions), byWhite = c.white >= 1, byGray = c.gray >= 4;
    return { early: byWhite || byGray, byWhite, byGray, white: c.white, gray: c.gray,
      status: (byWhite || byGray) ? 'Early graduation' : 'Full points scoring completed' };
  }

  // ---- points ----
  function suggest(session, scope) {   // is any box ticked in this part of the assessment?
    if (!scope) return false;
    const ticks = (session && session.ticks) || {};
    const parts = scope.split('.'), sec = SECTIONS.find(s => s.key === parts[0]);
    return sec.groups.some(g => (!parts[1] || g.key === parts[1]) && g.items.some(i => ticks[tickId(sec.key, g.key, i.key)]));
  }
  function sessionPoints(session, setKey) {
    const qs = QUESTIONS[setKey] || [], ans = (session && session.answers) || {};
    let total = 0, answered = 0;
    qs.forEach(q => { if (ans[q.id] === true) { total += q.points; answered++; } else if (ans[q.id] === false) answered++; });
    return { total, answered, unanswered: qs.length - answered, max: MAX_POINTS[setKey] };
  }
  // The scale's bands (Day 1 AM here = "Day 2 AM" on the sheet; Day 2 AM here = "Day 3 AM").
  const band1 = (p) => p < 15 ? 0 : p <= 19 ? 1 : p <= 31 ? 2 : 3;
  const band2 = (p) => p < 12 ? 0 : p <= 17 ? 1 : p <= 26 ? 2 : 3;
  const BAND1_LABELS = ['<15', '15–19', '20–31', '>31'], BAND2_LABELS = ['<12', '12–17', '18–26', '>26'];
  const MATRIX = [   // rows: Day 1 AM band; columns: Day 2 AM band; value = outcome 1 (extremely likely) to 4 (extremely unlikely)
    [4, 4, 2, 1],
    [4, 3, 2, 1],
    [2, 2, 1, 1],
    [1, 1, 1, 1]
  ];
  // Day 1 on its own (before Day 2 AM is scored): the Day 1 AM scale, shown as provisional.
  const DAY1_ONLY = [4, 3, 2, 1];
  function outcome(day1, day2) {
    const has1 = day1 != null, has2 = day2 != null;
    if (has1 && has2) return Object.assign({ provisional: false }, OUTCOMES[MATRIX[band1(day1)][band2(day2)]]);
    if (has1) return Object.assign({ provisional: true }, OUTCOMES[DAY1_ONLY[band1(day1)]]);
    return null;
  }

  // ---- the cat's whole result ----
  function summary(cat) {
    const d = (cat && cat.data) || {}, sessions = d.sessions || {};
    const grad = graduation(sessions), cum = cumulative(sessions);
    const p1 = sessionPoints(sessions.s1, 'd1'), p2 = sessionPoints(sessions.s3, 'd2');
    const has1 = p1.answered > 0, has2 = p2.answered > 0;
    const out = grad.early ? null : outcome(has1 ? p1.total : null, has2 ? p2.total : null);
    return { graduation: grad, cumulative: cum, day1: has1 ? p1 : null, day2: has2 ? p2 : null, outcome: out,
      socialisation: grad.early ? 'Early FSA graduate – this cat is social' : out ? out.n + ' – ' + out.label.toLowerCase() + (out.provisional ? ' (provisional: Day 2 not scored yet)' : '') : 'Not scored yet' };
  }

  // ---- days and what is due ----
  const dayStart = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  function dayInfo(intakeAt, now) {
    const n = now ? new Date(now) : new Date();
    const day = Math.round((dayStart(n) - dayStart(intakeAt)) / 86400000);
    return { day, ampm: n.getHours() < 12 ? 'AM' : 'PM' };
  }
  // The assessments that have come due by now, in order (Day 1 AM is due from the morning after arrival).
  function dueSessions(cat, now) {
    const di = dayInfo(cat.intake_at, now);
    if (di.day < 1) return [];
    const slot = (di.day - 1) * 2 + (di.ampm === 'PM' ? 1 : 0);
    return SESSIONS.filter((s, i) => i <= slot);
  }
  function nextDue(cat, now) {
    const sessions = ((cat.data || {}).sessions) || {};
    return dueSessions(cat, now).find(s => !(sessions[s.id] && sessions[s.id].doneAt)) || null;
  }
  // The cage only empties after the notes are in ShelterMate and ticked off (a cat with nothing recorded yet can be removed: it was added by mistake).
  const smEntered = (cat) => !!((cat && cat.data) || {}).smEntered;
  function hasAnyEntry(cat) {
    const d = (cat && cat.data) || {}, ses = d.sessions || {};
    return !!(d.behaviour || d.fas || d.plan || Object.keys(ses).some(k => ses[k] && (Object.keys(ses[k].ticks || {}).length || Object.keys(ses[k].answers || {}).length || ses[k].doneAt)));
  }
  const canDischarge = (cat) => smEntered(cat) || !hasAnyEntry(cat);
  // What a cage tile shows.
  function tileState(cat, now) {
    const s = summary(cat), di = dayInfo(cat.intake_at, now), sm = smEntered(cat) ? ' \u00B7 in SM \u2713' : ' \u00B7 enter in SM';
    if (s.graduation.early) return { key: 'graduate', label: 'Graduate \u2013 social' + sm };
    if (s.outcome && !s.outcome.provisional) return { key: 'outcome' + s.outcome.n, label: 'FSA ' + s.outcome.n + sm };
    const due = nextDue(cat, now);
    if (due) return { key: 'due', label: due.label + ' due' };
    if (di.day < 1) return { key: 'day0', label: 'Day 0' };
    if (s.outcome) return { key: 'wait', label: 'Day 1 scored' };
    return { key: 'wait', label: 'Day ' + Math.min(di.day, 2) + ' in progress' };
  }


  // ---- reminders: things staff need to pick up ----
  // The final assessment day: the day it graduated (early graduates), otherwise Day 2. Notes should be in ShelterMate within 2 days of it.
  function finalDate(cat) {
    const d = (cat && cat.data) || {};
    if (graduation(d.sessions || {}).early) return dayStart(d.gradAt || cat.intake_at);
    const x = dayStart(cat.intake_at); x.setDate(x.getDate() + 2); return x;
  }
  function smDeadline(cat) { const x = finalDate(cat); x.setDate(x.getDate() + 2); return x; }
  // An assessment is overdue once the next slot has begun and it still is not done (AM by midday; PM by the end of the day).
  function overdueSessions(cat, now) {
    if (graduation((((cat || {}).data) || {}).sessions || {}).early) return [];
    const di = dayInfo(cat.intake_at, now); if (di.day < 1) return [];
    const slot = (di.day - 1) * 2 + (di.ampm === 'PM' ? 1 : 0), ses = (((cat.data || {}).sessions) || {});
    return SESSIONS.filter((x, i) => slot >= i + 1 && !(ses[x.id] && ses[x.id].doneAt));
  }
  function reminders(cats, now) {
    const n = now ? new Date(now) : new Date(), out = [];
    (cats || []).forEach(cat => {
      if (cat.status && cat.status !== 'active') return;
      const od = overdueSessions(cat, n);
      if (od.length) out.push({ id: cat.id, cage: cat.cage, animal_id: cat.animal_id, kind: 'assessment', text: od.map(x => x.label).join(', ') + (od.length === 1 ? ' assessment is' : ' assessments are') + ' not done' });
      if (!smEntered(cat) && n >= smDeadline(cat)) out.push({ id: cat.id, cage: cat.cage, animal_id: cat.animal_id, kind: 'sm', text: 'notes are not in ShelterMate yet (due ' + smDeadline(cat).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }) + ')' });
    });
    return out;
  }

  // What goes in the counts-only log when a cat is completed: 'graduate', '1'-'4', or 'unscored' (no final result).
  function logOutcome(cat) {
    const s = summary(cat);
    if (s.graduation.early) return 'graduate';
    return s.outcome && !s.outcome.provisional ? String(s.outcome.n) : 'unscored';
  }
  // One line for the vets when staff ask them to start shelter stress medication (animal, FSA result, points, FAS, behaviour notes).
  function vetNote(cat) {
    const d = (cat && cat.data) || {}, s = summary(cat), beh = String(d.behaviour || '').replace(/\s*\n\s*/g, ' ').trim();
    return 'FIR room cage ' + cat.cage + '. FSA result: ' + s.socialisation + '. Graduation: ' + s.graduation.status + ' (one and done ' + s.graduation.white + ', 4 or more ' + s.graduation.gray + '). Day 1 points ' + (s.day1 ? s.day1.total : 'not scored')
      + ', Day 2 points ' + (s.day2 ? s.day2.total : 'not scored') + '. FAS ' + (d.fas || 'not scored') + (d.plan ? '. Plan: ' + d.plan : '') + '. Behaviour: ' + (beh || 'no notes yet');
  }
  // Who did each assessment (the staff member's initials are recorded on the assessment day).
  function assessedBy(cat) {
    const ses = (((cat && cat.data) || {}).sessions) || {};
    return SESSIONS.filter(def => ses[def.id] && (ses[def.id].doneBy || ses[def.id].by) && (ses[def.id].doneAt || Object.keys(ses[def.id].ticks || {}).length || Object.keys(ses[def.id].answers || {}).length)).map(def => def.label + ' ' + (ses[def.id].doneBy || ses[def.id].by)).join(', ');
  }
  // ---- the ShelterMate / Teams text ----
  function templateText(cat) {
    const d = (cat && cat.data) || {}, s = summary(cat);
    const plan = d.plan || '', fas = d.fas || '';
    return [
      'Graduation status: ' + s.graduation.status,
      'One and done behaviours: ' + s.graduation.white,
      '4 or more behaviour: ' + s.graduation.gray,
      'Day 1 points: ' + (s.day1 ? s.day1.total : 'not scored'),
      'Day 2 points: ' + (s.day2 ? s.day2.total : 'not scored'),
      'Socialisation status: ' + s.socialisation,
      'Behaviour: ' + String(d.behaviour || '').replace(/\s*\n\s*/g, ' ').trim(),
      'FAS: ' + fas,
      'PLAN: ' + plan,
      'Assessed by: ' + (assessedBy(cat) || 'initials not recorded'),
      'Behaviour notes by: ' + (d.behaviourBy || 'initials not recorded')
    ].join('\n');
  }

  return { SECTIONS, SESSIONS, QUESTIONS, MAX_POINTS, OUTCOMES, PLANS, FAS_OPTIONS, MATRIX, BAND1_LABELS, BAND2_LABELS, tickId, sessionDef,
    sectionCounts, sessionCounts, cumulative, graduation, suggest, sessionPoints, band1, band2, outcome, summary, dayInfo, dueSessions, nextDue, tileState, templateText, logOutcome, vetNote, assessedBy, smEntered, hasAnyEntry, canDischarge, finalDate, smDeadline, overdueSessions, reminders };
});
