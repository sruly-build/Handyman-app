-- Handyman app: database setup
--
-- How to use: in Supabase, open "SQL Editor", click "New query",
-- paste this whole file in, and press "Run". It is safe to run more than once,
-- so after an app update that changes this file, just run it again.

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

-- Create profiles for anyone who was added before this script ran
insert into public.profiles (id, full_name)
select id, split_part(email, '@', 1) from auth.users
on conflict (id) do nothing;

-- ---------------------------------------------------------------
-- Business settings (one row): markup, hourly rate, invoice details
-- ---------------------------------------------------------------
create table if not exists public.settings (
  id text primary key default 'main' check (id = 'main'),
  business_name text not null default '',
  business_phone text not null default '',
  business_email text not null default '',
  business_address text not null default '',
  markup_percent numeric not null default 20,
  hourly_rate numeric not null default 75,
  markup_labour boolean not null default true,
  labour_mode text not null default 'task' check (labour_mode in ('task', 'visit'))
);
insert into public.settings (id) values ('main') on conflict (id) do nothing;

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
alter table public.jobs add column if not exists assigned jsonb not null default '[]'::jsonb;
alter table public.jobs add column if not exists bring_extras jsonb not null default '[]'::jsonb;

-- ---------------------------------------------------------------
-- Punch list items (one task on a job)
-- measurements is a list like:
--   [{"id":"...","label":"Vanity","width":"30","height":"34","depth":"21","unit":"in","note":""}]
-- tools is a list like: ["Drill", "Wall anchors x8"]
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
alter table public.punch_items add column if not exists tools jsonb not null default '[]'::jsonb;
alter table public.punch_items add column if not exists estimated_hours numeric;
create index if not exists punch_items_job_id_idx on public.punch_items (job_id);

-- ---------------------------------------------------------------
-- Photos and sketches (files live in the "photos" storage bucket)
-- ---------------------------------------------------------------
create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.punch_items (id) on delete cascade,
  kind text not null default 'before',
  storage_path text not null,
  created_at timestamptz not null default now()
);
alter table public.photos drop constraint if exists photos_kind_check;
alter table public.photos add constraint photos_kind_check check (kind in ('before', 'after', 'sketch'));
create index if not exists photos_item_id_idx on public.photos (item_id);

-- ---------------------------------------------------------------
-- Parts: needed → ordered → received
-- cost is the total paid for the line (or the expected cost before buying)
-- ---------------------------------------------------------------
create table if not exists public.parts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  item_id uuid references public.punch_items (id) on delete set null,
  name text not null,
  quantity numeric not null default 1,
  cost numeric(10, 2),
  supplier text not null default '',
  status text not null default 'needed' check (status in ('needed', 'ordered', 'received')),
  created_at timestamptz not null default now(),
  ordered_at timestamptz,
  received_at timestamptz
);
create index if not exists parts_job_id_idx on public.parts (job_id);

-- ---------------------------------------------------------------
-- Bring list ticks (what's been loaded in the van)
-- ---------------------------------------------------------------
create table if not exists public.bring_checks (
  id text primary key,
  job_id uuid not null references public.jobs (id) on delete cascade,
  key text not null
);
create index if not exists bring_checks_job_id_idx on public.bring_checks (job_id);

-- ---------------------------------------------------------------
-- Time: "visit" = Arrived → Finished; "task" = timer on one item
-- ---------------------------------------------------------------
create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  item_id uuid references public.punch_items (id) on delete cascade,
  user_id uuid not null references auth.users (id) default auth.uid(),
  kind text not null check (kind in ('visit', 'task')),
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
create index if not exists time_entries_job_id_idx on public.time_entries (job_id);
create index if not exists time_entries_user_id_idx on public.time_entries (user_id);

-- ---------------------------------------------------------------
-- Invoices (a fixed copy of the bill at the moment it was made)
-- ---------------------------------------------------------------
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.jobs (id) on delete cascade,
  number integer not null,
  status text not null default 'unpaid' check (status in ('unpaid', 'paid')),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  lines jsonb not null default '[]'::jsonb,
  parts_total numeric(10, 2) not null default 0,
  labour_total numeric(10, 2) not null default 0,
  total numeric(10, 2) not null default 0,
  markup_percent numeric not null default 20
);

-- ---------------------------------------------------------------
-- Security: only logged-in users (the owner and the worker) can see
-- or change anything. Nobody else, ever.
-- ---------------------------------------------------------------
alter table public.profiles enable row level security;
drop policy if exists "team reads profiles" on public.profiles;
create policy "team reads profiles" on public.profiles
  for select to authenticated using (true);
drop policy if exists "edit own profile" on public.profiles;
create policy "edit own profile" on public.profiles
  for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['settings', 'jobs', 'punch_items', 'photos', 'parts', 'bring_checks', 'time_entries', 'invoices']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "team manages %s" on public.%I', t, t);
    execute format('create policy "team manages %s" on public.%I for all to authenticated using (true) with check (true)', t, t);
  end loop;
end $$;

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
