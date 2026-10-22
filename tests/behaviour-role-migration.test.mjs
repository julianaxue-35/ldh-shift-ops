import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
const MIG = path.resolve(import.meta.dirname, '../supabase/migrations');
const load = f => fs.readFileSync(path.join(MIG, f), 'utf8');
async function db() {
  const d = new PGlite();
  await d.exec(`create schema auth; create function auth.role() returns text language sql as $$ select 'authenticated' $$;
    create function auth.jwt() returns jsonb language sql as $$ select '{}'::jsonb $$; create role authenticated; create role anon; create publication supabase_realtime;`);
  for (const f of ['0028_behaviour_tasks.sql', '0029_behaviour_attached_note.sql', '0034_behaviour_requested_by_role.sql']) await d.exec(load(f));
  return d;
}
const rejects = async (d, sql) => { try { await d.exec(sql); return null; } catch (e) { return String(e.message); } };
test('0034: requested_by_role accepts the four teams and nothing else; old rows have none; re-running is safe', async () => {
  const d = await db(); await d.exec(load('0034_behaviour_requested_by_role.sql'));
  for (const r of ['staff', 'vets', 'nurses', 'behaviour']) assert.equal(await rejects(d, `insert into public.behaviour_tasks (kind, animal_id, location, due_window, requested_by_role) values ('other','R-1','Pound 1','today','${r}')`), null, r);
  assert.equal(await rejects(d, `insert into public.behaviour_tasks (kind, animal_id, location, due_window) values ('other','R-2','Pound 1','today')`), null, 'a sender that does not say is allowed (null)');
  assert.match(await rejects(d, `insert into public.behaviour_tasks (kind, animal_id, location, due_window, requested_by_role) values ('other','R-3','Pound 1','today','hacker')`) || '', /requested_by_role_check/);
});
