import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const MIG = path.resolve(import.meta.dirname, '../supabase/migrations');
const SHIM = `
  create schema extensions;
  create function extensions.gen_salt(t text) returns text language sql as $$ select '$shim$' || md5(random()::text) $$;
  create function extensions.crypt(pw text, salt text) returns text language sql as
    $$ select substr(salt, 1, 38) || md5(pw || substr(salt, 1, 38)) $$;`;
const load = f => fs.readFileSync(path.join(MIG, f), 'utf8')
  .replace(/create extension if not exists pgcrypto with schema extensions;/, '')
  .replace(/-- pgcrypto-guard-start[\s\S]*?-- pgcrypto-guard-end/, '');

async function db(upTo) {
  const d = new PGlite();
  await d.exec(`
    create schema auth;
    create function auth.role() returns text language sql as $$ select 'authenticated' $$;
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('app.jwt', true), ''), '{}')::jsonb $$;
    create role authenticated; create role anon;
    create publication supabase_realtime;` + SHIM);
  const files = fs.readdirSync(MIG).filter(f => /^\d{4}_.*\.sql$/.test(f) && f <= upTo).sort();
  // 0006 (surgery stations) needs real Supabase auth users; the later migrations here do not depend on it
  for (const f of files) { if (f.startsWith('0006') || f.startsWith('0007')) continue; await d.exec(load(f)); }
  return d;
}

test('0019: extra_reasons defaults to an empty list and takes entries', async () => {
  const d = await db('0019_task_extra_reasons.sql');
  await d.exec(`insert into public.tasks (title, location, shift) values ('A1', 'Pound 1', 'sick_injured')`);
  assert.deepEqual((await d.query(`select extra_reasons from public.tasks`)).rows[0].extra_reasons, []);
  await d.exec(`update public.tasks set extra_reasons = '[{"at":"x","condition":"vomiting"}]'::jsonb`);
  assert.equal((await d.query(`select jsonb_array_length(extra_reasons) n from public.tasks`)).rows[0].n, 1);
});

test('0020: a completed card no longer blocks a new live card with the same source_key', async () => {
  const d = await db('0020_aa_completed_list.sql');
  await d.exec(`insert into public.aa_items (kind, animal_ids, payload, source_key, completed_at) values ('processing_note', array['T-1'], '{"text":"x"}'::jsonb, 'k1', now())`);
  await d.exec(`insert into public.aa_items (kind, animal_ids, payload, source_key) values ('processing_note', array['T-1'], '{"text":"y"}'::jsonb, 'k1')`);
  let err = '';
  try { await d.exec(`insert into public.aa_items (kind, animal_ids, payload, source_key) values ('processing_note', array['T-1'], '{"text":"z"}'::jsonb, 'k1')`); } catch (e) { err = String(e.message); }
  assert.match(err, /duplicate|unique/i, 'two LIVE cards with the same key are still refused');
  assert.deepEqual((await d.query(`select done_ids from public.aa_items limit 1`)).rows[0].done_ids, []);
});

test('0021: nurse_daily_counts counts each role per Melbourne day; surgery_log keeps species and routine only', async () => {
  const d = await db('0021_nurse_and_surgery_stats.sql');
  await d.exec(`
    insert into public.tasks (title, location, shift, med_done_at, med_done_by) values ('A1', 'Pound 1', 'sick_injured', '2026-11-18 03:00:00+00', 'AB');
    insert into public.noga_requests (animal_id, location, task, done, done_at) values
      ('B1', 'P', 'blood', true, '2026-11-18 03:00:00+00'), ('C1', 'P', 'microchip', true, '2026-11-18 03:00:00+00'), ('D1', 'P', 'uv', false, null);
    insert into public.nurse_requests (kind, location, species, animal_count, done_count, arrived_at, completed_at) values ('vaccination', 'Cat Room 1', 'cat', 4, 4, '2026-11-18 01:00:00+00', '2026-11-18 03:00:00+00');
  `);
  const rows = (await d.query(`select day::text, role, n::int from public.nurse_daily_counts('2026-11-01') order by role`)).rows;
  assert.deepEqual(rows, [{ day: '2026-11-18', role: 'processing', n: 5 }, { day: '2026-11-18', role: 'welfare', n: 2 }]);
  assert.equal((await d.query(`select count(*)::int n from public.nurse_daily_counts('2026-12-01')`)).rows[0].n, 0);
  const cols = (await d.query(`select column_name from information_schema.columns where table_name = 'surgery_log' order by 1`)).rows.map(r => r.column_name);
  assert.deepEqual(cols, ['done_at', 'id', 'procedure', 'procedure2', 'routine', 'species']);
  let err = '';
  try { await d.exec(`insert into public.surgery_log (id, species, routine) values ('s1', 'hamster', true)`); } catch (e) { err = String(e.message); }
  assert.match(err, /check/i, 'only cat / dog / rabbit / other');
});

test('0022: a treatment misc task is accepted, junk kinds still refused', async () => {
  const d = await db('0022_treatment_task_kind.sql');
  await d.exec(`insert into public.noga_requests (animal_id, location, task) values ('T1', 'Pathway', 'treatment')`);
  assert.equal((await d.query(`select count(*)::int n from public.noga_requests where task = 'treatment'`)).rows[0].n, 1);
  let err = '';
  try { await d.exec(`insert into public.noga_requests (animal_id, location, task) values ('T2', 'Pathway', 'bogus')`); } catch (e) { err = String(e.message); }
  assert.match(err, /check/i);
});

test('0023: a done treatment task counts for the Processing nurse', async () => {
  const d = await db('0023_nurse_counts_treatment_processing.sql');
  await d.exec(`insert into public.noga_requests (animal_id, location, task, done, done_at) values
    ('T1', 'P', 'treatment', true, '2026-11-18 03:00:00+00'), ('B1', 'P', 'blood', true, '2026-11-18 03:00:00+00')`);
  const rows = (await d.query(`select role, n::int from public.nurse_daily_counts('2026-11-01') order by role`)).rows;
  assert.deepEqual(rows, [{ role: 'processing', n: 1 }, { role: 'welfare', n: 1 }]);
});
