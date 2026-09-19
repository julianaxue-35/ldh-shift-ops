-- 2026-09-19 amendment: lets a Shelter Staff request carry a free-text
-- description of the animal's issue, so it can be handed off to
-- sick-injured.html (or the other offline tools) when a vet picks it up
-- from the dashboard, instead of being re-typed from scratch.
--
-- Kept separate from `note` (short, coordination-only, written at
-- completion time) since this is written at REQUEST time and describes
-- the actual presenting issue, not a completion status note. The two are
-- different things that happen to both be short free text.
alter table public.tasks add column problem text;
