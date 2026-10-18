-- 2026-10-19: treatment check / due tasks belong to the Processing nurse (with microchip and UV), so they count there.
-- Run this whole file as ONE script. Safe to run more than once.
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
           case when task in ('microchip', 'uv', 'treatment') then 'processing' else 'welfare' end, 1
      from public.noga_requests where done and done_at is not null
    union all
    select (completed_at at time zone 'Australia/Melbourne')::date, 'processing', greatest(animal_count, 1)::bigint
      from public.nurse_requests where completed_at is not null
  )
  select day, role, sum(n)::bigint from ev where day >= p_since group by 1, 2 order by 1;
$$;
revoke all on function public.nurse_daily_counts(date) from public, anon;
grant execute on function public.nurse_daily_counts(date) to authenticated;
