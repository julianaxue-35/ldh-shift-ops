import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const MIG = path.resolve(import.meta.dirname, '../supabase/migrations');
// 0006/0007 don't touch these tables; 0008 (nurse_requests), 0010 (noga_requests), 0011/0012 (request kinds) then 0014, 0016.
const CHAIN = ['0001_init_schema.sql', '0002_rls_policies.sql', '0003_sync_account_scope.sql', '0004_task_problem_field.sql',
  '0005_task_condition_field.sql', '0008_triage_and_vet_desk.sql', '0009_surveillance.sql', '0010_round3.sql',
  '0011_scheduled_arrival.sql', '0012_nurse_request_kinds.sql', '0014_nurse_split_birthing.sql', '0016_microchip_uv_combined.sql', '0022_treatment_task_kind.sql', '0027_nurse_med_label.sql'];

// PGlite 0.2.x can't load pgcrypto, so 0010 runs with the same test-only shim the round3 suite uses.
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
  // Supabase's storage schema is not in PGlite: a minimal stand-in with the same names the migration touches
  await d.exec(`create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;`);
  for (const f of CHAIN) await d.exec(load(f));
  return d;
}
const rejects = async (d, sql) => { try { await d.exec(sql); return null; } catch (e) { return String(e.message); } };


test('0049: tasks.photo_path, a private JPEG-only bucket, three policies; re-running is safe', async () => {
  const d = await db();
  await d.exec(load('0049_flag_photos.sql'));
  const col = await d.query(`select 1 from information_schema.columns where table_name='tasks' and column_name='photo_path'`);
  assert.equal(col.rows.length, 1);
  const b = (await d.query(`select public, file_size_limit::int lim, allowed_mime_types from storage.buckets where id='flag-photos'`)).rows[0];
  assert.equal(b.public, false); assert.equal(b.lim, 3145728); assert.deepEqual(b.allowed_mime_types, ['image/jpeg']);
  const pol = (await d.query(`select policyname from pg_policies where tablename='objects' and schemaname='storage' order by 1`)).rows.map(r => r.policyname);
  assert.deepEqual(pol, ['flag_photos_delete', 'flag_photos_insert', 'flag_photos_select']);
  await d.exec(load('0049_flag_photos.sql'));   // idempotent
  assert.equal((await d.query(`select count(*)::int n from storage.buckets`)).rows[0].n, 1);
});
