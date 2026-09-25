-- Round 3: vet/nurse pages, medication hand-off, role passcodes, NO-GA list.
-- Run this whole file as ONE script. Safe to run more than once.
-- Requires pgcrypto in schema `extensions` (the Supabase default).
-- After applying on real Supabase, run once by hand: select public.check_passcode('nurse','nurse');  (expect true)
-- check_passcode has no rate limit (accepted risk).

-- 1. Case fields on tasks.
alter table public.tasks add column if not exists needs_medication boolean not null default false;
alter table public.tasks add column if not exists vet_done_at timestamptz;
alter table public.tasks add column if not exists med_chart_done boolean not null default false;
alter table public.tasks add column if not exists med_label text;
alter table public.tasks add column if not exists med_done_by text;
alter table public.tasks add column if not exists med_done_at timestamptz;
alter table public.tasks add column if not exists sm_number text;
alter table public.tasks add column if not exists location_detail text;

-- 2. Medication hold: a medication case cannot be marked done until the nurse has
-- made the label (med_done_at set). Vet "done" is recorded in vet_done_at instead.
-- Lives in the DB so it also covers the sync-completion Edge Function's upsert.
create or replace function public.tasks_hold_medication() returns trigger
language plpgsql as $$
begin
  if new.needs_medication and new.med_done_at is null and new.done then
    new.done := false;
    new.vet_done_at := coalesce(new.vet_done_at, now());
    new.completed_at := null;
  end if;
  return new;
end $$;
drop trigger if exists tasks_hold_medication on public.tasks;
create trigger tasks_hold_medication before insert or update on public.tasks
  for each row execute function public.tasks_hold_medication();

-- 3. Role passcodes (hashed; never readable by the app, only checkable).
create extension if not exists pgcrypto with schema extensions;
create table if not exists public.role_passcodes (
  role text primary key check (role in ('vet','nurse')),
  code_hash text not null
);
alter table public.role_passcodes enable row level security;  -- no policies: no direct access
-- pgcrypto-guard-start
do $$
begin
  if not exists (select 1 from pg_extension e join pg_namespace n on n.oid = e.extnamespace
                 where e.extname = 'pgcrypto' and n.nspname = 'extensions') then
    raise exception 'pgcrypto must be installed in schema extensions';
  end if;
end $$;
-- pgcrypto-guard-end
insert into public.role_passcodes (role, code_hash) values
  ('nurse', extensions.crypt('nurse', extensions.gen_salt('bf'))),
  ('vet', extensions.crypt('vet2026', extensions.gen_salt('bf')))
on conflict (role) do nothing;

create or replace function public.check_passcode(p_role text, p_code text) returns boolean
language sql security definer set search_path = extensions, pg_temp as $$
  select coalesce((select code_hash = crypt(p_code, code_hash)
                   from public.role_passcodes where role = p_role), false)
$$;
revoke all on function public.check_passcode(text, text) from public;
revoke all on function public.check_passcode(text, text) from anon;
grant execute on function public.check_passcode(text, text) to authenticated;

-- 4. NO-GA required list.
create table if not exists public.noga_requests (
  id uuid primary key default gen_random_uuid(),
  animal_id text not null,
  location text not null,
  location_detail text,
  task text not null check (task in ('fiv_test','microchip','other')),
  note text,
  added_by text,
  done boolean not null default false,
  done_by text,
  done_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.noga_requests enable row level security;
do $$
declare cmd text;
begin
  foreach cmd in array array['select','insert','update','delete'] loop
    execute format('drop policy if exists "authenticated_%s_noga_requests" on public.noga_requests', cmd);
  end loop;
  create policy "authenticated_select_noga_requests" on public.noga_requests for select
    using (auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
  create policy "authenticated_insert_noga_requests" on public.noga_requests for insert
    with check (auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
  create policy "authenticated_update_noga_requests" on public.noga_requests for update
    using (auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
  create policy "authenticated_delete_noga_requests" on public.noga_requests for delete
    using (auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'noga_requests') then
    alter publication supabase_realtime add table public.noga_requests;
  end if;
end $$;

-- 5. Server-side purge: medication label text is cleared 24 h after the nurse completes it.
-- Requires the pg_cron extension (Database > Extensions > pg_cron). Uncomment once enabled:
-- select cron.schedule('purge-med-labels', '0 * * * *',
--   $$update public.tasks set med_label = null where med_done_at < now() - interval '24 hours' and med_label is not null$$);
