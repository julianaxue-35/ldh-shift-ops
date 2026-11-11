-- 2026-11-11: a staff member can attach one phone photo to a flag. The picture is shrunk in the browser (about 200 KB, JPEG) and
-- stored in a PRIVATE Storage bucket; tasks.photo_path says which file belongs to the task. The photo is deleted as soon as the
-- task is finished (the pages remove it, and sweep up any left over on the next load). The task row itself is kept for the
-- 3-month case review, with photo_path cleared.
-- Run this whole file as ONE script. Safe to run more than once.
alter table public.tasks add column if not exists photo_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('flag-photos', 'flag-photos', false, 3145728, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = 3145728, allowed_mime_types = array['image/jpeg'];

do $$
declare cmd text;
begin
  foreach cmd in array array['select','insert','delete'] loop
    execute format('drop policy if exists "flag_photos_%s" on storage.objects', cmd);
  end loop;
  create policy "flag_photos_select" on storage.objects for select
    using (bucket_id = 'flag-photos' and auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
  create policy "flag_photos_insert" on storage.objects for insert
    with check (bucket_id = 'flag-photos' and auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
  create policy "flag_photos_delete" on storage.objects for delete
    using (bucket_id = 'flag-photos' and auth.role() = 'authenticated' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'sync_writer');
end $$;
