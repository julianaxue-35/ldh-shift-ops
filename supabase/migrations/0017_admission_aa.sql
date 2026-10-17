-- 2026-10-17: Admission AA page. Nurses send items (FIV result, microchip, UV result, vaccination updates) for the
-- Admission AA to enter in ShelterMate; the AA ticks each one off and the row is DELETED (no archive).
-- Run this whole file as ONE script. Safe to run more than once.
-- After running, set the real AA passcode IN THE SQL EDITOR ONLY (see rotate-codes.sql). Never commit a real code.

-- 1. The 'aa' role may have a passcode. The seed is a random value nobody knows, so the AA page stays locked until
--    the real code is set; re-running never overwrites a code that has been set.
alter table public.role_passcodes drop constraint if exists role_passcodes_role_check;
alter table public.role_passcodes add constraint role_passcodes_role_check check (role in ('vet','nurse','aa'));
insert into public.role_passcodes (role, code_hash)
  values ('aa', extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')))
  on conflict (role) do nothing;

-- 2. The items. One row per send; a vaccination update lists many animals, everything else exactly one.
create table if not exists public.aa_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('fiv','microchip','uv','microchip_uv','vaccination')),
  animal_ids text[] not null check (cardinality(animal_ids) >= 1),
  payload jsonb not null default '{}'::jsonb,
  sent_by text,
  sent_at timestamptz not null default now()
);
alter table public.aa_items enable row level security;

-- 3. Same access model as the other dashboard tables (shared staff login; the sync tool's account is shut out) + realtime.
do $$
declare cmd text;
begin
  foreach cmd in array array['select','insert','update','delete'] loop
    execute format('drop policy if exists "authenticated_%s_aa_items" on public.aa_items', cmd);
  end loop;
  create policy "authenticated_select_aa_items" on public.aa_items for select
    using (auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
  create policy "authenticated_insert_aa_items" on public.aa_items for insert
    with check (auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
  create policy "authenticated_update_aa_items" on public.aa_items for update
    using (auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
  create policy "authenticated_delete_aa_items" on public.aa_items for delete
    using (auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'aa_items') then
    alter publication supabase_realtime add table public.aa_items;
  end if;
end $$;
