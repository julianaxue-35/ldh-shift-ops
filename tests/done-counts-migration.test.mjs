import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const MIG = path.resolve(import.meta.dirname, '../supabase/migrations');
const SHIM = `
  create schema extensions;
  create function extensions.gen_salt(t text) returns text language sql as $$ select '$shim$' || md5(random()::text) $$;
  create function extensions.crypt(pw text, salt text) returns text language sql as
    $$ select substr(salt, 1, 38) || md5(pw || substr(salt, 1, 38)) $$;`;
const load = f => fs.readFileSync(path.join(MIG, f), 'utf8')
  .replace(/create extension if not exists pgcrypto with schema extensions;/, '')
  .replace(/-- pgcrypto-guard-start[\s\S]*?-- pgcrypto-guard-end/, '');
async function db(upTo = '0030_done_counts_and_noga_cleanup.sql') {
  const d = new PGlite();
  await d.exec(`
    create schema auth;
    create function auth.role() returns text language sql as $$ select 'authenticated' $$;
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('app.jwt', true), ''), '{}')::jsonb $$;
    create role authenticated; create role anon;
    create publication supabase_realtime;` + SHIM);
  const files = fs.readdirSync(MIG).filter(f => /^\d{4}_.*\.sql$/.test(f) && f <= upTo).sort();
  for (const f of files) { if (f.startsWith('0006') || f.startsWith('0007')) continue; await d.exec(load(f)); }
  return d;
}
const n = async (d, sql) => (await d.query(sql)).rows[0].n;
const counts = async (d, role) => Number((await d.query(`select coalesce(sum(n),0)::int n from public.nurse_daily_counts('2020-01-01') where role='${role}'`)).rows[0].n);

test('0030: a finished nurse task is counted, deleted within 24 hours, and the count stays', async () => {
  const d = await db();
  await d.exec(`insert into public.noga_requests (animal_id, location, task, added_by) values ('N-1','Pound 1','ear_swab','AB'),('N-2','Pound 1','microchip','AB'),('N-3','Pound 1','blood','AB')`);
  await d.exec(`update public.noga_requests set done=true, done_by='XY', done_at=now() where animal_id in ('N-1','N-2')`);
  assert.equal(await counts(d, 'welfare'), 1, 'welfare: the ear swab');
  assert.equal(await counts(d, 'processing'), 1, 'processing: the microchip');
  assert.equal(await n(d, `select count(*)::int n from public.noga_requests`), 3, 'recent finished tasks are still there');
  // 25 hours later the finished tasks go; the open one stays; the counts stay
  await d.exec(`update public.noga_requests set done_at = now() - interval '25 hours' where animal_id in ('N-1','N-2')`);
  await d.exec(`insert into public.noga_requests (animal_id, location, task, added_by) values ('N-4','Pound 1','blood','AB')`);
  assert.equal(await n(d, `select count(*)::int n from public.noga_requests where done`), 0, 'finished tasks older than 24h are deleted');
  assert.equal(await n(d, `select count(*)::int n from public.noga_requests where animal_id in ('N-3','N-4')`), 2, 'open tasks are kept');
  assert.equal(await counts(d, 'welfare'), 1); assert.equal(await counts(d, 'processing'), 1);
});

test('0030: the log holds no animal ID or note, and a task put back loses its count', async () => {
  const d = await db();
  const cols = (await d.query(`select column_name c from information_schema.columns where table_name in ('nurse_task_log','behaviour_done_log')`)).rows.map(r => r.c);
  assert.ok(!cols.some(c => /animal|note|title|location/.test(c)), 'no identifying columns: ' + cols);
  await d.exec(`insert into public.noga_requests (animal_id, location, task, added_by) values ('N-1','Pound 1','ear_swab','AB')`);
  await d.exec(`update public.noga_requests set done=true, done_at=now()`);
  assert.equal(await counts(d, 'welfare'), 1);
  await d.exec(`update public.noga_requests set done=false, done_at=null`);
  assert.equal(await counts(d, 'welfare'), 0, 'put back removes the count');
  await d.exec(`update public.noga_requests set done=true, done_at=now()`);
  await d.exec(`update public.noga_requests set done_by='ZZ'`);
  assert.equal(await counts(d, 'welfare'), 1, 'editing a finished task does not count it twice');
});

test('0030: tasks finished before the migration are counted when it runs, and it can run twice', async () => {
  const d = await db('0029_behaviour_attached_note.sql');
  await d.exec(`insert into public.noga_requests (animal_id, location, task, added_by, done, done_at) values ('O-1','Pound 1','ear_swab','AB',true,now() - interval '3 days'),('O-2','Pound 1','uv','AB',true,now())`);
  await d.exec(load('0030_done_counts_and_noga_cleanup.sql'));
  await d.exec(load('0030_done_counts_and_noga_cleanup.sql'));
  assert.equal(await counts(d, 'welfare'), 1); assert.equal(await counts(d, 'processing'), 1);
  assert.equal(await n(d, `select count(*)::int n from public.nurse_task_log`), 2);
});

test('0030: Behaviour cases are counted by kind when finished, and stay counted after the 7-day clean-up', async () => {
  const d = await db();
  await d.exec(`insert into public.behaviour_tasks (kind, animal_id, location, due_window, flagged_by) values
    ('courthold','B-1','Pound 1','today','AB'),('incident_review','B-2','Pound 2','today','AB'),('behaviour_review','B-3','Cat Room 1','today','AB')`);
  const q = `select cat, sum(n)::int n from public.behaviour_daily_counts('2020-01-01') group by cat order by cat`;
  assert.equal((await d.query(q)).rows.length, 0, 'nothing is counted while open');
  await d.exec(`update public.behaviour_tasks set status='done', done_at=now(), done_note='x', done_by='AB' where animal_id in ('B-1','B-2')`);
  assert.deepEqual((await d.query(q)).rows, [{ cat: 'courthold', n: 1 }, { cat: 'incident_review', n: 1 }]);
  assert.equal(await n(d, `select count(*)::int n from public.behaviour_done_log where courthold`), 1, 'a courthold case is flagged');
  await d.exec(`update public.behaviour_tasks set done_at = now() - interval '8 days' where animal_id = 'B-1'`);
  await d.exec(`insert into public.behaviour_tasks (kind, animal_id, location, due_window, flagged_by) values ('other','B-4','Pound 3','today','AB')`);
  assert.equal(await n(d, `select count(*)::int n from public.behaviour_tasks where animal_id='B-1'`), 0, 'the old finished row is deleted');
  assert.deepEqual((await d.query(q)).rows, [{ cat: 'courthold', n: 1 }, { cat: 'incident_review', n: 1 }], 'but the count stays');
  await d.exec(`update public.behaviour_tasks set done_note='edited' where animal_id='B-2'`);
  assert.equal(await n(d, `select count(*)::int n from public.behaviour_done_log`), 2, 'editing a finished case does not count it twice');
});
