import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
const SQL = fs.readFileSync(path.resolve(import.meta.dirname, '../supabase/migrations/0053_nurse_vacc_log.sql'), 'utf8');
test('counts list vaccinations once per animal per day plus finished vaccination requests, never practice animals; safe to rerun', async () => {
  const d = new PGlite();
  await d.exec(`create schema auth; create function auth.role() returns text language sql as $$ select 'authenticated' $$;
    create function auth.jwt() returns jsonb language sql as $$ select '{}'::jsonb $$; create role authenticated; create role anon;
    create function public.is_test_animal(p_id text) returns boolean language sql immutable as $$ select coalesce(p_id,'') ~* '^\\s*test[\\s_-]*[0-9]+\\s*$' $$;
    create table public.nurse_requests (kind text, animal_id text, animal_count int, completed_at timestamptz);`);
  await d.exec(SQL); await d.exec(SQL);
  await d.exec(`insert into public.nurse_vacc_log (animal_id) values ('1170001'), ('1170002'), ('TEST1');
    insert into public.nurse_vacc_log (animal_id) values ('1170001') on conflict do nothing;
    insert into public.nurse_requests values ('vaccination', null, 5, now()), ('vaccination', null, 3, null), ('microchip', null, 4, now());`);
  const r = (await d.query(`select sum(n)::int n from public.nurse_vacc_counts((now() at time zone 'Australia/Melbourne')::date)`)).rows[0];
  assert.equal(r.n, 7);
});
