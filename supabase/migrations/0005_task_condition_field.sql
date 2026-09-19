-- 2026-09-19 amendment: disease surveillance tracking. A controlled-
-- vocabulary field (not free text like `problem`), so it can actually be
-- aggregated/exported for outbreak monitoring over time, separate from the
-- free-text issue description used for the dashboard-to-tool hand-off.
alter table public.tasks add column condition text
  check (condition is null or condition in ('cat_flu','kennel_cough','diarrhoea','wounds_injury','other'));
