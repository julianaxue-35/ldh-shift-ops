-- 0046: a small daily summary of finished checks, so the totals and trend graphs stay fast for years (2026-10-30).
-- One row per day and department (about 1,000 rows a year) instead of one row per finished check (about 18,000 a year).
-- Kept up to date by the database itself: each entry in task_done_log adds 1 to its day, and one that is removed takes 1 off.
-- Days are Melbourne days. Practice animals (TEST1, TEST 2 ...) are not counted. The raw log is untouched and still the source:
-- select public.rebuild_stats_daily() recomputes the whole table from it at any time.
create table if not exists public.stats_daily (
  day date not null,
  shift text not null,
  n integer not null default 0,
  primary key (day, shift)
);
alter table public.stats_daily enable row level security;
drop policy if exists "authenticated_select_stats_daily" on public.stats_daily;
create policy "authenticated_select_stats_daily" on public.stats_daily for select
  using (auth.role() = 'authenticated');

create or replace function public.stats_daily_apply() returns trigger
language plpgsql security definer set search_path = public as $$
declare r public.task_done_log; d date; delta integer;
begin
  if tg_op = 'INSERT' then r := new; delta := 1; else r := old; delta := -1; end if;
  if r.completed_at is null or public.is_test_animal(r.title) then return null; end if;
  d := (r.completed_at at time zone 'Australia/Melbourne')::date;
  insert into public.stats_daily (day, shift, n) values (d, r.shift, greatest(delta, 0))
  on conflict (day, shift) do update set n = greatest(public.stats_daily.n + delta, 0);
  return null;
end $$;
revoke execute on function public.stats_daily_apply() from public, anon, authenticated;
drop trigger if exists stats_daily_ins on public.task_done_log;
drop trigger if exists stats_daily_del on public.task_done_log;
create trigger stats_daily_ins after insert on public.task_done_log for each row execute function public.stats_daily_apply();
create trigger stats_daily_del after delete on public.task_done_log for each row execute function public.stats_daily_apply();

create or replace function public.rebuild_stats_daily() returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.stats_daily where true;
  insert into public.stats_daily (day, shift, n)
  select (completed_at at time zone 'Australia/Melbourne')::date, shift, count(*)::int
  from public.task_done_log
  where completed_at is not null and not public.is_test_animal(title)
  group by 1, 2;
end $$;
revoke execute on function public.rebuild_stats_daily() from public, anon, authenticated;

select public.rebuild_stats_daily();   -- fill in all the history so far
