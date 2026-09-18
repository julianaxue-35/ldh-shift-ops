insert into public.tasks (title, location, shift, type, urgency, done)
values
  ('A-1042', 'Cat Room 2', 'sick_injured', 'check_recheck', 'soon', false),
  ('A-2077', 'Pound 3', 'processing', 'medication', 'routine', false),
  ('A-3390', 'Adoption 1', 'surgery', 'check_recheck', 'urgent', false),
  ('A-1188', 'FIR Room', 'sick_injured', 'check_recheck', 'urgent', true);

insert into public.memos (author, text)
values ('Vet team', 'Fictional seed memo — Cat Room 2 recheck moved to 2pm.');

insert into public.roster (shift, staff_name, roster_date)
values
  ('processing', 'Fictional Nurse A', current_date),
  ('sick_injured', 'Fictional Vet B', current_date),
  ('surgery', 'Fictional Vet C', current_date);
