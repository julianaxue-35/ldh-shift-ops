-- 0051: rescue groups (2026-11-18). One rescue request can cover several animals, each in its own space with its own checks.
--  nurse_requests.animals      : [{ "id": "1170123", "location": "Cat Room 1 / 4", "done": false }, ...]  (the nurse ticks each animal off;
--                                animal_count / done_count stay the totals the rest of the page already uses)
--  tasks.group_animals         : [{ "id": "1170123", "location": "Cat Room 1 / 4", "kinds": ["microchip","uv"] }, ...]  (one vet case for the group;
--                                "Transfer to nurse" turns it into nurse requests, one per kind of check)
-- Both are optional: every existing row, and every single-animal request, leaves them empty.
alter table public.nurse_requests add column if not exists animals jsonb;
alter table public.tasks add column if not exists group_animals jsonb;

-- One card for the whole rescue group: each animal lists its own checks (microchip, UV, treatment check, other) in nurse_requests.animals[].checks.
alter table public.nurse_requests drop constraint if exists nurse_requests_kind_check;
alter table public.nurse_requests add constraint nurse_requests_kind_check
  check (kind in ('vaccination','fiv','blood','microchip','uv','microchip_uv','rescue_group'));
