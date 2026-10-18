-- LDH Shift Ops: clear ALL test animals and start every count from zero.
-- Run in the Supabase SQL editor. It is IRREVERSIBLE, so read the preview first.
--
-- DELETES: every flagged case and its history, nurse requests / treatments / miscellaneous tasks, Admission AA
--          cards, surgery shift records, and the disease-watch snapshots.
-- KEEPS:   locations, roster, passcodes, memos, and the surgery-station login.
-- Do NOT paste a real code or any patient data into this file.

-- 1. PREVIEW: how many rows will go (run this on its own first and check the numbers look like test data).
select 'tasks' as what, count(*) from public.tasks
union all select 'flag_history', count(*) from public.flag_history
union all select 'nurse_requests', count(*) from public.nurse_requests
union all select 'nurse_treatments', count(*) from public.nurse_treatments
union all select 'noga_requests (misc tasks)', count(*) from public.noga_requests
union all select 'aa_items', count(*) from public.aa_items
union all select 'surgery_shift', count(*) from public.surgery_shift
union all select 'surveillance_snapshots', count(*) from public.surveillance_snapshots;

-- 2. THE CLEAR-OUT: select everything from here to COMMIT and run it as ONE script.
begin;
delete from public.aa_items;
delete from public.noga_requests;
delete from public.nurse_treatment_doses;
delete from public.nurse_treatments;
delete from public.nurse_requests;
delete from public.flag_history;
delete from public.tasks;
delete from public.surgery_shift;
delete from public.surveillance_snapshots;
commit;

-- 3. CHECK: every number below should be 0.
select 'tasks' as what, count(*) from public.tasks
union all select 'flag_history', count(*) from public.flag_history
union all select 'nurse_requests', count(*) from public.nurse_requests
union all select 'nurse_treatments', count(*) from public.nurse_treatments
union all select 'noga_requests', count(*) from public.noga_requests
union all select 'aa_items', count(*) from public.aa_items
union all select 'surgery_shift', count(*) from public.surgery_shift
union all select 'surveillance_snapshots', count(*) from public.surveillance_snapshots;
