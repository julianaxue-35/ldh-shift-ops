-- 2026-10-19: Admission AA completed list. Ticking a card no longer deletes it straight away: it moves to a
-- "Completed" list (newest first) where an accidental tick can be put back. Completed rows are removed within 24 hours
-- (the AA empties the list at the end of the day; the page and the sync function also clear anything older than 24 h),
-- so no notes stay in the system for more than a day. A card for several animals is completed one animal at a time.
-- Run this whole file as ONE script. Safe to run more than once.
alter table public.aa_items add column if not exists completed_at timestamptz;
alter table public.aa_items add column if not exists done_ids text[] not null default '{}';
-- One LIVE card per kind + day + animal: a completed card no longer blocks a new send for the same animal.
drop index if exists public.aa_items_source_key_idx;
create unique index if not exists aa_items_source_key_live_idx on public.aa_items (source_key) where completed_at is null;
