-- 2026-10-28: the FIR numbers also count where each cat went next (the Plan chosen in the behaviour notes).
-- adoption = general population adoption; behaviour_mod = behaviour modification; uu = behavioural euthanasia
-- (the page only ever says "UU"). Still counts only: no animal ID, no notes. Safe to run more than once.
alter table public.fsa_log add column if not exists pathway text;
alter table public.fsa_log drop constraint if exists fsa_log_pathway_check;
alter table public.fsa_log add constraint fsa_log_pathway_check check (pathway is null or pathway in ('adoption', 'behaviour_mod', 'uu'));
