import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const MIG = path.resolve(import.meta.dirname, '../supabase/migrations');
// 0006/0007 don't touch these tables; 0008 (nurse_requests), 0010 (noga_requests), 0011/0012 (request kinds) then 0014, 0016.
const CHAIN = ['0001_init_schema.sql', '0002_rls_policies.sql', '0003_sync_account_scope.sql', '0004_task_problem_field.sql',
  '0005_task_condition_field.sql', '0008_triage_and_vet_desk.sql', '0009_surveillance.sql', '0010_round3.sql',
  '0011_scheduled_arrival.sql', '0012_nurse_request_kinds.sql', '0014_nurse_split_birthing.sql', '0016_microchip_uv_combined.sql'];

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
  for (const f of CHAIN) await d.exec(load(f));
  return d;
}
const rejects = async (d, sql) => { try { await d.exec(sql); return null; } catch (e) { return String(e.message); } };

test('0016: nurse requests accept the combined microchip_uv kind, still reject unknown kinds, and re-running is safe', async () => {
  const d = await db();
  await d.exec(`insert into public.nurse_requests (kind, location, species, animal_count, animal_id, arrived_at) values ('microchip_uv','Pathway','cat',1,'FOS-1', now())`);
  assert.equal((await d.query(`select count(*)::int n from public.nurse_requests where kind='microchip_uv'`)).rows[0].n, 1);
  assert.match(await rejects(d, `insert into public.nurse_requests (kind, location, species, animal_count, arrived_at) values ('bogus','Pathway','cat',1, now())`) || '', /check/i);
  await d.exec(load('0016_microchip_uv_combined.sql'));   // idempotent
  assert.equal((await d.query(`select count(*)::int n from public.nurse_requests`)).rows[0].n, 1);
});
