-- 2026-10-16: vets can put a picked-up case back; nurses can send a finished task (with a result) back to the vets.
-- Run this whole file as ONE script. Safe to run more than once.

-- 1. Put back: when a vet puts a picked-up case back, claimed_at/claimed_by are cleared and the time is kept here
--    so the board can show "Put back 2:05pm". No reason is recorded (by design).
alter table public.tasks add column if not exists put_back_at timestamptz;

-- 2. Send back to vet: a nurse finishes a miscellaneous task and records the result. The vet then gets a normal
--    'shelter' request on the vet board (made by the page, 2 h or 12-24 h window); these columns keep the audit trail.
alter table public.noga_requests add column if not exists result_note text;
alter table public.noga_requests add column if not exists returned_at timestamptz;
