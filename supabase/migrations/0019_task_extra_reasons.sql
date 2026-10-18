-- 2026-10-19: more than one reason on the same flagged animal. When staff flag an animal that is already open in
-- the same pen for something different (e.g. vomiting, then diarrhoea), the new reason is added to the SAME case
-- instead of being refused. Each entry: {at, by, condition, problem, red_flags[], urgency}.
-- Run this whole file as ONE script. Safe to run more than once.
alter table public.tasks add column if not exists extra_reasons jsonb not null default '[]'::jsonb;
