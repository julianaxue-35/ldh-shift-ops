-- 2026-10-21: a vet sends a medication label (the long label for a medication in Treatment / a registered medication chart) to the
-- Welfare nurse. It arrives as a miscellaneous task of kind 'med_label': animal ID, space, the label text in the note, and the
-- vet's initials in added_by. source_key identifies one label (chart + medication line) so sending it again after an edit
-- UPDATES the open task instead of adding a second one.
-- Run this whole file as ONE script. Safe to run more than once.
alter table public.noga_requests add column if not exists source_key text;
alter table public.noga_requests drop constraint if exists noga_requests_task_check;
alter table public.noga_requests add constraint noga_requests_task_check
  check (task in ('fiv_test','microchip','other','blood','ear_swab','ivft','uv','treatment','med_label'));
create unique index if not exists noga_requests_open_label_idx on public.noga_requests (source_key) where source_key is not null and done = false;
