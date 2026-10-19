-- 2026-10-19: what the Admission AA has completed, for the progress ring (week / month / quarter / year).
-- Completed cards are deleted within 24 hours, so each completion is also counted here: when, what kind and how many
-- animals. No animal IDs and no note text. A "put back" removes the count again.
-- Run this whole file as ONE script. Safe to run more than once.
create table if not exists public.aa_done_log (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null,
  kind text not null,
  animals int not null default 1,
  completed_at timestamptz not null default now()
);
create index if not exists aa_done_log_completed_idx on public.aa_done_log (completed_at);
create index if not exists aa_done_log_item_idx on public.aa_done_log (item_id);
alter table public.aa_done_log enable row level security;
do $$
declare cmd text;
begin
  foreach cmd in array array['select','insert','delete'] loop
    execute format('drop policy if exists "authenticated_%s_aa_done_log" on public.aa_done_log', cmd);
  end loop;
  create policy "authenticated_select_aa_done_log" on public.aa_done_log for select
    using (auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
  create policy "authenticated_insert_aa_done_log" on public.aa_done_log for insert
    with check (auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
  create policy "authenticated_delete_aa_done_log" on public.aa_done_log for delete
    using (auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
end $$;

-- Daily totals per Melbourne day: notes (Processing + Sick & Injured), charts (medication charts printed), tasks (everything the nurses sent).
create or replace function public.aa_daily_counts(p_since date)
returns table (day date, cat text, n bigint)
language sql stable security definer set search_path = public as $$
  select (completed_at at time zone 'Australia/Melbourne')::date as day,
         case when kind in ('processing_note', 'si_note') then 'notes' when kind = 'med_chart' then 'charts' else 'tasks' end as cat,
         sum(animals)::bigint
    from public.aa_done_log
   where (completed_at at time zone 'Australia/Melbourne')::date >= p_since
   group by 1, 2 order by 1;
$$;
revoke all on function public.aa_daily_counts(date) from public, anon;
grant execute on function public.aa_daily_counts(date) to authenticated;
