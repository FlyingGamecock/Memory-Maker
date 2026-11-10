create extension if not exists pgcrypto;

create table if not exists public.memories (
  id uuid primary key,
  user_id uuid references auth.users(id) on delete cascade,
  text text not null check (char_length(text) <= 80),
  notes text not null default '' check (char_length(notes) <= 500),
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.memories
add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table public.memories
add column if not exists notes text not null default '';

alter table public.memories
add column if not exists is_public boolean not null default false;

alter table public.memories
drop constraint if exists memories_notes_length_check;

alter table public.memories
add constraint memories_notes_length_check check (char_length(notes) <= 500);

alter table public.memories
  drop column if exists category,
  drop column if exists due_date,
  drop column if exists done;

create index if not exists memories_user_id_updated_at_idx
on public.memories (user_id, updated_at desc);

create table if not exists public.memory_photos (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null references public.memories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  width integer not null,
  height integer not null,
  size_bytes integer not null,
  created_at timestamptz not null default now()
);

create index if not exists memory_photos_memory_id_created_at_idx
on public.memory_photos (memory_id, created_at);

alter table public.memory_photos enable row level security;

revoke all on public.memory_photos from anon;
grant select, insert, update, delete on public.memory_photos to authenticated;
grant select (id, memory_id, storage_path, width, height, size_bytes, created_at)
on public.memory_photos to anon;

drop policy if exists "Users can read their own memory photos" on public.memory_photos;
drop policy if exists "Users can add their own memory photos" on public.memory_photos;
drop policy if exists "Users can update their own memory photos" on public.memory_photos;
drop policy if exists "Users can delete their own memory photos" on public.memory_photos;
drop policy if exists "Anyone can read photos on shared memories" on public.memory_photos;

create policy "Users can read their own memory photos"
on public.memory_photos for select
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

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('idea-photos', 'idea-photos', false, 3145728, array['image/jpeg'])
on conflict (id) do update
set public = false,
    file_size_limit = 3145728,
    allowed_mime_types = array['image/jpeg'];

revoke all on storage.objects from anon;
grant select on storage.objects to anon;

drop policy if exists "Users can read their own stored memory photos" on storage.objects;
drop policy if exists "Users can upload their own stored memory photos" on storage.objects;
drop policy if exists "Users can update their own stored memory photos" on storage.objects;
drop policy if exists "Users can delete their own stored memory photos" on storage.objects;
drop policy if exists "Anyone can read stored photos on shared memories" on storage.objects;

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

alter table public.memories enable row level security;

revoke all on public.memories from anon;
grant select, insert, update, delete on public.memories to authenticated;
grant select (id, text, notes, is_public, updated_at) on public.memories to anon;

drop policy if exists "Users can read their own memories" on public.memories;
drop policy if exists "Users can add their own memories" on public.memories;
drop policy if exists "Users can update their own memories" on public.memories;
drop policy if exists "Users can delete their own memories" on public.memories;
drop policy if exists "Anyone can read shared memories" on public.memories;

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
