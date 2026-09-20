import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const MIG = path.resolve(import.meta.dirname, '../supabase/migrations');
const BASE = ['0001_init_schema.sql', '0002_rls_policies.sql', '0003_sync_account_scope.sql', '0004_task_problem_field.sql', '0005_task_condition_field.sql'];

async function db(files) {
  const d = new PGlite();
  await d.exec(`
    create schema auth;
    create function auth.role() returns text language sql as $$ select 'authenticated' $$;
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('app.jwt', true), ''), '{}')::jsonb $$;
    create role authenticated; create role anon;
    create publication supabase_realtime;`);
  for (const f of files) await d.exec(fs.readFileSync(path.join(MIG, f), 'utf8'));
  return d;
}
const rejects = async (d, sql) => { try { await d.exec(sql); return null; } catch (e) { return e.message; } };

test('existing urgency values map: urgent->red_flag, soon->urgent, routine unchanged', async () => {
  const d = await db(BASE);
  await d.exec(`insert into public.tasks (title,location,shift,urgency) values
    ('a','r','sick_injured','urgent'),('b','r','sick_injured','soon'),('c','r','sick_injured','routine')`);
  await d.exec(fs.readFileSync(path.join(MIG, '0008_triage_and_vet_desk.sql'), 'utf8'));
  const r = await d.query(`select title, urgency from public.tasks order by title`);
  assert.deepEqual(r.rows.map(x => x.urgency), ['red_flag', 'urgent', 'routine']);
});

test('new tier value accepted, legacy soon still accepted, junk rejected, new columns default sensibly', async () => {
  const d = await db([...BASE, '0008_triage_and_vet_desk.sql']);
  await d.exec(`insert into public.tasks (title,location,shift,urgency,red_flags) values ('x','r','sick_injured','red_flag','{bleeding}')`);
  await d.exec(`insert into public.tasks (title,location,shift,urgency) values ('y','r','sick_injured','soon')`);
  const err = await rejects(d, `insert into public.tasks (title,location,shift,urgency) values ('bad','r','sick_injured','bogus')`);
  assert.ok(err && /check constraint|violates|invalid/i.test(err));
  await d.exec(`insert into public.tasks (title,location,shift) values ('z','r','sick_injured')`);
  const r = await d.query(`select red_flags, claimed_by from public.tasks where title='z'`);
  assert.deepEqual(r.rows[0].red_flags, []);
  assert.equal(r.rows[0].claimed_by, null);
});

test('memos: UPDATE/DELETE policies exist, staff can tick off and delete, sync_writer cannot', async () => {
  const d = await db([...BASE, '0008_triage_and_vet_desk.sql']);
  const pol = await d.query(`select cmd from pg_policies where tablename='memos'`);
  const cmds = pol.rows.map(r => r.cmd);
  assert.ok(cmds.includes('UPDATE') && cmds.includes('DELETE'));

  // Staff (normal authenticated) can update and delete
  await d.exec(`grant all on all tables in schema public to authenticated;`);
  await d.exec(`insert into public.memos (author,text) values ('JX','hello')`);
  await d.exec(`set role authenticated;`);
  await d.exec(`update public.memos set done = true, done_at = now() where author='JX'`);
  assert.equal((await d.query(`select done from public.memos where author='JX'`)).rows[0].done, true);
  const memo_id = (await d.query(`select id from public.memos where author='JX'`)).rows[0].id;
  await d.exec(`delete from public.memos where id='${memo_id}'`);
  assert.equal((await d.query(`select count(*)::int as n from public.memos where author='JX'`)).rows[0].n, 0);
  await d.exec(`reset role;`);

  // sync_writer cannot update memos
  await d.exec(`set app.jwt = '{"app_metadata":{"role":"sync_writer"}}'`);
  await d.exec(`insert into public.memos (author,text) values ('JX2','hello2')`);
  await d.exec(`set role authenticated;`);
  const updateResult = await d.query(`update public.memos set done = true where author='JX2' returning *`);
  assert.equal(updateResult.rows.length, 0);
  await d.exec(`reset role;`);
});

test('nurse tables: constraints, uniqueness, cascade', async () => {
  const d = await db([...BASE, '0008_triage_and_vet_desk.sql']);
  await d.exec(`insert into public.nurse_requests (location,species,animal_count) values ('FIR Room','cat',8)`);
  const err1 = await rejects(d, `insert into public.nurse_requests (location,species,animal_count) values ('FIR Room','cat',0)`);
  assert.ok(err1 && /check constraint|violates/i.test(err1));
  const err2 = await rejects(d, `insert into public.nurse_requests (location,species,animal_count) values ('FIR Room','rabbit',1)`);
  assert.ok(err2 && /check constraint|violates/i.test(err2));
  await d.exec(`insert into public.nurse_treatments (animal_id,location,treatment,times_per_day,days) values ('1174362','Cat Room 1','Flush site',2,7)`);
  const err3 = await rejects(d, `insert into public.nurse_treatments (animal_id,location,treatment,times_per_day,days) values ('x','r','t',5,7)`);
  assert.ok(err3 && /check constraint|violates/i.test(err3));
  const t = (await d.query(`select id from public.nurse_treatments`)).rows[0].id;
  await d.exec(`insert into public.nurse_treatment_doses (treatment_id,day_no,slot_no,due_date) values ('${t}',1,1,'2026-09-20')`);
  const err4 = await rejects(d, `insert into public.nurse_treatment_doses (treatment_id,day_no,slot_no,due_date) values ('${t}',1,1,'2026-09-20')`);
  assert.ok(err4 && /unique|violates/i.test(err4));
  await d.exec(`delete from public.nurse_treatments`);
  assert.equal((await d.query(`select count(*)::int as n from public.nurse_treatment_doses`)).rows[0].n, 0);
});

test('nurse tables: sync_writer blocked by RLS policies', async () => {
  const d = await db([...BASE, '0008_triage_and_vet_desk.sql']);
  await d.exec(`grant all on all tables in schema public to authenticated;`);
  await d.exec(`set app.jwt = '{"app_metadata":{"role":"sync_writer"}}'`);
  await d.exec(`set role authenticated;`);

  // sync_writer cannot insert into nurse_requests
  const err1 = await rejects(d, `insert into public.nurse_requests (location,species,animal_count) values ('FIR Room','cat',8)`);
  assert.ok(err1 && /row level security|policy|violates/i.test(err1));

  // sync_writer cannot insert into nurse_treatments
  const err2 = await rejects(d, `insert into public.nurse_treatments (animal_id,location,treatment,times_per_day,days) values ('1174362','Cat Room 1','Flush site',2,7)`);
  assert.ok(err2 && /row level security|policy|violates/i.test(err2));

  await d.exec(`reset role;`);
});
