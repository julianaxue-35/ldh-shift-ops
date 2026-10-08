import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const MIG = path.resolve(import.meta.dirname, '../supabase/migrations');
// Same partial chain as the surveillance suite (0006/0007 don't affect these tables), plus 0013.
const CHAIN = ['0001_init_schema.sql', '0002_rls_policies.sql', '0003_sync_account_scope.sql', '0004_task_problem_field.sql',
  '0005_task_condition_field.sql', '0008_triage_and_vet_desk.sql', '0009_surveillance.sql', '0013_shelter_board.sql'];

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

test('0013 adds treatment + plan to tasks, and the Rabbit Room (10 cages) to locations; re-running is harmless', async () => {
  const d = await db();
  await d.exec(`insert into public.tasks (title,location,shift,treatment,plan) values ('9990001','Cat Room 1 / 3','sick_injured','Gabapentin','Rest')`);
  const r = await d.query(`select treatment, plan from public.tasks where title='9990001'`);
  assert.deepEqual(r.rows[0], { treatment: 'Gabapentin', plan: 'Rest' });
  const rr = await d.query(`select grp, cages, sort from public.locations where name='Rabbit Room'`);
  assert.deepEqual(rr.rows[0], { grp: 'Rabbits', cages: 10, sort: 13 });
  await d.exec(fs.readFileSync(path.join(MIG, '0013_shelter_board.sql'), 'utf8'));   // idempotent
  assert.equal((await d.query(`select count(*)::int as n from public.locations`)).rows[0].n, 13);
});
