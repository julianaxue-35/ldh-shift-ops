// Migration 0011: scheduled vaccination arrivals — arrived_at becomes
// nullable, expected_at is added, and a row must always have at least one
// of the two set.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const MIG = path.resolve(import.meta.dirname, '../supabase/migrations');
const ALL = fs.readdirSync(MIG).filter(f => /^00(0[1-9]|1[01])_/.test(f)).sort();

const SHIM = `
  create schema extensions;
  create function extensions.gen_salt(t text) returns text language sql as $$ select '$shim$' || md5(random()::text) $$;
  create function extensions.crypt(pw text, salt text) returns text language sql as
    $$ select substr(salt, 1, 38) || md5(pw || substr(salt, 1, 38)) $$;`;

async function db(files = ALL) {
  const d = new PGlite();
  await d.exec(`
    create schema auth;
    create function auth.role() returns text language sql as $$ select 'authenticated' $$;
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('app.jwt', true), ''), '{}')::jsonb $$;
    create role authenticated; create role anon;
    create publication supabase_realtime;
    alter default privileges in schema public grant execute on functions to anon;` + SHIM);
  for (const f of files) await d.exec(load(f));
  return d;
}
const load = f => fs.readFileSync(path.join(MIG, f), 'utf8')
  .replace(/create extension if not exists pgcrypto with schema extensions;/, '')
  .replace(/-- pgcrypto-guard-start[\s\S]*?-- pgcrypto-guard-end/, '');
const rejects = async (d, sql) => { try { await d.exec(sql); return null; } catch (e) { return e.message; } };

test('arrived_at is nullable with no default; expected_at exists', async () => {
  const d = await db();
  await d.exec(`insert into public.nurse_requests (location, species, animal_count, expected_at)
    values ('FIR Room', 'cat', 3, now() + interval '2 hours')`);
  const r = (await d.query(`select arrived_at, expected_at from public.nurse_requests`)).rows[0];
  assert.equal(r.arrived_at, null);
  assert.ok(r.expected_at);
});

test('a row still works with only arrived_at set (existing behaviour unchanged)', async () => {
  const d = await db();
  await d.exec(`insert into public.nurse_requests (location, species, animal_count, arrived_at)
    values ('Transport', 'dog', 2, now())`);
  const r = (await d.query(`select arrived_at, expected_at from public.nurse_requests`)).rows[0];
  assert.ok(r.arrived_at);
  assert.equal(r.expected_at, null);
});

test('a row with neither arrived_at nor expected_at is rejected', async () => {
  const d = await db();
  const err = await rejects(d, `insert into public.nurse_requests (location, species, animal_count) values ('Pound 1', 'dog', 1)`);
  assert.match(err, /nurse_requests_arrival_check/);
});

test('marking a scheduled request arrived (setting arrived_at) is a plain update, no trigger involved', async () => {
  const d = await db();
  await d.exec(`insert into public.nurse_requests (location, species, animal_count, expected_at)
    values ('FIR Room', 'cat', 1, now() + interval '10 minutes')`);
  const id = (await d.query(`select id from public.nurse_requests`)).rows[0].id;
  await d.exec(`update public.nurse_requests set arrived_at = now() where id = '${id}'`);
  const r = (await d.query(`select arrived_at from public.nurse_requests where id = '${id}'`)).rows[0];
  assert.ok(r.arrived_at);
});

test('running 0011 twice is harmless', async () => {
  const d = await db(ALL.slice(0, -1));
  await d.exec(load('0011_scheduled_arrival.sql'));
  await d.exec(load('0011_scheduled_arrival.sql'));
  await d.exec(`insert into public.nurse_requests (location, species, animal_count, expected_at)
    values ('FIR Room', 'cat', 1, now())`);
});
