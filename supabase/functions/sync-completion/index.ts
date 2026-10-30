// LDH Shift Ops — offline-tool sync (completions + list-load).
//
// Five request shapes (delete added 2026-09-25, chart + status 2026-09-26),
// same endpoint, same shared secret:
//   1. { title, location, shift }        — one item just ticked "Completed"
//      in an offline tool. Upserts done=true, completed_at=now().
//   2. { items: [{title,location,shift}, ...] } — a whole list just got
//      loaded/imported into an offline tool (2026-09-19 amendment, "Option
//      1": the dashboard needs the total, not just completions, to show
//      "X of Y" instead of just "X"). Insert-only, ON CONFLICT DO NOTHING —
//      this must NEVER overwrite an existing row's done/completed_at, since
//      an item already marked complete must stay complete even if the same
//      list gets re-imported.
//   4. { chart: {title,location,shift,med_label,med_chart_done} } — a
//      medication chart was registered/corrected for this animal in
//      Processing/Sick & Injured/Surgery (medchart.js). UPDATE only, never
//      an upsert: if the dashboard has no matching row (not a flagged
//      medication case, or not on the dashboard at all) this is a no-op —
//      it must never create a stray task row out of a chart record alone.
//
//  12. { behaviour: {animal_id,location,reason,sent_by,window,note} } — (2026-10-21) send an animal to the Behaviour page with its note attached
//   9. { nurse_label: {animal_id,location,sent_by,labels:[{key,text}]} } — (2026-10-21) medication labels for the Welfare nurse
//   8. { aa_check: {items:[{kind,animal_id}]} } — (2026-10-19) read-only: which Admission AA cards are still waiting?
//
//   9. { surgery_log: {source_id,species,surg_type,surg_type2,registered} } — (2026-10-19) a registered surgery, for the stats
//
//  10. { flag_check: {titles:[...]} } / 11. { flag_done: {title, plan} } — (2026-10-19) open staff requests on an animal, and marking them done
//
//   5. { status: {shift, items:[{title,location}]} } — read-back: which of
//      these were already completed today by another device? Answers only
//      about the pairs sent; never lists other animals.
//
//   6. { care: {title, shift, treatment, plan} } — (2026-10-09, Shelter board) the vet's
//      treatment and plan for a flagged animal, so shelter staff can read them against the
//      animal's room/pen. UPDATE only, never an insert: it fills in the existing dashboard
//      request(s) for that animal ID and silently touches nothing if there isn't one. Matched on
//      title + shift (+ a request type, created in the last 3 days) — NOT location, because the
//      offline tools and the dashboard spell the same pen differently ("CR1-30" vs "Cat Room 1 / 30").
//
//   7. { aa: {kind, animal_id, location, sent_by, payload} } — (2026-10-18) share a finished note with the
//      Admission AA page; replies {ok:true} only once saved.
//
// Runs with the service role key, which bypasses RLS entirely, so this
// function itself is the only thing that must be trusted to only ever
// touch `tasks`. Everything writes (insert/update/delete) except shape 5,
// which reads back only what the caller already asked about.
//
// Why this exists instead of a scoped "sync_writer" Supabase Auth user:
// that approach (see the design spec's Option 2) hit an unresolved,
// reproducible platform-specific bug — an authenticated session tagged
// via app_metadata was rejected by a plain `auth.role() = 'authenticated'`
// RLS policy, even though the identical request succeeded for an
// untagged authenticated session, and manually simulating the same role
// in SQL also succeeded. Rather than keep chasing that, this function
// avoids the RLS/JWT-role path completely.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SYNC_SECRET = Deno.env.get('SYNC_SECRET');
const PROJECT_URL = Deno.env.get('PROJECT_URL');
const SERVICE_KEY = Deno.env.get('SERVICE_KEY');

const VALID_SHIFTS = ['processing', 'sick_injured', 'surgery'];

// Called cross-origin from GitHub Pages (a different origin than this
// function), so the browser sends a CORS preflight OPTIONS request before
// the real POST. Missing this was the actual bug on the first deploy: curl
// doesn't enforce CORS, so testing with curl looked fine while every real
// browser call silently failed the preflight and was never sent.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'apikey, x-sync-secret, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ISO timestamp of the most recent midnight in Melbourne (used by the
// read-back so only completions from today count).
function melbourneMidnightISO(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Australia/Melbourne', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const g = (t: string) => parseInt(parts.find((p) => p.type === t)!.value, 10);
  const msSinceMidnight = ((g('hour') * 60 + g('minute')) * 60 + g('second')) * 1000;
  return new Date(Date.now() - msSinceMidnight).toISOString();
}

// aa-validate-start
// Admission AA (Phase 2): a vet's shift tool sends a finished note / medication chart. Plain JavaScript on purpose
// (no type annotations) so tests/aa-edge-validate.test.mjs can run exactly this block.
const AA_NOTE_KINDS = ['processing_note', 'si_note', 'surgery_note', 'med_chart'];
function aaSourceKey(kind, dateISO, animalId) { return kind + '|' + dateISO + '|' + animalId; }
function validateAaShare(a) {
  if (!a || typeof a !== 'object') return { error: 'Bad request.' };
  if (AA_NOTE_KINDS.indexOf(a.kind) === -1) return { error: 'Unknown kind.' };
  const id = typeof a.animal_id === 'string' ? a.animal_id.trim().toUpperCase() : '';
  if (!id || id.length > 40) return { error: 'An animal ID (up to 40 characters) is required.' };
  const sentBy = typeof a.sent_by === 'string' ? a.sent_by.trim().toUpperCase().slice(0, 4) : '';
  const p = a.payload && typeof a.payload === 'object' ? a.payload : null;
  if (!p) return { error: 'Missing payload / text.' };
  let payload;
  if (a.kind === 'med_chart') {
    const lines = Array.isArray(p.lines) ? p.lines.filter((l) => typeof l === 'string' && l.trim()).map((l) => l.trim().slice(0, 500)).slice(0, 20) : [];
    if (!lines.length) return { error: 'The medication chart has no lines.' };
    payload = { lines: lines };
    if (p.xlsx_b64 != null && p.xlsx_b64 !== '') {
      if (typeof p.xlsx_b64 !== 'string' || p.xlsx_b64.length > 1200000) return { error: 'The Excel chart is too large to send.' };
      if (!/^[A-Za-z0-9+\/=]+$/.test(p.xlsx_b64)) return { error: 'The Excel chart is not valid base64.' };
      payload.xlsx_b64 = p.xlsx_b64;
    }
  } else {
    const text = typeof p.text === 'string' ? p.text.trim() : '';
    if (!text) return { error: 'The note text is empty.' };
    if (text.length > 20000) return { error: 'The note is too long (limit 20,000 characters).' };
    payload = { text: text };
    if (p.priority === true) payload.priority = true;          // the vet asked for this one to be done first (e.g. awaiting foster)
    if (payload.priority && Number.isFinite(p.due_mins) && p.due_mins >= 5 && p.due_mins <= 240) payload.due_mins = Math.round(p.due_mins);   // "within 30-60 minutes"; the card counts down from this
    if (p.docx_b64 != null && p.docx_b64 !== '') {
      if (typeof p.docx_b64 !== 'string' || p.docx_b64.length > 1200000) return { error: 'The Word file is too large to send.' };
      if (!/^[A-Za-z0-9+\/=]+$/.test(p.docx_b64)) return { error: 'The Word file is not valid base64.' };
      payload.docx_b64 = p.docx_b64;
    }
  }
  const location = typeof a.location === 'string' ? a.location.trim().slice(0, 80) : '';
  if (location) payload.location = location;
  return { row: { kind: a.kind, animal_ids: [id], payload: payload, sent_by: sentBy } };
}
// Shape 8 request: which of these cards are still waiting for the Admission AA? (anything no longer there was ticked)
// (2026-10-21) { nurse_label: { animal_id, location, sent_by, labels: [{ key, text }] } } — a vet sends medication labels to the Welfare nurse.
function validateNurseLabel(n) {
  if (!n || typeof n !== 'object') return { error: 'Bad request.' };
  const id = typeof n.animal_id === 'string' ? n.animal_id.trim() : '';
  if (!id || id.length > 40) return { error: 'An animal ID (up to 40 characters) is required.' };
  const location = typeof n.location === 'string' ? n.location.trim().slice(0, 80) : '';
  if (!location) return { error: 'A location is required.' };
  const sentBy = typeof n.sent_by === 'string' ? n.sent_by.trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) : '';
  if (!Array.isArray(n.labels) || !n.labels.length || n.labels.length > 10) return { error: 'Send between 1 and 10 labels.' };
  const labels = [];
  for (const l of n.labels) {
    const key = typeof l?.key === 'string' ? l.key.trim().slice(0, 120) : '';
    const text = typeof l?.text === 'string' ? l.text.trim().slice(0, 1000) : '';
    if (!key || !text) return { error: 'Each label needs a key and its text.' };
    labels.push({ key, text });
  }
  return { id, location, sentBy, labels };
}
function validateAaCheck(c) {
  if (!c || typeof c !== 'object' || !Array.isArray(c.items)) return { error: 'Bad request.' };
  if (!c.items.length || c.items.length > 100) return { error: 'Send between 1 and 100 items.' };
  const pairs = [];
  for (const it of c.items) {
    if (!it || AA_NOTE_KINDS.indexOf(it.kind) === -1) return { error: 'Unknown kind.' };
    const id = typeof it.animal_id === 'string' ? it.animal_id.trim().toUpperCase() : '';
    if (!id || id.length > 40) return { error: 'Each item needs an animal ID.' };
    pairs.push({ kind: it.kind, id: id });
  }
  return { pairs: pairs };
}
// aa-validate-end

// flag-validate-start
// Flags (2026-10-19): the Processing tool asks "which of these animals are also flagged on the dashboard?" and can mark such a
// flag done with a quick plan. Matching ignores case and spaces. Only requests (not routine list checks) are ever touched.
const flagId = (s) => String(s == null ? '' : s).replace(/\s+/g, '').toUpperCase();
function validateFlagCheck(c) {
  if (!c || typeof c !== 'object' || !Array.isArray(c.titles)) return { error: 'Bad request.' };
  const titles = c.titles.map((t) => (typeof t === 'string' ? t.trim() : '')).filter(Boolean);
  if (!titles.length || titles.length > 100 || titles.some((t) => t.length > 40)) return { error: 'Send between 1 and 100 animal IDs.' };
  return { ids: Array.from(new Set(titles.map(flagId))) };
}
function validateFlagDone(c) {
  if (!c || typeof c !== 'object') return { error: 'Bad request.' };
  const title = typeof c.title === 'string' ? c.title.trim() : '';
  if (!title || title.length > 40) return { error: 'An animal ID is required.' };
  const plan = typeof c.plan === 'string' ? c.plan.trim().slice(0, 1000) : '';
  if (!plan) return { error: 'A quick plan is required.' };
  return { id: flagId(title), plan: plan };
}
// flag-validate-end

// surgery-validate-start
// Surgery stats: the Surgery tool reports each registered surgery (species + procedure only). Routine = spey / castrate.
const SURGERY_ROUTINE_TYPES = ['spey', 'spey-flank', 'preg1', 'preg2', 'preg3', 'castrate', 'cryptorchid'];
function validateSurgeryLog(s) {
  if (!s || typeof s !== 'object') return { error: 'Bad request.' };
  const id = typeof s.source_id === 'string' ? s.source_id.trim() : '';
  if (!id || id.length > 80) return { error: 'A source id is required.' };
  if (s.registered === false) return { remove: id };
  const sp = String(s.species || '').toLowerCase();
  const species = ['cat', 'dog', 'rabbit'].indexOf(sp) !== -1 ? sp : 'other';
  const t1 = String(s.surg_type || '').trim().slice(0, 40);
  const t2 = String(s.surg_type2 || '').trim().slice(0, 40);
  if (!t1) return { error: 'The surgery type is required.' };
  const routine = [t1, t2].filter(Boolean).every((t) => SURGERY_ROUTINE_TYPES.indexOf(t) !== -1);
  return { row: { id: id, species: species, procedure: t1, procedure2: t2 || null, routine: routine } };
}
// surgery-validate-end

// behaviour-validate-start
// (2026-10-21) { behaviour: { animal_id, location, reason, sent_by, window, note } } — a vet sends an animal to the Behaviour page
// with the whole medical note attached. The database removes the note when the task is ticked Done.
function validateBehaviourSend(b, dayISO) {
  if (!b || typeof b !== 'object') return { error: 'Bad request.' };
  const id = typeof b.animal_id === 'string' ? b.animal_id.trim().toUpperCase() : '';
  if (!id || id.length > 40) return { error: 'An animal ID (up to 40 characters) is required.' };
  const reason = typeof b.reason === 'string' ? b.reason.trim().slice(0, 500) : '';
  if (!reason) return { error: 'A reason is required.' };
  const note = typeof b.note === 'string' ? b.note.trim() : '';
  if (!note) return { error: 'The note is empty.' };
  if (note.length > 20000) return { error: 'The note is too long (limit 20,000 characters).' };
  const by = typeof b.sent_by === 'string' ? b.sent_by.trim().toUpperCase() : '';
  if (!/^[A-Z]{1,4}$/.test(by)) return { error: 'Initials (1 to 4 letters) are required.' };
  if (['30_60m', 'today', '48h'].indexOf(b.window) === -1) return { error: 'Pick a time frame.' };
  const location = typeof b.location === 'string' ? b.location.trim().slice(0, 80) : '';
  const sp = typeof b.species === 'string' ? b.species.trim().toLowerCase() : '';
  return { row: { kind: 'behaviour_review', requested_by_role: 'vets', animal_id: id, location: location || 'Unknown', species: sp === 'cat' || sp === 'dog' ? sp : null, reason: reason, flagged_by: by,
    due_window: b.window, attached_note: note, source_key: 'bh|' + dayISO + '|' + id } };
}
// A resend by anyone (same animal, same day) replaces the note, so say so in the card's history.
function behaviourResendHistory(history, by, nowISO) {
  return (Array.isArray(history) ? history : []).concat([{ at: nowISO, by: by, from: 'updated', to: 'note re-sent' }]);
}
// behaviour-validate-end

// Completed Admission AA cards are kept 7 days (so a note the AA missed can be put back), then removed. Best effort.
// status-match-start
// (2026-10-30) The offline tools and the dashboard spell the same animal/pen differently (case, spaces, "CR1-30" vs
// "Cat Room 1 / 30"), so the read-back compares a normalised ID + location, and answers with the CALLER's own spelling.
function statusKey(title, location) {
  const id = String(title == null ? '' : title).replace(/\s+/g, '').toLowerCase();
  const loc = String(location == null ? '' : location).toLowerCase().replace(/[^a-z0-9]/g, '')
    .replace(/^catroom/, 'cr').replace(/^adoption/, 'ca').replace(/^pound/, 'p').replace(/^rabbitroom/, 'rr');
  return id + '|' + loc;
}
function doneAmong(asked, rows) {
  const have = new Set(rows.map((r) => statusKey(r.title, r.location)));
  return asked.filter((it) => have.has(statusKey(it.title, it.location))).map((it) => ({ title: it.title, location: it.location }));
}
// status-match-end

// list-refresh-start
// (2026-10-30) A list entry (type check_recheck) left over from an EARLIER day — still open, or finished on an earlier day — is
// the same animal being listed again today. The insert is ignore-duplicates, so without this it never counted toward today's
// total (22 of 37 on a 48-animal list). Re-listing makes it a fresh, open check for today. Rows already created or completed
// today are left alone, so a list sent twice in a day can never undo a completion.
function staleToRefresh(rows, wantedKeys, midnightISO) {
  const start = new Date(midnightISO).getTime();
  return rows.filter((r) => {
    if (r.type !== 'check_recheck' || !wantedKeys.has(r.title + '|' + r.location)) return false;
    if (r.done) return r.completed_at ? new Date(r.completed_at).getTime() < start : new Date(r.created_at).getTime() < start;
    return new Date(r.created_at).getTime() < start;
  });
}
// list-refresh-end

async function purgeCompletedAa(supabase) {
  try {
    await supabase.from('aa_items').delete().not('completed_at', 'is', null)
      .lt('completed_at', new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString());
  } catch (_e) { /* never block a send over housekeeping */ }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: CORS_HEADERS });
  }

  const providedSecret = req.headers.get('x-sync-secret');
  // 2026-10-30: three wrong codes from one network address in 15 minutes lock that address (even for the right code) and every
  // wrong guess is logged (when, which door, which address; never the guess). Needs migration 0045: if it has not been run the
  // calls below fail and the check carries on exactly as before, so syncing never breaks because of the lockout.
  const clientId = (req.headers.get('cf-connecting-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0] || 'unknown').trim() || 'unknown';
  const guard = createClient(PROJECT_URL, SERVICE_KEY);
  let recentFailures = 0;
  try {
    const { data, error } = await guard.rpc('auth_recent_failures', { p_client: clientId });
    if (!error && typeof data === 'number') recentFailures = data;
  } catch { /* lockout unavailable: carry on */ }
  if (recentFailures >= 3) {
    try { await guard.rpc('auth_record_failure', { p_source: 'sync_code', p_role: null, p_client: clientId, p_blocked: true }); } catch { /* log only */ }
    return new Response(JSON.stringify({ error: 'Too many wrong attempts. Try again in 15 minutes.' }), { status: 429, headers: { ...CORS_HEADERS, 'Retry-After': '900' } });
  }
  if (!SYNC_SECRET || providedSecret !== SYNC_SECRET) {
    if (providedSecret) {   // a missing code is a tool that was never connected, not a guess
      try { await guard.rpc('auth_record_failure', { p_source: 'sync_code', p_role: null, p_client: clientId, p_blocked: false }); } catch { /* log only */ }
    }
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS_HEADERS });
  }
  if (recentFailures > 0) {
    try { await guard.rpc('auth_clear_failures', { p_client: clientId }); } catch { /* count simply ages out */ }
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: CORS_HEADERS });
  }

  const supabase = createClient(PROJECT_URL, SERVICE_KEY);

  // Shapes 10 and 11 (2026-10-19): { flag_check: {titles:[...]} } -> {ok, flags:[{title,location,condition,problem,type,created_at,needs_medication}]}
  // for the OPEN staff requests on those animals; { flag_done: {title, plan} } marks them done with a quick plan.
  if ((body.flag_check && typeof body.flag_check === 'object') || (body.flag_done && typeof body.flag_done === 'object')) {
    const isDone = !!body.flag_done;
    const v = isDone ? validateFlagDone(body.flag_done) : validateFlagCheck(body.flag_check);
    if (v.error) return new Response(JSON.stringify({ error: v.error }), { status: 400, headers: CORS_HEADERS });
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const { data, error } = await supabase.from('tasks')
      .select('id,title,location,condition,problem,type,created_at,needs_medication,med_done_at')
      .eq('done', false).neq('type', 'check_recheck').gte('created_at', since).limit(1000);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: CORS_HEADERS });
    const want = new Set(isDone ? [v.id] : v.ids);
    const hits = (data ?? []).filter((r) => want.has(flagId(r.title)));
    if (!isDone) {
      return new Response(JSON.stringify({ ok: true, flags: hits.map((r) => ({ title: r.title, location: r.location, condition: r.condition, problem: r.problem, type: r.type, created_at: r.created_at, needs_medication: !!r.needs_medication })) }), { status: 200, headers: CORS_HEADERS });
    }
    const waiting = hits.filter((r) => r.needs_medication && !r.med_done_at).length;   // a medication case stays open until the nurse has made the label
    let updated = 0;
    if (hits.length) {
      const now = new Date().toISOString();
      const upd = await supabase.from('tasks')
        .update({ done: true, completed_by_role: 'vet_nurse', completed_at: now, vet_done_at: now, plan: v.plan })
        .in('id', hits.map((r) => r.id)).select('id');
      if (upd.error) return new Response(JSON.stringify({ error: upd.error.message }), { status: 500, headers: CORS_HEADERS });
      updated = (upd.data ?? []).length;
    }
    return new Response(JSON.stringify({ ok: true, updated: updated, found: hits.length, waiting_medication: waiting }), { status: 200, headers: CORS_HEADERS });
  }
  // Shape 9 (2026-10-19): { surgery_log: {source_id, species, surg_type, surg_type2, registered} } — the Surgery tool
  // reports a registered surgery (or an un-registered one: registered:false removes it) for the dashboard stats.
  if (body.surgery_log && typeof body.surgery_log === 'object') {
    const v = validateSurgeryLog(body.surgery_log);
    if (v.error) return new Response(JSON.stringify({ error: v.error }), { status: 400, headers: CORS_HEADERS });
    const res = v.remove
      ? await supabase.from('surgery_log').delete().eq('id', v.remove)
      : await supabase.from('surgery_log').upsert(v.row, { onConflict: 'id' });
    if (res.error) return new Response(JSON.stringify({ error: res.error.message }), { status: 500, headers: CORS_HEADERS });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: CORS_HEADERS });
  }
  // Shape 12 (2026-10-21): { behaviour: {...} } — send an animal to the Behaviour page with its note attached. One open card per
  // animal per Melbourne day: a resend UPDATES it (the vet edited the note). A Done card is not reopened (a new card is made).
  // Replies {ok:true} only once saved. The note is never logged or echoed in an error.
  if (body.behaviour && typeof body.behaviour === 'object') {
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne' }).format(new Date());
    const v = validateBehaviourSend(body.behaviour, day);
    if (v.error) return new Response(JSON.stringify({ error: v.error }), { status: 400, headers: CORS_HEADERS });
    const upd = async () => {
      const cur = await supabase.from('behaviour_tasks').select('id,history').eq('source_key', v.row.source_key).eq('status', 'open').limit(1);
      if (cur.error) return { n: 0, error: cur.error };
      if (!cur.data || !cur.data.length) return { n: 0, error: null };
      const { data, error } = await supabase.from('behaviour_tasks')
        .update({ reason: v.row.reason, attached_note: v.row.attached_note, due_window: v.row.due_window, location: v.row.location,
          species: v.row.species, flagged_by: v.row.flagged_by, history: behaviourResendHistory(cur.data[0].history, v.row.flagged_by, new Date().toISOString()) })
        .eq('id', cur.data[0].id).eq('status', 'open').select('id');
      return { n: data ? data.length : 0, error };
    };
    let u = await upd();
    if (u.error) return new Response(JSON.stringify({ error: 'Could not save.' }), { status: 500, headers: CORS_HEADERS });
    if (u.n > 0) return new Response(JSON.stringify({ ok: true, updated: true }), { status: 200, headers: CORS_HEADERS });
    const ins = await supabase.from('behaviour_tasks').insert(Object.assign({}, v.row, { history: [{ at: new Date().toISOString(), by: v.row.flagged_by, from: 'new', to: 'incoming' }] }));
    if (ins.error && ins.error.code === '23505') {
      u = await upd();
      if (!u.error && u.n > 0) return new Response(JSON.stringify({ ok: true, updated: true }), { status: 200, headers: CORS_HEADERS });
    }
    if (ins.error) return new Response(JSON.stringify({ error: 'Could not save.' }), { status: 500, headers: CORS_HEADERS });
    return new Response(JSON.stringify({ ok: true, updated: false }), { status: 200, headers: CORS_HEADERS });
  }
  // Shape 9 (2026-10-21): { nurse_label: { animal_id, location, sent_by, labels: [{key, text}] } } — medication labels for the
  // Welfare nurse. One open task per label key: sending again UPDATES the open task (the vet edited the chart), a finished one
  // is not reopened (a new task is made).
  if (body.nurse_label && typeof body.nurse_label === 'object') {
    const v = validateNurseLabel(body.nurse_label);
    if (v.error) return new Response(JSON.stringify({ error: v.error }), { status: 400, headers: CORS_HEADERS });
    for (const l of v.labels) {
      const row = { animal_id: v.id, location: v.location, task: 'med_label', note: l.text, added_by: v.sentBy || null };
      const { data: open, error: e1 } = await supabase.from('noga_requests').select('id').eq('source_key', l.key).eq('done', false).limit(1);
      if (e1) return new Response(JSON.stringify({ error: e1.message }), { status: 500, headers: CORS_HEADERS });
      const res = open && open.length
        ? await supabase.from('noga_requests').update(row).eq('id', open[0].id)
        : await supabase.from('noga_requests').insert(Object.assign({}, row, { source_key: l.key }));
      if (res.error) return new Response(JSON.stringify({ error: res.error.message }), { status: 500, headers: CORS_HEADERS });
    }
    return new Response(JSON.stringify({ ok: true, count: v.labels.length }), { status: 200, headers: CORS_HEADERS });
  }
  // Shape 8 (2026-10-19): { aa_check: { items: [{kind, animal_id}] } } — read-back for the shift tools: which of the
  // cards they sent are still waiting? Replies {ok:true, pending:["kind|ANIMAL", ...]}; a card that is gone was ticked.
  if (body.aa_check && typeof body.aa_check === 'object') {
    const v = validateAaCheck(body.aa_check);
    if (v.error) return new Response(JSON.stringify({ error: v.error }), { status: 400, headers: CORS_HEADERS });
    await purgeCompletedAa(supabase);
    const pending: string[] = [];
    const doneBy: Record<string, string> = {};   // who ticked each finished card off (the AA's initials), when they gave them
    for (const p of v.pairs) {
      const { data, error } = await supabase.from('aa_items').select('id').eq('kind', p.kind).contains('animal_ids', [p.id]).is('completed_at', null).limit(1);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: CORS_HEADERS });
      if (data && data.length) { pending.push(p.kind + '|' + p.id); continue; }
      const { data: fin } = await supabase.from('aa_items').select('completed_by').eq('kind', p.kind).contains('animal_ids', [p.id]).not('completed_at', 'is', null).order('completed_at', { ascending: false }).limit(1);
      if (fin && fin.length && fin[0].completed_by) doneBy[p.kind + '|' + p.id] = fin[0].completed_by;   // column missing (migration not run yet) = no initials, never an error
    }
    return new Response(JSON.stringify({ ok: true, pending: pending, done_by: doneBy }), { status: 200, headers: CORS_HEADERS });
  }
  // Shape 7 (2026-10-18): { aa: { kind, animal_id, location, sent_by, payload } } — a vet's shift tool shares a
  // finished note with the Admission AA page. One live card per kind + Melbourne day + animal: a resend UPDATES it.
  // Replies {ok:true} only once the row is saved — the tool treats anything else as NOT SENT.
  if (body.aa && typeof body.aa === 'object') {
    const v = validateAaShare(body.aa);
    if (v.error) return new Response(JSON.stringify({ error: v.error }), { status: 400, headers: CORS_HEADERS });
    await purgeCompletedAa(supabase);
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne' }).format(new Date());
    const key = aaSourceKey(v.row.kind, day, v.row.animal_ids[0]);
    // Update the live card if there is one; otherwise insert. Never reply ok unless a row was really written:
    // the card may have been ticked (deleted) between steps, and two sends can race on the unique key.
    const updateCard = async () => {
      const { data, error } = await supabase.from('aa_items')
        .update({ payload: v.row.payload, sent_by: v.row.sent_by, updated_at: new Date().toISOString() })
        .eq('source_key', key).is('completed_at', null).select('id');
      return { n: data ? data.length : 0, error };
    };
    let u = await updateCard();
    if (u.error) return new Response(JSON.stringify({ error: u.error.message }), { status: 500, headers: CORS_HEADERS });
    if (u.n > 0) return new Response(JSON.stringify({ ok: true, updated: true }), { status: 200, headers: CORS_HEADERS });
    const ins = await supabase.from('aa_items').insert(Object.assign({}, v.row, { source_key: key }));
    if (ins.error && ins.error.code === '23505') {            // someone else inserted first: update theirs instead
      u = await updateCard();
      if (!u.error && u.n > 0) return new Response(JSON.stringify({ ok: true, updated: true }), { status: 200, headers: CORS_HEADERS });
    }
    if (ins.error) return new Response(JSON.stringify({ error: ins.error.message }), { status: 500, headers: CORS_HEADERS });
    return new Response(JSON.stringify({ ok: true, updated: false }), { status: 200, headers: CORS_HEADERS });
  }

  // Shape 3 (2026-09-25): { delete: {title,location,shift} } — an animal was
  // removed from an offline tool's list, so its case is removed here too.
  // Deletes only the one matching row; never reads anything back.
  if (body.delete && typeof body.delete === 'object') {
    const dTitle = typeof body.delete.title === 'string' ? body.delete.title.trim() : '';
    const dLocation = typeof body.delete.location === 'string' ? body.delete.location.trim() : '';
    const dShift = body.delete.shift;
    if (!dTitle || !dLocation || !VALID_SHIFTS.includes(dShift)) {
      return new Response(JSON.stringify({ error: 'delete needs title, location and a valid shift' }), { status: 400, headers: CORS_HEADERS });
    }
    const { error } = await supabase.from('tasks').delete()
      .eq('title', dTitle).eq('location', dLocation).eq('shift', dShift).eq('type', 'check_recheck');   // the list entry only: a staff request for the same animal+pen is a separate log
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: CORS_HEADERS });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // Shape 4 (2026-09-26): { chart: {title,location,shift,med_label,med_chart_done} }.
  // Plain UPDATE filtered by the same (title,location,shift) key as
  // everything else — no insert branch, so a chart with no matching
  // dashboard row (not flagged for medication, or not synced there at all)
  // silently touches nothing rather than fabricating a task.
  if (body.chart && typeof body.chart === 'object') {
    const cTitle = typeof body.chart.title === 'string' ? body.chart.title.trim() : '';
    const cLocation = typeof body.chart.location === 'string' ? body.chart.location.trim() : '';
    const cShift = body.chart.shift;
    const cLabel = typeof body.chart.med_label === 'string' && body.chart.med_label.trim() ? body.chart.med_label.trim().slice(0, 500) : null;
    if (!cTitle || !cLocation || !VALID_SHIFTS.includes(cShift) || !cLabel) {
      return new Response(JSON.stringify({ error: 'chart needs title, location, a valid shift and a med_label' }), { status: 400, headers: CORS_HEADERS });
    }
    const { error } = await supabase.from('tasks')
      .update({ med_label: cLabel, med_chart_done: body.chart.med_chart_done === true })
      .eq('title', cTitle).eq('location', cLocation).eq('shift', cShift).neq('type', 'check_recheck');   // a flagged request only (a plain list entry has no vet case to chart)
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: CORS_HEADERS });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // Shape 6 (2026-10-09): { care: {title, shift, treatment, plan} } — see header. Update-only.
  if (body.care && typeof body.care === 'object') {
    const kTitle = typeof body.care.title === 'string' ? body.care.title.trim() : '';
    const kShift = body.care.shift;
    const clip = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);
    if (!kTitle || !VALID_SHIFTS.includes(kShift)) {
      return new Response(JSON.stringify({ error: 'care needs a title and a valid shift' }), { status: 400, headers: CORS_HEADERS });
    }
    const since = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
    const { error } = await supabase.from('tasks')
      .update({ treatment: clip(body.care.treatment, 800), plan: clip(body.care.plan, 1000) })
      .eq('title', kTitle).eq('shift', kShift).neq('type', 'check_recheck').gte('created_at', since);
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: CORS_HEADERS });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // Shape 5 (2026-09-26): { status: {shift, items:[{title,location}]} } — an
  // offline tool asks "which of MY animals were already completed today by
  // another device?" so it can move them out of its own pending list (a
  // helping vet finished a room). Read-only, and only ever answers about the
  // exact title+location pairs the caller sent (max 500) — it never lists
  // other animals. "Today" = since midnight in Melbourne, so a completion
  // from a previous day can't mark today's re-listed animal as done.
  if (body.status && typeof body.status === 'object') {
    const sShift = body.status.shift;
    const asked = (Array.isArray(body.status.items) ? body.status.items : []).slice(0, 500)
      .map((it) => ({
        title: typeof it?.title === 'string' ? it.title.trim() : '',
        location: typeof it?.location === 'string' ? it.location.trim() : '',
      }))
      .filter((it) => it.title && it.location);
    if (!VALID_SHIFTS.includes(sShift) || !asked.length) {
      return new Response(JSON.stringify({ error: 'status needs a valid shift and at least one title+location' }), { status: 400, headers: CORS_HEADERS });
    }
    // (2026-10-30) Matched ignoring case, spaces and location spelling ("CR1-30" = "Cat Room 1 / 30"), so it needs every
    // completion from today on this shift, not an exact title filter. Only the caller's own pairs are ever answered.
    const { data, error } = await supabase.from('tasks')
      .select('title,location')
      .eq('shift', sShift).eq('done', true).eq('type', 'check_recheck')   // list entries only: a vet finishing a staff request is not "this list animal registered elsewhere"
      .gte('completed_at', melbourneMidnightISO())
      .limit(5000);
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: CORS_HEADERS });
    }
    const done = doneAmong(asked, data ?? []);
    return new Response(JSON.stringify({ ok: true, done }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // Shape 2: batch list-load. Insert-only — never touches an existing row's
  // done/completed_at, so a re-imported list can't un-complete something.
  if (Array.isArray(body.items)) {
    const rows = body.items
      .map((it) => ({
        title: typeof it?.title === 'string' ? it.title.trim() : '',
        location: typeof it?.location === 'string' ? it.location.trim() : '',
        shift: it?.shift,
      }))
      .filter((it) => it.title && it.location && VALID_SHIFTS.includes(it.shift));

    if (!rows.length) {
      return new Response(JSON.stringify({ error: 'No valid items in the list' }), { status: 400, headers: CORS_HEADERS });
    }

    const { error } = await supabase.from('tasks').upsert(rows, {
      onConflict: 'title,location,shift,kind',
      ignoreDuplicates: true,
    });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: CORS_HEADERS });
    }

    // Re-listed animals whose row is from an earlier day become today's again (see staleToRefresh). The earlier completion is
    // written to task_done_log FIRST (migration 0043): if that fails (migration not run yet) nothing is reset, so no history is lost.
    // Never fails the list-load.
    let refreshed = 0;
    try {
      const now = new Date().toISOString();
      for (const sh of [...new Set(rows.map((r) => r.shift))]) {
        const inShift = rows.filter((r) => r.shift === sh);
        const keys = new Set(inShift.map((r) => r.title + '|' + r.location));
        const { data: existing } = await supabase.from('tasks')
          .select('id,title,location,shift,type,done,created_at,completed_at')
          .eq('shift', sh).in('title', [...new Set(inShift.map((r) => r.title))]);
        const stale = staleToRefresh(existing ?? [], keys, melbourneMidnightISO());
        if (!stale.length) continue;
        const finished = stale.filter((r) => r.done && r.completed_at);
        if (finished.length) {
          const { error: eLog } = await supabase.from('task_done_log').upsert(
            finished.map((r) => ({ task_id: r.id, shift: r.shift, title: r.title, completed_at: r.completed_at })),
            { onConflict: 'task_id,completed_at', ignoreDuplicates: true });
          if (eLog) continue;
        }
        const { error: e2 } = await supabase.from('tasks')
          .update({ created_at: now, done: false, completed_at: null, note: null })
          .in('id', stale.map((r) => r.id));
        if (!e2) refreshed += stale.length;
      }
    } catch (_e) { /* a refresh problem must never block the list-load */ }

    return new Response(JSON.stringify({ ok: true, count: rows.length, refreshed }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // Shape 1: single completion. `note` is optional — a short excerpt of the
  // offline tool's Plan/Treatment field (2026-09-19 amendment), so staff
  // looking at the dashboard can see what's actually being done for the
  // animal without opening the offline tool. Hard-capped server-side too
  // (defense in depth beyond whatever truncation the client already did)
  // since this is the one field explicitly meant to stay short and
  // non-clinical — see the spec's online/offline split.
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const location = typeof body.location === 'string' ? body.location.trim() : '';
  const shift = body.shift;
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 200) : null;

  if (!title || !location || !VALID_SHIFTS.includes(shift)) {
    return new Response(
      JSON.stringify({ error: 'title, location, and a valid shift (processing/sick_injured/surgery) are required' }),
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const { error } = await supabase.from('tasks').upsert(
    { title, location, shift, done: true, completed_at: new Date().toISOString(), note },
    { onConflict: 'title,location,shift,kind' },
  );

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: CORS_HEADERS });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
});
