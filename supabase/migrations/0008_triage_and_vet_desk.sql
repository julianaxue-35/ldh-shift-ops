-- Stage 1 of the Floor / Vet desk redesign (2026-09-20).

-- 1. Three triage tiers. Old 'urgent' (act now) becomes 'red_flag'; old 'soon' becomes 'urgent'.
alter table public.tasks drop constraint if exists tasks_urgency_check;
update public.tasks set urgency = 'red_flag' where urgency = 'urgent';
update public.tasks set urgency = 'urgent' where urgency = 'soon';
-- 'soon' stays allowed ONLY so a browser tab still running the old page keeps working
-- through the switch-over; the app treats it as 'urgent' (LDHLogic.normTier).
alter table public.tasks
  add constraint tasks_urgency_check check (urgency in ('routine','soon','urgent','red_flag'));
alter table public.tasks add column red_flags text[] not null default '{}';
alter table public.tasks add column claimed_by text;
alter table public.tasks add column claimed_at timestamptz;

-- 2. Memos can be ticked off (kept, hidden) or deleted.
alter table public.memos add column done boolean not null default false;
alter table public.memos add column done_at timestamptz;
alter table public.memos add column source text;
create policy "authenticated_update_memos" on public.memos
  for update using (auth.role() = 'authenticated'
    and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
create policy "authenticated_delete_memos" on public.memos
  for delete using (auth.role() = 'authenticated'
    and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');

-- 3. Nurse vaccination requests (groups of animals, 3 h from arrival).
create table public.nurse_requests (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'vaccination',
  location text not null,
  species text not null check (species in ('cat','dog')),
  animal_count int not null check (animal_count > 0),
  note text,
  arrived_at timestamptz not null default now(),
  done_count int not null default 0 check (done_count >= 0),
  claimed_by text,
  created_by text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- 4. Nurse treatment reminders: a course (N times a day for D days) and its dose ticks.
create table public.nurse_treatments (
  id uuid primary key default gen_random_uuid(),
  animal_id text not null,
  location text not null,
  treatment text not null,
  times_per_day int not null check (times_per_day between 1 and 4),
  days int not null check (days between 1 and 30),
  start_date date not null default current_date,
  requested_by text,
  stopped boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.nurse_treatment_doses (
  id uuid primary key default gen_random_uuid(),
  treatment_id uuid not null references public.nurse_treatments(id) on delete cascade,
  day_no int not null,
  slot_no int not null,
  due_date date not null,
  done_by text,
  done_at timestamptz,
  unique (treatment_id, day_no, slot_no)
);

-- 5. Same access model as the other dashboard tables (shared staff login) + realtime.
do $$
declare t text;
begin
  foreach t in array array['nurse_requests','nurse_treatments','nurse_treatment_doses'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "authenticated_select_%s" on public.%I for select using (auth.role() = ''authenticated'' and coalesce(auth.jwt() -> ''app_metadata'' ->> ''role'', '''') <> ''sync_writer'')', t, t);
    execute format('create policy "authenticated_insert_%s" on public.%I for insert with check (auth.role() = ''authenticated'' and coalesce(auth.jwt() -> ''app_metadata'' ->> ''role'', '''') <> ''sync_writer'')', t, t);
    execute format('create policy "authenticated_update_%s" on public.%I for update using (auth.role() = ''authenticated'' and coalesce(auth.jwt() -> ''app_metadata'' ->> ''role'', '''') <> ''sync_writer'')', t, t);
    execute format('create policy "authenticated_delete_%s" on public.%I for delete using (auth.role() = ''authenticated'' and coalesce(auth.jwt() -> ''app_metadata'' ->> ''role'', '''') <> ''sync_writer'')', t, t);
    execute format('alter publication supabase_realtime add table public.%I', t);
  end loop;
end $$;
