-- 2026-10-22: which team asked for a Behaviour task, so the plan can be fed back to the page that asked.
-- 'staff' = shelter staff page, 'vets' = Vets page or a vet's shift tool (Send to Behaviour), 'nurses' = Nurses page,
-- 'behaviour' = the Behaviour team's own tasks. Older tasks have no value and are simply not fed back.
-- Run this whole file as ONE script. Safe to run more than once.
alter table public.behaviour_tasks add column if not exists requested_by_role text;
alter table public.behaviour_tasks drop constraint if exists behaviour_tasks_requested_by_role_check;
alter table public.behaviour_tasks add constraint behaviour_tasks_requested_by_role_check
  check (requested_by_role is null or requested_by_role in ('staff','vets','nurses','behaviour'));
create index if not exists behaviour_tasks_role_idx on public.behaviour_tasks (requested_by_role, status);
