-- 2026-10-09: Shelter board (shelter-board.html).
-- 1. Two new free-text columns on tasks so the vet's TREATMENT and PLAN (written in the offline
--    Sick & Injured tool) travel with the flagged case and show against its room/pen on the board.
--    Kept separate from `note` (the old short completion note) and `problem` (written at request time).
alter table public.tasks add column if not exists treatment text;
alter table public.tasks add column if not exists plan text;

-- 2. Rabbit Room (10 cages) joins the spaces list, so it appears in the flag form and the cage counts.
--    "Pathway" (foster requests) is deliberately NOT a locations row: it has no cages, and like
--    "Offsite" it is a name the app knows about (OFFSITE_NAMES in lib/ldh-logic.js).
insert into public.locations (name, grp, cages, sort) values
  ('Rabbit Room', 'Rabbits', 10, 13)
on conflict (name) do nothing;

-- 3. Flag history (2026-10-09): "has this animal been flagged before?"
--    A small permanent-ish log, SEPARATE from the live `tasks` rows. Why separate: a task row is the live case —
--    it is overwritten when completed, and a second flag for the same animal in the same pen on the same shift
--    is rejected by the unique index (tasks_title_location_shift_idx). The log only ever gets new lines added.
--    Written by a trigger (nobody types into it) with just the animal ID, date, room/pen and the flagged reason
--    — no treatment or plan. Lines older than 3 months are deleted by the same trigger, so no cron job is needed.
create table if not exists public.flag_history (
  id uuid primary key default gen_random_uuid(),
  task_id uuid,
  title text not null,
  flagged_at timestamptz not null,
  location text,
  reason text,
  condition text,
  unique (task_id, flagged_at)
);
create index if not exists flag_history_title_idx on public.flag_history (title, flagged_at desc);

create or replace function public.log_flag() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.type = 'check_recheck' then return new; end if;     -- list entries from the offline tools aren't flags
  insert into public.flag_history (task_id, title, flagged_at, location, reason, condition)
    values (new.id, new.title, new.created_at, new.location, nullif(btrim(coalesce(new.problem, '')), ''), new.condition)
    on conflict (task_id, flagged_at) do nothing;
  delete from public.flag_history where flagged_at < now() - interval '3 months';
  return new;
end $$;
revoke execute on function public.log_flag() from public, anon, authenticated;

drop trigger if exists tasks_log_flag_ins on public.tasks;
create trigger tasks_log_flag_ins after insert on public.tasks
  for each row execute function public.log_flag();
-- a RE-flag of a finished case reopens the same row and gives it a fresh created_at — log that too
drop trigger if exists tasks_log_flag_upd on public.tasks;
create trigger tasks_log_flag_upd after update of created_at on public.tasks
  for each row when (new.created_at is distinct from old.created_at)
  execute function public.log_flag();

-- cases already flagged in the last 3 months become the starting history
insert into public.flag_history (task_id, title, flagged_at, location, reason, condition)
  select id, title, created_at, location, nullif(btrim(coalesce(problem, '')), ''), condition
  from public.tasks
  where type <> 'check_recheck' and created_at >= now() - interval '3 months'
on conflict (task_id, flagged_at) do nothing;

-- read-only for signed-in staff (same guard as locations / tasks); nothing is writable through the API
alter table public.flag_history enable row level security;
drop policy if exists "staff_select_flag_history" on public.flag_history;
create policy "staff_select_flag_history" on public.flag_history for select using (
  auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
