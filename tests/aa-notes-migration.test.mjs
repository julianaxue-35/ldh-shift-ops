import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const MIG = path.resolve(import.meta.dirname, '../supabase/migrations');
// The chain the round-3 suite needs for role_passcodes, plus 0017. (0006/0007/0011-0016 don't touch these tables.)
const CHAIN = ['0001_init_schema.sql', '0002_rls_policies.sql', '0003_sync_account_scope.sql', '0004_task_problem_field.sql',
  '0005_task_condition_field.sql', '0008_triage_and_vet_desk.sql', '0009_surveillance.sql', '0010_round3.sql', '0017_admission_aa.sql', '0018_aa_notes.sql'];

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

test('0018: the three new kinds are accepted, unknown kinds still refused', async () => {
  const d = await db();
  for (const k of ['processing_note', 'si_note', 'med_chart'])
    await d.exec(`insert into public.aa_items (kind, animal_ids, payload, sent_by) values ('${k}', array['T-100'], '{"text":"x"}'::jsonb, 'AB')`);
  assert.equal((await d.query(`select count(*)::int n from public.aa_items`)).rows[0].n, 3);
  assert.match(await rejects(d, `insert into public.aa_items (kind, animal_ids, payload, sent_by) values ('bogus', array['T-100'], '{}'::jsonb, 'AB')`) || '', /check/i);
});

test('0018: source_key is unique (one live card per shift/animal/kind) but optional', async () => {
  const d = await db();
  await d.exec(`insert into public.aa_items (kind, animal_ids, payload, source_key) values ('fiv', array['A1'], '{}'::jsonb, null), ('fiv', array['A2'], '{}'::jsonb, null)`);
  await d.exec(`insert into public.aa_items (kind, animal_ids, payload, source_key) values ('processing_note', array['T-100'], '{}'::jsonb, 'processing_note|2026-10-18|T-100')`);
  assert.match(await rejects(d, `insert into public.aa_items (kind, animal_ids, payload, source_key) values ('processing_note', array['T-100'], '{}'::jsonb, 'processing_note|2026-10-18|T-100')`) || '', /unique|duplicate/i);
});

test('0018: updated_at starts null; oversize payloads are refused', async () => {
  const d = await db();
  await d.exec(`insert into public.aa_items (kind, animal_ids, payload) values ('fiv', array['A1'], '{}'::jsonb)`);
  assert.equal((await d.query(`select updated_at from public.aa_items`)).rows[0].updated_at, null);
  const big = 'x'.repeat(1600000);
  assert.match(await rejects(d, `insert into public.aa_items (kind, animal_ids, payload) values ('processing_note', array['A1'], jsonb_build_object('text','${big}'))`) || '', /check|payload/i);
});

test('0018: re-running is safe and keeps existing rows', async () => {
  const d = await db();
  await d.exec(`insert into public.aa_items (kind, animal_ids, payload, source_key) values ('processing_note', array['T-100'], '{}'::jsonb, 'k1')`);
  await d.exec(load('0018_aa_notes.sql'));
  assert.equal((await d.query(`select count(*)::int n from public.aa_items`)).rows[0].n, 1);
});
