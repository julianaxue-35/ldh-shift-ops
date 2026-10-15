-- 2026-10-15: Welfare nurse / Processing nurse split, vet "transfer to nurse", UV + microchip requests
-- from foster/rescue flags, and the renamed Miscellaneous tasks list (was the NO-GA list).
-- Run this whole file as ONE script. Safe to run more than once.

-- 1. Miscellaneous tasks (table keeps its old name noga_requests): more task kinds, and a link back to the
--    vet case when a vet transfers it to the nurses.
alter table public.noga_requests drop constraint if exists noga_requests_task_check;
alter table public.noga_requests add constraint noga_requests_task_check
  check (task in ('fiv_test','microchip','other','blood','ear_swab','ivft','uv'));
alter table public.noga_requests add column if not exists source_task_id uuid references public.tasks(id) on delete set null;

-- 2. Nurse requests: UV request kind, and an optional animal ID (foster/rescue requests are one named animal,
--    not a head-count at a location).
alter table public.nurse_requests drop constraint if exists nurse_requests_kind_check;
alter table public.nurse_requests add constraint nurse_requests_kind_check
  check (kind in ('vaccination','fiv','blood','microchip','uv'));
alter table public.nurse_requests add column if not exists animal_id text;
