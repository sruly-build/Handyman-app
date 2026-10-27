-- Handyman app — database setup (Stage 1)
--
-- How to use: in Supabase, open "SQL Editor", click "New query",
-- paste this whole file in, and press "Run". It is safe to run more than once.

-- ---------------------------------------------------------------
-- People who can log in (one row per login, created automatically)
-- ---------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Create profiles for anyone who signed up before this script ran
insert into public.profiles (id, full_name)
select id, split_part(email, '@', 1) from auth.users
on conflict (id) do nothing;

-- ---------------------------------------------------------------
-- Jobs
-- ---------------------------------------------------------------
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  customer_phone text not null default '',
  customer_email text not null default '',
  address text not null default '',
  job_date date,
  notes text not null default '',
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- Punch list items (one task on a job)
-- measurements is a list like:
--   [{"id":"...","label":"Vanity","width":"30","height":"34","depth":"21","unit":"in","note":""}]
-- ---------------------------------------------------------------
create table if not exists public.punch_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  title text not null,
  location text not null default '',
  notes text not null default '',
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  measurements jsonb not null default '[]'::jsonb,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists punch_items_job_id_idx on public.punch_items (job_id);

-- ---------------------------------------------------------------
-- Photos (files live in the "photos" storage bucket)
-- ---------------------------------------------------------------
create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.punch_items (id) on delete cascade,
  kind text not null default 'before' check (kind in ('before', 'after')),
  storage_path text not null,
  created_at timestamptz not null default now()
);
create index if not exists photos_item_id_idx on public.photos (item_id);

-- ---------------------------------------------------------------
-- Security: only logged-in users (the owner and the worker) can see
-- or change anything. Nobody else, ever.
-- ---------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.jobs enable row level security;
alter table public.punch_items enable row level security;
alter table public.photos enable row level security;

drop policy if exists "team reads profiles" on public.profiles;
create policy "team reads profiles" on public.profiles
  for select to authenticated using (true);
drop policy if exists "edit own profile" on public.profiles;
create policy "edit own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "team manages jobs" on public.jobs;
create policy "team manages jobs" on public.jobs
  for all to authenticated using (true) with check (true);

drop policy if exists "team manages punch items" on public.punch_items;
create policy "team manages punch items" on public.punch_items
  for all to authenticated using (true) with check (true);

drop policy if exists "team manages photos" on public.photos;
create policy "team manages photos" on public.photos
  for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------
-- Photo storage bucket (private: photos are only shown to logged-in users)
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

drop policy if exists "team reads photo files" on storage.objects;
create policy "team reads photo files" on storage.objects
  for select to authenticated using (bucket_id = 'photos');
drop policy if exists "team uploads photo files" on storage.objects;
create policy "team uploads photo files" on storage.objects
  for insert to authenticated with check (bucket_id = 'photos');
drop policy if exists "team deletes photo files" on storage.objects;
create policy "team deletes photo files" on storage.objects
  for delete to authenticated using (bucket_id = 'photos');
