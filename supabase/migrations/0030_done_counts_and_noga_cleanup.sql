-- 2026-10-22: (1) completed nurse tasks (noga_requests) are deleted within 24 hours, so each completion is counted in a
-- counts-only log first (when and which nurse; no animal ID, no note). The nurse ring and totals read the log, so they keep
-- their numbers after the task itself is gone. A task put back (done unticked) removes its count again.
-- (2) the Behaviour team gets the same: a counts-only log of finished cases (kind, lane, courthold, when), for its ring and totals.
-- Run this whole file as ONE script. Safe to run more than once.

-- ============ 1. nurse tasks ============
create table if not exists public.nurse_task_log (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null unique,
  role text not null check (role in ('welfare', 'processing')),
  completed_at timestamptz not null default now()
);
create index if not exists nurse_task_log_completed_idx on public.nurse_task_log (completed_at);
alter table public.nurse_task_log enable row level security;
drop policy if exists "authenticated_select_nurse_task_log" on public.nurse_task_log;
create policy "authenticated_select_nurse_task_log" on public.nurse_task_log for select
  using (auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');

create or replace function public.noga_log_done() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.done and (tg_op = 'INSERT' or old.done is distinct from new.done) then
    insert into public.nurse_task_log (task_id, role, completed_at)
    values (new.id, case when new.task in ('microchip', 'uv', 'treatment') then 'processing' else 'welfare' end, coalesce(new.done_at, now()))
    on conflict (task_id) do nothing;
  elsif tg_op = 'UPDATE' and not new.done and old.done then
    delete from public.nurse_task_log where task_id = new.id;
  end if;
  return null;
end $$;
drop trigger if exists noga_log_done on public.noga_requests;
create trigger noga_log_done after insert or update on public.noga_requests for each row execute function public.noga_log_done();

-- Already-finished tasks are counted before anything is deleted.
insert into public.nurse_task_log (task_id, role, completed_at)
select id, case when task in ('microchip', 'uv', 'treatment') then 'processing' else 'welfare' end, done_at
  from public.noga_requests where done and done_at is not null
on conflict (task_id) do nothing;

-- Finished tasks go within 24 hours (runs whenever the table changes, like the Behaviour and Admission AA cleanups).
create or replace function public.noga_cleanup() returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.noga_requests where done and coalesce(done_at, created_at) < now() - interval '24 hours';
  return null;
end $$;
drop trigger if exists noga_cleanup on public.noga_requests;
create trigger noga_cleanup after insert or update on public.noga_requests for each statement execute function public.noga_cleanup();

create or replace function public.nurse_daily_counts(p_since date)
returns table (day date, role text, n bigint)
language sql stable security definer set search_path = public as $$
  with ev as (
    select (med_done_at at time zone 'Australia/Melbourne')::date as day, 'welfare'::text as role, 1::bigint as n
      from public.tasks where med_done_at is not null
    union all
    select (done_at at time zone 'Australia/Melbourne')::date, 'welfare', 1
      from public.nurse_treatment_doses where done_at is not null
    union all
    select (completed_at at time zone 'Australia/Melbourne')::date, role, 1
      from public.nurse_task_log
    union all
    select (completed_at at time zone 'Australia/Melbourne')::date, 'processing', greatest(animal_count, 1)::bigint
      from public.nurse_requests where completed_at is not null
  )
  select day, role, sum(n)::bigint from ev where day >= p_since group by 1, 2 order by 1;
$$;
revoke all on function public.nurse_daily_counts(date) from public, anon;
grant execute on function public.nurse_daily_counts(date) to authenticated;

-- ============ 2. Behaviour cases ============
create table if not exists public.behaviour_done_log (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null unique,
  kind text not null,
  lane text,
  courthold boolean not null default false,
  completed_at timestamptz not null default now()
);
create index if not exists behaviour_done_log_completed_idx on public.behaviour_done_log (completed_at);
alter table public.behaviour_done_log enable row level security;
drop policy if exists "authenticated_select_behaviour_done_log" on public.behaviour_done_log;
create policy "authenticated_select_behaviour_done_log" on public.behaviour_done_log for select
  using (auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');

create or replace function public.behaviour_log_done() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status is distinct from 'done') then
    insert into public.behaviour_done_log (task_id, kind, lane, courthold, completed_at)
    values (new.id, new.kind, new.lane, coalesce(new.courthold, false) or new.kind = 'courthold', coalesce(new.done_at, now()))
    on conflict (task_id) do nothing;
  elsif tg_op = 'UPDATE' and new.status = 'open' and old.status = 'done' then
    delete from public.behaviour_done_log where task_id = new.id;
  end if;
  return null;
end $$;
drop trigger if exists behaviour_log_done on public.behaviour_tasks;
create trigger behaviour_log_done after insert or update on public.behaviour_tasks for each row execute function public.behaviour_log_done();

insert into public.behaviour_done_log (task_id, kind, lane, courthold, completed_at)
select id, kind, lane, coalesce(courthold, false) or kind = 'courthold', coalesce(done_at, created_at)
  from public.behaviour_tasks where status = 'done'
on conflict (task_id) do nothing;

-- Daily totals per Melbourne day and kind of case.
create or replace function public.behaviour_daily_counts(p_since date)
returns table (day date, cat text, n bigint)
language sql stable security definer set search_path = public as $$
  select (completed_at at time zone 'Australia/Melbourne')::date as day, kind as cat, count(*)::bigint
    from public.behaviour_done_log
   where (completed_at at time zone 'Australia/Melbourne')::date >= p_since
   group by 1, 2 order by 1;
$$;
revoke all on function public.behaviour_daily_counts(date) from public, anon;
grant execute on function public.behaviour_daily_counts(date) to authenticated;
