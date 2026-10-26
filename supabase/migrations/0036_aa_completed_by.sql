-- 2026-10-27: the Admission AA types their initials on their page; they are saved on each card they tick off,
-- so the Surgery tool can show them as "Paperwork by" on the note. Safe to run more than once.
alter table public.aa_items add column if not exists completed_by text;
