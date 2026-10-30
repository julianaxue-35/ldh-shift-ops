-- 2026-10-30: a permanent log of every finished check (tasks), so a list entry can be re-listed on a later day (reset to an open
-- check for TODAY) without losing the day it was finished before. The month / year totals and daily averages read this log.
-- Run this whole file as ONE script. Safe to run more than once.

create table if not exists public.task_done_log (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  shift text not null,
  title text not null,
  completed_at timestamptz not null,
  unique (task_id, completed_at)
);
create index if not exists task_done_log_completed_idx on public.task_done_log (completed_at);
alter table public.task_done_log enable row level security;
drop policy if exists "authenticated_select_task_done_log" on public.task_done_log;
create policy "authenticated_select_task_done_log" on public.task_done_log for select
  using (auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');

create or replace function public.tasks_log_done() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.done and new.completed_at is not null
     and (tg_op = 'INSERT' or old.done is distinct from true or old.completed_at is distinct from new.completed_at) then
    insert into public.task_done_log (task_id, shift, title, completed_at)
    values (new.id, new.shift, new.title, new.completed_at)
    on conflict (task_id, completed_at) do nothing;
  elsif tg_op = 'UPDATE' and old.done and not new.done and new.created_at is not distinct from old.created_at and old.completed_at is not null then
    -- finished by mistake and put back (same row, same day): the count goes. A RE-LIST gives the row a fresh created_at, so it keeps its count.
    delete from public.task_done_log where task_id = new.id and completed_at = old.completed_at;
  end if;
  return null;
end $$;
revoke execute on function public.tasks_log_done() from public, anon, authenticated;
drop trigger if exists tasks_log_done on public.tasks;
create trigger tasks_log_done after insert or update on public.tasks for each row execute function public.tasks_log_done();

-- everything finished so far becomes the starting history
insert into public.task_done_log (task_id, shift, title, completed_at)
select id, shift, title, completed_at from public.tasks where done and completed_at is not null
on conflict (task_id, completed_at) do nothing;
