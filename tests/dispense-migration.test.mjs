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
async function db(upTo) {
  const d = new PGlite();
  await d.exec(`create schema auth; create function auth.role() returns text language sql as $$ select 'authenticated' $$;
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('app.jwt', true), ''), '{}')::jsonb $$;
    create role authenticated; create role anon; create publication supabase_realtime;` + SHIM);
  for (const f of fs.readdirSync(MIG).filter(f => /^\d{4}_.*\.sql$/.test(f) && f <= upTo).sort()) { if (f.startsWith('0006') || f.startsWith('0007')) continue; await d.exec(load(f)); }
  return d;
}
const rejects = async (d, sql) => { try { await d.exec(sql); return null; } catch (e) { return String(e.message); } };
test('0031: "dispense" is an allowed nurse task; before it, it was refused; re-running is safe; other kinds still work', async () => {
  const d = await db('0030_done_counts_and_noga_cleanup.sql');
  assert.match(await rejects(d, `insert into public.noga_requests (animal_id, location, task) values ('D-1','Pound 1','dispense')`) || '', /noga_requests_task_check/);
  await d.exec(load('0031_dispense_task.sql')); await d.exec(load('0031_dispense_task.sql'));
  assert.equal(await rejects(d, `insert into public.noga_requests (animal_id, location, task, note) values ('D-1','Pound 1','dispense','meloxicam 0.5 ml')`), null);
  assert.equal(await rejects(d, `insert into public.noga_requests (animal_id, location, task) values ('D-2','Pound 1','blood')`), null);
  assert.match(await rejects(d, `insert into public.noga_requests (animal_id, location, task) values ('D-3','Pound 1','nonsense')`) || '', /noga_requests_task_check/);
});
test('0031: a finished dispense task is counted for the Welfare nurse and cleared after 24 hours', async () => {
  const d = await db('0031_dispense_task.sql');
  await d.exec(`insert into public.noga_requests (animal_id, location, task, done, done_at) values ('D-1','Pound 1','dispense',true, now() - interval '30 hours')`);
  await d.exec(`insert into public.noga_requests (animal_id, location, task) values ('D-2','Pound 1','dispense')`);
  assert.equal((await d.query(`select count(*)::int n from public.noga_requests where animal_id='D-1'`)).rows[0].n, 0);
  assert.equal((await d.query(`select count(*)::int n from public.noga_requests where animal_id='D-2'`)).rows[0].n, 1, 'the open one stays');
  assert.equal(Number((await d.query(`select coalesce(sum(n),0)::int n from public.nurse_daily_counts('2020-01-01') where role='welfare'`)).rows[0].n), 1);
});
