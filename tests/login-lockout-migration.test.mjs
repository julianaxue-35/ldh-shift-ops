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
async function db() {
  const d = new PGlite();
  await d.exec(`
    create schema auth;
    create function auth.role() returns text language sql as $$ select 'authenticated' $$;
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('app.jwt', true), ''), '{}')::jsonb $$;
    create role authenticated; create role anon; create role service_role;
    create publication supabase_realtime;` + SHIM);
  const files = fs.readdirSync(MIG).filter(f => /^\d{4}_.*\.sql$/.test(f) && f <= '0045_login_lockout_and_failed_log.sql').sort();
  for (const f of files) { if (f.startsWith('0006') || f.startsWith('0007')) continue; await d.exec(load(f)); }
  return d;
}
const n = async (d, sql) => (await d.query(sql)).rows[0].n;
const hdr = (d, ip) => d.exec(`select set_config('request.headers', '{"x-forwarded-for":"${ip}, 10.0.0.1"}', false)`);
const guess = async (d, code) => (await d.query(`select public.check_passcode('vet', '${code}') ok`)).rows[0].ok;

test('0045: three wrong role-passcode guesses lock that address, even for the right code; others are unaffected', async () => {
  const d = await db();
  await hdr(d, '1.2.3.4');
  assert.equal(await guess(d, 'vet2026'), true, 'right code works');
  assert.equal(await guess(d, 'nope1'), false);
  assert.equal(await guess(d, 'nope2'), false);
  assert.equal(await guess(d, 'vet2026'), true, 'two wrong then the right code: in, and the count starts again');
  assert.equal(await guess(d, 'nope3'), false);
  assert.equal(await guess(d, 'nope4'), false);
  assert.equal(await guess(d, 'nope5'), false);
  assert.equal(await guess(d, 'vet2026'), false, 'three wrong since the last good entry: locked, the right code is refused too');
  assert.equal(await n(d, `select count(*)::int n from public.auth_failed_log where not blocked`), 5);
  assert.equal(await n(d, `select count(*)::int n from public.auth_failed_log where blocked`), 1, 'the refused attempt is logged as blocked');
  await hdr(d, '9.9.9.9');
  assert.equal(await guess(d, 'vet2026'), true, 'a different address is not locked');
});

test('0045: the lock ends once the failures are 15 minutes old, and the log never holds the guessed code', async () => {
  const d = await db();
  await hdr(d, '5.5.5.5');
  for (const c of ['aaa', 'bbb', 'ccc']) await guess(d, c);
  assert.equal(await guess(d, 'vet2026'), false);
  await d.exec(`update public.auth_failed_log set at = now() - interval '16 minutes' where client = '5.5.5.5'`);
  assert.equal(await guess(d, 'vet2026'), true, 'unlocked after 15 minutes');
  const cols = (await d.query(`select column_name from information_schema.columns where table_name = 'auth_failed_log'`)).rows.map(r => r.column_name);
  assert.ok(!cols.some(c => /code|guess|password/.test(c)), 'no column can hold the guess');
});

test('0045: old log rows are cleared after a year, and the pages cannot read the log or call the lock functions', async () => {
  const d = await db();
  await d.exec(`insert into public.auth_failed_log (at, source, client) values (now() - interval '400 days', 'sync_code', 'old')`);
  await d.exec(`select public.auth_record_failure('sync_code', null, '7.7.7.7', false)`);
  assert.equal(await n(d, `select count(*)::int n from public.auth_failed_log where client = 'old'`), 0);
  const rls = await n(d, `select count(*)::int n from pg_class where relname = 'auth_failed_log' and relrowsecurity`);
  assert.equal(rls, 1, 'row level security on, no policies');
  const g = await n(d, `select count(*)::int n from information_schema.routine_privileges where routine_name in ('auth_is_locked','auth_record_failure','auth_recent_failures','auth_clear_failures') and grantee in ('anon','authenticated','PUBLIC')`);
  assert.equal(g, 0, 'not callable from the pages');
});
