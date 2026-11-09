alter table public.ideas
  drop column if exists category,
  drop column if exists due_date;

revoke all on public.ideas from anon;
grant select (id, text, notes, done, is_public, updated_at)
on public.ideas to anon;
