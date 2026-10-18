-- 2026-10-19: (1) nurse activity averages and (2) surgery breakdown, for the dashboard stats.
-- Run this whole file as ONE script. Safe to run more than once.

-- 1. Daily counts of nurse tasks completed, per role, per Melbourne day. Counts only (no animal IDs or names).
--    Welfare nurse: medication labels made, treatment doses given, miscellaneous tasks (not microchip / UV).
--    Processing nurse: animals completed on nurse requests, and microchip / UV tasks.
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
    select (done_at at time zone 'Australia/Melbourne')::date,
           case when task in ('microchip', 'uv') then 'processing' else 'welfare' end, 1
      from public.noga_requests where done and done_at is not null
    union all
    select (completed_at at time zone 'Australia/Melbourne')::date, 'processing', greatest(animal_count, 1)::bigint
      from public.nurse_requests where completed_at is not null
  )
  select day, role, sum(n)::bigint from ev where day >= p_since group by 1, 2 order by 1;
$$;
revoke all on function public.nurse_daily_counts(date) from public, anon;
grant execute on function public.nurse_daily_counts(date) to authenticated;

-- 2. One row per surgery registered in the Surgery tool: species and procedure only. No animal ID, name or notes.
--    Written by the sync Edge Function; the dashboard only reads it.
create table if not exists public.surgery_log (
  id text primary key,                         -- the Surgery tool's own record id (changes nothing if re-registered)
  done_at timestamptz not null default now(),
  species text not null check (species in ('cat', 'dog', 'rabbit', 'other')),
  procedure text,
  procedure2 text,
  routine boolean not null                     -- true = spey / castrate only; false = anything else (dental, amputation ...)
);
create index if not exists surgery_log_done_at_idx on public.surgery_log (done_at);
alter table public.surgery_log enable row level security;
drop policy if exists "authenticated_select_surgery_log" on public.surgery_log;
create policy "authenticated_select_surgery_log" on public.surgery_log for select
  using (auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
