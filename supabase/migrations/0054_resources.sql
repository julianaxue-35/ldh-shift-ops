-- 2026-11-28: Resources page. Documents (a name, and the page shown when it is opened) are kept in the database, readable only by
-- signed-in staff, so their contents are never part of the public code. They are added or updated from the SQL editor only.
-- Safe to run more than once.
create table if not exists public.resources (
  slug text primary key,
  title text not null,
  body text not null,
  sort int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.resources enable row level security;
drop policy if exists "staff_select_resources" on public.resources;
create policy "staff_select_resources" on public.resources for select
  using (auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
revoke all on public.resources from anon, authenticated;
grant select on public.resources to authenticated;
