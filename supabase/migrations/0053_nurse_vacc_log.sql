-- 2026-11-27: count the vaccinations the nurses give. Two sources: animals marked done on the "Vaccinations due (Report 7)" list
-- (that list is cleared after 3 days, so each one is logged here), and finished Vaccination requests. One animal counts once a day
-- from the list. Run this whole file as ONE script. Safe to run more than once.

create table if not exists public.nurse_vacc_log (
  animal_id text not null,
  given_on  date not null default (now() at time zone 'Australia/Melbourne')::date,
  created_at timestamptz not null default now(),
  primary key (animal_id, given_on)
);
alter table public.nurse_vacc_log enable row level security;
drop policy if exists "staff_select_nurse_vacc_log" on public.nurse_vacc_log;
drop policy if exists "staff_insert_nurse_vacc_log" on public.nurse_vacc_log;
create policy "staff_select_nurse_vacc_log" on public.nurse_vacc_log for select
  using (auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
create policy "staff_insert_nurse_vacc_log" on public.nurse_vacc_log for insert
  with check (auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
grant select, insert on public.nurse_vacc_log to authenticated;

create or replace function public.nurse_vacc_counts(p_since date)
returns table (day date, n bigint)
language sql stable security definer set search_path = public as $$
  with ev as (
    select given_on as day, 1::bigint as n from public.nurse_vacc_log where not public.is_test_animal(animal_id)
    union all
    select (completed_at at time zone 'Australia/Melbourne')::date, greatest(animal_count, 1)::bigint
      from public.nurse_requests where kind = 'vaccination' and completed_at is not null and not public.is_test_animal(animal_id)
  )
  select day, sum(n)::bigint from ev where day >= p_since group by 1 order by 1;
$$;
revoke all on function public.nurse_vacc_counts(date) from public, anon;
grant execute on function public.nurse_vacc_counts(date) to authenticated;
