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
async function db(upTo = '0043_task_done_log.sql') {
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

test('0043: a finished check is logged once, and re-listing the row for a new day keeps the earlier completion', async () => {
  const d = await db();
  await d.exec(`insert into public.tasks (title, location, shift) values ('A1','CR1-1','sick_injured')`);
  await d.exec(`update public.tasks set done=true, completed_at = now() - interval '2 days' where title='A1'`);
  assert.equal(await n(d, `select count(*)::int n from public.task_done_log`), 1, 'logged on completion');
  // re-list: fresh created_at, open again (what the Edge Function does)
  await d.exec(`update public.tasks set created_at=now(), done=false, completed_at=null, note=null where title='A1'`);
  assert.equal(await n(d, `select count(*)::int n from public.task_done_log where title='A1'`), 1, 'the earlier completion survives a re-list');
  // finished again today: a second entry
  await d.exec(`update public.tasks set done=true, completed_at=now() where title='A1'`);
  assert.equal(await n(d, `select count(*)::int n from public.task_done_log where title='A1'`), 2, 'and today\'s completion is added');
});
test('0043: a check put back by mistake (same row, same day) loses its count', async () => {
  const d = await db();
  await d.exec(`insert into public.tasks (title, location, shift) values ('B1','P1','processing')`);
  await d.exec(`update public.tasks set done=true, completed_at=now() where title='B1'`);
  assert.equal(await n(d, `select count(*)::int n from public.task_done_log`), 1);
  await d.exec(`update public.tasks set done=false, completed_at=null where title='B1'`);
  assert.equal(await n(d, `select count(*)::int n from public.task_done_log`), 0, 'undo removes it');
});
test('0043: already-finished rows become the starting history; the log is readable only by signed-in staff', async () => {
  const d = await db('0042_clinic_meeting.sql');
  await d.exec(`insert into public.tasks (title, location, shift, done, completed_at) values ('C1','P1','surgery',true,now() - interval '40 days')`);
  await d.exec(load('0043_task_done_log.sql'));
  assert.equal(await n(d, `select count(*)::int n from public.task_done_log where title='C1'`), 1, 'backfilled');
  await d.exec(load('0043_task_done_log.sql'));   // safe to run twice
  assert.equal(await n(d, `select count(*)::int n from public.task_done_log where title='C1'`), 1, 'no duplicates on a second run');
  assert.equal(await n(d, `select count(*)::int n from pg_policies where tablename='task_done_log'`), 1);
});

test('0044: a request and a list entry for the same ID + location + shift are two rows; two of the same kind still collide', async () => {
  const d = await db('0044_tasks_request_and_list_separate.sql');
  await d.exec(`insert into public.tasks (title, location, shift) values ('R1','Cat Room 1 / 3','sick_injured')`);               // list entry (default type)
  await d.exec(`insert into public.tasks (title, location, shift, type) values ('R1','Cat Room 1 / 3','sick_injured','shelter')`); // staff request
  assert.equal(await n(d, `select count(*)::int n from public.tasks where title='R1'`), 2);
  await assert.rejects(() => d.exec(`insert into public.tasks (title, location, shift, type) values ('R1','Cat Room 1 / 3','sick_injured','foster')`), /unique|duplicate/i, 'a second request for the same animal+pen still hits the key');
  // the tool's upsert (no type, no kind) hits only the list row
  await d.exec(`insert into public.tasks (title, location, shift, done, completed_at) values ('R1','Cat Room 1 / 3','sick_injured',true,now())
                on conflict (title,location,shift,kind) do update set done=excluded.done, completed_at=excluded.completed_at`);
  assert.equal(await n(d, `select count(*)::int n from public.tasks where title='R1'`), 2, 'still two rows');
  assert.equal(await n(d, `select count(*)::int n from public.tasks where title='R1' and type='shelter' and done`), 0, 'the request stays open');
  assert.equal(await n(d, `select count(*)::int n from public.tasks where title='R1' and type='check_recheck' and done`), 1, 'the list check is the one completed');
  await d.exec(load('0044_tasks_request_and_list_separate.sql'));   // safe to run twice
});
