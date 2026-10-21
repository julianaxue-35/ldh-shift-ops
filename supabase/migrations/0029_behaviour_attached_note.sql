-- 2026-10-21: Phase B of the Behaviour page. A vet can send an animal to Behaviour from a shift tool WITH the whole
-- medical note attached (attached_note). The note is patient data, so the database itself removes it:
--   * the moment a task becomes Done (before-update trigger: no page can leave one behind), and
--   * after 7 days if nobody ticked Done (the existing cleanup trigger).
-- source_key = one open card per animal per Melbourne day per send (a re-send updates it). Run as ONE script. Safe to repeat.
alter table public.behaviour_tasks add column if not exists attached_note text;
alter table public.behaviour_tasks add column if not exists source_key text;
create unique index if not exists behaviour_tasks_open_source_key on public.behaviour_tasks (source_key)
  where status = 'open' and source_key is not null;

create or replace function public.behaviour_tasks_clear_note() returns trigger language plpgsql as $$
begin
  if new.status = 'done' then new.attached_note := null; end if;
  return new;
end $$;
drop trigger if exists behaviour_tasks_clear_note on public.behaviour_tasks;
create trigger behaviour_tasks_clear_note before insert or update on public.behaviour_tasks
  for each row execute function public.behaviour_tasks_clear_note();

create or replace function public.behaviour_tasks_cleanup() returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.behaviour_tasks where status = 'done' and done_at < now() - interval '7 days';
  -- the update below fires this trigger again, so only the outermost run does it (no endless loop)
  if pg_trigger_depth() < 2 then
    update public.behaviour_tasks set attached_note = null
      where attached_note is not null and created_at < now() - interval '7 days';
  end if;
  return null;
end $$;
