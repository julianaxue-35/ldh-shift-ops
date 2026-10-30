-- 2026-10-30: a shelter request (flagged on the staff form) and a Sick & Injured / Processing / Surgery list entry for the SAME
-- animal ID in the SAME location are two separate logs. They counted as one row before (one unique key: ID + location + shift),
-- so the request and the list check merged. `kind` splits the key: 'list' = offline-tool list entry (type check_recheck),
-- 'request' = anything raised on the staff form / sent by a nurse or Behaviour. Different IDs in one location were always separate.
-- Run this whole file as ONE script. Safe to run more than once.

alter table public.tasks add column if not exists kind text
  generated always as (case when type = 'check_recheck' then 'list' else 'request' end) stored;
drop index if exists public.tasks_title_location_shift_idx;
create unique index if not exists tasks_title_location_shift_kind_idx on public.tasks (title, location, shift, kind);
