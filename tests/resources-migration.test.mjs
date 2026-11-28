import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
const SQL = fs.readFileSync(path.resolve(import.meta.dirname, '../supabase/migrations/0054_resources.sql'), 'utf8');
test('resources: signed-in staff can read, cannot write; safe to rerun', async () => {
  const d = new PGlite();
  await d.exec(`create schema auth; create function auth.role() returns text language sql as $$ select coalesce(current_setting('app.role', true), 'anon') $$;
    create function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('app.jwt', true), ''), '{}')::jsonb $$;
    create role authenticated; create role anon; grant usage on schema auth to authenticated, anon; grant usage on schema public to authenticated, anon;`);
  await d.exec(SQL); await d.exec(SQL);
  await d.exec(`insert into public.resources (slug, title, body) values ('a', 'A doc', '<p>x</p>')`);
  const as = async (role, sql, jwt = '') => { await d.exec(`select set_config('app.role', '${role === 'anon' ? 'anon' : 'authenticated'}', false); select set_config('app.jwt', '${jwt}', false); set role ${role}`); try { return (await d.query(sql)).rows; } finally { await d.exec('reset role'); } };
  assert.equal((await as('authenticated', 'select * from public.resources')).length, 1);
  assert.equal((await as('authenticated', 'select * from public.resources', '{"app_metadata":{"role":"sync_writer"}}')).length, 0);
  await assert.rejects(() => as('anon', 'select * from public.resources'), /permission denied/);
  await assert.rejects(() => as('authenticated', "update public.resources set title = 'z'"), /permission denied/);
});
