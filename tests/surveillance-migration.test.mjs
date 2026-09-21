import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const LDHLogic = createRequire(import.meta.url)('../lib/ldh-logic.js');

const MIG = path.resolve(import.meta.dirname, '../supabase/migrations');
// 0006 and 0007 are deliberately absent: 0006 only creates surgery_shift and 0007 only touches roster — neither affects 0009. This chain therefore does not equal the live schema.
const CHAIN = ['0001_init_schema.sql', '0002_rls_policies.sql', '0003_sync_account_scope.sql', '0004_task_problem_field.sql',
  '0005_task_condition_field.sql', '0008_triage_and_vet_desk.sql', '0009_surveillance.sql'];

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

test('the wider sign list is accepted; a diagnosis is not', async () => {
  const d = await db();
  for (const k of ['cat_flu', 'kennel_cough', 'diarrhoea', 'vomiting', 'eye_condition', 'skin_condition', 'wounds_injury', 'other']) {
    await d.exec(`insert into public.tasks (title,location,shift,condition) values ('x-${k}','Cat Room 1 / 1','sick_injured','${k}')`);
  }
  assert.match(await rejects(d, `insert into public.tasks (title,location,shift,condition) values ('g','Cat Room 1 / 2','sick_injured','giardia')`), /check constraint|violates/i);
});

test('locations are seeded with the Cranbourne spaces and 269 cages', async () => {
  const d = await db();
  const r = await d.query(`select name, grp, cages from public.locations order by sort`);
  assert.deepEqual(r.rows.map(x => x.name), ['Cat Room 1', 'Cat Room 2', 'Cat Room 3', 'FIR Room', 'Adoption 1', 'Adoption 2', 'Cat Isolation ward', 'Pound 1', 'Pound 2', 'Pound 3', 'Pound 4', 'Transport']);
  assert.equal(r.rows.reduce((n, x) => n + x.cages, 0), 269);
  assert.equal(r.rows.find(x => x.name === 'Cat Isolation ward').grp, 'Isolation');
  assert.equal(r.rows.find(x => x.name === 'FIR Room').grp, 'Cat rooms');
});

test('take_surveillance_snapshot counts distinct animals per sign and distinct cases per space within the window, idempotently', async () => {
  const d = await db();
  await d.exec(`
    insert into public.tasks (title,location,shift,condition,created_at) values
      ('A1','Cat Room 1 / 4','sick_injured','cat_flu', now()),
      ('A2','Cat Room 1 / 5','sick_injured','cat_flu', now()),
      ('A1','Cat Room 1 / 4','processing','kennel_cough', now()),
      ('A2','Cat Room 1 / 5','processing','cat_flu', now()),
      ('A3','Pound 2 / 7','sick_injured','cat_flu', now() - interval '5 days'),
      ('A4','Unknown room / 1','sick_injured','other', now()),
      ('A5','Cat Room 2 / 1','sick_injured', null, now());`);
  const n1 = (await d.query(`select public.take_surveillance_snapshot() as n`)).rows[0].n;
  assert.equal(n1, 108, '12 spaces x (8 signs + any)');
  const row = async (space, cond) => (await d.query(`select animals, cages from public.surveillance_snapshots where space=$1 and condition=$2`, [space, cond])).rows[0];
  assert.deepEqual(await row('Cat Room 1', 'cat_flu'), { animals: 2, cages: 30 }, 'A2 flagged twice for the same sign still counts once');
  assert.deepEqual(await row('Cat Room 1', 'kennel_cough'), { animals: 1, cages: 30 });
  assert.equal((await row('Cat Room 1', 'any')).animals, 3, 'cases: A1+cat_flu, A2+cat_flu (reported twice = once), A1+kennel_cough');
  assert.equal((await row('Pound 2', 'any')).animals, 0, 'a 5-day-old flag is outside the 3-day window');
  assert.equal((await row('Cat Room 2', 'any')).animals, 0, 'a task with no sign is not counted');
  const total = () => d.query(`select count(*)::int as n from public.surveillance_snapshots`).then(r => r.rows[0].n);
  assert.equal(await total(), 108);
  await d.query(`select public.take_surveillance_snapshot()`);
  assert.equal(await total(), 108, 'running twice on the same day upserts, never duplicates');
  const dt = (await d.query(`select distinct snapshot_date::text as d from public.surveillance_snapshots`)).rows;
  const expected = (await d.query(`select ((now() - interval '1 hour') at time zone 'Australia/Melbourne')::date::text as d`)).rows[0].d;
  assert.deepEqual(dt, [{ d: expected }], 'dated by the Melbourne evening the job ran in');
});

test('locations and snapshots are read-only for API users and guarded against sync_writer', async () => {
  const d = await db();
  const pol = await d.query(`select tablename, cmd, qual from pg_policies where tablename in ('locations','surveillance_snapshots') order by 1,2`);
  const pairs = pol.rows.map(r => `${r.tablename}:${r.cmd}`).sort();
  assert.deepEqual(pairs, ['locations:SELECT', 'surveillance_snapshots:SELECT'], 'exactly one SELECT policy each, nothing writable');
  pol.rows.forEach(r => assert.ok(String(r.qual).includes('sync_writer'), r.tablename + ' select policy must carry the sync_writer guard'));
  await d.exec(`grant all on all tables in schema public to authenticated; set role authenticated; set app.jwt = '{"app_metadata":{}}';`);
  assert.equal((await d.query(`select count(*)::int as n from public.locations`)).rows[0].n, 12, 'staff can read locations');
  assert.match(await rejects(d, `insert into public.locations (name,grp,cages,sort) values ('X','G',1,99)`), /row.level security|policy/i);
  await d.exec(`set app.jwt = '{"app_metadata":{"role":"sync_writer"}}'`);
  assert.equal((await d.query(`select count(*)::int as n from public.locations`)).rows[0].n, 0, 'sync_writer sees nothing');
  await d.exec(`reset role`);
});

test('0009 can be applied twice, and only the owner may run the snapshot function', async () => {
  const d = await db();
  await d.exec(fs.readFileSync(path.join(MIG, '0009_surveillance.sql'), 'utf8'));   // second application: no error
  assert.equal((await d.query(`select count(*)::int as n from public.locations`)).rows[0].n, 12, 'seed is not duplicated');
  assert.equal((await d.query(`select count(*)::int as n from pg_policies where tablename in ('locations','surveillance_snapshots')`)).rows[0].n, 2, 'policies are not duplicated');
  await d.exec(`grant all on all tables in schema public to authenticated; set role authenticated;`);
  assert.match(await rejects(d, `select public.take_surveillance_snapshot()`), /permission denied/i);
  await d.exec(`reset role`);
  assert.equal((await d.query(`select public.take_surveillance_snapshot() as n`)).rows[0].n, 108, 'the owner can still run it');
});

test('the SQL snapshot and the JS buildSurvey count the same rows the same way', async () => {
  const d = await db();
  const now = Date.now(), iso = (msAgo) => new Date(now - msAgo).toISOString(), H = 3600 * 1000, D = 24 * H;
  const rows = [
    { title: 'A1', location: 'Cat Room 1 / 4', condition: 'cat_flu', created_at: iso(1 * H), shift: 'sick_injured' },
    { title: 'A1', location: 'Cat Room 1 / 4', condition: 'cat_flu', created_at: iso(2 * H), shift: 'processing' },     // same animal + sign again, another shift
    { title: 'A2', location: 'Cat Room 1 / 5', condition: 'cat_flu', created_at: iso(1 * H), shift: 'sick_injured' },
    { title: 'A2', location: 'Cat Room 1 / 5', condition: 'vomiting', created_at: iso(1 * H), shift: 'processing' },   // two different signs = two cases
    { title: 'A6', location: 'Cat Room 2 / 1', condition: 'kennel_cough', created_at: iso(3 * H), shift: 'sick_injured' },
    { title: 'A6', location: 'Pound 1 / 2', condition: 'kennel_cough', created_at: iso(2 * H), shift: 'sick_injured' },    // animal in two spaces
    { title: 'A7', location: 'Mystery Room / 1', condition: 'other', created_at: iso(1 * H), shift: 'sick_injured' },     // unknown space
    { title: 'A8', location: 'Pound 3 / 1', condition: null, created_at: iso(1 * H), shift: 'sick_injured' },             // unflagged
    { title: 'A9', location: 'Pound 2 / 7', condition: 'cat_flu', created_at: iso(5 * D), shift: 'sick_injured' }         // 5 days old
  ];
  for (const r of rows) {
    await d.query(`insert into public.tasks (title,location,shift,condition,created_at) values ($1,$2,$3,$4,$5)`, [r.title, r.location, r.shift, r.condition, r.created_at]);
  }
  await d.query(`select public.take_surveillance_snapshot(3)`);
  const locationRows = (await d.query(`select name, grp, cages, sort from public.locations order by sort`)).rows;
  const survey = LDHLogic.buildSurvey(rows, locationRows, new Date(now - 3 * D));
  const snap = (await d.query(`select space, condition, animals from public.surveillance_snapshots`)).rows;
  const get = (space, cond) => snap.find(r => r.space === space && r.condition === cond).animals;
  assert.equal(survey.spaces.length, 12);
  for (const sp of survey.spaces) {
    assert.equal(get(sp.name, 'any'), sp.cases, sp.name + ': cases');
    for (const k of LDHLogic.SIGN_KEYS) assert.equal(get(sp.name, k), sp.by[k] || 0, sp.name + ' / ' + k);
  }
  assert.equal(survey.spaces.find(s => s.name === 'Cat Room 1').cases, 3, 'sanity: A1 flu once, A2 flu + vomiting');
  assert.equal(survey.unmapped, 1, 'sanity: the unknown space is unmapped on both sides');
});
