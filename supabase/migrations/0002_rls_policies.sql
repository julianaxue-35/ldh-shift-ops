alter table public.tasks enable row level security;
alter table public.memos enable row level security;
alter table public.roster enable row level security;

create policy "authenticated_select_tasks" on public.tasks
  for select using (auth.role() = 'authenticated');
create policy "authenticated_insert_tasks" on public.tasks
  for insert with check (auth.role() = 'authenticated');
create policy "authenticated_update_tasks" on public.tasks
  for update using (auth.role() = 'authenticated');

create policy "authenticated_select_memos" on public.memos
  for select using (auth.role() = 'authenticated');
create policy "authenticated_insert_memos" on public.memos
  for insert with check (auth.role() = 'authenticated');

create policy "authenticated_select_roster" on public.roster
  for select using (auth.role() = 'authenticated');
create policy "authenticated_insert_roster" on public.roster
  for insert with check (auth.role() = 'authenticated');
create policy "authenticated_update_roster" on public.roster
  for update using (auth.role() = 'authenticated');
create policy "authenticated_delete_roster" on public.roster
  for delete using (auth.role() = 'authenticated');

alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.memos;
