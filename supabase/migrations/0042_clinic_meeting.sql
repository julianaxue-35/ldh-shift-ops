-- 2026-10-28: the date of the next clinic meeting, shown on the Memo board (Vets and Nurses pages).
-- One shared row (id = 1) so everyone sees the same date.
create table if not exists public.clinic_meeting (
  id int primary key default 1 check (id = 1),
  next_date date,
  updated_at timestamptz not null default now()
);
insert into public.clinic_meeting (id) values (1) on conflict (id) do nothing;

alter table public.clinic_meeting enable row level security;
create policy "staff_select_clinic_meeting" on public.clinic_meeting for select using (
  auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
create policy "staff_insert_clinic_meeting" on public.clinic_meeting for insert with check (
  auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
create policy "staff_update_clinic_meeting" on public.clinic_meeting for update using (
  auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');

alter publication supabase_realtime add table public.clinic_meeting;
