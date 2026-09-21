-- Stage 2 of the Floor / Vet desk redesign: disease surveillance (2026-09-21).
-- Run this whole file as ONE script.

-- 1. Wider list of REPORTED SIGNS (diagnoses such as Giardia are deliberately not signs).
alter table public.tasks drop constraint if exists tasks_condition_check;
alter table public.tasks add constraint tasks_condition_check check (condition is null or condition in
  ('cat_flu','kennel_cough','diarrhoea','vomiting','eye_condition','skin_condition','wounds_injury','other'));

-- 2. Spaces and their cage counts (Cranbourne, 23 Aug 2026 count). Names match the flag form's dropdown.
create table public.locations (
  name text primary key,
  grp text not null,
  cages int not null check (cages >= 0),
  sort int not null
);
insert into public.locations (name, grp, cages, sort) values
  ('Cat Room 1',         'Cat rooms',    30,  1),
  ('Cat Room 2',         'Cat rooms',    24,  2),
  ('Cat Room 3',         'Cat rooms',    10,  3),
  ('FIR Room',           'Cat rooms',    32,  4),
  ('Adoption 1',         'Cat adoption', 16,  5),
  ('Adoption 2',         'Cat adoption', 16,  6),
  ('Cat Isolation ward', 'Isolation',     6,  7),
  ('Pound 1',            'Pounds',       30,  8),
  ('Pound 2',            'Pounds',       26,  9),
  ('Pound 3',            'Pounds',       60, 10),
  ('Pound 4',            'Pounds',        9, 11),
  ('Transport',          'Transport',    10, 12);

-- 3. Nightly snapshot rows, so a baseline builds up over time.
--    condition is a sign key (distinct animals with that sign), or 'any' = distinct CASES (animal + sign pairs) in that space.
create table public.surveillance_snapshots (
  snapshot_date date not null,
  space text not null,
  condition text not null,
  animals int not null check (animals >= 0),
  cages int not null,
  primary key (snapshot_date, space, condition)
);

-- 4. Snapshot function: distinct animals (tasks.title) per space and sign within the last p_days days.
--    Dated by the Melbourne evening the job ran in (job runs at 13:00 UTC = 23:00 AEST / 00:00 AEDT).
create or replace function public.take_surveillance_snapshot(p_days int default 3)
returns int language plpgsql as $$
declare
  d date := ((now() - interval '1 hour') at time zone 'Australia/Melbourne')::date;
  n1 int; n2 int;
begin
  insert into public.surveillance_snapshots (snapshot_date, space, condition, animals, cages)
  select d, l.name, c.condition, count(distinct t.title)::int, l.cages
  from public.locations l
  cross join (select unnest(array['cat_flu','kennel_cough','diarrhoea','vomiting','eye_condition','skin_condition','wounds_injury','other']) as condition) c
  left join public.tasks t
    on trim(split_part(t.location, '/', 1)) = l.name
   and t.condition = c.condition
   and t.created_at >= now() - make_interval(days => p_days)
  group by l.name, l.cages, c.condition
  on conflict (snapshot_date, space, condition) do update set animals = excluded.animals, cages = excluded.cages;
  get diagnostics n1 = row_count;

  insert into public.surveillance_snapshots (snapshot_date, space, condition, animals, cages)
  -- concatenate (not a row constructor): a row of two NULLs from the LEFT JOIN is itself non-null and would count as 1
  select d, l.name, 'any', count(distinct (t.title || '|' || t.condition))::int, l.cages
  from public.locations l
  left join public.tasks t
    on trim(split_part(t.location, '/', 1)) = l.name
   and t.condition is not null
   and t.created_at >= now() - make_interval(days => p_days)
  group by l.name, l.cages
  on conflict (snapshot_date, space, condition) do update set animals = excluded.animals, cages = excluded.cages;
  get diagnostics n2 = row_count;
  return n1 + n2;
end;
$$;

-- 5. Access: read-only for signed-in staff (same sync_writer guard as migration 0003). Nothing writable via the API;
--    edit cage counts in the SQL editor, snapshots are written by the job.
alter table public.locations enable row level security;
alter table public.surveillance_snapshots enable row level security;
create policy "staff_select_locations" on public.locations for select using (
  auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
create policy "staff_select_surveillance_snapshots" on public.surveillance_snapshots for select using (
  auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
