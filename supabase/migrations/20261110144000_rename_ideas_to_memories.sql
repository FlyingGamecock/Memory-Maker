alter table public.ideas rename to memories;
alter table public.idea_photos rename to memory_photos;
alter table public.memory_photos rename column idea_id to memory_id;

alter index public.ideas_user_id_updated_at_idx rename to memories_user_id_updated_at_idx;
alter index public.idea_photos_idea_id_created_at_idx rename to memory_photos_memory_id_created_at_idx;

alter table public.memories drop column done;

revoke all on public.memories from anon;
grant select (id, text, notes, is_public, updated_at) on public.memories to anon;

drop policy if exists "Anyone can read ideas" on public.memories;
drop policy if exists "Anyone can add ideas" on public.memories;
drop policy if exists "Anyone can update ideas" on public.memories;
drop policy if exists "Anyone can delete ideas" on public.memories;
drop policy if exists "Users can read their own ideas" on public.memories;
drop policy if exists "Users can add their own ideas" on public.memories;
drop policy if exists "Users can update their own ideas" on public.memories;
drop policy if exists "Users can delete their own ideas" on public.memories;
drop policy if exists "Anyone can read shared ideas" on public.memories;

create policy "Users can read their own memories"
on public.memories for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can add their own memories"
on public.memories for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own memories"
on public.memories for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own memories"
on public.memories for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Anyone can read shared memories"
on public.memories for select
to anon, authenticated
using (is_public = true);

revoke all on public.memory_photos from anon;
grant select (id, memory_id, storage_path, width, height, size_bytes, created_at)
on public.memory_photos to anon;

drop policy if exists "Users can read their own idea photos" on public.memory_photos;
drop policy if exists "Users can add their own idea photos" on public.memory_photos;
drop policy if exists "Users can update their own idea photos" on public.memory_photos;
drop policy if exists "Users can delete their own idea photos" on public.memory_photos;
drop policy if exists "Anyone can read photos on shared ideas" on public.memory_photos;

create policy "Users can read their own memory photos"
on public.memory_photos for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can add their own memory photos"
on public.memory_photos for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own memory photos"
on public.memory_photos for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own memory photos"
on public.memory_photos for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Anyone can read photos on shared memories"
on public.memory_photos for select
to anon, authenticated
using (
  exists (
    select 1
    from public.memories
    where public.memories.id = memory_photos.memory_id
      and public.memories.is_public = true
  )
);

drop policy if exists "Users can read their own stored idea photos" on storage.objects;
drop policy if exists "Users can upload their own stored idea photos" on storage.objects;
drop policy if exists "Users can update their own stored idea photos" on storage.objects;
drop policy if exists "Users can delete their own stored idea photos" on storage.objects;
drop policy if exists "Anyone can read stored photos on shared ideas" on storage.objects;

create policy "Users can read their own stored memory photos"
on storage.objects for select
to authenticated
using (
  bucket_id = 'idea-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Users can upload their own stored memory photos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'idea-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Users can update their own stored memory photos"
on storage.objects for update
to authenticated
using (
  bucket_id = 'idea-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'idea-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Users can delete their own stored memory photos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'idea-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

grant select on storage.objects to anon;

create policy "Anyone can read stored photos on shared memories"
on storage.objects for select
to anon, authenticated
using (
  bucket_id = 'idea-photos'
  and exists (
    select 1
    from public.memory_photos
    join public.memories on public.memories.id = public.memory_photos.memory_id
    where public.memory_photos.storage_path = storage.objects.name
      and public.memories.is_public = true
  )
);
