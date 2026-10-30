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
async function db(upTo = '0046_stats_daily.sql') {
  const d = new PGlite();
  await d.exec(`
    create schema auth;
    create function auth.role() returns text language sql as $$ select 'authenticated' $$;
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('app.jwt', true), ''), '{}')::jsonb $$;
    create role authenticated; create role anon; create role service_role;
    create publication supabase_realtime;` + SHIM);
  const files = fs.readdirSync(MIG).filter(f => /^\d{4}_.*\.sql$/.test(f) && f <= upTo).sort();
  for (const f of files) { if (f.startsWith('0006') || f.startsWith('0007')) continue; await d.exec(load(f)); }
  return d;
}
const rows = async (d, sql) => (await d.query(sql)).rows;

test('0046: finishing checks adds to that Melbourne day and shift; un-finishing takes it off', async () => {
  const d = await db();
  await d.exec(`insert into public.tasks (title, location, shift) values ('A1','CR1-1','sick_injured'), ('A2','CR1-2','sick_injured'), ('P1','CR2-1','processing')`);
  await d.exec(`update public.tasks set done=true, completed_at='2026-10-29 23:30:00+00' where title in ('A1','A2')`);   // 10:30 on the 30th in Melbourne
  await d.exec(`update public.tasks set done=true, completed_at='2026-10-30 01:00:00+00' where title='P1'`);
  let r = await rows(d, `select day::text as "day", shift, n from public.stats_daily order by shift`);
  assert.deepEqual(r, [{ day: '2026-10-30', shift: 'processing', n: 1 }, { day: '2026-10-30', shift: 'sick_injured', n: 2 }]);
  await d.exec(`update public.tasks set done=false, completed_at=null where title='A2'`);   // un-finished: its log entry goes
  r = await rows(d, `select n from public.stats_daily where shift='sick_injured'`);
  assert.equal(r[0].n, 1);
});

test('0046: practice animals are not counted, and rebuild matches the live table', async () => {
  const d = await db();
  await d.exec(`insert into public.tasks (title, location, shift) values ('TEST1','CR1-1','sick_injured'), ('A9','CR1-3','surgery')`);
  await d.exec(`update public.tasks set done=true, completed_at=now()`);
  const live = await rows(d, `select day::text as "day", shift, n from public.stats_daily order by 1,2`);
  assert.equal(live.length, 1);
  assert.equal(live[0].shift, 'surgery');
  await d.exec(`select public.rebuild_stats_daily()`);
  assert.deepEqual(await rows(d, `select day::text as "day", shift, n from public.stats_daily order by 1,2`), live, 'rebuild gives the same numbers');
});

test('0046: history already in the log is filled in when the migration runs; pages can read but not rebuild', async () => {
  const d = await db('0045_login_lockout_and_failed_log.sql');
  await d.exec(`insert into public.tasks (title, location, shift) values ('H1','CR1-1','sick_injured')`);
  await d.exec(`update public.tasks set done=true, completed_at='2026-10-21 02:00:00+00' where title='H1'`);
  await d.exec(load('0046_stats_daily.sql'));
  assert.equal((await rows(d, `select n from public.stats_daily where day='2026-10-21'`))[0].n, 1);
  const g = await rows(d, `select count(*)::int n from information_schema.routine_privileges where routine_name in ('rebuild_stats_daily','stats_daily_apply') and grantee in ('anon','authenticated','PUBLIC')`);
  assert.equal(g[0].n, 0);
});
