-- Handyman app: database setup
--
-- How to use: in Supabase, open "SQL Editor", click "New query",
-- paste this whole file in, and press "Run". It is safe to run more than once,
-- so after an app update that changes this file, just run it again.
--
-- How the data is organised:
--   * Every login belongs to one COMPANY. A company sees only its own jobs,
--     prices, parts, time and invoices.
--   * Signing up creates a new company, unless the email was invited by a
--     company owner, in which case the person joins that company.
--   * A company can share a job with another company. The other company
--     then sees only that job's punch list and photos (never prices, parts,
--     time or invoices).

-- ---------------------------------------------------------------
-- Companies (the business profile shown on estimates and invoices)
-- ---------------------------------------------------------------
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  email text not null default '',
  phone text not null default '',
  address text not null default '',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- People who can log in (one row per login, created automatically)
-- role: 'owner' runs the company (prices, profile, team); 'member' works jobs
-- ---------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  created_at timestamptz not null default now()
);
alter table public.profiles add column if not exists company_id uuid references public.companies (id) on delete set null;
alter table public.profiles add column if not exists role text not null default 'owner';
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('owner', 'member'));
create index if not exists profiles_company_id_idx on public.profiles (company_id);

-- ---------------------------------------------------------------
-- Prices, one row per company (id = the company id):
-- markup, first-hour and hourly rates, how labour is charged
-- ---------------------------------------------------------------
create table if not exists public.settings (
  id text primary key,
  business_name text not null default '',
  business_phone text not null default '',
  business_email text not null default '',
  business_address text not null default '',
  markup_percent numeric not null default 20,
  hourly_rate numeric not null default 75,
  markup_labour boolean not null default true,
  labour_mode text not null default 'task' check (labour_mode in ('task', 'visit'))
);
alter table public.settings add column if not exists first_hour_rate numeric;
alter table public.settings add column if not exists markup_parts boolean not null default true;
-- Earlier versions: one shared row called 'main', then one row per person
alter table public.settings drop constraint if exists settings_id_check;
alter table public.settings alter column id drop default;

-- ---------------------------------------------------------------
-- Team invitations: when this email signs up, it joins the company
-- ---------------------------------------------------------------
create table if not exists public.company_invites (
  email text primary key,
  company_id uuid not null references public.companies (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- New sign-ups: join the company that invited them, or start a new one
-- ---------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  invite public.company_invites;
  company uuid;
  person_role text := 'owner';
begin
  select * into invite from public.company_invites where email = lower(new.email);
  if found then
    company := invite.company_id;
    person_role := 'member';
    delete from public.company_invites where email = invite.email;
  else
    company := new.id;
    insert into public.companies (id, name, email)
    values (
      company,
      coalesce(nullif(trim(new.raw_user_meta_data ->> 'company_name'), ''), split_part(new.email, '@', 1)),
      coalesce(new.email, '')
    )
    on conflict (id) do nothing;
    insert into public.settings (id) values (company::text) on conflict (id) do nothing;
  end if;

  insert into public.profiles (id, full_name, company_id, role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    company,
    person_role
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Upgrading: profiles for anyone added before this script ran
insert into public.profiles (id, full_name)
select id, split_part(email, '@', 1) from auth.users
on conflict (id) do nothing;

-- Upgrading from the 'main' settings row: give each person a copy
insert into public.settings (id, business_name, business_phone, business_email, business_address,
                             markup_percent, hourly_rate, markup_labour, labour_mode)
select p.id::text, s.business_name, s.business_phone, s.business_email, s.business_address,
       s.markup_percent, s.hourly_rate, s.markup_labour, s.labour_mode
from public.profiles p cross join public.settings s
where s.id = 'main' and p.company_id is null
on conflict (id) do nothing;

-- Upgrading from "one person = one business": each existing person becomes
-- the owner of their own company, keeping their business details and prices
insert into public.companies (id, name, email, phone, address)
select p.id,
       coalesce(nullif(s.business_name, ''), nullif(p.full_name, ''), split_part(u.email, '@', 1)),
       coalesce(nullif(s.business_email, ''), u.email, ''),
       coalesce(s.business_phone, ''),
       coalesce(s.business_address, '')
from public.profiles p
join auth.users u on u.id = p.id
left join public.settings s on s.id = p.id::text
where p.company_id is null
on conflict (id) do nothing;
update public.profiles set company_id = id, role = 'owner' where company_id is null;
insert into public.settings (id) select id::text from public.companies on conflict (id) do nothing;

-- ---------------------------------------------------------------
-- Jobs (belong to a company)
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
-- Each job can turn the markup on materials on or off (empty = use the company's setting)
alter table public.jobs add column if not exists markup_parts boolean;
alter table public.jobs add column if not exists company_id uuid references public.companies (id) on delete cascade;
create index if not exists jobs_company_id_idx on public.jobs (company_id);
-- Earlier versions protected per-person sharing with a trigger; it would block
-- the upgrade steps below, so remove it first
drop trigger if exists protect_job_sharing on public.jobs;
drop function if exists public.protect_job_sharing();
-- Upgrading: jobs without an owner go to the first person who signed up,
-- and every job belongs to its creator's company
update public.jobs set created_by = (select id from auth.users order by created_at limit 1) where created_by is null;
update public.jobs j set company_id = p.company_id
from public.profiles p
where j.company_id is null and p.id = j.created_by;

-- ---------------------------------------------------------------
-- Jobs shared with another company (punch list and photos only)
-- ---------------------------------------------------------------
create table if not exists public.job_shares (
  job_id uuid not null references public.jobs (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (job_id, company_id)
);
create index if not exists job_shares_company_id_idx on public.job_shares (company_id);
-- Upgrading: earlier versions shared jobs with people; share with their company instead
insert into public.job_shares (job_id, company_id)
select j.id, p.company_id
from public.jobs j
cross join lateral jsonb_array_elements_text(j.assigned) as a(person)
join public.profiles p on a.person ~ '^[0-9a-f-]{36}$' and p.id = a.person::uuid
where p.company_id is distinct from j.company_id and p.company_id is not null
on conflict do nothing;
update public.jobs set assigned = '[]'::jsonb where assigned <> '[]'::jsonb;

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
-- Security helpers
-- ---------------------------------------------------------------
create or replace function public.my_company()
returns uuid
language sql stable security definer set search_path = public
as $$
  select company_id from public.profiles where id = auth.uid()
$$;

create or replace function public.i_am_owner()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'owner')
$$;

-- A job of my own company: everything (prices, parts, time, invoices)
create or replace function public.is_my_job(j uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.jobs where id = j and company_id = public.my_company())
$$;

-- A job another company shared with mine: punch list and photos only
create or replace function public.is_shared_with_me(j uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.job_shares where job_id = j and company_id = public.my_company())
$$;

-- Punch list and photos: my company's jobs and jobs shared with me
create or replace function public.can_access_job(j uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_my_job(j) or public.is_shared_with_me(j)
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

-- Companies I share a job with, in either direction (to show their name)
create or replace function public.knows_company(c uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.job_shares s join public.jobs j on j.id = s.job_id
    where (s.company_id = c and j.company_id = public.my_company())
       or (j.company_id = c and s.company_id = public.my_company())
  )
$$;

-- Share one of my company's jobs with the company of the person who uses this email
create or replace function public.share_job(job uuid, with_email text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  target uuid;
  target_name text;
begin
  if not public.is_my_job(job) then
    raise exception 'You can only share your own company''s jobs.';
  end if;
  select p.company_id into target
  from auth.users u join public.profiles p on p.id = u.id
  where lower(u.email) = lower(trim(with_email));
  if target is null then
    raise exception 'No one has signed up with %. Ask them to sign up first.', trim(with_email);
  end if;
  if target = public.my_company() then
    raise exception 'That person is already in your company, so they can already see this job.';
  end if;
  insert into public.job_shares (job_id, company_id) values (job, target) on conflict do nothing;
  select name into target_name from public.companies where id = target;
  return target_name;
end;
$$;

-- Invite someone to join my company (owners only)
create or replace function public.invite_member(invite_email text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  clean text := lower(trim(invite_email));
begin
  if not public.i_am_owner() then
    raise exception 'Only the company owner can invite people.';
  end if;
  if clean !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'That doesn''t look like an email address.';
  end if;
  if exists (select 1 from auth.users where lower(email) = clean) then
    raise exception '% already has an account. Invites only work for people who haven''t signed up yet.', clean;
  end if;
  if exists (select 1 from public.company_invites where email = clean and company_id <> public.my_company()) then
    raise exception '% has already been invited by another company.', clean;
  end if;
  insert into public.company_invites (email, company_id) values (clean, public.my_company())
  on conflict (email) do nothing;
end;
$$;

-- ---------------------------------------------------------------
-- Security rules. The database itself enforces these, so nobody can see
-- another company's data, whatever app or tool they use.
-- ---------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['companies', 'profiles', 'settings', 'company_invites', 'jobs', 'job_shares',
                           'punch_items', 'photos', 'parts', 'bring_checks', 'time_entries', 'invoices']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
  -- Remove rules from earlier versions
  foreach t in array array['settings', 'jobs', 'punch_items', 'photos', 'parts', 'bring_checks', 'time_entries', 'invoices']
  loop
    execute format('drop policy if exists "team manages %s" on public.%I', t, t);
    execute format('drop policy if exists "follows its job" on public.%I', t);
  end loop;
end $$;
drop policy if exists "team reads profiles" on public.profiles;
drop policy if exists "edit own profile" on public.profiles;
drop policy if exists "read settings" on public.settings;
drop policy if exists "add own settings" on public.settings;
drop policy if exists "change own settings" on public.settings;
drop policy if exists "see own and shared jobs" on public.jobs;
drop policy if exists "create own jobs" on public.jobs;
drop policy if exists "edit own and shared jobs" on public.jobs;
drop policy if exists "owner deletes jobs" on public.jobs;
drop policy if exists "follows its item" on public.photos;
drop policy if exists "see time on my jobs" on public.time_entries;
drop policy if exists "log own time" on public.time_entries;
drop policy if exists "fix time on my jobs" on public.time_entries;
drop policy if exists "delete time on my jobs" on public.time_entries;

-- Companies: see your own, and the name of companies you share jobs with;
-- only the owner edits the business profile
drop policy if exists "see own and partner companies" on public.companies;
create policy "see own and partner companies" on public.companies for select to authenticated
  using (id = public.my_company() or public.knows_company(id));
drop policy if exists "owner edits company" on public.companies;
create policy "owner edits company" on public.companies for update to authenticated
  using (id = public.my_company() and public.i_am_owner())
  with check (id = public.my_company() and public.i_am_owner());

-- People: see the people in your company; change only your own name
drop policy if exists "see my company's people" on public.profiles;
create policy "see my company's people" on public.profiles for select to authenticated
  using (id = auth.uid() or company_id = public.my_company());
drop policy if exists "edit own name" on public.profiles;
create policy "edit own name" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
-- Nobody can move themselves into another company or make themselves owner
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (full_name) on public.profiles to authenticated;

-- Prices: your company only; only the owner changes them
drop policy if exists "see my company's prices" on public.settings;
create policy "see my company's prices" on public.settings for select to authenticated
  using (id = public.my_company()::text);
drop policy if exists "owner adds prices" on public.settings;
create policy "owner adds prices" on public.settings for insert to authenticated
  with check (id = public.my_company()::text and public.i_am_owner());
drop policy if exists "owner changes prices" on public.settings;
create policy "owner changes prices" on public.settings for update to authenticated
  using (id = public.my_company()::text and public.i_am_owner())
  with check (id = public.my_company()::text and public.i_am_owner());

-- Invitations: the owner sees and cancels them (new ones go through invite_member)
drop policy if exists "owner sees invites" on public.company_invites;
create policy "owner sees invites" on public.company_invites for select to authenticated
  using (company_id = public.my_company() and public.i_am_owner());
drop policy if exists "owner cancels invites" on public.company_invites;
create policy "owner cancels invites" on public.company_invites for delete to authenticated
  using (company_id = public.my_company() and public.i_am_owner());

-- Jobs: your company's jobs, plus the basic details of jobs shared with you
drop policy if exists "see my company's and shared jobs" on public.jobs;
create policy "see my company's and shared jobs" on public.jobs for select to authenticated
  using (company_id = public.my_company() or public.is_shared_with_me(id));
drop policy if exists "add my company's jobs" on public.jobs;
create policy "add my company's jobs" on public.jobs for insert to authenticated
  with check (company_id = public.my_company());
drop policy if exists "edit my company's jobs" on public.jobs;
create policy "edit my company's jobs" on public.jobs for update to authenticated
  using (company_id = public.my_company()) with check (company_id = public.my_company());
drop policy if exists "delete my company's jobs" on public.jobs;
create policy "delete my company's jobs" on public.jobs for delete to authenticated
  using (company_id = public.my_company());

-- Shares: the job's company and the company it's shared with can see them;
-- either can remove them; new ones go through share_job
drop policy if exists "see shares" on public.job_shares;
create policy "see shares" on public.job_shares for select to authenticated
  using (company_id = public.my_company() or public.is_my_job(job_id));
drop policy if exists "remove shares" on public.job_shares;
create policy "remove shares" on public.job_shares for delete to authenticated
  using (company_id = public.my_company() or public.is_my_job(job_id));

-- Punch list and photos: your company's jobs and jobs shared with you
drop policy if exists "punch list of my and shared jobs" on public.punch_items;
create policy "punch list of my and shared jobs" on public.punch_items for all to authenticated
  using (public.can_access_job(job_id)) with check (public.can_access_job(job_id));
drop policy if exists "photos of my and shared jobs" on public.photos;
create policy "photos of my and shared jobs" on public.photos for all to authenticated
  using (public.can_access_item(item_id)) with check (public.can_access_item(item_id));

-- Parts, bring list and invoices: your company's jobs only
do $$
declare t text;
begin
  foreach t in array array['parts', 'bring_checks', 'invoices']
  loop
    execute format('drop policy if exists "my company''s jobs only" on public.%I', t);
    execute format('create policy "my company''s jobs only" on public.%I for all to authenticated
      using (public.is_my_job(job_id)) with check (public.is_my_job(job_id))', t);
  end loop;
end $$;

-- Time: your company's jobs only; you only log time as yourself
drop policy if exists "see my company's time" on public.time_entries;
create policy "see my company's time" on public.time_entries for select to authenticated
  using (public.is_my_job(job_id));
drop policy if exists "log own time" on public.time_entries;
create policy "log own time" on public.time_entries for insert to authenticated
  with check (user_id = auth.uid() and public.is_my_job(job_id));
drop policy if exists "fix my company's time" on public.time_entries;
create policy "fix my company's time" on public.time_entries for update to authenticated
  using (public.is_my_job(job_id)) with check (public.is_my_job(job_id));
drop policy if exists "delete my company's time" on public.time_entries;
create policy "delete my company's time" on public.time_entries for delete to authenticated
  using (public.is_my_job(job_id));

-- ---------------------------------------------------------------
-- Photo storage bucket (private: photos are only shown to logged-in users
-- who can see the job)
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
