-- 0045: lock out repeated wrong guesses (3 in 15 minutes) and keep a log of failed attempts (2026-10-30).
-- Covers the two code checks we control: the sync Edge Function (used by the shift tools' access gate) and the role passcode check
-- (check_passcode). The guessed code is NEVER stored: only when, which door, which role, and which network address.
-- A locked address is refused for everything, including the right code, until its oldest counted failure is 15 minutes old.
-- Supabase's own dashboard sign-in is outside this: see the note in the PR (set its rate limit in Authentication > Rate Limits).
create table if not exists public.auth_failed_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  source text not null,                    -- 'sync_code' (Edge Function / tools gate) or 'role_passcode'
  role text,                               -- for role_passcode: the role tried
  client text not null,                    -- network address as seen by the server
  blocked boolean not null default false,  -- true = refused because the address was already locked (not counted again)
  cleared boolean not null default false   -- true = the right code was entered afterwards, so this failure no longer counts toward a lock
);
create index if not exists auth_failed_log_client_at_idx on public.auth_failed_log (client, at);
alter table public.auth_failed_log enable row level security;   -- no policies: only the server and the SQL editor can read it

create or replace function public.auth_recent_failures(p_client text) returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.auth_failed_log
  where client = p_client and not blocked and not cleared and at > now() - interval '15 minutes'
$$;

create or replace function public.auth_is_locked(p_client text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.auth_recent_failures(p_client) >= 3
$$;

-- A correct entry wipes that address's count (the log rows stay, marked cleared).
create or replace function public.auth_clear_failures(p_client text) returns void
language sql security definer set search_path = public as $$
  update public.auth_failed_log set cleared = true where client = p_client and not cleared
$$;

create or replace function public.auth_record_failure(p_source text, p_role text, p_client text, p_blocked boolean default false) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.auth_failed_log (source, role, client, blocked) values (p_source, p_role, coalesce(nullif(p_client, ''), 'unknown'), coalesce(p_blocked, false));
  delete from public.auth_failed_log where at < now() - interval '1 year';
end $$;

-- Only the server (service role) may call these two; they are not reachable from the pages.
revoke all on function public.auth_recent_failures(text) from public, anon, authenticated;
revoke all on function public.auth_is_locked(text) from public, anon, authenticated;
revoke all on function public.auth_clear_failures(text) from public, anon, authenticated;
revoke all on function public.auth_record_failure(text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.auth_recent_failures(text) to service_role;
grant execute on function public.auth_is_locked(text) to service_role;
grant execute on function public.auth_clear_failures(text) to service_role;
grant execute on function public.auth_record_failure(text, text, text, boolean) to service_role;

-- The role passcode check now counts wrong answers and refuses a locked address.
create or replace function public.check_passcode(p_role text, p_code text) returns boolean
language plpgsql security definer set search_path = extensions, public, pg_temp as $$
declare
  hdr text := nullif(current_setting('request.headers', true), '');
  c text := coalesce(nullif(trim(split_part(coalesce(case when hdr is null then null else hdr::json ->> 'x-forwarded-for' end, ''), ',', 1)), ''), 'unknown');
  ok boolean;
begin
  if public.auth_is_locked(c) then
    perform public.auth_record_failure('role_passcode', p_role, c, true);
    return false;
  end if;
  select code_hash = crypt(p_code, code_hash) into ok from public.role_passcodes where role = p_role;
  if not coalesce(ok, false) then
    perform public.auth_record_failure('role_passcode', p_role, c, false);
    return false;
  end if;
  perform public.auth_clear_failures(c);
  return true;
end $$;
revoke all on function public.check_passcode(text, text) from public;
revoke all on function public.check_passcode(text, text) from anon;
grant execute on function public.check_passcode(text, text) to authenticated;
