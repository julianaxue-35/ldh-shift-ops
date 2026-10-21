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
    create function auth.jwt() returns jsonb language sql as $$ select '{}'::jsonb $$;
    create role authenticated; create role anon;
    create publication supabase_realtime;`);
  await d.exec(fs.readFileSync(path.join(MIG, '0028_behaviour_tasks.sql'), 'utf8'));
  await d.exec(fs.readFileSync(path.join(MIG, '0029_behaviour_attached_note.sql'), 'utf8'));
  return d;
}
const rejects = async (d, sql) => { try { await d.exec(sql); return null; } catch (e) { return String(e.message); } };
const ins = (extra = '', key = 'bh|2026-10-21|BEH-1', note = 'NOTE TEXT') =>
  `insert into public.behaviour_tasks (kind, animal_id, location, due_window, flagged_by, attached_note, source_key ${extra ? ',' + extra.split('=')[0] : ''})
   values ('behaviour_review','BEH-1','Cat Room 1 / 3','today','AB','${note}', ${key ? `'${key}'` : 'null'} ${extra ? ',' + extra.split('=')[1] : ''})`;
const note = async (d, id = 'BEH-1') => (await d.query(`select attached_note n from public.behaviour_tasks where animal_id='${id}' order by created_at desc limit 1`)).rows[0].n;

test('0029: an attached note is kept while the task is open', async () => {
  const d = await db(); await d.exec(ins());
  assert.equal(await note(d), 'NOTE TEXT');
});

test('0029: Done clears the attached note, even if the same update sets a new one', async () => {
  const d = await db(); await d.exec(ins());
  await d.exec(`update public.behaviour_tasks set status='done', done_at=now(), done_note='x', done_by='AB', attached_note='SNEAKY'`);
  assert.equal(await note(d), null);
});

test('0029: a note stays cleared on a done row if someone writes one later', async () => {
  const d = await db(); await d.exec(ins());
  await d.exec(`update public.behaviour_tasks set status='done', done_at=now(), done_note='x', done_by='AB'`);
  await d.exec(`update public.behaviour_tasks set attached_note='LATE'`);
  assert.equal(await note(d), null);
});

test('0029: an open note older than 7 days is cleared by the cleanup, a recent one is kept', async () => {
  const d = await db();
  await d.exec(ins('', 'k1', 'OLD').replace("'BEH-1'", "'OLD-1'"));
  await d.exec(`update public.behaviour_tasks set created_at = now() - interval '8 days' where animal_id='OLD-1'`);
  await d.exec(ins('', 'k2', 'FRESH').replace("'BEH-1'", "'NEW-1'"));
  assert.equal(await note(d, 'OLD-1'), null);
  assert.equal(await note(d, 'NEW-1'), 'FRESH');
});

test('0029: two open tasks cannot share a source_key (23505); a done one does not block a new open one', async () => {
  const d = await db(); await d.exec(ins());
  assert.match(await rejects(d, ins()) || '', /duplicate|unique/i);
  await d.exec(`update public.behaviour_tasks set status='done', done_at=now(), done_note='x', done_by='AB'`);
  assert.equal(await rejects(d, ins()), null);
});

test('0029: tasks without a source_key (manual ones) never collide', async () => {
  const d = await db(); await d.exec(ins('', '', 'a')); assert.equal(await rejects(d, ins('', '', 'b')), null);
});
