-- Allow a "Foster consult" vet on the roster (roster-only: tasks still use
-- the original three shifts). Existing rows are unaffected.
alter table public.roster drop constraint if exists roster_shift_check;
alter table public.roster
  add constraint roster_shift_check
  check (shift in ('processing','sick_injured','surgery','foster_consult'));
