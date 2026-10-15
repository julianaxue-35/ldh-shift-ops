import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const MIG = path.resolve(import.meta.dirname, '../supabase/migrations');
// 0006/0007 don't touch these tables; 0008 (nurse_requests), 0010 (noga_requests), 0011/0012 (request kinds) then 0014.
const CHAIN = ['0001_init_schema.sql', '0002_rls_policies.sql', '0003_sync_account_scope.sql', '0004_task_problem_field.sql',
  '0005_task_condition_field.sql', '0008_triage_and_vet_desk.sql', '0009_surveillance.sql', '0010_round3.sql',
  '0011_scheduled_arrival.sql', '0012_nurse_request_kinds.sql', '0014_nurse_split_birthing.sql'];

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

test('0014: miscellaneous tasks accept the new kinds and link back to a vet case', async () => {
  const d = await db();
  await d.exec(`insert into public.tasks (title,location,shift) values ('A1','Cat Room 1 / 2','sick_injured')`);
  const tid = (await d.query(`select id from public.tasks where title='A1'`)).rows[0].id;
  for (const k of ['blood', 'ear_swab', 'fiv_test', 'ivft', 'microchip', 'uv', 'other']) {
    await d.exec(`insert into public.noga_requests (animal_id,location,task) values ('A1','Cat Room 1','${k}')`);
  }
  await d.exec(`insert into public.noga_requests (animal_id,location,task,source_task_id) values ('A1','Cat Room 1','blood','${tid}')`);
  assert.equal((await d.query(`select count(*)::int n from public.noga_requests`)).rows[0].n, 8);
  assert.ok(await rejects(d, `insert into public.noga_requests (animal_id,location,task) values ('A1','x','bogus')`), 'an unknown task kind is still rejected');
  await d.exec(`delete from public.tasks where id='${tid}'`);   // case deleted: the nurse task survives, link cleared
  assert.equal((await d.query(`select count(*)::int n from public.noga_requests where source_task_id is not null`)).rows[0].n, 0);
});

test('0014: nurse requests accept a UV kind and an optional animal ID; old kinds and rows still work', async () => {
  const d = await db();
  await d.exec(`insert into public.nurse_requests (kind,location,species,animal_count,arrived_at,due_window,animal_id) values ('uv','Pathway','cat',1,now(),'today','FOS-1')`);
  await d.exec(`insert into public.nurse_requests (kind,location,species,animal_count,arrived_at) values ('vaccination','FIR Room','cat',3,now())`);
  const r = await d.query(`select kind, animal_id from public.nurse_requests order by created_at, kind`);
  assert.equal(r.rows.length, 2);
  assert.ok(r.rows.some(x => x.kind === 'uv' && x.animal_id === 'FOS-1'));
  assert.ok(r.rows.some(x => x.kind === 'vaccination' && x.animal_id === null));
  assert.ok(await rejects(d, `insert into public.nurse_requests (kind,location,species,animal_count,arrived_at) values ('nope','x','cat',1,now())`), 'an unknown request kind is still rejected');
});

test('0014: re-running the migration is harmless', async () => {
  const d = await db();
  await d.exec(load('0014_nurse_split_birthing.sql'));
  await d.exec(`insert into public.noga_requests (animal_id,location,task) values ('A','x','uv')`);
});
