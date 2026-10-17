import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const MIG = path.resolve(import.meta.dirname, '../supabase/migrations');
// The chain the round-3 suite needs for role_passcodes, plus 0017. (0006/0007/0011-0016 don't touch these tables.)
const CHAIN = ['0001_init_schema.sql', '0002_rls_policies.sql', '0003_sync_account_scope.sql', '0004_task_problem_field.sql',
  '0005_task_condition_field.sql', '0008_triage_and_vet_desk.sql', '0009_surveillance.sql', '0010_round3.sql', '0017_admission_aa.sql'];

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
    create role authenticated; create role anon;
    create publication supabase_realtime;` + SHIM);
  for (const f of CHAIN) await d.exec(load(f));
  return d;
}
const rejects = async (d, sql) => { try { await d.exec(sql); return null; } catch (e) { return String(e.message); } };

test('0017: aa_items accepts the five kinds, rejects unknown kinds and empty animal lists', async () => {
  const d = await db();
  for (const k of ['fiv', 'microchip', 'uv', 'microchip_uv', 'vaccination'])
    await d.exec(`insert into public.aa_items (kind, animal_ids, payload, sent_by) values ('${k}', array['A1'], '{}'::jsonb, 'AB')`);
  assert.equal((await d.query(`select count(*)::int n from public.aa_items`)).rows[0].n, 5);
  assert.match(await rejects(d, `insert into public.aa_items (kind, animal_ids, payload, sent_by) values ('bogus', array['A1'], '{}'::jsonb, 'AB')`) || '', /check/i);
  assert.match(await rejects(d, `insert into public.aa_items (kind, animal_ids, payload, sent_by) values ('fiv', array[]::text[], '{}'::jsonb, 'AB')`) || '', /check/i);
});

test('0017: sent_at defaults to now and rows hard-delete', async () => {
  const d = await db();
  await d.exec(`insert into public.aa_items (kind, animal_ids, payload, sent_by) values ('fiv', array['A1'], '{"result":"neg"}'::jsonb, 'AB')`);
  const r = (await d.query(`select extract(epoch from (now() - sent_at)) as age from public.aa_items`)).rows[0];
  assert.ok(Number(r.age) < 60);
  await d.exec(`delete from public.aa_items`);
  assert.equal((await d.query(`select count(*)::int n from public.aa_items`)).rows[0].n, 0);
});

test('0017: RLS is on, the table is in the realtime publication, and the sync_writer role is shut out', async () => {
  const d = await db();
  assert.equal((await d.query(`select relrowsecurity from pg_class where relname='aa_items'`)).rows[0].relrowsecurity, true);
  assert.equal((await d.query(`select count(*)::int n from pg_publication_tables where pubname='supabase_realtime' and tablename='aa_items'`)).rows[0].n, 1);
  const pol = (await d.query(`select polname, pg_get_expr(polqual, polrelid) q, pg_get_expr(polwithcheck, polrelid) w from pg_policy where polrelid='public.aa_items'::regclass`)).rows;
  assert.equal(pol.length, 4);
  assert.ok(pol.every(p => /sync_writer/.test((p.q || '') + (p.w || ''))));
});

test("0017: the 'aa' passcode role exists but nothing the repo knows unlocks it", async () => {
  const d = await db();
  assert.equal((await d.query(`select count(*)::int n from public.role_passcodes where role='aa'`)).rows[0].n, 1);
  for (const guess of ['aa', 'admission', 'nurse', 'vet2026', '']) {
    assert.equal((await d.query(`select public.check_passcode('aa', $1) as ok`, [guess])).rows[0].ok, false);
  }
  // Setting a code (what Juliana does in the SQL editor) then works, and the vet/nurse codes are untouched.
  await d.exec(`update public.role_passcodes set code_hash = extensions.crypt('sample-code', extensions.gen_salt('bf')) where role='aa'`);
  assert.equal((await d.query(`select public.check_passcode('aa','sample-code') as ok`)).rows[0].ok, true);
  assert.equal((await d.query(`select public.check_passcode('nurse','nurse') as ok`)).rows[0].ok, true);
});

test('0017: re-running is safe and does not reset an AA code that has been set', async () => {
  const d = await db();
  await d.exec(`update public.role_passcodes set code_hash = extensions.crypt('sample-code', extensions.gen_salt('bf')) where role='aa'`);
  await d.exec(load('0017_admission_aa.sql'));
  assert.equal((await d.query(`select public.check_passcode('aa','sample-code') as ok`)).rows[0].ok, true);
  assert.equal((await d.query(`select count(*)::int n from pg_policy where polrelid='public.aa_items'::regclass`)).rows[0].n, 4);
});
