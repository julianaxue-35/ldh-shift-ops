import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const LDHLogic = createRequire(import.meta.url)('../lib/ldh-logic.js');

const MIG = path.resolve(import.meta.dirname, '../supabase/migrations');
const CHAIN = ['0001_init_schema.sql', '0002_rls_policies.sql', '0003_sync_account_scope.sql', '0004_task_problem_field.sql',
  '0005_task_condition_field.sql', '0008_triage_and_vet_desk.sql', '0009_surveillance.sql', '0013_shelter_board.sql'];
const M47 = () => fs.readFileSync(path.join(MIG, '0047_sign_groups.sql'), 'utf8');

async function db({ apply = true } = {}) {
  const d = new PGlite();
  await d.exec(`
    create schema auth;
    create function auth.role() returns text language sql as $$ select 'authenticated' $$;
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('app.jwt', true), ''), '{}')::jsonb $$;
    create role authenticated; create role anon;
    create publication supabase_realtime;`);
  for (const f of CHAIN) await d.exec(fs.readFileSync(path.join(MIG, f), 'utf8'));
  if (apply) await d.exec(M47());
  return d;
}
const rejects = async (d, sql) => { try { await d.exec(sql); return null; } catch (e) { return String(e.message); } };
const one = async (d, sql, p) => (await d.query(sql, p)).rows[0];

test('old-style insert with only condition fills conditions with the raw key', async () => {
  const d = await db();
  await d.exec(`insert into public.tasks (title,location,shift,condition) values ('a','Cat Room 1 / 1','sick_injured','vomiting')`);
  const r = await one(d, `select condition, conditions from public.tasks where title='a'`);
  assert.deepEqual(r, { condition: 'vomiting', conditions: ['vomiting'] });
});

test('conditions sets condition to the earliest group in display order (raw key kept)', async () => {
  const d = await db();
  await d.exec(`insert into public.tasks (title,location,shift,conditions) values ('b','Cat Room 1 / 1','sick_injured','{urinary,respiratory}')`);
  assert.deepEqual(await one(d, `select condition, conditions from public.tasks where title='b'`), { condition: 'respiratory', conditions: ['urinary', 'respiratory'] });
  // legacy key ranks by its group: vomiting (gi) beats skin; raw key is stored and chosen
  await d.exec(`insert into public.tasks (title,location,shift,conditions) values ('c','Cat Room 1 / 2','sick_injured','{skin,vomiting}')`);
  assert.deepEqual(await one(d, `select condition from public.tasks where title='c'`), { condition: 'vomiting' });
  // update of conditions re-syncs condition
  await d.exec(`update public.tasks set conditions='{neonatal,ears}' where title='c'`);
  assert.deepEqual(await one(d, `select condition from public.tasks where title='c'`), { condition: 'ears' });
});

test('empty both leaves null/empty; unknown key rejected; legacy keys allowed', async () => {
  const d = await db();
  await d.exec(`insert into public.tasks (title,location,shift) values ('e','Cat Room 1 / 1','sick_injured')`);
  assert.deepEqual(await one(d, `select condition, conditions from public.tasks where title='e'`), { condition: null, conditions: [] });
  assert.match(await rejects(d, `insert into public.tasks (title,location,shift,conditions) values ('f','Cat Room 1 / 2','sick_injured','{giardia}')`), /check constraint|violates/i);
  assert.match(await rejects(d, `insert into public.tasks (title,location,shift,condition) values ('g','Cat Room 1 / 3','sick_injured','giardia')`), /check constraint|violates/i);
  for (const k of new Set(['cat_flu', 'kennel_cough', 'diarrhoea', 'vomiting', 'eye_condition', 'skin_condition', 'wounds_injury', ...LDHLogic.SIGN_KEYS])) {
    await d.exec(`insert into public.tasks (title,location,shift,condition) values ('x-${k}','Cat Room 1 / 4','sick_injured','${k}')`);
  }
});

test('sign_group mirrors the JS groupOf; NULL stays NULL, unknown maps to itself', async () => {
  const d = await db();
  for (const k of [...Object.keys(LDHLogic.LEGACY_GROUP), ...LDHLogic.SIGN_KEYS, 'mystery']) {
    assert.equal((await one(d, `select public.sign_group($1) as g`, [k])).g, LDHLogic.groupOf(k), k);
  }
  assert.equal((await one(d, `select public.sign_group(null) as g`)).g, null);
});

test('existing rows are backfilled and old snapshot rows untouched', async () => {
  const d = await db({ apply: false });
  await d.exec(`insert into public.tasks (title,location,shift,condition) values ('o','Cat Room 1 / 1','sick_injured','cat_flu');
    insert into public.surveillance_snapshots values (current_date,'Cat Room 1','cat_flu',2,30)`);
  await d.exec(M47());
  assert.deepEqual((await one(d, `select conditions from public.tasks where title='o'`)).conditions, ['cat_flu']);
  assert.deepEqual(await one(d, `select condition, animals from public.surveillance_snapshots`), { condition: 'cat_flu', animals: 2 });
});

test('flag_history gets conditions from the task (trigger and backfill)', async () => {
  const d = await db({ apply: false });
  await d.exec(`insert into public.tasks (title,location,shift,type,condition) values ('old','Cat Room 1 / 1','sick_injured','shelter','diarrhoea')`);
  await d.exec(M47());
  assert.deepEqual((await one(d, `select conditions from public.flag_history where title='old'`)).conditions, ['diarrhoea']);
  await d.exec(`insert into public.tasks (title,location,shift,type,conditions) values ('new','Cat Room 1 / 2','sick_injured','shelter','{gi,urinary}')`);
  assert.deepEqual(await one(d, `select condition, conditions from public.flag_history where title='new'`), { condition: 'gi', conditions: ['gi', 'urinary'] });
});

test('running 0047 twice does not error or duplicate', async () => {
  const d = await db();
  await d.exec(`insert into public.tasks (title,location,shift,conditions) values ('t','Cat Room 1 / 1','sick_injured','{skin}')`);
  await d.exec(M47());
  assert.deepEqual(await one(d, `select condition, conditions from public.tasks where title='t'`), { condition: 'skin', conditions: ['skin'] });
  assert.equal((await one(d, `select count(*)::int as n from pg_trigger where tgname='tasks_sync_conditions'`)).n, 1);
});

test('take_surveillance_snapshot matches buildSurvey with groups, legacy folding and multi-group animals', async () => {
  const d = await db();
  const now = Date.now(), iso = ms => new Date(now - ms).toISOString(), H = 3600 * 1000, D = 24 * H;
  const rows = [
    { title: 'A1', location: 'Cat Room 1 / 4', conditions: ['gi', 'urinary'], created_at: iso(H), shift: 'sick_injured' },
    { title: 'A2', location: 'Cat Room 1 / 5', conditions: ['vomiting', 'diarrhoea'], created_at: iso(H), shift: 'sick_injured' },
    { title: 'A3', location: 'Cat Room 1 / 6', condition: 'vomiting', created_at: iso(H), shift: 'sick_injured' },
    { title: 'A3', location: 'Cat Room 1 / 6', condition: 'diarrhoea', created_at: iso(2 * H), shift: 'processing' },
    { title: 'A4', location: 'Pound 1 / 2', condition: 'kennel_cough', created_at: iso(H), shift: 'sick_injured' },
    { title: 'A5', location: 'Cat Room 2 / 1', condition: 'cat_flu', created_at: iso(H), shift: 'sick_injured' },
    { title: 'A5', location: 'Cat Room 2 / 1', conditions: ['respiratory'], created_at: iso(2 * H), shift: 'processing' },
    { title: 'A6', location: 'Pound 3 / 1', created_at: iso(H), shift: 'sick_injured' },
    { title: 'A7', location: 'Mystery Room / 1', conditions: ['skin'], created_at: iso(H), shift: 'sick_injured' },
    { title: 'A8', location: 'Pound 2 / 7', conditions: ['msk'], created_at: iso(5 * D), shift: 'sick_injured' }
  ];
  for (const r of rows) {
    await d.query(`insert into public.tasks (title,location,shift,condition,conditions,created_at) values ($1,$2,$3,$4,$5,$6)`,
      [r.title, r.location, r.shift, r.condition || null, r.conditions || [], r.created_at]);
  }
  await d.query(`select public.take_surveillance_snapshot(3)`);
  const locationRows = (await d.query(`select name, grp, cages, sort from public.locations order by sort`)).rows;
  const dbRows = (await d.query(`select title, location, condition, conditions, created_at, shift from public.tasks`)).rows;
  const survey = LDHLogic.buildSurvey(dbRows, locationRows, new Date(now - 3 * D));
  const snap = (await d.query(`select space, condition, animals from public.surveillance_snapshots`)).rows;
  const get = (space, cond) => snap.find(r => r.space === space && r.condition === cond).animals;
  for (const sp of survey.spaces) {
    assert.equal(get(sp.name, 'any'), sp.cases, sp.name + ': cases');
    for (const k of LDHLogic.SIGN_KEYS) assert.equal(get(sp.name, k), sp.by[k] || 0, sp.name + ' / ' + k);
  }
  const cr1 = survey.spaces.find(s => s.name === 'Cat Room 1');
  assert.equal(cr1.cases, 4, 'A1 gi+urinary, A2 gi once, A3 gi once');
  assert.equal(get('Cat Room 1', 'gi'), 3);
  assert.equal(get('Cat Room 2', 'respiratory'), 1);
  assert.equal(get('Pound 1', 'respiratory'), 1);
  assert.equal(snap.filter(r => r.space === 'Cat Room 1').length, 12, '11 groups + any');
});

test('an old page re-flagging with only condition replaces the stale conditions (and flag_history sees the new value)', async () => {
  const d = await db();
  await d.exec(`insert into public.tasks (title,location,shift,type,conditions,created_at) values ('r','Cat Room 1 / 1','sick_injured','shelter','{gi}', now() - interval '2 days')`);
  await d.exec(`update public.tasks set condition='skin', created_at=now() where title='r'`);
  assert.deepEqual(await one(d, `select condition, conditions from public.tasks where title='r'`), { condition: 'skin', conditions: ['skin'] });
  const h = (await d.query(`select conditions from public.flag_history where title='r' order by flagged_at desc`)).rows;
  assert.deepEqual(h[0].conditions, ['skin']);
  assert.deepEqual(h[1].conditions, ['gi']);
  await d.exec(`update public.tasks set condition=null where title='r'`);
  assert.deepEqual(await one(d, `select condition, conditions from public.tasks where title='r'`), { condition: null, conditions: [] });
});

test('updating only conditions re-derives condition; updating both follows conditions', async () => {
  const d = await db();
  await d.exec(`insert into public.tasks (title,location,shift,conditions) values ('u','Cat Room 1 / 1','sick_injured','{gi}')`);
  await d.exec(`update public.tasks set conditions='{urinary,ears}' where title='u'`);
  assert.deepEqual(await one(d, `select condition, conditions from public.tasks where title='u'`), { condition: 'urinary', conditions: ['urinary', 'ears'] });
  await d.exec(`update public.tasks set condition='skin', conditions='{neuro,eyes}' where title='u'`);
  assert.deepEqual(await one(d, `select condition, conditions from public.tasks where title='u'`), { condition: 'neuro', conditions: ['neuro', 'eyes'] });
});
