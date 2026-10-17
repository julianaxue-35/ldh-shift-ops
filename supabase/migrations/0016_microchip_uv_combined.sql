-- 2026-10-17: one combined "Microchip + UV" nurse request for a named foster/rescue animal (was two separate requests).
-- Run this whole file as ONE script. Safe to run more than once.
alter table public.nurse_requests drop constraint if exists nurse_requests_kind_check;
alter table public.nurse_requests add constraint nurse_requests_kind_check
  check (kind in ('vaccination','fiv','blood','microchip','uv','microchip_uv'));
