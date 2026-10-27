import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const MIG = path.resolve(import.meta.dirname, '../supabase/migrations');
async function db() {
  const d = new PGlite();
  await d.exec(`
    create schema auth;
    create function auth.role() returns text language sql as $$ select 'authenticated' $$;
    create function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('app.jwt', true), ''), '{}')::jsonb $$;
    create role authenticated; create role anon;
    create publication supabase_realtime;`);
  const sql = fs.readFileSync(path.join(MIG, '0038_fsa_fir.sql'), 'utf8');
  await d.exec(sql);
  await d.exec(sql);   // safe to run twice
  return d;
}
const rejects = async (d, sql) => { try { await d.exec(sql); return null; } catch (e) { return String(e.message); } };
const ins = (cage, id) => `insert into public.fsa_cats (cage, animal_id) values (${cage}, '${id}')`;

test('0038: defaults — active, empty data, intake now', async () => {
  const d = await db(); await d.exec(ins(5, 'FICT-5'));
  const r = (await d.query('select status, data, intake_at from public.fsa_cats')).rows[0];
  assert.equal(r.status, 'active'); assert.deepEqual(r.data, {}); assert.ok(r.intake_at);
});

test('0038: cage must be 1-32, status must be known, and only one ACTIVE cat per cage', async () => {
  const d = await db();
  assert.match(await rejects(d, ins(0, 'X')) || '', /check/i); assert.match(await rejects(d, ins(33, 'X')) || '', /check/i);
  await d.exec(ins(32, 'OK-32'));
  assert.match(await rejects(d, `insert into public.fsa_cats (cage, animal_id, status) values (1, 'X', 'maybe')`) || '', /check/i);
  await d.exec(ins(7, 'A')); assert.match(await rejects(d, ins(7, 'B')) || '', /unique|duplicate/i);
  await d.exec(`update public.fsa_cats set status = 'completed' where animal_id = 'A'`);
  await d.exec(ins(7, 'B'));   // the cage is free once the first cat is completed
});

test('0038: an update refreshes updated_at; completing stamps completed_at and putting back clears it', async () => {
  const d = await db(); await d.exec(ins(3, 'U-1'));
  await d.exec(`update public.fsa_cats set updated_at = now() - interval '1 hour'`);
  await d.exec(`update public.fsa_cats set data = '{"a":1}'`);
  const r = (await d.query(`select updated_at > now() - interval '1 minute' as fresh from public.fsa_cats`)).rows[0]; assert.equal(r.fresh, true);
  await d.exec(`update public.fsa_cats set status = 'completed'`);
  assert.ok((await d.query('select completed_at from public.fsa_cats')).rows[0].completed_at);
  await d.exec(`update public.fsa_cats set status = 'active'`);
  assert.equal((await d.query('select completed_at from public.fsa_cats')).rows[0].completed_at, null);
});

test('0038: completed cats go 7 days after completion and untouched rows after 7 days; recent ones stay', async () => {
  const d = await db();
  await d.exec(ins(1, 'OLD-DISCH')); await d.exec(ins(2, 'NEW-DISCH')); await d.exec(ins(3, 'STALE')); await d.exec(ins(4, 'FRESH'));
  await d.exec(`update public.fsa_cats set status = 'completed' where animal_id in ('OLD-DISCH','NEW-DISCH')`);
  await d.exec(`update public.fsa_cats set completed_at = now() - interval '8 days' where animal_id = 'OLD-DISCH'`);
  await d.exec(`alter table public.fsa_cats disable trigger fsa_cats_touch`);
  await d.exec(`update public.fsa_cats set updated_at = now() - interval '8 days' where animal_id = 'STALE'`);
  await d.exec(`alter table public.fsa_cats enable trigger fsa_cats_touch`);
  await d.exec(ins(5, 'TRIGGER-ROW'));   // any insert runs the clean-up
  const left = (await d.query('select animal_id from public.fsa_cats order by animal_id')).rows.map(r => r.animal_id);
  assert.deepEqual(left, ['FRESH', 'NEW-DISCH', 'TRIGGER-ROW']);
});

test('0038: RLS is on and the table is in the realtime publication', async () => {
  const d = await db();
  assert.equal((await d.query(`select relrowsecurity from pg_class where relname = 'fsa_cats'`)).rows[0].relrowsecurity, true);
  assert.equal((await d.query(`select count(*)::int as n from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'fsa_cats'`)).rows[0].n, 1);
  assert.equal((await d.query(`select count(*)::int as n from pg_policies where tablename = 'fsa_cats'`)).rows[0].n, 4);
});
