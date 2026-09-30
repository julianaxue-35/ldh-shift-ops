-- Generalise nurse_requests beyond vaccination-only (2026-09-30).
-- `kind` already existed (default 'vaccination', never actually used to
-- branch on anything) — now the dashboard lets staff pick it explicitly:
-- vaccination / fiv / blood / microchip. New `due_window` replaces the old
-- hardcoded "2 hours from arrival" clock with a per-request choice.
alter table public.nurse_requests drop constraint if exists nurse_requests_kind_check;
alter table public.nurse_requests add constraint nurse_requests_kind_check
  check (kind in ('vaccination','fiv','blood','microchip'));

alter table public.nurse_requests add column if not exists due_window text not null default '2h';
alter table public.nurse_requests drop constraint if exists nurse_requests_due_window_check;
alter table public.nurse_requests add constraint nurse_requests_due_window_check
  check (due_window in ('2h','today','24_48h'));
