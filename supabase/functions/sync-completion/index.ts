// LDH Shift Ops — offline-tool completion sync.
//
// Called by processing.html / sick-injured.html / surgery.html at the
// moment an item is ticked "Completed". Accepts exactly the 3 fields the
// 2026-09-18 spec amendment allows (animal ID, location, shift) plus a
// shared secret — never a Supabase Auth session. Runs with the service
// role key, which bypasses RLS entirely, so this function itself is the
// only thing that must be trusted to only ever touch `tasks`, and only
// ever insert/update, never read anything back to the caller.
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

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const providedSecret = req.headers.get('x-sync-secret');
  if (!SYNC_SECRET || providedSecret !== SYNC_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const location = typeof body.location === 'string' ? body.location.trim() : '';
  const shift = body.shift;

  if (!title || !location || !VALID_SHIFTS.includes(shift)) {
    return new Response(
      JSON.stringify({ error: 'title, location, and a valid shift (processing/sick_injured/surgery) are required' }),
      { status: 400 },
    );
  }

  const supabase = createClient(PROJECT_URL, SERVICE_KEY);
  const { error } = await supabase.from('tasks').upsert(
    { title, location, shift, done: true, completed_at: new Date().toISOString() },
    { onConflict: 'title,location,shift' },
  );

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
