-- 2026-11-01: Sign groups (tickable body-system groups on the flag form). Run this whole file as ONE script. Safe to run more than once.
-- Old rows are KEPT as they are: legacy keys stay valid and are folded into groups only when read / counted.

-- 1. sign_group(key): the group a stored key counts under. Mirrors LDHLogic.groupOf (lib/ldh-logic.js).
--    NULL stays NULL; an unknown key maps to itself.
create or replace function public.sign_group(k text) returns text language sql immutable as $$
  select case k
    when 'cat_flu' then 'respiratory'
    when 'kennel_cough' then 'respiratory'
    when 'vomiting' then 'gi'
    when 'diarrhoea' then 'gi'
    when 'eye_condition' then 'eyes'
    when 'skin_condition' then 'skin'
    when 'wounds_injury' then 'wounds_pain_swelling'
    else k
  end
$$;

-- 2. New list column (raw keys as stored) on tasks and on the flag log.
alter table public.tasks add column if not exists conditions text[] not null default '{}';
alter table public.flag_history add column if not exists conditions text[] not null default '{}';

-- 3. Allowed keys: the 11 groups (LDHLogic.SIGN_KEYS) plus the 7 legacy keys (old cached pages may still send them).
alter table public.tasks drop constraint if exists tasks_condition_check;
alter table public.tasks add constraint tasks_condition_check check (condition is null or condition in
  ('respiratory','gi','urinary','skin','msk','neuro','eyes','ears','wounds_pain_swelling','neonatal','other',
   'cat_flu','kennel_cough','diarrhoea','vomiting','eye_condition','skin_condition','wounds_injury'));
alter table public.tasks drop constraint if exists tasks_conditions_check;
alter table public.tasks add constraint tasks_conditions_check check (conditions <@ array
  ['respiratory','gi','urinary','skin','msk','neuro','eyes','ears','wounds_pain_swelling','neonatal','other',
   'cat_flu','kennel_cough','diarrhoea','vomiting','eye_condition','skin_condition','wounds_injury']::text[]);

-- 4. Keep condition and conditions in step. Old pages send only `condition`; new pages send `conditions`.
--    condition = the RAW key in conditions whose group is earliest in display order (mirrors LDHLogic.primaryCondition).
create or replace function public.sync_conditions() returns trigger language plpgsql as $$
declare
  ord text[] := array['respiratory','gi','urinary','skin','msk','neuro','eyes','ears','wounds_pain_swelling','neonatal','other'];
begin
  if coalesce(cardinality(new.conditions), 0) = 0 then
    if new.condition is not null then new.conditions := array[new.condition]; end if;
  else
    select u.k into new.condition
    from unnest(new.conditions) with ordinality as u(k, n)
    order by coalesce(array_position(ord, public.sign_group(u.k)), 99), u.n
    limit 1;
  end if;
  return new;
end $$;
drop trigger if exists tasks_sync_conditions on public.tasks;
create trigger tasks_sync_conditions before insert or update of condition, conditions on public.tasks
  for each row execute function public.sync_conditions();

-- 5. Backfill: existing single-condition rows read as conditions = [condition]. Nothing else is rewritten.
update public.tasks set conditions = array[condition] where condition is not null and coalesce(cardinality(conditions), 0) = 0;
update public.flag_history set conditions = array[condition] where condition is not null and coalesce(cardinality(conditions), 0) = 0;

-- 6. Flag log also copies conditions.
create or replace function public.log_flag() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.type = 'check_recheck' then return new; end if;     -- list entries from the offline tools aren't flags
  insert into public.flag_history (task_id, title, flagged_at, location, reason, condition, conditions)
    values (new.id, new.title, new.created_at, new.location, nullif(btrim(coalesce(new.problem, '')), ''), new.condition, coalesce(new.conditions, '{}'))
    on conflict (task_id, flagged_at) do nothing;
  delete from public.flag_history where flagged_at < now() - interval '3 months';
  return new;
end $$;
revoke execute on function public.log_flag() from public, anon, authenticated;
revoke execute on function public.sync_conditions() from public, anon, authenticated;

-- 7. Snapshot: distinct animals per GROUP (legacy keys fold in) and per space within the last p_days days.
--    'any' = distinct CASES (animal + group pairs). Old surveillance_snapshots rows are left as they are.
create or replace function public.take_surveillance_snapshot(p_days int default 3)
returns int language plpgsql set search_path = public as $$
declare
  d date := ((now() - interval '1 hour') at time zone 'Australia/Melbourne')::date;
  n1 int; n2 int;
begin
  insert into public.surveillance_snapshots (snapshot_date, space, condition, animals, cages)
  select d, l.name, c.condition, count(distinct t.title)::int, l.cages
  from public.locations l
  cross join (select unnest(array['respiratory','gi','urinary','skin','msk','neuro','eyes','ears','wounds_pain_swelling','neonatal','other']) as condition) c
  left join public.tasks t
    on trim(split_part(t.location, '/', 1)) = l.name
   and t.created_at >= now() - make_interval(days => p_days)
   and exists (select 1 from unnest(t.conditions) u(cond) where public.sign_group(u.cond) = c.condition)
  group by l.name, l.cages, c.condition
  on conflict (snapshot_date, space, condition) do update set animals = excluded.animals, cages = excluded.cages;
  get diagnostics n1 = row_count;

  insert into public.surveillance_snapshots (snapshot_date, space, condition, animals, cages)
  -- concatenate (not a row constructor): a row of two NULLs from the LEFT JOIN is itself non-null and would count as 1
  select d, l.name, 'any', count(distinct (t.title || '|' || public.sign_group(u.cond)))::int, l.cages
  from public.locations l
  left join public.tasks t
    on trim(split_part(t.location, '/', 1)) = l.name
   and t.created_at >= now() - make_interval(days => p_days)
  left join lateral unnest(t.conditions) u(cond) on true
  group by l.name, l.cages
  on conflict (snapshot_date, space, condition) do update set animals = excluded.animals, cages = excluded.cages;
  get diagnostics n2 = row_count;
  return n1 + n2;
end;
$$;
revoke execute on function public.take_surveillance_snapshot(int) from public, anon, authenticated;
