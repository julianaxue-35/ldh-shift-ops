-- 2026-10-09: Shelter board (shelter-board.html).
-- 1. Two new free-text columns on tasks so the vet's TREATMENT and PLAN (written in the offline
--    Sick & Injured tool) travel with the flagged case and show against its room/pen on the board.
--    Kept separate from `note` (the old short completion note) and `problem` (written at request time).
alter table public.tasks add column if not exists treatment text;
alter table public.tasks add column if not exists plan text;

-- 2. Rabbit Room (10 cages) joins the spaces list, so it appears in the flag form and the cage counts.
--    "Pathway" (foster requests) is deliberately NOT a locations row: it has no cages, and like
--    "Offsite" it is a name the app knows about (OFFSITE_NAMES in lib/ldh-logic.js).
insert into public.locations (name, grp, cages, sort) values
  ('Rabbit Room', 'Rabbits', 10, 13)
on conflict (name) do nothing;
