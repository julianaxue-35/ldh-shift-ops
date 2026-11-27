-- 2026-11-27: a request for an animal whose case a vet has ALREADY picked up becomes a new task for the vets.
-- The one-case rule (ID + location + shift + kind) is kept; a follow-up carries a number, which makes its kind different.
-- The sync service's saves of list entries use the same four columns and are unaffected.
-- Run this whole file as ONE script. Safe to run more than once.

alter table public.tasks add column if not exists followup smallint not null default 0;
drop index if exists public.tasks_title_location_shift_kind_idx;
alter table public.tasks drop column if exists kind;
alter table public.tasks add column kind text
  generated always as (case when type = 'check_recheck' then 'list'
                            when followup > 0 then 'request ' || followup::text
                            else 'request' end) stored;
create unique index if not exists tasks_title_location_shift_kind_idx on public.tasks (title, location, shift, kind);
