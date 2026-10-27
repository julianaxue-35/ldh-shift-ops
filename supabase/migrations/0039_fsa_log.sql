-- 2026-10-27: FIR room numbers (fir tab on behaviour.html). One COUNTS-ONLY row per cat that has finished the FIR/FSA process,
-- so the weekly / monthly / quarterly / yearly numbers survive after the cat's record is deleted (7 days after completion).
-- No animal ID, no notes, nothing identifying: only the arrival date, when it was completed and the FSA outcome.
-- Run this whole file as ONE script. Safe to run more than once.
create table if not exists public.fsa_log (
  cat_id uuid primary key,
  intake_at timestamptz not null,
  completed_at timestamptz not null default now(),
  outcome text not null check (outcome in ('graduate','1','2','3','4','unscored')),
  created_at timestamptz not null default now()
);
create index if not exists fsa_log_intake_idx on public.fsa_log (intake_at);

alter table public.fsa_log enable row level security;
do $$
declare cmd text;
begin
  foreach cmd in array array['select','insert','update','delete'] loop
    execute format('drop policy if exists "authenticated_%s_fsa_log" on public.fsa_log', cmd);
  end loop;
  create policy "authenticated_select_fsa_log" on public.fsa_log for select
    using (auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
  create policy "authenticated_insert_fsa_log" on public.fsa_log for insert
    with check (auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
  create policy "authenticated_update_fsa_log" on public.fsa_log for update
    using (auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
  create policy "authenticated_delete_fsa_log" on public.fsa_log for delete
    using (auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
end $$;
