-- 2026-10-19: the Processing nurse uploads the Report 7 (Vet Treatments Due) on the computer and opens the same list on
-- her phone. One row per day. It holds only: animal ID, shelter location, kennel, vaccine, due date, weight (names and
-- microchip numbers are never read from the report). Same access as the rest of the dashboard (the staff passcode and
-- sign-in the Nurses page already needs): there is no extra password. Rows older than a few days are deleted.
-- Run this whole file as ONE script. Safe to run more than once.
create table if not exists public.vacc_list (
  day date primary key,
  animals jsonb not null default '[]'::jsonb,
  sent jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.vacc_list enable row level security;
do $$
declare cmd text;
begin
  foreach cmd in array array['select','insert','update','delete'] loop
    execute format('drop policy if exists "authenticated_%s_vacc_list" on public.vacc_list', cmd);
  end loop;
  create policy "authenticated_select_vacc_list" on public.vacc_list for select
    using (auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
  create policy "authenticated_insert_vacc_list" on public.vacc_list for insert
    with check (auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
  create policy "authenticated_update_vacc_list" on public.vacc_list for update
    using (auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
  create policy "authenticated_delete_vacc_list" on public.vacc_list for delete
    using (auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'vacc_list') then
    alter publication supabase_realtime add table public.vacc_list;
  end if;
end $$;
