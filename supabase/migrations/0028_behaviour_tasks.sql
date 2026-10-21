-- 2026-10-21: Behaviour team page (behaviour.html). One row per behaviour task.
-- Staff flag tasks from the shelter staff page; the team moves them between lanes and ticks them Done with a note.
-- Animal IDs and notes are patient data: done rows are deleted after 7 days (trigger below).
-- Run this whole file as ONE script. Safe to run more than once.
create table if not exists public.behaviour_tasks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('courthold','surrender_history','incident_review','behaviour_review','other')),
  animal_id text not null,
  location text not null,
  lane text not null default 'incoming' check (lane in ('incoming','tl','cat','dog')),
  due_window text not null check (due_window in ('30_60m','today','48h')),
  reason text,
  courthold boolean not null default false,
  flagged_by text,
  status text not null default 'open' check (status in ('open','done')),
  done_at timestamptz,
  done_note text,
  done_by text,
  history jsonb not null default '[]'::jsonb
);
create index if not exists behaviour_tasks_status_idx on public.behaviour_tasks (status, created_at);
create index if not exists behaviour_tasks_animal_idx on public.behaviour_tasks (animal_id);

create or replace function public.behaviour_tasks_cleanup() returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.behaviour_tasks where status = 'done' and done_at < now() - interval '7 days';
  return null;
end $$;
drop trigger if exists behaviour_tasks_cleanup on public.behaviour_tasks;
create trigger behaviour_tasks_cleanup after insert on public.behaviour_tasks
  for each statement execute function public.behaviour_tasks_cleanup();

alter table public.behaviour_tasks enable row level security;
do $$
declare cmd text;
begin
  foreach cmd in array array['select','insert','update','delete'] loop
    execute format('drop policy if exists "authenticated_%s_behaviour_tasks" on public.behaviour_tasks', cmd);
  end loop;
  create policy "authenticated_select_behaviour_tasks" on public.behaviour_tasks for select
    using (auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
  create policy "authenticated_insert_behaviour_tasks" on public.behaviour_tasks for insert
    with check (auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
  create policy "authenticated_update_behaviour_tasks" on public.behaviour_tasks for update
    using (auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
  create policy "authenticated_delete_behaviour_tasks" on public.behaviour_tasks for delete
    using (auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
end $$;
do $$ begin
  alter publication supabase_realtime add table public.behaviour_tasks;
exception when duplicate_object then null; end $$;
