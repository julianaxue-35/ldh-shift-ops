-- 0050: the wrong-code lockout now lasts 1 minute (was 15), and the pages can ask "is this address locked?" so they can say
-- "Too many wrong attempts" instead of "Wrong passcode" (2026-11-17). Replaces functions from 0045; no tables change.
-- Still 3 wrong codes from one network address -> locked (even for the right code) until the oldest counted failure is 1 minute old.
create or replace function public.auth_recent_failures(p_client text) returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.auth_failed_log
  where client = p_client and not blocked and not cleared and at > now() - interval '1 minute'
$$;
revoke all on function public.auth_recent_failures(text) from public, anon, authenticated;
grant execute on function public.auth_recent_failures(text) to service_role;

-- Pages call this after a refused code. Reads only the caller's own address; returns true/false, nothing else.
create or replace function public.passcode_locked() returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  hdr text := nullif(current_setting('request.headers', true), '');
  c text := coalesce(nullif(trim(split_part(coalesce(case when hdr is null then null else hdr::json ->> 'x-forwarded-for' end, ''), ',', 1)), ''), 'unknown');
begin
  return public.auth_is_locked(c);
end $$;
revoke all on function public.passcode_locked() from public;
revoke all on function public.passcode_locked() from anon;
grant execute on function public.passcode_locked() to authenticated;
