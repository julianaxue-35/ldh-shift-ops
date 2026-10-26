-- 2026-10-27: a Processing nurse can send a microchip or vaccination to the Behaviour team to do (card type 'chip_vacc').
-- Run this whole file as ONE script. Safe to run more than once.
alter table public.behaviour_tasks drop constraint if exists behaviour_tasks_kind_check;
alter table public.behaviour_tasks add constraint behaviour_tasks_kind_check
  check (kind in ('courthold','surrender_history','incident_review','behaviour_review','other','chip_vacc'));
