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
-- Business settings, one row per person (id = their login id):
-- markup, hourly rate, and the details printed on their invoices
-- ---------------------------------------------------------------
create table if not exists public.settings (
  id text primary key default auth.uid()::text,
  business_name text not null default '',
  business_phone text not null default '',
  business_email text not null default '',
  business_address text not null default '',
  markup_percent numeric not null default 20,
  hourly_rate numeric not null default 75,
  markup_labour boolean not null default true,
  labour_mode text not null default 'task' check (labour_mode in ('task', 'visit'))
);
-- Earlier versions had one shared row called 'main'
alter table public.settings drop constraint if exists settings_id_check;
alter table public.settings alter column id set default auth.uid()::text;
insert into public.settings (id, business_name, business_phone, business_email, business_address,
                             markup_percent, hourly_rate, markup_labour, labour_mode)
select p.id::text, s.business_name, s.business_phone, s.business_email, s.business_address,
       s.markup_percent, s.hourly_rate, s.markup_labour, s.labour_mode
from public.profiles p cross join public.settings s
where s.id = 'main'
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
alter table public.jobs add column if not exists assigned jsonb not null default '[]'::jsonb;
alter table public.jobs add column if not exists bring_extras jsonb not null default '[]'::jsonb;
-- created_by is the job's owner. assigned lists the people it is shared with.
-- Jobs made before ownership existed go to the first person who signed up.
update public.jobs set created_by = (select id from auth.users order by created_at limit 1) where created_by is null;

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
-- Security: every job is private to the person who created it,
-- unless they share it. Sharing gives full access to that job
-- (items, photos, parts, time, bill). The database itself enforces
-- this, so nobody can see a job that isn't theirs or shared with them.
-- ---------------------------------------------------------------
create or replace function public.can_access_job(j uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.jobs
    where id = j and (created_by = auth.uid() or assigned ? auth.uid()::text)
  )
$$;

create or replace function public.can_access_item(i uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.punch_items p where p.id = i and public.can_access_job(p.job_id))
$$;

-- Photo files are stored as "<item id>/<file>"
create or replace function public.can_access_photo_file(path text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select case
    when split_part(path, '/', 1) ~ '^[0-9a-f-]{36}$' then public.can_access_item(split_part(path, '/', 1)::uuid)
    else false
  end
$$;

-- Only the owner can change who a job is shared with, or hand it to someone else
create or replace function public.protect_job_sharing()
returns trigger
language plpgsql
as $$
begin
  if old.created_by is not null and new.created_by is distinct from old.created_by then
    raise exception 'Only the owner can change who owns a job';
  end if;
  if new.assigned is distinct from old.assigned and old.created_by is distinct from auth.uid() then
    raise exception 'Only the person who created this job can change who it is shared with';
  end if;
  return new;
end;
$$;
drop trigger if exists protect_job_sharing on public.jobs;
create trigger protect_job_sharing before update on public.jobs
  for each row execute function public.protect_job_sharing();

alter table public.profiles enable row level security;
drop policy if exists "team reads profiles" on public.profiles;
create policy "team reads profiles" on public.profiles
  for select to authenticated using (true);
drop policy if exists "edit own profile" on public.profiles;
create policy "edit own profile" on public.profiles
  for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Remove the old "everyone sees everything" rules from earlier versions
do $$
declare t text;
begin
  foreach t in array array['settings', 'jobs', 'punch_items', 'photos', 'parts', 'bring_checks', 'time_entries', 'invoices']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "team manages %s" on public.%I', t, t);
  end loop;
end $$;

-- Settings: anyone logged in can read them (so a shared job's bill uses its
-- owner's rates and business name); you can only change your own.
drop policy if exists "read settings" on public.settings;
create policy "read settings" on public.settings for select to authenticated using (true);
drop policy if exists "add own settings" on public.settings;
create policy "add own settings" on public.settings for insert to authenticated with check (id = auth.uid()::text);
drop policy if exists "change own settings" on public.settings;
create policy "change own settings" on public.settings for update to authenticated
  using (id = auth.uid()::text) with check (id = auth.uid()::text);

-- Jobs: see and edit your own and ones shared with you; only the owner deletes
drop policy if exists "see own and shared jobs" on public.jobs;
create policy "see own and shared jobs" on public.jobs for select to authenticated
  using (created_by = auth.uid() or assigned ? auth.uid()::text);
drop policy if exists "create own jobs" on public.jobs;
create policy "create own jobs" on public.jobs for insert to authenticated
  with check (created_by = auth.uid());
drop policy if exists "edit own and shared jobs" on public.jobs;
create policy "edit own and shared jobs" on public.jobs for update to authenticated
  using (created_by = auth.uid() or assigned ? auth.uid()::text)
  with check (created_by = auth.uid() or assigned ? auth.uid()::text);
drop policy if exists "owner deletes jobs" on public.jobs;
create policy "owner deletes jobs" on public.jobs for delete to authenticated
  using (created_by = auth.uid());

-- Everything inside a job follows the job
do $$
declare t text;
begin
  foreach t in array array['punch_items', 'parts', 'bring_checks', 'invoices']
  loop
    execute format('drop policy if exists "follows its job" on public.%I', t);
    execute format('create policy "follows its job" on public.%I for all to authenticated
      using (public.can_access_job(job_id)) with check (public.can_access_job(job_id))', t);
  end loop;
end $$;

drop policy if exists "follows its item" on public.photos;
create policy "follows its item" on public.photos for all to authenticated
  using (public.can_access_item(item_id)) with check (public.can_access_item(item_id));

-- Time: see everyone's time on jobs you can access; only log time as yourself
drop policy if exists "follows its job" on public.time_entries;
drop policy if exists "see time on my jobs" on public.time_entries;
create policy "see time on my jobs" on public.time_entries for select to authenticated
  using (public.can_access_job(job_id));
drop policy if exists "log own time" on public.time_entries;
create policy "log own time" on public.time_entries for insert to authenticated
  with check (user_id = auth.uid() and public.can_access_job(job_id));
drop policy if exists "fix time on my jobs" on public.time_entries;
create policy "fix time on my jobs" on public.time_entries for update to authenticated
  using (public.can_access_job(job_id)) with check (public.can_access_job(job_id));
drop policy if exists "delete time on my jobs" on public.time_entries;
create policy "delete time on my jobs" on public.time_entries for delete to authenticated
  using (public.can_access_job(job_id));

-- ---------------------------------------------------------------
-- Photo storage bucket (private: photos are only shown to logged-in users)
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

drop policy if exists "team reads photo files" on storage.objects;
drop policy if exists "team uploads photo files" on storage.objects;
drop policy if exists "team deletes photo files" on storage.objects;
drop policy if exists "read photos of my jobs" on storage.objects;
create policy "read photos of my jobs" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and public.can_access_photo_file(name));
drop policy if exists "add photos to my jobs" on storage.objects;
create policy "add photos to my jobs" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and public.can_access_photo_file(name));
drop policy if exists "delete photos of my jobs" on storage.objects;
create policy "delete photos of my jobs" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and public.can_access_photo_file(name));
