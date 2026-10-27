-- 2026-10-28: practice animals named TEST followed by a number (TEST1, TEST 2, test-3 ...) are never counted in the
-- nurse or Behaviour totals. Run this whole file as ONE script. Safe to run more than once.

create or replace function public.is_test_animal(p_id text) returns boolean
language sql immutable as $$ select coalesce(p_id, '') ~* '^\s*test[\s_-]*[0-9]+\s*$' $$;

-- Nurse tasks: a finished task is only logged for a real animal.
create or replace function public.noga_log_done() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.done and (tg_op = 'INSERT' or old.done is distinct from new.done) then
    if not public.is_test_animal(new.animal_id) then
      insert into public.nurse_task_log (task_id, role, completed_at)
      values (new.id, case when new.task in ('microchip', 'uv', 'treatment') then 'processing' else 'welfare' end, coalesce(new.done_at, now()))
      on conflict (task_id) do nothing;
    end if;
  elsif tg_op = 'UPDATE' and not new.done and old.done then
    delete from public.nurse_task_log where task_id = new.id;
  end if;
  return null;
end $$;
delete from public.nurse_task_log l using public.noga_requests n where n.id = l.task_id and public.is_test_animal(n.animal_id);

-- Behaviour cases: same.
create or replace function public.behaviour_log_done() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status is distinct from 'done') then
    if not public.is_test_animal(new.animal_id) then
      insert into public.behaviour_done_log (task_id, kind, lane, courthold, completed_at)
      values (new.id, new.kind, new.lane, coalesce(new.courthold, false) or new.kind = 'courthold', coalesce(new.done_at, now()))
      on conflict (task_id) do nothing;
    end if;
  elsif tg_op = 'UPDATE' and new.status = 'open' and old.status = 'done' then
    delete from public.behaviour_done_log where task_id = new.id;
  end if;
  return null;
end $$;
delete from public.behaviour_done_log l using public.behaviour_tasks b where b.id = l.task_id and public.is_test_animal(b.animal_id);

-- Nurse daily counts: leave out medication labels, treatment doses and requests for practice animals.
create or replace function public.nurse_daily_counts(p_since date)
returns table (day date, role text, n bigint)
language sql stable security definer set search_path = public as $$
  with ev as (
    select (med_done_at at time zone 'Australia/Melbourne')::date as day, 'welfare'::text as role, 1::bigint as n
      from public.tasks where med_done_at is not null and not public.is_test_animal(title)
    union all
    select (d.done_at at time zone 'Australia/Melbourne')::date, 'welfare', 1
      from public.nurse_treatment_doses d join public.nurse_treatments t on t.id = d.treatment_id
     where d.done_at is not null and not public.is_test_animal(t.animal_id)
    union all
    select (completed_at at time zone 'Australia/Melbourne')::date, role, 1
      from public.nurse_task_log
    union all
    select (completed_at at time zone 'Australia/Melbourne')::date, 'processing', greatest(animal_count, 1)::bigint
      from public.nurse_requests where completed_at is not null and not public.is_test_animal(animal_id)
  )
  select day, role, sum(n)::bigint from ev where day >= p_since group by 1, 2 order by 1;
$$;
revoke all on function public.nurse_daily_counts(date) from public, anon;
grant execute on function public.nurse_daily_counts(date) to authenticated;
