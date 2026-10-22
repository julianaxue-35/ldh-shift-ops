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
async function db() {
  const d = new PGlite();
  await d.exec(`create schema auth; create function auth.role() returns text language sql as $$ select 'authenticated' $$;
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('app.jwt', true), ''), '{}')::jsonb $$;
    create role authenticated; create role anon; create publication supabase_realtime;` + SHIM);
  for (const f of fs.readdirSync(MIG).filter(f => /^\d{4}_.*\.sql$/.test(f) && f <= '0032_behaviour_trainer_and_passcode.sql').sort()) { if (f.startsWith('0006') || f.startsWith('0007')) continue; await d.exec(load(f)); }
  return d;
}
const rejects = async (d, sql) => { try { await d.exec(sql); return null; } catch (e) { return String(e.message); } };
const check = async (d, role, code) => (await d.query(`select public.check_passcode('${role}', '${code}') ok`)).rows[0].ok;
test('0032: the trainer lane is allowed, others still are, nonsense is not', async () => {
  const d = await db();
  for (const lane of ['incoming', 'tl', 'cat', 'dog', 'trainer'])
    assert.equal(await rejects(d, `insert into public.behaviour_tasks (kind, animal_id, location, due_window, lane) values ('other','L-1','Pound 1','today','${lane}')`), null, lane);
  assert.match(await rejects(d, `insert into public.behaviour_tasks (kind, animal_id, location, due_window, lane) values ('other','L-2','Pound 1','today','vet')`) || '', /behaviour_tasks_lane_check/);
});
test('0032: the behaviour passcode role exists, is locked until set, and re-running does not overwrite a set code', async () => {
  const d = await db();
  assert.equal(await check(d, 'behaviour', 'anything'), false, 'locked by a random seed');
  assert.equal(await check(d, 'vet', 'vet2026'), true, 'the other roles are untouched');
  await d.exec(`update public.role_passcodes set code_hash = extensions.crypt('my-test-code', extensions.gen_salt('bf')) where role = 'behaviour'`);
  assert.equal(await check(d, 'behaviour', 'my-test-code'), true);
  await d.exec(load('0032_behaviour_trainer_and_passcode.sql'));
  assert.equal(await check(d, 'behaviour', 'my-test-code'), true, 'a second run keeps the code that was set');
  assert.equal(await check(d, 'behaviour', 'nope'), false);
});
