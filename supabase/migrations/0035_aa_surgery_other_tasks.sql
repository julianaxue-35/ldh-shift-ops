-- 2026-10-27: Surgery tool can now send finished notes to the Admission AA (card kind 'surgery_note').
-- Also adds the nurses' 'other' task card (free text in the comment box).
-- Run this whole file as ONE script. Safe to run more than once.
-- Run it BEFORE deploying the updated Edge Function (sync-completion).

alter table public.aa_items drop constraint if exists aa_items_kind_check;
alter table public.aa_items add constraint aa_items_kind_check
  check (kind in ('fiv','microchip','uv','microchip_uv','vaccination','processing_note','si_note','surgery_note','med_chart','other'));

-- Daily totals: surgery notes count with the other notes.
create or replace function public.aa_daily_counts(p_since date)
returns table (day date, cat text, n bigint)
language sql stable security definer set search_path = public as $$
  select (completed_at at time zone 'Australia/Melbourne')::date as day,
         case when kind in ('processing_note', 'si_note', 'surgery_note') then 'notes' when kind = 'med_chart' then 'charts' else 'tasks' end as cat,
         sum(animals)::bigint
    from public.aa_done_log
   where (completed_at at time zone 'Australia/Melbourne')::date >= p_since
   group by 1, 2 order by 1;
$$;
revoke all on function public.aa_daily_counts(date) from public, anon;
grant execute on function public.aa_daily_counts(date) to authenticated;

-- Three more one-animal tasks a vet can ask the Welfare nurse for: tail bandage, urine collection, triple test.
alter table public.noga_requests drop constraint if exists noga_requests_task_check;
alter table public.noga_requests add constraint noga_requests_task_check
  check (task in ('fiv_test','microchip','other','blood','ear_swab','ivft','uv','treatment','med_label','dispense','tail_bandage','urine_collection','triple_test'));
