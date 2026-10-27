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
    create role authenticated; create role anon;`);
  const sql = fs.readFileSync(path.join(MIG, '0039_fsa_log.sql'), 'utf8');
  await d.exec(sql); await d.exec(sql);   // safe to run twice
  return d;
}
const rejects = async (d, sql) => { try { await d.exec(sql); return null; } catch (e) { return String(e.message); } };
const ins = (id, outcome) => `insert into public.fsa_log (cat_id, intake_at, outcome) values ('${id}', now(), '${outcome}')`;
const U = (n) => `00000000-0000-0000-0000-00000000000${n}`;

test('0039: one row per cat, outcome must be a known value, no animal ID or notes are stored', async () => {
  const d = await db();
  for (const [i, o] of ['graduate', '1', '2', '3', '4', 'unscored'].entries()) await d.exec(ins(U(i), o));
  assert.match(await rejects(d, ins(U(8), '5')) || '', /check/i);
  assert.match(await rejects(d, ins(U(0), '1')) || '', /unique|duplicate/i);
  const cols = (await d.query(`select column_name from information_schema.columns where table_name = 'fsa_log' order by column_name`)).rows.map(r => r.column_name);
  assert.deepEqual(cols, ['cat_id', 'completed_at', 'created_at', 'intake_at', 'outcome']);
});

test('0039: RLS on with the four policies; counts are never auto-deleted', async () => {
  const d = await db();
  assert.equal((await d.query(`select relrowsecurity from pg_class where relname = 'fsa_log'`)).rows[0].relrowsecurity, true);
  assert.equal((await d.query(`select count(*)::int as n from pg_policies where tablename = 'fsa_log'`)).rows[0].n, 4);
  assert.equal((await d.query(`select count(*)::int as n from pg_trigger where tgrelid = 'public.fsa_log'::regclass and not tgisinternal`)).rows[0].n, 0);
});
