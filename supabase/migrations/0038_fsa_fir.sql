-- 2026-10-27: FIR room map + Feline Spectrum Assessment (fir.html). One row per cat currently in a FIR cage.
-- A cat is 'active' while it is in a FIR cage. Once its notes are entered in ShelterMate it is marked 'completed' (the cage is free again).
-- Animal IDs and behaviour notes are patient data: completed rows are deleted 7 days after completion (staff can put one back within
-- those 7 days), and any row nobody has touched for 7 days is removed too (cats are in FIR for less than 7 days) (trigger below runs on every insert or update).
-- The whole assessment lives in `data` (jsonb).
-- Run this whole file as ONE script. Safe to run more than once.
create table if not exists public.fsa_cats (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cage int not null check (cage between 1 and 32),
  animal_id text not null,
  intake_at timestamptz not null default now(),
  intake_type text,
  description text,
  status text not null default 'active' check (status in ('active','completed')),
  completed_at timestamptz,
  created_by text,
  updated_by text,
  data jsonb not null default '{}'::jsonb
);
-- one active cat per cage
create unique index if not exists fsa_cats_one_active_per_cage on public.fsa_cats (cage) where status = 'active';
create index if not exists fsa_cats_status_idx on public.fsa_cats (status, updated_at);
create index if not exists fsa_cats_animal_idx on public.fsa_cats (animal_id);

create or replace function public.fsa_cats_touch() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  if new.status = 'completed' and old.status is distinct from 'completed' then new.completed_at = now(); end if;
  if new.status = 'active' then new.completed_at = null; end if;
  return new;
end $$;
drop trigger if exists fsa_cats_touch on public.fsa_cats;
create trigger fsa_cats_touch before update on public.fsa_cats for each row execute function public.fsa_cats_touch();

create or replace function public.fsa_cats_cleanup() returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.fsa_cats where status = 'completed' and coalesce(completed_at, updated_at) < now() - interval '7 days';
  delete from public.fsa_cats where updated_at < now() - interval '7 days';
  return null;
end $$;
drop trigger if exists fsa_cats_cleanup on public.fsa_cats;
create trigger fsa_cats_cleanup after insert or update on public.fsa_cats
  for each statement execute function public.fsa_cats_cleanup();

alter table public.fsa_cats enable row level security;
do $$
declare cmd text;
begin
  foreach cmd in array array['select','insert','update','delete'] loop
    execute format('drop policy if exists "authenticated_%s_fsa_cats" on public.fsa_cats', cmd);
  end loop;
  create policy "authenticated_select_fsa_cats" on public.fsa_cats for select
    using (auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
  create policy "authenticated_insert_fsa_cats" on public.fsa_cats for insert
    with check (auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
  create policy "authenticated_update_fsa_cats" on public.fsa_cats for update
    using (auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
  create policy "authenticated_delete_fsa_cats" on public.fsa_cats for delete
    using (auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
end $$;
do $$ begin
  alter publication supabase_realtime add table public.fsa_cats;
exception when duplicate_object then null; end $$;
