import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const MIG = path.resolve(import.meta.dirname, '../supabase/migrations');
// Same partial chain as the surveillance suite (0006/0007 don't affect these tables), plus 0013.
const CHAIN = ['0001_init_schema.sql', '0002_rls_policies.sql', '0003_sync_account_scope.sql', '0004_task_problem_field.sql',
  '0005_task_condition_field.sql', '0008_triage_and_vet_desk.sql', '0009_surveillance.sql', '0013_shelter_board.sql'];

async function db() {
  const d = new PGlite();
  await d.exec(`
    create schema auth;
    create function auth.role() returns text language sql as $$ select 'authenticated' $$;
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('app.jwt', true), ''), '{}')::jsonb $$;
    create role authenticated; create role anon;
    create publication supabase_realtime;`);
  for (const f of CHAIN) await d.exec(fs.readFileSync(path.join(MIG, f), 'utf8'));
  return d;
}

const rejects = async (d, sql) => { try { await d.exec(sql); return null; } catch (e) { return String(e.message); } };

test('0013 adds treatment + plan to tasks, and the Rabbit Room (10 cages) to locations; re-running is harmless', async () => {
  const d = await db();
  await d.exec(`insert into public.tasks (title,location,shift,treatment,plan) values ('9990001','Cat Room 1 / 3','sick_injured','Gabapentin','Rest')`);
  const r = await d.query(`select treatment, plan from public.tasks where title='9990001'`);
  assert.deepEqual(r.rows[0], { treatment: 'Gabapentin', plan: 'Rest' });
  const rr = await d.query(`select grp, cages, sort from public.locations where name='Rabbit Room'`);
  assert.deepEqual(rr.rows[0], { grp: 'Rabbits', cages: 10, sort: 13 });
  await d.exec(fs.readFileSync(path.join(MIG, '0013_shelter_board.sql'), 'utf8'));   // idempotent
  assert.equal((await d.query(`select count(*)::int as n from public.locations`)).rows[0].n, 13);
});

test('flag history: logs real flags (not offline list entries), survives a re-flag, keeps no treatment/plan, drops lines > 3 months', async () => {
  const d = await db();
  const hist = async (t) => (await d.query(`select reason, condition, location from public.flag_history where title='${t}' order by flagged_at`)).rows;
  // a real flag and an offline-tool list entry
  await d.exec(`insert into public.tasks (title,location,shift,type,problem,condition) values ('A1','Cat Room 1 / 12','sick_injured','shelter','Sneezing','cat_flu')`);
  await d.exec(`insert into public.tasks (title,location,shift) values ('A2','Cat Room 1 / 13','sick_injured')`);   // type defaults to check_recheck
  assert.equal((await hist('A1')).length, 1);
  assert.equal((await hist('A2')).length, 0, 'offline list entries are not flags');
  // the same pen + shift cannot be inserted twice — the app reopens the finished row instead, which must log a 2nd line
  assert.match(await rejects(d, `insert into public.tasks (title,location,shift,type) values ('A1','Cat Room 1 / 12','sick_injured','shelter')`), /unique|duplicate/i);
  await d.exec(`update public.tasks set done=true, completed_at=now() where title='A1'`);
  await d.exec(`update public.tasks set done=false, completed_at=null, problem='Vomiting', created_at = now() + interval '1 second' where title='A1'`);
  const h = await hist('A1');
  assert.deepEqual(h.map(x => x.reason), ['Sneezing', 'Vomiting'], 'both flags are kept, in order');
  // only the reason is stored — no treatment/plan columns exist on the log
  const cols = (await d.query(`select column_name from information_schema.columns where table_name='flag_history'`)).rows.map(r => r.column_name);
  assert.ok(!cols.includes('treatment') && !cols.includes('plan'), 'no treatment/plan in the history');
  // retention: an old line is removed the next time a flag is logged
  await d.exec(`insert into public.flag_history (title, flagged_at, reason) values ('OLD', now() - interval '4 months', 'ancient')`);
  await d.exec(`insert into public.tasks (title,location,shift,type) values ('A3','Pound 1 / 1','sick_injured','shelter')`);
  assert.equal((await hist('OLD')).length, 0, 'older than 3 months is deleted');
  // read-only to the API
  const pol = await d.query(`select cmd from pg_policies where tablename='flag_history'`);
  assert.deepEqual(pol.rows.map(r => r.cmd), ['SELECT']);
});

test('0013 backfills the last 3 months of existing flags into the history', async () => {
  const d = new PGlite();
  await d.exec(`create schema auth; create function auth.role() returns text language sql as $$ select 'authenticated' $$; create function auth.uid() returns uuid language sql as $$ select null::uuid $$; create function auth.jwt() returns jsonb language sql as $$ select '{}'::jsonb $$; create role authenticated; create role anon; create publication supabase_realtime;`);
  for (const f of CHAIN.slice(0, -1)) await d.exec(fs.readFileSync(path.join(MIG, f), 'utf8'));
  await d.exec(`insert into public.tasks (title,location,shift,type,problem,created_at) values ('OLDFLAG','Cat Room 1 / 1','sick_injured','shelter','Limping', now() - interval '10 days'), ('ANCIENT','Cat Room 1 / 2','sick_injured','shelter','x', now() - interval '5 months')`);
  await d.exec(fs.readFileSync(path.join(MIG, '0013_shelter_board.sql'), 'utf8'));
  const r = (await d.query(`select title, reason from public.flag_history order by title`)).rows;
  assert.deepEqual(r, [{ title: 'OLDFLAG', reason: 'Limping' }]);
});
