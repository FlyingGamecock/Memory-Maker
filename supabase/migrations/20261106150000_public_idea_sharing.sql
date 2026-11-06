alter table public.ideas
add column if not exists is_public boolean not null default false;

revoke all on public.ideas from anon;
grant select (id, text, notes, category, due_date, done, is_public, updated_at)
on public.ideas to anon;

drop policy if exists "Anyone can read shared ideas" on public.ideas;
create policy "Anyone can read shared ideas"
on public.ideas for select
to anon, authenticated
using (is_public = true);

revoke all on public.idea_photos from anon;
grant select (id, idea_id, storage_path, width, height, size_bytes, created_at)
on public.idea_photos to anon;

drop policy if exists "Anyone can read photos on shared ideas" on public.idea_photos;
create policy "Anyone can read photos on shared ideas"
on public.idea_photos for select
to anon, authenticated
using (
  exists (
    select 1
    from public.ideas
    where public.ideas.id = idea_photos.idea_id
      and public.ideas.is_public = true
  )
);

drop policy if exists "Anyone can read stored photos on shared ideas" on storage.objects;
grant select on storage.objects to anon;

create policy "Anyone can read stored photos on shared ideas"
on storage.objects for select
to anon, authenticated
using (
  bucket_id = 'idea-photos'
  and exists (
    select 1
    from public.idea_photos
    join public.ideas on public.ideas.id = public.idea_photos.idea_id
    where public.idea_photos.storage_path = storage.objects.name
      and public.ideas.is_public = true
  )
);
