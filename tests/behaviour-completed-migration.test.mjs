import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
const MIG = path.resolve(import.meta.dirname, '../supabase/migrations');
const SHIM = `create schema extensions;
  create function extensions.gen_salt(t text) returns text language sql as $$ select '$shim$' || md5(random()::text) $$;
  create function extensions.crypt(pw text, salt text) returns text language sql as $$ select substr(salt, 1, 38) || md5(pw || substr(salt, 1, 38)) $$;`;
const load = f => fs.readFileSync(path.join(MIG, f), 'utf8').replace(/create extension if not exists pgcrypto with schema extensions;/, '').replace(/-- pgcrypto-guard-start[\s\S]*?-- pgcrypto-guard-end/, '');
async function db(upTo = '0033_behaviour_completed_24h.sql') {
  const d = new PGlite();
  await d.exec(`create schema auth; create function auth.role() returns text language sql as $$ select 'authenticated' $$;
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('app.jwt', true), ''), '{}')::jsonb $$;
    create role authenticated; create role anon; create publication supabase_realtime;` + SHIM);
  for (const f of fs.readdirSync(MIG).filter(f => /^\d{4}_.*\.sql$/.test(f) && f <= upTo).sort()) { if (f.startsWith('0006') || f.startsWith('0007')) continue; await d.exec(load(f)); }
  return d;
}
const n = async (d, sql) => (await d.query(sql)).rows[0].n;
const ins = (id, extra = '') => `insert into public.behaviour_tasks (kind, animal_id, location, due_window, flagged_by${extra ? ', ' + extra.split('=')[0] : ''}) values ('other','${id}','Pound 1','today','AB'${extra ? ', ' + extra.split('=')[1] : ''})`;
test('0033: a finished Behaviour task stays for 24 hours (so it can be put back), then goes; open ones never go; the count stays', async () => {
  const d = await db();
  await d.exec(ins('C-1')); await d.exec(ins('C-2')); await d.exec(ins('C-3'));
  await d.exec(`update public.behaviour_tasks set status='done', done_at = now() - interval '23 hours', done_note='x', done_by='AB' where animal_id = 'C-1'`);
  await d.exec(`update public.behaviour_tasks set status='done', done_at = now() - interval '25 hours', done_note='x', done_by='AB' where animal_id = 'C-2'`);
  assert.equal(await n(d, `select count(*)::int n from public.behaviour_tasks where animal_id='C-1'`), 1, 'finished 23 hours ago: still there');
  assert.equal(await n(d, `select count(*)::int n from public.behaviour_tasks where animal_id='C-2'`), 0, 'finished 25 hours ago: removed');
  assert.equal(await n(d, `select count(*)::int n from public.behaviour_tasks where animal_id='C-3'`), 1, 'an open task is never removed');
  assert.equal(await n(d, `select count(*)::int n from public.behaviour_done_log`), 2, 'both completions are still counted');
});
test('0033: a finished task can be put back (status open) within the day and its count goes with it; running twice is safe', async () => {
  const d = await db(); await d.exec(load('0033_behaviour_completed_24h.sql'));
  await d.exec(ins('C-4'));
  await d.exec(`update public.behaviour_tasks set status='done', done_at=now(), done_note='note', done_by='AB'`);
  assert.equal(await n(d, `select count(*)::int n from public.behaviour_done_log`), 1);
  await d.exec(`update public.behaviour_tasks set status='open', done_at=null, done_note=null, done_by=null`);
  assert.equal(await n(d, `select count(*)::int n from public.behaviour_done_log`), 0, 'put back removes the count');
  assert.equal(await n(d, `select count(*)::int n from public.behaviour_tasks where status='open'`), 1);
});
