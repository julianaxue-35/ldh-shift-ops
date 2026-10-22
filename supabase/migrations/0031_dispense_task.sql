-- 2026-10-22: a vet can ask a nurse to dispense medication for an animal (no schedule, no treatment type): a plain nurse task.
-- Run this whole file as ONE script. Safe to run more than once.
alter table public.noga_requests drop constraint if exists noga_requests_task_check;
alter table public.noga_requests add constraint noga_requests_task_check
  check (task in ('fiv_test','microchip','other','blood','ear_swab','ivft','uv','treatment','med_label','dispense'));
