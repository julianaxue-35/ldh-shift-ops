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
  await d.exec(fs.readFileSync(path.join(MIG, '0028_behaviour_tasks.sql'), 'utf8'));
  return d;
}
const rejects = async (d, sql) => { try { await d.exec(sql); return null; } catch (e) { return String(e.message); } };
const ins = () => `insert into public.behaviour_tasks (kind, animal_id, location, due_window, flagged_by) values ('behaviour_review','BEH-1','Cat Room 1 / 3','today','AB')`;

test('0028: defaults — lane incoming, status open, empty history, courthold false', async () => {
  const d = await db();
  await d.exec(ins());
  const r = (await d.query(`select lane, status, courthold, history from public.behaviour_tasks`)).rows[0];
  assert.equal(r.lane, 'incoming'); assert.equal(r.status, 'open'); assert.equal(r.courthold, false); assert.deepEqual(r.history, []);
});

test('0028: rejects unknown kind, lane, due_window and status', async () => {
  const d = await db();
  const base = { kind: "'other'", animal_id: "'X'", location: "'Pound 1'", due_window: "'today'", flagged_by: "'AB'" };
  for (const [col, bad] of [['kind', 'bogus'], ['lane', 'rabbit'], ['due_window', '1h'], ['status', 'maybe']]) {
    const v = Object.assign({}, base, { [col]: `'${bad}'` });
    const cols = Object.keys(v), sql = `insert into public.behaviour_tasks (${cols.join(',')}) values (${cols.map(c => v[c]).join(',')})`;
    assert.match(await rejects(d, sql) || '', /check/i, col);
  }
});

test('0028: RLS on, in the realtime publication, sync_writer shut out', async () => {
  const d = await db();
  assert.equal((await d.query(`select relrowsecurity from pg_class where relname='behaviour_tasks'`)).rows[0].relrowsecurity, true);
  assert.equal((await d.query(`select count(*)::int n from pg_publication_tables where pubname='supabase_realtime' and tablename='behaviour_tasks'`)).rows[0].n, 1);
  const pol = (await d.query(`select pg_get_expr(polqual, polrelid) q, pg_get_expr(polwithcheck, polrelid) w from pg_policy where polrelid='public.behaviour_tasks'::regclass`)).rows;
  assert.equal(pol.length, 4);
  assert.ok(pol.every(p => /sync_writer/.test((p.q || '') + (p.w || ''))));
});

test('0028: done rows older than 7 days are deleted when a new row arrives; recent done rows stay', async () => {
  const d = await db();
  await d.exec(`insert into public.behaviour_tasks (kind, animal_id, location, due_window, flagged_by, status, done_at, done_note, done_by)
    values ('other','OLD-1','Pound 1','today','AB','done', now() - interval '8 days','n','AB'),
           ('other','NEW-1','Pound 1','today','AB','done', now() - interval '1 day','n','AB')`);
  await d.exec(ins());
  const ids = (await d.query(`select animal_id from public.behaviour_tasks order by animal_id`)).rows.map(r => r.animal_id);
  assert.deepEqual(ids, ['BEH-1', 'NEW-1']);
});
