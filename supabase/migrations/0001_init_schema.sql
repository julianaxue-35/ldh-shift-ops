create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  location text not null,
  shift text not null check (shift in ('processing','sick_injured','surgery')),
  type text not null default 'check_recheck' check (type in ('shelter','foster','rescue','medication','check_recheck')),
  origin text not null default 'add_on' check (origin in ('scheduled','add_on')),
  urgency text not null default 'routine' check (urgency in ('routine','soon','urgent')),
  done boolean not null default false,
  completed_by_role text check (completed_by_role in ('attendant','vet_nurse')),
  completed_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);

create table public.memos (
  id uuid primary key default gen_random_uuid(),
  author text not null,
  text text not null,
  created_at timestamptz not null default now()
);

create table public.roster (
  id uuid primary key default gen_random_uuid(),
  shift text not null check (shift in ('processing','sick_injured','surgery')),
  staff_name text not null,
  roster_date date not null default current_date
);

create index tasks_shift_idx on public.tasks (shift);
create index tasks_location_idx on public.tasks (location);
create index roster_shift_date_idx on public.roster (shift, roster_date);

-- Needed for the offline-tool completion sync (spec amendment, 2026-09-18):
-- the sync writes are an upsert keyed on (title, location, shift), which
-- requires a real unique index to resolve conflicts against.
create unique index tasks_title_location_shift_idx on public.tasks (title, location, shift);
