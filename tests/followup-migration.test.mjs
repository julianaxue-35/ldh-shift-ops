// 0052: follow-up tasks sit beside a picked-up case; the sync service's list saves are unaffected.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
const MIG = path.resolve(import.meta.dirname, '../supabase/migrations');
const run = async (d, f) => d.exec(fs.readFileSync(path.join(MIG, f), 'utf8'));
async function db() {
  const d = new PGlite();
  // just the columns the rule uses, then the real 0044 and 0052
  await d.exec(`create table public.tasks (id serial primary key, title text not null, location text, shift text, type text, done boolean default false, completed_at timestamptz);
    create unique index tasks_title_location_shift_idx on public.tasks (title, location, shift);`);
  await run(d, '0044_tasks_request_and_list_separate.sql');
  await d.exec(`insert into public.tasks (title, location, shift, type, done) values ('A','CR1 / 3','sick_injured','shelter', false), ('A','CR1 / 3','sick_injured','check_recheck', false);`);
  await run(d, '0052_task_followups.sql');
  return d;
}
const add = (d, extra = '') => d.query(`insert into public.tasks (title, location, shift, type ${extra ? ', followup' : ''}) values ('A','CR1 / 3','sick_injured','shelter' ${extra}) returning kind`);

test('existing rows keep their kind; a second plain request is still refused', async () => {
  const d = await db();
  assert.deepEqual((await d.query('select kind from public.tasks order by id')).rows.map(r => r.kind), ['request', 'list']);
  await assert.rejects(() => add(d), /duplicate key/);
});
test('a numbered follow-up is allowed, once per number', async () => {
  const d = await db();
  assert.equal((await add(d, ', 1')).rows[0].kind, 'request 1');
  await assert.rejects(() => add(d, ', 1'), /duplicate key/);
  assert.equal((await add(d, ', 2')).rows[0].kind, 'request 2');
});
test('the sync service\'s upsert on the same four columns still works', async () => {
  const d = await db();
  await d.query(`insert into public.tasks (title, location, shift, type) values ('A','CR1 / 3','sick_injured','check_recheck') on conflict (title, location, shift, kind) do update set done = true`);
  const r = (await d.query(`select count(*)::int n, bool_or(done) done from public.tasks where kind = 'list'`)).rows[0];
  assert.deepEqual([r.n, r.done], [1, true]);
});
test('safe to run twice', async () => { const d = await db(); await run(d, '0052_task_followups.sql'); assert.equal((await d.query('select count(*)::int n from public.tasks')).rows[0].n, 2); });
