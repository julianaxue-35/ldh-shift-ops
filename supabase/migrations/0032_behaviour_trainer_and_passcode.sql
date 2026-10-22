-- 2026-10-22: (1) a Behaviour trainer lane on the Behaviour page, (2) its own passcode for opening the Behaviour page.
-- Run this whole file as ONE script. Safe to run more than once.
-- After running, set the real Behaviour passcode IN THE SQL EDITOR ONLY (see rotate-codes.sql, section 4). Never commit a real code.

-- 1. The 'trainer' lane.
alter table public.behaviour_tasks drop constraint if exists behaviour_tasks_lane_check;
alter table public.behaviour_tasks add constraint behaviour_tasks_lane_check check (lane in ('incoming','tl','cat','dog','trainer'));

-- 2. The 'behaviour' role may have a passcode. The seed is a random value nobody knows, so the Behaviour page stays locked
--    until the real code is set; re-running never overwrites a code that has been set.
alter table public.role_passcodes drop constraint if exists role_passcodes_role_check;
alter table public.role_passcodes add constraint role_passcodes_role_check check (role in ('vet','nurse','aa','behaviour'));
insert into public.role_passcodes (role, code_hash)
  values ('behaviour', extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')))
  on conflict (role) do nothing;
