import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const MIG = path.resolve(import.meta.dirname, '../supabase/migrations');
const BASE = ['0001_init_schema.sql', '0002_rls_policies.sql', '0004_task_problem_field.sql', '0005_task_condition_field.sql'];

async function db(files) {
  const d = new PGlite();
  await d.exec(`
    create schema auth;
    create function auth.role() returns text language sql as $$ select 'authenticated' $$;
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create role authenticated; create role anon;
    create publication supabase_realtime;`);
  for (const f of files) await d.exec(fs.readFileSync(path.join(MIG, f), 'utf8'));
  return d;
}
const rejects = async (d, sql) => { try { await d.exec(sql); return false; } catch (e) { return true; } };

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
  assert.ok(await rejects(d, `insert into public.tasks (title,location,shift,urgency) values ('bad','r','sick_injured','bogus')`));
  await d.exec(`insert into public.tasks (title,location,shift) values ('z','r','sick_injured')`);
  const r = await d.query(`select red_flags, claimed_by from public.tasks where title='z'`);
  assert.deepEqual(r.rows[0].red_flags, []);
  assert.equal(r.rows[0].claimed_by, null);
});

test('memos can be ticked off and deleted (policies exist)', async () => {
  const d = await db([...BASE, '0008_triage_and_vet_desk.sql']);
  const pol = await d.query(`select cmd from pg_policies where tablename='memos'`);
  const cmds = pol.rows.map(r => r.cmd);
  assert.ok(cmds.includes('UPDATE') && cmds.includes('DELETE'));
  await d.exec(`insert into public.memos (author,text) values ('JX','hello')`);
  await d.exec(`update public.memos set done = true, done_at = now() where author='JX'`);
  assert.equal((await d.query(`select done from public.memos`)).rows[0].done, true);
});

test('nurse tables: constraints, uniqueness, cascade', async () => {
  const d = await db([...BASE, '0008_triage_and_vet_desk.sql']);
  await d.exec(`insert into public.nurse_requests (location,species,animal_count) values ('FIR Room','cat',8)`);
  assert.ok(await rejects(d, `insert into public.nurse_requests (location,species,animal_count) values ('FIR Room','cat',0)`));
  assert.ok(await rejects(d, `insert into public.nurse_requests (location,species,animal_count) values ('FIR Room','rabbit',1)`));
  await d.exec(`insert into public.nurse_treatments (animal_id,location,treatment,times_per_day,days) values ('1174362','Cat Room 1','Flush site',2,7)`);
  assert.ok(await rejects(d, `insert into public.nurse_treatments (animal_id,location,treatment,times_per_day,days) values ('x','r','t',5,7)`));
  const t = (await d.query(`select id from public.nurse_treatments`)).rows[0].id;
  await d.exec(`insert into public.nurse_treatment_doses (treatment_id,day_no,slot_no,due_date) values ('${t}',1,1,'2026-09-20')`);
  assert.ok(await rejects(d, `insert into public.nurse_treatment_doses (treatment_id,day_no,slot_no,due_date) values ('${t}',1,1,'2026-09-20')`));
  await d.exec(`delete from public.nurse_treatments`);
  assert.equal((await d.query(`select count(*)::int as n from public.nurse_treatment_doses`)).rows[0].n, 0);
});
