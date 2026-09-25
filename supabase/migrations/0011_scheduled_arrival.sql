-- Scheduled vaccination arrivals (2026-09-26).
-- Run this whole file as ONE script. Safe to run more than once.
--
-- Today, logging a vaccination request always means "this animal is here
-- now" — arrived_at starts the 2h vaccinate-by clock immediately. She wants
-- to also be able to log one AHEAD of time ("8 cats arriving at 2pm"), so
-- nurses see it coming and get a 15-minute warning, rather than only ever
-- finding out once it's already on site.
--
-- arrived_at becomes nullable: a row with arrived_at still null and
-- expected_at set is "scheduled, not here yet". The moment someone marks it
-- arrived (nurses.html's new "Mark arrived" button), arrived_at is stamped
-- and the request behaves exactly as it does today. A row must always have
-- at least one of the two set.
alter table public.nurse_requests alter column arrived_at drop not null;
alter table public.nurse_requests alter column arrived_at drop default;
alter table public.nurse_requests add column if not exists expected_at timestamptz;
alter table public.nurse_requests drop constraint if exists nurse_requests_arrival_check;
alter table public.nurse_requests add constraint nurse_requests_arrival_check
  check (arrived_at is not null or expected_at is not null);
