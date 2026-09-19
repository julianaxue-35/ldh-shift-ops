-- Multi-station surgery sync (surgery.html "Share this shift").
-- One row per animal; the record lives in `data` (jsonb, mirrors the tool's
-- own local shape). Microchip NUMBERS are never written here — the client
-- strips them and sends only a microchipImplanted flag. surg_type and done
-- are denormalised so the dashboard can show counts without reading `data`.
-- Retention: the client deletes rows older than 24h on connect, and scrubs a
-- row's `data` (keeping surg_type/done for the counts) once it is exported.

create table if not exists public.surgery_shift (
  id text primary key,                       -- the animal's local id in surgery.html
  shift_date date not null,                  -- device-local date the shift was started
  surg_type text,
  done boolean not null default false,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists surgery_shift_date_idx on public.surgery_shift (shift_date);

-- Only accounts listed here may touch surgery_shift. Add the surgery-stations
-- login's user id after creating it in Authentication > Users:
--   insert into public.surgery_stations (user_id) values ('<uuid>');
-- Revoke by deleting the row. The dashboard's own login is NOT listed, so it
-- can never read clinical records — it only gets counts via surgery_summary().
create table if not exists public.surgery_stations (
  user_id uuid primary key
);
alter table public.surgery_stations enable row level security;
-- no policies: nobody can read/write this via the API; manage it in the SQL editor.

create or replace function public.is_surgery_station()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.surgery_stations where user_id = auth.uid());
$$;

alter table public.surgery_shift enable row level security;

create policy "station_select_surgery_shift" on public.surgery_shift
  for select using (public.is_surgery_station());
create policy "station_insert_surgery_shift" on public.surgery_shift
  for insert with check (public.is_surgery_station());
create policy "station_update_surgery_shift" on public.surgery_shift
  for update using (public.is_surgery_station());
create policy "station_delete_surgery_shift" on public.surgery_shift
  for delete using (public.is_surgery_station());

-- Counts only, for the dashboard (any authenticated user). Never returns `data`.
create or replace function public.surgery_summary(p_shift_date date)
returns table (surg_type text, total bigint, completed bigint)
language sql stable security definer set search_path = public as $$
  select coalesce(surg_type, 'unspecified'), count(*), count(*) filter (where done)
  from public.surgery_shift
  where shift_date = p_shift_date
  group by 1
  order by 2 desc;
$$;
revoke all on function public.surgery_summary(date) from public, anon;
grant execute on function public.surgery_summary(date) to authenticated;

-- Recursive merge: objects merge key-by-key, everything else (scalars,
-- arrays, null) is replaced by the patch value. Lets two stations edit
-- different parts of the same animal (e.g. different ticks) without one
-- overwriting the other's whole record.
create or replace function public.jsonb_deep_merge(a jsonb, b jsonb)
returns jsonb language plpgsql immutable as $$
declare
  result jsonb;
  k text;
begin
  if jsonb_typeof(a) = 'object' and jsonb_typeof(b) = 'object' then
    result := a;
    for k in select jsonb_object_keys(b) loop
      if result ? k then
        result := jsonb_set(result, array[k], public.jsonb_deep_merge(result -> k, b -> k));
      else
        result := result || jsonb_build_object(k, b -> k);
      end if;
    end loop;
    return result;
  end if;
  return b;
end;
$$;

-- Upsert a partial update for one animal. security invoker (the default), so
-- the RLS policies above still apply to the caller.
create or replace function public.merge_surgery_animal(
  p_id text,
  p_shift_date date,
  p_patch jsonb,
  p_surg_type text,
  p_done boolean
) returns void language plpgsql as $$
begin
  insert into public.surgery_shift (id, shift_date, surg_type, done, data)
  values (p_id, p_shift_date, p_surg_type, coalesce(p_done, false), coalesce(p_patch, '{}'::jsonb))
  on conflict (id) do update set
    surg_type = coalesce(p_surg_type, public.surgery_shift.surg_type),
    done = coalesce(p_done, public.surgery_shift.done),
    data = public.jsonb_deep_merge(public.surgery_shift.data, coalesce(p_patch, '{}'::jsonb)),
    updated_at = now();
end;
$$;

alter publication supabase_realtime add table public.surgery_shift;

-- Server-side retention: delete anything older than 24h, hourly, regardless of
-- whether any device opens the app. Requires the pg_cron extension
-- (Database > Extensions > pg_cron). Uncomment once it is enabled:
-- select cron.schedule('purge-surgery-shift', '0 * * * *',
--   $$delete from public.surgery_shift where updated_at < now() - interval '24 hours'$$);
