-- 2026-10-22: a finished Behaviour task stays on the Behaviour page's Completed list (with its note) for 24 hours so it can be put
-- back, then it is deleted (it was 7 days). Its count stays in behaviour_done_log. The attached medical note is still removed the
-- moment the task is Done, and any attached note on an open task is still cleared after 7 days.
-- Run this whole file as ONE script. Safe to run more than once.
create or replace function public.behaviour_tasks_cleanup() returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.behaviour_tasks where status = 'done' and coalesce(done_at, created_at) < now() - interval '24 hours';
  -- the update below fires this trigger again, so only the outermost run does it (no endless loop)
  if pg_trigger_depth() < 2 then
    update public.behaviour_tasks set attached_note = null
      where attached_note is not null and created_at < now() - interval '7 days';
  end if;
  return null;
end $$;
