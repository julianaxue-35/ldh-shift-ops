-- Scopes the offline-tool sync account down to insert/update on `tasks`
-- only. Run this AFTER creating the sync_writer account (see the
-- 2026-09-18 amendment in the design spec for the account-creation steps
-- and the raw_app_meta_data tagging SQL, which must be run first).

drop policy "authenticated_select_tasks" on public.tasks;
drop policy "authenticated_select_memos" on public.memos;
drop policy "authenticated_insert_memos" on public.memos;
drop policy "authenticated_select_roster" on public.roster;
drop policy "authenticated_insert_roster" on public.roster;
drop policy "authenticated_update_roster" on public.roster;
drop policy "authenticated_delete_roster" on public.roster;

create policy "staff_select_tasks" on public.tasks for select using (
  auth.role() = 'authenticated'
  and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer'
);
create policy "staff_select_memos" on public.memos for select using (
  auth.role() = 'authenticated'
  and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer'
);
create policy "staff_insert_memos" on public.memos for insert with check (
  auth.role() = 'authenticated'
  and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer'
);
create policy "staff_select_roster" on public.roster for select using (
  auth.role() = 'authenticated'
  and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer'
);
create policy "staff_insert_roster" on public.roster for insert with check (
  auth.role() = 'authenticated'
  and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer'
);
create policy "staff_update_roster" on public.roster for update using (
  auth.role() = 'authenticated'
  and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer'
);
create policy "staff_delete_roster" on public.roster for delete using (
  auth.role() = 'authenticated'
  and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer'
);

-- authenticated_insert_tasks / authenticated_update_tasks from
-- 0002_rls_policies.sql are untouched on purpose — both the staff
-- dashboard and the sync_writer account need to write tasks.
