-- 2026-10-19: foster / rescue requests can ask the nurses to check or give due treatments. It arrives as a
-- miscellaneous task of kind 'treatment' (Welfare nurse's list).
-- Run this whole file as ONE script. Safe to run more than once.
alter table public.noga_requests drop constraint if exists noga_requests_task_check;
alter table public.noga_requests add constraint noga_requests_task_check
  check (task in ('fiv_test','microchip','other','blood','ear_swab','ivft','uv','treatment'));
