-- LDH Shift Ops: change the codes (2026-10-17 security fix).
--
-- How to use: open Supabase > SQL Editor, paste this file, replace the three
-- placeholders IN THE EDITOR ONLY, then Run. Never commit real codes back to
-- this file: GitHub is public, which is how the old codes leaked.
--
-- Code structure:
--   * LDH access code: one code for everything. It unlocks the Shift Tools
--     gate, syncs the tools to the dashboard, and signs in to the dashboard.
--     It must also be set as the Edge Function secret SYNC_SECRET
--     (Supabase > Edge Functions > Secrets), exactly the same text.
--   * Vet passcode: extra code for the Vet page only.
--   * Nurse passcode: extra code for the Nurse page only.
--
-- Use a long LDH code (three or more words plus a number), because it is
-- the only thing protecting the dashboard from the internet.

-- 1. Dashboard sign-in = the LDH access code
update auth.users
   set encrypted_password = extensions.crypt('REPLACE_WITH_LDH_CODE', extensions.gen_salt('bf')),
       updated_at = now()
 where email = 'staff@ldh-shift-ops.local';

-- 2. Vet and Nurse page passcodes (the old ones are visible in 0010_round3.sql)
update public.role_passcodes
   set code_hash = extensions.crypt('REPLACE_WITH_VET_CODE', extensions.gen_salt('bf'))
 where role = 'vet';

update public.role_passcodes
   set code_hash = extensions.crypt('REPLACE_WITH_NURSE_CODE', extensions.gen_salt('bf'))
 where role = 'nurse';

-- Check: each line below should return true with your new codes.
-- select public.check_passcode('vet', 'REPLACE_WITH_VET_CODE');
-- select public.check_passcode('nurse', 'REPLACE_WITH_NURSE_CODE');
