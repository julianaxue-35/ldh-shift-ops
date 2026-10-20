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
  for (const f of CHAIN) await d.exec(load(f));
  return d;
}
const rejects = async (d, sql) => { try { await d.exec(sql); return null; } catch (e) { return String(e.message); } };

test('0027: a medication label is a kind of nurse task; one OPEN task per label key; a finished one lets a new one in; re-running is safe', async () => {
  const d = await db();
  await d.exec(`insert into public.noga_requests (animal_id, location, task, note, added_by, source_key) values ('A-1','Pound 1 / 3','med_label','Meloxicam, give 1 tablet orally with food for 5 days','JX','chart1|0')`);
  assert.equal((await d.query(`select count(*)::int n from public.noga_requests where task='med_label'`)).rows[0].n, 1);
  assert.match(await rejects(d, `insert into public.noga_requests (animal_id, location, task, source_key) values ('A-1','Pound 1','med_label','chart1|0')`) || '', /duplicate|unique/i);
  await d.exec(`insert into public.noga_requests (animal_id, location, task, source_key) values ('A-1','Pound 1','med_label','chart1|1')`);   // another medication line
  await d.exec(`update public.noga_requests set done = true where source_key = 'chart1|0'`);
  await d.exec(`insert into public.noga_requests (animal_id, location, task, source_key) values ('A-1','Pound 1','med_label','chart1|0')`);   // the first is finished: a new label is allowed
  assert.equal((await d.query(`select count(*)::int n from public.noga_requests where source_key='chart1|0'`)).rows[0].n, 2);
  assert.match(await rejects(d, `insert into public.noga_requests (animal_id, location, task) values ('A-1','Pound 1','bogus')`) || '', /check/i);
  await d.exec(`insert into public.noga_requests (animal_id, location, task) values ('A-2','Pound 1','other'), ('A-3','Pound 1','other')`);   // no key: many allowed
  await d.exec(load('0027_nurse_med_label.sql'));   // idempotent
  assert.equal((await d.query(`select count(*)::int n from public.noga_requests`)).rows[0].n, 5);
});
