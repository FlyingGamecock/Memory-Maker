create table public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.user_roles enable row level security;
revoke all on public.user_roles from anon, authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = (select auth.uid())
      and is_admin = true
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create or replace function public.list_app_users()
returns table (user_id uuid, email text, is_admin boolean)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  return query
  select users.id, users.email::text, coalesce(roles.is_admin, false)
  from auth.users as users
  left join public.user_roles as roles on roles.user_id = users.id
  order by users.email;
end;
$$;

revoke all on function public.list_app_users() from public, anon;
grant execute on function public.list_app_users() to authenticated;

create or replace function public.set_app_user_admin(target_user_id uuid, make_admin boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_count bigint;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('public.user_roles.admin_count'));

  if not exists (select 1 from auth.users where id = target_user_id) then
    raise exception 'User account not found' using errcode = '22023';
  end if;

  if make_admin then
    insert into public.user_roles (user_id, is_admin)
    values (target_user_id, true)
    on conflict (user_id) do update set is_admin = true;
  else
    select count(*) into admin_count
    from public.user_roles
    where is_admin = true;

    if admin_count <= 1 and exists (
      select 1 from public.user_roles
      where user_id = target_user_id and is_admin = true
    ) then
      raise exception 'At least one administrator must remain' using errcode = '23514';
    end if;

    delete from public.user_roles where user_id = target_user_id;
  end if;
end;
$$;

revoke all on function public.set_app_user_admin(uuid, boolean) from public, anon;
grant execute on function public.set_app_user_admin(uuid, boolean) to authenticated;

drop policy if exists "Admins can read all memories" on public.memories;
drop policy if exists "Admins can update all memories" on public.memories;
drop policy if exists "Admins can delete all memories" on public.memories;

create policy "Admins can read all memories"
on public.memories for select
to authenticated
using ((select public.is_admin()));

create policy "Admins can update all memories"
on public.memories for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "Admins can delete all memories"
on public.memories for delete
to authenticated
using ((select public.is_admin()));

drop policy if exists "Admins can read all memory photos" on public.memory_photos;
drop policy if exists "Admins can add memory photos" on public.memory_photos;
drop policy if exists "Admins can update all memory photos" on public.memory_photos;
drop policy if exists "Admins can delete all memory photos" on public.memory_photos;

create policy "Admins can read all memory photos"
on public.memory_photos for select
to authenticated
using ((select public.is_admin()));

create policy "Admins can add memory photos"
on public.memory_photos for insert
to authenticated
with check ((select public.is_admin()));

create policy "Admins can update all memory photos"
on public.memory_photos for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "Admins can delete all memory photos"
on public.memory_photos for delete
to authenticated
using ((select public.is_admin()));

drop policy if exists "Admins can read all stored memory photos" on storage.objects;
drop policy if exists "Admins can upload stored memory photos" on storage.objects;
drop policy if exists "Admins can update all stored memory photos" on storage.objects;
drop policy if exists "Admins can delete all stored memory photos" on storage.objects;

create policy "Admins can read all stored memory photos"
on storage.objects for select
to authenticated
using (bucket_id = 'idea-photos' and (select public.is_admin()));

create policy "Admins can upload stored memory photos"
on storage.objects for insert
to authenticated
with check (bucket_id = 'idea-photos' and (select public.is_admin()));

create policy "Admins can update all stored memory photos"
on storage.objects for update
to authenticated
using (bucket_id = 'idea-photos' and (select public.is_admin()))
with check (bucket_id = 'idea-photos' and (select public.is_admin()));

create policy "Admins can delete all stored memory photos"
on storage.objects for delete
to authenticated
using (bucket_id = 'idea-photos' and (select public.is_admin()));

notify pgrst, 'reload schema';
