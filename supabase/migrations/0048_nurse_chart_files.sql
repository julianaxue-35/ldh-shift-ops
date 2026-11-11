-- 2026-11-11: a vet can send a registered medication chart (the Excel file) to the nurses to PRINT, e.g. at the weekend when the
-- Admission AA is not in. It arrives as a nurse task of kind 'med_chart' (animal ID, space, the medication lines in the note, the
-- vet's initials in added_by). The Excel itself is kept in its own table so the boards (which read noga_requests with select *)
-- never download it; the Nurses page fetches it only when someone presses Download. The file row is deleted with its task
-- (on delete cascade), and completed tasks are already deleted 24 hours after they are ticked off.
-- source_key identifies one chart, so sending it again after an edit UPDATES the open task instead of adding a second one.
-- Run this whole file as ONE script. Safe to run more than once.
alter table public.noga_requests drop constraint if exists noga_requests_task_check;
alter table public.noga_requests add constraint noga_requests_task_check
  check (task in ('fiv_test','microchip','other','blood','ear_swab','ivft','uv','treatment','med_label','dispense','tail_bandage','urine_collection','triple_test','med_chart'));

create table if not exists public.nurse_chart_files (
  request_id uuid primary key references public.noga_requests(id) on delete cascade,
  filename text not null default 'medication_chart.xlsx',
  xlsx_b64 text not null,
  created_at timestamptz not null default now()
);
alter table public.nurse_chart_files enable row level security;
do $$
declare cmd text;
begin
  foreach cmd in array array['select','insert','update','delete'] loop
    execute format('drop policy if exists "authenticated_%s_nurse_chart_files" on public.nurse_chart_files', cmd);
  end loop;
  create policy "authenticated_select_nurse_chart_files" on public.nurse_chart_files for select
    using (auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
  create policy "authenticated_insert_nurse_chart_files" on public.nurse_chart_files for insert
    with check (auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
  create policy "authenticated_update_nurse_chart_files" on public.nurse_chart_files for update
    using (auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer')
    with check (auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
  create policy "authenticated_delete_nurse_chart_files" on public.nurse_chart_files for delete
    using (auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
end $$;
