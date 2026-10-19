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
const AA_NOTE_KINDS = ['processing_note', 'si_note', 'med_chart'];
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

// Completed Admission AA cards are removed within 24 hours (the AA also empties the list daily). Best effort.
async function purgeCompletedAa(supabase) {
  try {
    await supabase.from('aa_items').delete().not('completed_at', 'is', null)
      .lt('completed_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString());
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
  if (!SYNC_SECRET || providedSecret !== SYNC_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS_HEADERS });
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
  // Shape 8 (2026-10-19): { aa_check: { items: [{kind, animal_id}] } } — read-back for the shift tools: which of the
  // cards they sent are still waiting? Replies {ok:true, pending:["kind|ANIMAL", ...]}; a card that is gone was ticked.
  if (body.aa_check && typeof body.aa_check === 'object') {
    const v = validateAaCheck(body.aa_check);
    if (v.error) return new Response(JSON.stringify({ error: v.error }), { status: 400, headers: CORS_HEADERS });
    await purgeCompletedAa(supabase);
    const pending: string[] = [];
    for (const p of v.pairs) {
      const { data, error } = await supabase.from('aa_items').select('id').eq('kind', p.kind).contains('animal_ids', [p.id]).is('completed_at', null).limit(1);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: CORS_HEADERS });
      if (data && data.length) pending.push(p.kind + '|' + p.id);
    }
    return new Response(JSON.stringify({ ok: true, pending: pending }), { status: 200, headers: CORS_HEADERS });
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
      .eq('title', dTitle).eq('location', dLocation).eq('shift', dShift);
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
      .eq('title', cTitle).eq('location', cLocation).eq('shift', cShift);
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
    const titles = [...new Set(asked.map((it) => it.title))];
    const { data, error } = await supabase.from('tasks')
      .select('title,location')
      .eq('shift', sShift).eq('done', true)
      .gte('completed_at', melbourneMidnightISO())
      .in('title', titles);
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: CORS_HEADERS });
    }
    const wanted = new Set(asked.map((it) => `${it.title}|${it.location}`));
    const done = (data ?? []).filter((r) => wanted.has(`${r.title}|${r.location}`)).map((r) => ({ title: r.title, location: r.location }));
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
      onConflict: 'title,location,shift',
      ignoreDuplicates: true,
    });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: CORS_HEADERS });
    }

    return new Response(JSON.stringify({ ok: true, count: rows.length }), {
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
    { onConflict: 'title,location,shift' },
  );

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: CORS_HEADERS });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
});
