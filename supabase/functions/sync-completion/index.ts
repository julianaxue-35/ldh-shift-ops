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
//   5. { status: {shift, items:[{title,location}]} } — read-back: which of
//      these were already completed today by another device? Answers only
//      about the pairs sent; never lists other animals.
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
