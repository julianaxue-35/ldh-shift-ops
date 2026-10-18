-- 2026-10-19: who is on today. The Welfare and Processing nurses type their initials on the Nurses page; the
-- Admission AA page shows them so the AA knows who to ask. Initials only, one row per day and role.
-- Run this whole file as ONE script. Safe to run more than once.
create table if not exists public.nurse_on_duty (
  day date not null,
  role text not null check (role in ('welfare', 'processing')),
  initials text not null check (char_length(initials) between 1 and 4),
  updated_at timestamptz not null default now(),
  primary key (day, role)
);
alter table public.nurse_on_duty enable row level security;
do $$
declare cmd text;
begin
  foreach cmd in array array['select','insert','update','delete'] loop
    execute format('drop policy if exists "authenticated_%s_nurse_on_duty" on public.nurse_on_duty', cmd);
  end loop;
  create policy "authenticated_select_nurse_on_duty" on public.nurse_on_duty for select
    using (auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
  create policy "authenticated_insert_nurse_on_duty" on public.nurse_on_duty for insert
    with check (auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
  create policy "authenticated_update_nurse_on_duty" on public.nurse_on_duty for update
    using (auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
  create policy "authenticated_delete_nurse_on_duty" on public.nurse_on_duty for delete
    using (auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'nurse_on_duty') then
    alter publication supabase_realtime add table public.nurse_on_duty;
  end if;
end $$;
