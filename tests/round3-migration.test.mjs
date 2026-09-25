import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const MIG = path.resolve(import.meta.dirname, '../supabase/migrations');
const ALL = fs.readdirSync(MIG).filter(f => /^00(0[1-9]|10)_/.test(f)).sort();

// NOTE: PGlite 0.2.x cannot load its pgcrypto bundle (dynamic-lib error), so the harness
// installs a SHIM `extensions.crypt/gen_salt` (md5-based, test only) and strips the
// `create extension ... pgcrypto` line. The real migration keeps that line for Supabase.
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
// The pgcrypto guard is stripped like the create-extension line (shim is not a real extension).
const load = f => fs.readFileSync(path.join(MIG, f), 'utf8')
  .replace(/create extension if not exists pgcrypto with schema extensions;/, '')
  .replace(/-- pgcrypto-guard-start[\s\S]*?-- pgcrypto-guard-end/, '');
const rejects = async (d, sql) => { try { await d.exec(sql); return null; } catch (e) { return e.message; } };
const row = async (d, title) => (await d.query(`select * from public.tasks where title=$1`, [title])).rows[0];

test('migration file requires pgcrypto in the extensions schema', () => {
  assert.match(fs.readFileSync(path.join(MIG, '0010_round3.sql'), 'utf8'), /create extension if not exists pgcrypto with schema extensions/);
});

test('migration has the pgcrypto-in-extensions guard, and check_passcode uses a locked search_path', () => {
  const sql = fs.readFileSync(path.join(MIG, '0010_round3.sql'), 'utf8');
  assert.match(sql, /pgcrypto must be installed in schema extensions/);
  assert.match(sql, /set search_path = extensions, pg_temp/);
  assert.match(sql, /from public\.role_passcodes/);
});

test('medication insert with done=true is held: done=false, vet_done_at stamped', async () => {
  const d = await db();
  await d.exec(`insert into public.tasks (title,location,shift,needs_medication,done,completed_at) values ('m','r','sick_injured',true,true,now())`);
  const r = await row(d, 'm');
  assert.equal(r.done, false);
  assert.ok(r.vet_done_at);
  assert.equal(r.completed_at, null);
});

test('medication row passes through once med_done_at is set', async () => {
  const d = await db();
  await d.exec(`insert into public.tasks (title,location,shift,needs_medication,done) values ('m','r','sick_injured',true,true)`);
  await d.exec(`update public.tasks set med_done_at=now(), done=true, completed_at=now() where title='m'`);
  const r = await row(d, 'm');
  assert.equal(r.done, true);
  assert.ok(r.completed_at);
});

test('non-medication row done=true is untouched', async () => {
  const d = await db();
  await d.exec(`insert into public.tasks (title,location,shift,done) values ('n','r','sick_injured',true)`);
  const r = await row(d, 'n');
  assert.equal(r.done, true);
  assert.equal(r.vet_done_at, null);
});

test('Edge Function upsert path (on conflict do update set done=true) still held for medication rows', async () => {
  const d = await db();
  await d.exec(`insert into public.tasks (title,location,shift,needs_medication) values ('u','r','sick_injured',true)`);
  await d.exec(`insert into public.tasks (title,location,shift,done) values ('u','r','sick_injured',true)
    on conflict (title,location,shift) do update set done=true`);
  const r = await row(d, 'u');
  assert.equal(r.done, false);
  assert.ok(r.vet_done_at);
});

test('new task columns default sensibly', async () => {
  const d = await db();
  await d.exec(`insert into public.tasks (title,location,shift) values ('z','r','sick_injured')`);
  const r = await row(d, 'z');
  assert.equal(r.needs_medication, false);
  assert.equal(r.med_chart_done, false);
  for (const c of ['vet_done_at', 'med_label', 'med_done_by', 'med_done_at', 'sm_number', 'location_detail']) assert.equal(r[c], null);
});

test('check_passcode: right codes true, wrong/unknown false, anon cannot execute', async () => {
  const d = await db();
  await d.exec(`grant all on all tables in schema public to authenticated;`);
  await d.exec(`set role authenticated;`);
  const q = async (r, c) => (await d.query(`select public.check_passcode($1,$2) ok`, [r, c])).rows[0].ok;
  assert.equal(await q('nurse', 'nurse'), true);
  assert.equal(await q('vet', 'vet2026'), true);
  assert.equal(await q('nurse', 'vet2026'), false);
  assert.equal(await q('vet', 'nope'), false);
  assert.equal(await q('admin', 'nurse'), false);
  await d.exec(`reset role; set role anon;`);
  const err = await rejects(d, `select public.check_passcode('nurse','nurse')`);
  assert.ok(err && /permission denied/i.test(err), err);
  await d.exec(`reset role;`);
});

test('role_passcodes is unreadable by authenticated (RLS on, no policies)', async () => {
  const d = await db();
  await d.exec(`grant all on all tables in schema public to authenticated;`);
  await d.exec(`set role authenticated;`);
  const r = await d.query(`select * from public.role_passcodes`);
  assert.equal(r.rows.length, 0);
  await d.exec(`reset role;`);
  const stored = (await d.query(`select role, code_hash from public.role_passcodes order by role`)).rows;
  assert.equal(stored.length, 2);
  for (const s of stored) assert.ok(!['nurse', 'vet2026'].includes(s.code_hash));
});

test('noga_requests: staff insert/select work, sync_writer blocked, constraints enforced', async () => {
  const d = await db();
  await d.exec(`grant all on all tables in schema public to authenticated;`);
  await d.exec(`set app.jwt = '{"app_metadata":{}}'`);
  await d.exec(`set role authenticated;`);
  await d.exec(`insert into public.noga_requests (animal_id,location,task) values ('123','Dog Room 1','fiv_test')`);
  assert.equal((await d.query(`select * from public.noga_requests`)).rows.length, 1);
  const bad = await rejects(d, `insert into public.noga_requests (animal_id,location,task) values ('1','r','bogus')`);
  assert.ok(bad && /check constraint|violates/i.test(bad));
  await d.exec(`reset role;`);

  await d.exec(`set app.jwt = '{"app_metadata":{"role":"sync_writer"}}'`);
  await d.exec(`set role authenticated;`);
  assert.equal((await d.query(`select * from public.noga_requests`)).rows.length, 0);
  const err = await rejects(d, `insert into public.noga_requests (animal_id,location,task) values ('2','r','other')`);
  assert.ok(err && /row level security|policy|violates/i.test(err));
  assert.equal((await d.query(`update public.noga_requests set done=true returning *`)).rows.length, 0);
  assert.equal((await d.query(`delete from public.noga_requests returning *`)).rows.length, 0);
  await d.exec(`reset role;`);
});

test('noga_requests has 4 guarded policies and is in supabase_realtime', async () => {
  const d = await db();
  const p = await d.query(`select cmd, qual, with_check from pg_policies where tablename='noga_requests'`);
  assert.deepEqual(p.rows.map(r => r.cmd).sort(), ['DELETE', 'INSERT', 'SELECT', 'UPDATE']);
  for (const r of p.rows) assert.ok(((r.qual || '') + (r.with_check || '')).includes('sync_writer'));
  const pub = await d.query(`select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='noga_requests'`);
  assert.equal(pub.rows.length, 1);
});

test('running 0010 twice is harmless', async () => {
  const d = await db();
  await d.exec(`update public.role_passcodes set code_hash = extensions.crypt('x', extensions.gen_salt('bf')) where role='nurse'`);
  await d.exec(load('0010_round3.sql'));
  assert.equal((await d.query(`select public.check_passcode('nurse','x') ok`)).rows[0].ok, true);
  assert.equal((await d.query(`select public.check_passcode('nurse','nurse') ok`)).rows[0].ok, false);
  assert.equal((await d.query(`select count(*)::int n from public.role_passcodes`)).rows[0].n, 2);
  assert.equal((await d.query(`select count(*)::int n from pg_policies where tablename='noga_requests'`)).rows[0].n, 4);
  assert.equal((await d.query(`select count(*)::int n from pg_trigger where tgname='tasks_hold_medication'`)).rows[0].n, 1);
});
