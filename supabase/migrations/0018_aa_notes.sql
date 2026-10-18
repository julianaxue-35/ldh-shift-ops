-- 2026-10-18: Admission AA Phase 2a. Vets' shift tools send finished notes to the AA page.
-- Run this whole file as ONE script. Safe to run more than once.
-- Run it BEFORE deploying the updated Edge Function.

-- 1. Three more kinds of card.
alter table public.aa_items drop constraint if exists aa_items_kind_check;
alter table public.aa_items add constraint aa_items_kind_check
  check (kind in ('fiv','microchip','uv','microchip_uv','vaccination','processing_note','si_note','med_chart'));

-- 2. One live card per shift/animal/kind: a resend UPDATES the card instead of adding a second one.
--    NULL for the nurse-sent kinds (NULLs never clash). updated_at stays NULL until a card is first updated.
alter table public.aa_items add column if not exists source_key text;
alter table public.aa_items add column if not exists updated_at timestamptz;
create unique index if not exists aa_items_source_key_idx on public.aa_items (source_key);

-- 3. Belt and braces behind the Edge Function's own limit (about 1.5 MB of JSON per card).
alter table public.aa_items drop constraint if exists aa_items_payload_size_check;
alter table public.aa_items add constraint aa_items_payload_size_check check (octet_length(payload::text) <= 1600000);
