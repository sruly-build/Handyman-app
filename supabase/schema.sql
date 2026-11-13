-- Handyman app: database setup
--
-- How to use: in Supabase, open "SQL Editor", click "New query",
-- paste this whole file in, and press "Run". It is safe to run more than once,
-- so after an app update that changes this file, just run it again.
--
-- How the data is organised:
--   * Every login belongs to one COMPANY. A company sees only its own jobs,
--     prices, parts, time and invoices.
--   * Sign-up is by approval only, and only the app's admin (super admin) can
--     approve: an email either starts a new company or joins an existing one.
--     Nobody else can approve anyone, and anyone not approved is turned away
--     by the database. Approved people choose their own password.
--   * A company can share a job with another company. The other company
--     sees that job's punch list and photos, plus (if chosen) the parts to
--     buy, the bring list and time. Never prices, estimates, invoices or
--     payments.
--   * Leads and the schedule belong to the company, like jobs: no other
--     company sees them.
--   * Sales & Leads (prospects, calls, follow-ups, properties) belongs to the
--     company, so all its partners see every lead. Customers converted from
--     sales are shared with the company too.
--   * Each person's directory (clients and vendors) is private to them,
--     unless they share it with specific people, who can then only look.

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
alter table public.profiles add constraint profiles_role_check check (role in ('owner', 'member', 'landlord'));
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
-- Approved sign-ups (made only by the app's admin). Only these emails can
-- create an account.
--   company_id set:   joins that company as a team member
--   company_id empty: starts a new company as its owner
-- ---------------------------------------------------------------
create table if not exists public.company_invites (
  email text primary key,
  company_id uuid references public.companies (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.company_invites alter column company_id drop not null;

-- The app's admin (super admin): the only one who can approve sign-ups
create table if not exists public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);
-- Upgrading: the first person who ever signed up becomes the admin
insert into public.app_admins (user_id)
select id from auth.users
where not exists (select 1 from public.app_admins)
order by created_at
limit 1;

-- ---------------------------------------------------------------
-- Turn away sign-ups that weren't approved. (On a brand-new app with no
-- admin yet, the very first sign-up is allowed and becomes the admin.)
-- ---------------------------------------------------------------
create or replace function public.check_signup_allowed()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if exists (select 1 from public.app_admins)
     and not exists (select 1 from public.company_invites where email = lower(new.email))
     and not (coalesce(new.raw_user_meta_data ->> 'account_type', '') = 'landlord'
              and exists (select 1 from public.service_settings
                          where public_slug = lower(coalesce(new.raw_user_meta_data ->> 'company_slug', '')))) then
    raise exception 'This email has not been approved to sign up.';
  end if;
  return new;
end;
$$;

drop trigger if exists before_auth_user_created on auth.users;
create trigger before_auth_user_created
  before insert on auth.users
  for each row execute function public.check_signup_allowed();

-- ---------------------------------------------------------------
-- New sign-ups: join the team that approved them, or start a new company
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
  person_name text := coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1));
  lid uuid;
begin
  select * into invite from public.company_invites where email = lower(new.email);

  -- A landlord signing up from a company's request page
  if invite.email is null and coalesce(new.raw_user_meta_data ->> 'account_type', '') = 'landlord'
     and exists (select 1 from public.app_admins) then
    select company_id into company from public.service_settings
    where public_slug = lower(coalesce(new.raw_user_meta_data ->> 'company_slug', ''));
    insert into public.profiles (id, full_name, company_id, role) values (new.id, person_name, null, 'landlord')
    on conflict (id) do nothing;
    -- Already on file as a landlord (added by the owner)? Link the login to it
    update public.landlords set user_id = new.id
    where id = (select id from public.landlords where company_id = company and user_id is null
                and lower(email) = lower(new.email) limit 1)
    returning id into lid;
    if lid is null then
      insert into public.landlords (company_id, user_id, name, email, phone, referred_by)
      values (company, new.id, person_name, lower(new.email), left(coalesce(new.raw_user_meta_data ->> 'phone', ''), 30),
              (select id from public.landlords where company_id = company
               and referral_code = coalesce(new.raw_user_meta_data ->> 'referral', '') limit 1));
    end if;
    return new;
  end if;

  -- The approval is used up either way
  delete from public.company_invites where email = lower(new.email);
  if invite.company_id is not null then
    company := invite.company_id;
    person_role := 'member';
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
    insert into public.service_settings (company_id, public_slug)
    values (company, 'co-' || left(replace(company::text, '-', ''), 10))
    on conflict (company_id) do nothing;
  end if;

  insert into public.profiles (id, full_name, company_id, role)
  values (new.id, person_name, company, person_role)
  on conflict (id) do nothing;

  -- A brand-new app's first sign-up becomes its admin
  if not exists (select 1 from public.app_admins) then
    insert into public.app_admins (user_id) values (new.id);
  end if;
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
where s.id = 'main' and p.company_id is null and p.role <> 'landlord'
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
where p.company_id is null and p.role <> 'landlord'
on conflict (id) do nothing;
update public.profiles set company_id = id, role = 'owner' where company_id is null and role <> 'landlord';
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
-- Leads: a job that isn't confirmed yet. Converting a lead just turns it into
-- a job, so the walkthrough's punch list, photos and measurements stay with it.
alter table public.jobs add column if not exists stage text not null default 'job';
alter table public.jobs drop constraint if exists jobs_stage_check;
alter table public.jobs add constraint jobs_stage_check check (stage in ('lead', 'job'));
alter table public.jobs add column if not exists lead_status text;
alter table public.jobs drop constraint if exists jobs_lead_status_check;
alter table public.jobs add constraint jobs_lead_status_check
  check (lead_status in ('new', 'walkthrough_booked', 'estimate_sent', 'won', 'lost'));
-- When the walkthrough is booked (date and time)
alter table public.jobs add column if not exists walkthrough_at timestamptz;
-- When a lead was won or lost
alter table public.jobs add column if not exists lead_closed_at timestamptz;
-- A job's start time on its date (optional), for the schedule
alter table public.jobs add column if not exists job_time time;
create index if not exists jobs_stage_idx on public.jobs (company_id, stage);
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
-- What else the other company sees, besides the punch list and photos.
-- Prices, estimates, invoices and payments are never shared.
alter table public.job_shares add column if not exists share_parts boolean not null default false;
alter table public.job_shares add column if not exists share_bring boolean not null default false;
alter table public.job_shares add column if not exists share_time boolean not null default false;
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
-- A part the vendor orders themselves (stays off my orders list and my bill)
alter table public.parts add column if not exists vendor_orders boolean not null default false;

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
-- Extra charges on a job: line items typed in by hand (trip charge,
-- disposal fee, add-ons). Billed at the price entered, no markup.
-- ---------------------------------------------------------------
create table if not exists public.job_charges (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  description text not null,
  quantity numeric not null default 1,
  unit_price numeric(10, 2) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists job_charges_job_id_idx on public.job_charges (job_id);

-- ---------------------------------------------------------------
-- Payments received for a job: deposits and partial payments
-- ---------------------------------------------------------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  amount numeric(10, 2) not null check (amount > 0),
  paid_on date not null default current_date,
  method text not null default 'cash' check (method in ('cash', 'check', 'card', 'transfer', 'other')),
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists payments_job_id_idx on public.payments (job_id);

-- ---------------------------------------------------------------
-- A company's saved price list, to add common charges quickly
-- ---------------------------------------------------------------
create table if not exists public.price_list (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  price numeric(10, 2) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists price_list_company_id_idx on public.price_list (company_id);


-- ---------------------------------------------------------------
-- Directory: each person's own contacts (vendors, subs, suppliers), private
-- to them unless they share their directory with specific people
-- ---------------------------------------------------------------
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name text not null default '',
  business text not null default '',
  categories text[] not null default '{}',
  phone text not null default '',
  email text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists contacts_owner_id_idx on public.contacts (owner_id);
-- Two parts: clients (customers) and vendors (subs, suppliers…)
alter table public.contacts add column if not exists kind text not null default 'vendor';
alter table public.contacts drop constraint if exists contacts_kind_check;
alter table public.contacts add constraint contacts_kind_check check (kind in ('client', 'vendor'));
alter table public.contacts add column if not exists address text not null default '';

-- Whose directory each person may see (read only)
create table if not exists public.directory_shares (
  owner_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  viewer_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, viewer_id)
);
create index if not exists directory_shares_viewer_id_idx on public.directory_shares (viewer_id);

-- ---------------------------------------------------------------
-- A punch list item given to a vendor (or anyone else). Kept apart from the
-- item itself so a company a job is shared with never sees vendors or prices.
--   price: what the vendor charges me for the labour (never on the client's invoice)
--   paid_by 'me': billed to the client in place of my hourly labour (plus my
--     markup if markup is on); 'client': the client pays the vendor directly
-- ---------------------------------------------------------------
create table if not exists public.item_assignments (
  id uuid primary key references public.punch_items (id) on delete cascade, -- the item's id
  job_id uuid not null references public.jobs (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  name text not null,
  price numeric(10, 2),
  materials_by text not null default 'me' check (materials_by in ('me', 'vendor')),
  paid_by text not null default 'me' check (paid_by in ('me', 'client')),
  markup boolean not null default false,
  vendor_paid boolean not null default false,
  vendor_paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists item_assignments_job_id_idx on public.item_assignments (job_id);
create index if not exists item_assignments_contact_id_idx on public.item_assignments (contact_id);

-- Each job's client (in the directory of whoever made the job)
alter table public.jobs add column if not exists client_id uuid references public.contacts (id) on delete set null;
create index if not exists jobs_client_id_idx on public.jobs (client_id);

-- One-time upgrade steps (run once, never again, so a client you delete stays deleted)
create table if not exists public.app_migrations (
  name text primary key,
  ran_at timestamptz not null default now()
);
alter table public.app_migrations enable row level security;

do $$
begin
  if not exists (select 1 from public.app_migrations where name = 'clients_from_jobs') then
    -- Every customer on an existing job becomes a client of the person who made the job
    insert into public.contacts (owner_id, kind, name, phone, email, address)
    select distinct on (j.created_by, lower(trim(j.customer_name)))
           j.created_by, 'client', trim(j.customer_name), j.customer_phone, j.customer_email, j.address
    from public.jobs j
    where j.client_id is null and j.created_by is not null and trim(j.customer_name) <> ''
      and not exists (
        select 1 from public.contacts c
        where c.owner_id = j.created_by and c.kind = 'client' and lower(c.name) = lower(trim(j.customer_name))
      )
    -- the job with the most details (phone, address, email) wins, then the newest
    order by j.created_by, lower(trim(j.customer_name)),
             (j.customer_phone <> '')::int + (j.address <> '')::int + (j.customer_email <> '')::int desc,
             j.created_at desc;
    update public.jobs j set client_id = (
      select c.id from public.contacts c
      where c.owner_id = j.created_by and c.kind = 'client' and lower(c.name) = lower(trim(j.customer_name))
      order by c.created_at limit 1
    )
    where j.client_id is null and j.created_by is not null and trim(j.customer_name) <> '';
    insert into public.app_migrations (name) values ('clients_from_jobs');
  end if;
end $$;

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

-- A job shared with my company, including this extra part ('parts', 'bring' or 'time')
create or replace function public.shared_with_me_for(j uuid, what text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.job_shares
    where job_id = j and company_id = public.my_company()
      and case what when 'parts' then share_parts when 'bring' then share_bring when 'time' then share_time else false end
  )
$$;

-- Share one of my company's jobs with the company of the person who uses this email,
-- choosing what else they see. Sharing again just changes the choices.
drop function if exists public.share_job(uuid, text);
create or replace function public.share_job(job uuid, with_email text, parts boolean default false,
                                            bring boolean default false, hours boolean default false)
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
  insert into public.job_shares (job_id, company_id, share_parts, share_bring, share_time)
  values (job, target, parts, bring, hours)
  on conflict (job_id, company_id) do update
    set share_parts = excluded.share_parts, share_bring = excluded.share_bring, share_time = excluded.share_time;
  select name into target_name from public.companies where id = target;
  return target_name;
end;
$$;

-- Change what a company I shared a job with can see
create or replace function public.set_job_share(job uuid, company uuid, parts boolean, bring boolean, hours boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_my_job(job) then
    raise exception 'You can only change sharing on your own company''s jobs.';
  end if;
  update public.job_shares set share_parts = parts, share_bring = bring, share_time = hours
  where job_id = job and company_id = company;
end;
$$;

-- Parts on a job shared with me: what to buy, never what it cost
create or replace function public.shared_parts(job uuid)
returns table (id uuid, job_id uuid, item_id uuid, name text, quantity numeric, supplier text, status text,
               created_at timestamptz, ordered_at timestamptz, received_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select p.id, p.job_id, p.item_id, p.name, p.quantity, p.supplier, p.status, p.created_at, p.ordered_at, p.received_at
  from public.parts p
  where p.job_id = job and public.shared_with_me_for(job, 'parts')
$$;

-- Add a part to a job shared with me (no cost: only the job's company sets prices)
create or replace function public.add_shared_part(job uuid, item uuid, part_name text, qty numeric, part_supplier text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  new_id uuid;
begin
  if not public.shared_with_me_for(job, 'parts') then
    raise exception 'Parts on this job aren''t shared with you.';
  end if;
  if item is not null and not exists (select 1 from public.punch_items where id = item and job_id = job) then
    raise exception 'That item isn''t on this job.';
  end if;
  insert into public.parts (job_id, item_id, name, quantity, supplier)
  values (job, item, trim(part_name), greatest(coalesce(qty, 1), 0.01), coalesce(trim(part_supplier), ''))
  returning id into new_id;
  return new_id;
end;
$$;

-- Mark a part on a job shared with me as needed, ordered or received
create or replace function public.set_shared_part_status(part uuid, new_status text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  j uuid;
begin
  select job_id into j from public.parts where id = part;
  if j is null or not public.shared_with_me_for(j, 'parts') then
    raise exception 'Parts on this job aren''t shared with you.';
  end if;
  update public.parts
  set status = new_status,
      ordered_at = case when new_status = 'needed' then null else coalesce(ordered_at, now()) end,
      received_at = case when new_status = 'received' then coalesce(received_at, now()) else null end
  where id = part;
end;
$$;

-- Directory: has this person shared their directory with me?
create or replace function public.directory_shared_with_me(owner uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.directory_shares where owner_id = owner and viewer_id = auth.uid())
$$;

-- Let the person who logs in with this email see my directory (read only)
create or replace function public.share_directory(with_email text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  target uuid;
  target_name text;
begin
  if auth.uid() is null then
    raise exception 'Please log in first.';
  end if;
  select u.id, coalesce(nullif(p.full_name, ''), u.email) into target, target_name
  from auth.users u left join public.profiles p on p.id = u.id
  where lower(u.email) = lower(trim(with_email));
  if target is null then
    raise exception 'No one has signed up with %. Ask them to sign up first.', trim(with_email);
  end if;
  if target = auth.uid() then
    raise exception 'That''s you.';
  end if;
  insert into public.directory_shares (owner_id, viewer_id) values (auth.uid(), target) on conflict do nothing;
  return target_name;
end;
$$;

-- The people I share my directory with
create or replace function public.my_directory_shares()
returns table (viewer_id uuid, name text, email text)
language sql stable security definer set search_path = public
as $$
  select d.viewer_id, coalesce(nullif(p.full_name, ''), u.email), u.email
  from public.directory_shares d
  join auth.users u on u.id = d.viewer_id
  left join public.profiles p on p.id = d.viewer_id
  where d.owner_id = auth.uid()
  order by 2
$$;

-- The people who share their directory with me
create or replace function public.directories_shared_with_me()
returns table (owner_id uuid, name text)
language sql stable security definer set search_path = public
as $$
  select d.owner_id, coalesce(nullif(p.full_name, ''), u.email)
  from public.directory_shares d
  join auth.users u on u.id = d.owner_id
  left join public.profiles p on p.id = d.owner_id
  where d.viewer_id = auth.uid()
  order by 2
$$;

-- Earlier versions let company owners invite their own team; now only the
-- app's admin approves anyone (see approve_signup)
drop function if exists public.invite_member(text);

create or replace function public.i_am_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid())
$$;

-- Approve someone to sign up (the app's admin only). Leave join_company empty
-- to let them start a new company, or pick a company for them to join.
drop function if exists public.approve_signup(text);
create or replace function public.approve_signup(approve_email text, join_company uuid default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  clean text := lower(trim(approve_email));
begin
  if not public.i_am_admin() then
    raise exception 'Only the app''s admin can approve people.';
  end if;
  if clean !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'That doesn''t look like an email address.';
  end if;
  if exists (select 1 from auth.users where lower(email) = clean) then
    raise exception '% already has an account.', clean;
  end if;
  if join_company is not null and not exists (select 1 from public.companies where id = join_company) then
    raise exception 'That company doesn''t exist.';
  end if;
  -- Approving the same email again just changes where they go
  insert into public.company_invites (email, company_id) values (clean, join_company)
  on conflict (email) do update set company_id = excluded.company_id, created_at = now();
end;
$$;

-- Before signing up: is this email approved? Returns 'company' (start a new
-- company), 'team' (join the team that invited it), 'exists' (already has an
-- account) or 'none' (not approved). Anyone can ask, including before logging in.
create or replace function public.signup_status(check_email text)
returns text
language plpgsql stable security definer set search_path = public
as $$
declare
  clean text := lower(trim(check_email));
  invite public.company_invites;
begin
  if exists (select 1 from auth.users where lower(email) = clean) then
    return 'exists';
  end if;
  if not exists (select 1 from public.app_admins) then
    return 'company';
  end if;
  select * into invite from public.company_invites where email = clean;
  if not found then
    return 'none';
  end if;
  return case when invite.company_id is null then 'company' else 'team' end;
end;
$$;
grant execute on function public.signup_status(text) to anon, authenticated;

-- ---------------------------------------------------------------
-- Security rules. The database itself enforces these, so nobody can see
-- another company's data, whatever app or tool they use.
-- ---------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['companies', 'profiles', 'settings', 'company_invites', 'jobs', 'job_shares',
                           'punch_items', 'photos', 'parts', 'bring_checks', 'time_entries', 'invoices',
                           'job_charges', 'price_list', 'payments', 'contacts', 'directory_shares',
                           'item_assignments']
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
  using (id = public.my_company() or public.knows_company(id) or public.i_am_admin());
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

-- Approvals: only the app's admin sees and cancels them; new ones only go
-- through approve_signup
drop policy if exists "owner sees invites" on public.company_invites;
drop policy if exists "owner cancels invites" on public.company_invites;
drop policy if exists "admin sees approvals" on public.company_invites;
create policy "admin sees approvals" on public.company_invites for select to authenticated
  using (public.i_am_admin());
drop policy if exists "admin cancels approvals" on public.company_invites;
create policy "admin cancels approvals" on public.company_invites for delete to authenticated
  using (public.i_am_admin());

-- Admins: you can see whether you are one; nobody can make themselves one
alter table public.app_admins enable row level security;
drop policy if exists "see own admin row" on public.app_admins;
create policy "see own admin row" on public.app_admins for select to authenticated
  using (user_id = auth.uid());

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

-- Parts, extra charges, payments and invoices: your company's jobs only
-- (a company a job is shared with gets parts through shared_parts, without costs)
do $$
declare t text;
begin
  foreach t in array array['parts', 'invoices', 'job_charges', 'payments']
  loop
    execute format('drop policy if exists "my company''s jobs only" on public.%I', t);
    execute format('create policy "my company''s jobs only" on public.%I for all to authenticated
      using (public.is_my_job(job_id)) with check (public.is_my_job(job_id))', t);
  end loop;
end $$;

-- Vendors on items: my company's jobs only, and only for an item on that job
drop policy if exists "my company's item vendors" on public.item_assignments;
create policy "my company's item vendors" on public.item_assignments for all to authenticated
  using (public.is_my_job(job_id))
  with check (
    public.is_my_job(job_id)
    and exists (select 1 from public.punch_items p where p.id = item_assignments.id and p.job_id = item_assignments.job_id)
  );

-- Bring list ticks: each company ticks its own (each loads its own van), on its
-- own jobs and on jobs whose bring list is shared with it
alter table public.bring_checks add column if not exists company_id uuid references public.companies (id) on delete cascade;
update public.bring_checks b set company_id = j.company_id
from public.jobs j
where b.company_id is null and j.id = b.job_id;
alter table public.bring_checks alter column company_id set default public.my_company();
drop policy if exists "my company's jobs only" on public.bring_checks;
drop policy if exists "my company's bring ticks" on public.bring_checks;
create policy "my company's bring ticks" on public.bring_checks for all to authenticated
  using (company_id = public.my_company() and (public.is_my_job(job_id) or public.shared_with_me_for(job_id, 'bring')))
  with check (company_id = public.my_company() and (public.is_my_job(job_id) or public.shared_with_me_for(job_id, 'bring')));

-- Price list: everyone in the company uses it; only the owner changes it
drop policy if exists "see my company's price list" on public.price_list;
create policy "see my company's price list" on public.price_list for select to authenticated
  using (company_id = public.my_company());
drop policy if exists "owner manages price list" on public.price_list;
create policy "owner manages price list" on public.price_list for all to authenticated
  using (company_id = public.my_company() and public.i_am_owner())
  with check (company_id = public.my_company() and public.i_am_owner());

-- Time: your company's jobs, and jobs whose time is shared with you. You log
-- your own time; an owner can also add or fix time for anyone in their company
-- (time typed in by hand). Nobody can change another company's time.
create or replace function public.in_my_company(person uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.profiles where id = person and company_id = public.my_company())
$$;
drop policy if exists "see my company's time" on public.time_entries;
create policy "see my company's time" on public.time_entries for select to authenticated
  using (public.is_my_job(job_id) or public.shared_with_me_for(job_id, 'time'));
drop policy if exists "log own time" on public.time_entries;
create policy "log own time" on public.time_entries for insert to authenticated
  with check (
    (public.is_my_job(job_id) or public.shared_with_me_for(job_id, 'time'))
    and (user_id = auth.uid() or (public.i_am_owner() and public.in_my_company(user_id)))
  );
drop policy if exists "fix my company's time" on public.time_entries;
create policy "fix my company's time" on public.time_entries for update to authenticated
  using (public.is_my_job(job_id) or (public.shared_with_me_for(job_id, 'time') and public.in_my_company(user_id)))
  with check ((public.is_my_job(job_id) or public.shared_with_me_for(job_id, 'time')) and public.in_my_company(user_id));
drop policy if exists "delete my company's time" on public.time_entries;
create policy "delete my company's time" on public.time_entries for delete to authenticated
  using (public.is_my_job(job_id) or (public.shared_with_me_for(job_id, 'time') and public.in_my_company(user_id)));

-- Directory: only you see and change your contacts. People you shared your
-- directory with can see (never change) them. Not even your own company sees
-- them otherwise.
drop policy if exists "see own and shared contacts" on public.contacts;
create policy "see own and shared contacts" on public.contacts for select to authenticated
  using (owner_id = auth.uid() or public.directory_shared_with_me(owner_id));
-- (adding, changing and deleting contacts: see Sales & Leads below, which also covers company customers)
-- Shares: new ones only through share_directory; either side can end one
drop policy if exists "see directory shares" on public.directory_shares;
create policy "see directory shares" on public.directory_shares for select to authenticated
  using (owner_id = auth.uid() or viewer_id = auth.uid());
drop policy if exists "end directory shares" on public.directory_shares;
create policy "end directory shares" on public.directory_shares for delete to authenticated
  using (owner_id = auth.uid() or viewer_id = auth.uid());

-- ---------------------------------------------------------------
-- Sales & Leads: people we're contacting about turnover work. Everything
-- here belongs to the company, so both partners see and work every lead.
-- ---------------------------------------------------------------
-- A landlord or management company (one company, many contacts)
create table if not exists public.sales_orgs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.my_company() references public.companies (id) on delete cascade,
  name text not null,
  org_type text not null default 'other'
    check (org_type in ('landlord', 'property_manager', 'investor', 'apartment_owner', 'other')),
  service_area text not null default '',
  units_estimate integer,
  created_at timestamptz not null default now()
);
create index if not exists sales_orgs_company_id_idx on public.sales_orgs (company_id);

-- A sales lead (a person we're contacting)
create table if not exists public.prospects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.my_company() references public.companies (id) on delete cascade,
  org_id uuid references public.sales_orgs (id) on delete set null,
  name text not null,
  phone text not null default '',
  email text not null default '',
  -- How we know them: partners who know them, a mutual connection, or a cold lead
  known_by uuid[] not null default '{}',
  mutual boolean not null default false,
  cold boolean not null default false,
  how_known text not null default '',
  assigned_to uuid references auth.users (id) on delete set null,
  stage text not null default 'new'
    check (stage in ('new', 'contacted', 'follow_up', 'interested', 'meeting', 'proposal', 'converted', 'not_interested')),
  interest text not null default 'unknown' check (interest in ('unknown', 'low', 'medium', 'high')),
  notes text not null default '',
  project_notes text not null default '',
  last_contacted_at timestamptz,
  last_contacted_by uuid references auth.users (id) on delete set null,
  archived_at timestamptz,
  -- The customer (directory client) once converted
  client_id uuid references public.contacts (id) on delete set null,
  -- Where the lead came from (for cold calls, ads, website forms later)
  source text not null default 'personal',
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists prospects_company_id_idx on public.prospects (company_id);

-- Everything that happened with a lead, in order: calls and their results, notes, stage changes
create table if not exists public.sales_activities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.my_company() references public.companies (id) on delete cascade,
  prospect_id uuid not null references public.prospects (id) on delete cascade,
  kind text not null check (kind in ('created', 'call', 'note', 'stage', 'follow_up', 'converted')),
  outcome text check (outcome in ('no_answer', 'voicemail', 'call_back', 'interested', 'meeting', 'not_interested')),
  channel text not null default 'phone',
  note text not null default '',
  by_user uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists sales_activities_prospect_id_idx on public.sales_activities (prospect_id, created_at);

-- The next call or meeting with a lead. Only one open per lead, so nothing is doubled up.
create table if not exists public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.my_company() references public.companies (id) on delete cascade,
  prospect_id uuid not null references public.prospects (id) on delete cascade,
  kind text not null default 'call' check (kind in ('call', 'meeting')),
  due_at timestamptz not null,
  note text not null default '',
  location text not null default '',
  done_at timestamptz,
  done_by uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index if not exists follow_ups_one_open_idx on public.follow_ups (prospect_id) where done_at is null;
create index if not exists follow_ups_company_due_idx on public.follow_ups (company_id, due_at);

-- Buildings and their units (kept simple). A unit's turnovers over time are jobs.
create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.my_company() references public.companies (id) on delete cascade,
  org_id uuid references public.sales_orgs (id) on delete set null,
  prospect_id uuid references public.prospects (id) on delete set null,
  client_id uuid references public.contacts (id) on delete set null,
  address text not null,
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists properties_company_id_idx on public.properties (company_id);
create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.my_company() references public.companies (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  label text not null,
  created_at timestamptz not null default now()
);
create index if not exists units_property_id_idx on public.units (property_id);

-- A turnover opportunity is a lead job with these filled in
alter table public.jobs add column if not exists prospect_id uuid references public.prospects (id) on delete set null;
alter table public.jobs add column if not exists property_id uuid references public.properties (id) on delete set null;
alter table public.jobs add column if not exists unit_id uuid references public.units (id) on delete set null;
alter table public.jobs add column if not exists move_out_date date;
alter table public.jobs add column if not exists ready_by_date date;

-- Customers converted from sales belong to the company, so both partners see them.
-- Everything else in a directory stays private to its owner, as before.
alter table public.contacts add column if not exists company_id uuid references public.companies (id) on delete cascade;
create index if not exists contacts_company_id_idx on public.contacts (company_id);
drop policy if exists "see company contacts" on public.contacts;
create policy "see company contacts" on public.contacts for select to authenticated
  using (company_id is not null and company_id = public.my_company());
drop policy if exists "add own contacts" on public.contacts;
create policy "add own contacts" on public.contacts for insert to authenticated
  with check (owner_id = auth.uid() and (company_id is null or company_id = public.my_company()));
drop policy if exists "change own contacts" on public.contacts;
create policy "change own contacts" on public.contacts for update to authenticated
  using (owner_id = auth.uid() or (company_id is not null and company_id = public.my_company()))
  with check (
    (owner_id = auth.uid() and (company_id is null or company_id = public.my_company()))
    or (company_id is not null and company_id = public.my_company())
  );
drop policy if exists "delete own contacts" on public.contacts;
create policy "delete own contacts" on public.contacts for delete to authenticated
  using (owner_id = auth.uid() or (company_id is not null and company_id = public.my_company()));

-- Sales data: my company only
do $$
declare t text;
begin
  foreach t in array array['sales_orgs', 'prospects', 'sales_activities', 'follow_ups', 'properties', 'units']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "my company''s sales" on public.%I', t);
    execute format('create policy "my company''s sales" on public.%I for all to authenticated
      using (company_id = public.my_company()) with check (company_id = public.my_company())', t);
  end loop;
end $$;

-- ===============================================================
-- Request Inbox & Landlord Maintenance Plan
-- (the same as supabase/updates/10 to 14)
-- ===============================================================
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('owner', 'member', 'landlord'));

-- Request page and plan settings, one row per company. Everything here can be
-- changed in the app (Me → Request page & plan).
create table if not exists public.service_settings (
  company_id uuid primary key default public.my_company() references public.companies (id) on delete cascade,
  public_slug text unique,                      -- the request page: /r/<slug>
  emergency_fee numeric not null default 150,   -- shown on the Emergency choice and in the plan terms
  filter_months integer not null default 4,     -- HVAC filter reminder (each house can change it)
  repeat_threshold integer not null default 3,  -- same issue this many times in 12 months = repeat flag
  nearby_miles numeric not null default 3,      -- "Whenever" requests this close are suggested together
  parts_auto_approve numeric not null default 25, -- each landlord can have their own limit
  review_url text not null default '',          -- Google review link (thumbs up)
  whatsapp text not null default '',            -- number for "Video call" (WhatsApp)
  emergency_phone text not null default '',     -- "Call now" (empty = business phone)
  plan_tiers jsonb not null default '[
    {"id":"basic","name":"Basic","price":49,"hours":1,"every_months":2,"cap":6,"expire_months":12,"active":true,
     "services":["1 hour of handyman work every 2 months","Unused hours roll over (up to 6)","Parts at cost plus 20%, with your approval"]},
    {"id":"premium","name":"Premium","price":null,"hours":1,"every_months":2,"cap":6,"expire_months":12,"active":false,
     "services":["Everything in Basic","Dryer vent cleaning","Gutter cleaning","Sprinkler shut-off and turn-on","Smoke and CO detector testing","Yearly re-inspection"]}
  ]'::jsonb,
  addons jsonb not null default '[]'::jsonb,    -- paid add-ons: [{"name":"...","price":0}]
  turnover_checklist jsonb not null default '[]'::jsonb,
  seasonal_checklists jsonb not null default '{"winter":[],"spring":[]}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.service_settings (company_id, public_slug)
select c.id, trim(both '-' from left(regexp_replace(lower(c.name), '[^a-z0-9]+', '-', 'g'), 30)) || '-' || left(c.id::text, 4)
from public.companies c
on conflict (company_id) do nothing;

-- A landlord who uses (or signed up for) the plan. One row per company they work with.
create table if not exists public.landlords (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.my_company() references public.companies (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,   -- their login, once they sign up
  client_id uuid references public.contacts (id) on delete set null,
  name text not null default '',
  email text not null default '',
  phone text not null default '',
  auto_approve_limit numeric,                   -- parts under this are approved without asking (empty = company default)
  notify_new_request boolean not null default false,
  notify_done boolean not null default false,
  stripe_customer_id text,
  referral_code text unique default left(replace(gen_random_uuid()::text, '-', ''), 8),
  referred_by uuid references public.landlords (id) on delete set null,
  referral_rewarded_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists landlords_company_user_idx on public.landlords (company_id, user_id);
create index if not exists landlords_user_id_idx on public.landlords (user_id);

-- The landlord rows of the person logged in
create or replace function public.my_landlord_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select id from public.landlords where user_id = auth.uid()
$$;

-- "12 Oak Street Apt 2, Lakewood, NJ" → "12 oak st" (to recognise the same house)
create or replace function public.address_key(a text)
returns text
language plpgsql immutable
as $$
declare
  s text := lower(coalesce(split_part(a, ',', 1), ''));
  pair text[];
begin
  s := regexp_replace(s, '\s+(apt|apartment|unit|suite|ste|fl|floor|bsmt|basement|upstairs|downstairs)\y.*$', '');
  s := regexp_replace(s, '\s*#.*$', '');
  s := regexp_replace(s, '[^a-z0-9 ]', ' ', 'g');
  s := ' ' || regexp_replace(trim(s), '\s+', ' ', 'g') || ' ';
  foreach pair slice 1 in array array[
    ['street','st'],['avenue','ave'],['av','ave'],['road','rd'],['drive','dr'],['lane','ln'],['court','ct'],
    ['place','pl'],['boulevard','blvd'],['terrace','ter'],['circle','cir'],['parkway','pkwy'],['highway','hwy'],
    ['square','sq'],['north','n'],['south','s'],['east','e'],['west','w']]
  loop
    s := replace(s, ' ' || pair[1] || ' ', ' ' || pair[2] || ' ');
  end loop;
  return trim(s);
end;
$$;

-- Houses: the profile (shut-offs, filter, paint) and who the landlord is
alter table public.properties add column if not exists address_key text;
alter table public.properties add column if not exists lat double precision;
alter table public.properties add column if not exists lng double precision;
alter table public.properties add column if not exists landlord_id uuid references public.landlords (id) on delete set null;
alter table public.properties add column if not exists source text not null default 'owner';
alter table public.properties add column if not exists water_shutoff text not null default '';
alter table public.properties add column if not exists breaker_panel text not null default '';
alter table public.properties add column if not exists paint_colors text not null default '';
alter table public.properties add column if not exists filter_type text not null default '';
alter table public.properties add column if not exists filter_size text not null default '';
alter table public.properties add column if not exists filter_months integer;   -- empty = company setting
alter table public.properties add column if not exists last_filter_at date;
alter table public.properties add column if not exists intake_done_at timestamptz;
create index if not exists properties_address_key_idx on public.properties (company_id, address_key);
create index if not exists properties_landlord_id_idx on public.properties (landlord_id);
create or replace function public.set_address_key()
returns trigger language plpgsql as $$
begin
  new.address_key := public.address_key(new.address);
  return new;
end;
$$;
drop trigger if exists properties_address_key on public.properties;
create trigger properties_address_key before insert or update of address on public.properties
  for each row execute function public.set_address_key();
update public.properties set address_key = public.address_key(address) where address_key is null;
alter table public.units add column if not exists notes text not null default '';

-- Fill in the company from the house (for rows a landlord adds)
create or replace function public.company_from_property()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.company_id := (select company_id from public.properties where id = new.property_id);
  return new;
end;
$$;

-- Tenants of each unit: texts and requests from these numbers are matched to the unit
create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  unit_id uuid references public.units (id) on delete set null,
  name text not null default '',
  phone text not null default '',
  phone_key text generated always as (right(regexp_replace(phone, '\D', '', 'g'), 10)) stored,
  email text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists tenants_property_id_idx on public.tenants (property_id);
create index if not exists tenants_phone_key_idx on public.tenants (company_id, phone_key);
drop trigger if exists tenants_company on public.tenants;
create trigger tenants_company before insert or update of property_id on public.tenants
  for each row execute function public.company_from_property();

-- A landlord asking for a house to be linked to their account (the owner approves;
-- paying for the plan approves it automatically)
create table if not exists public.property_claims (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  landlord_id uuid not null references public.landlords (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (landlord_id, property_id)
);

-- The plan, one per house (each house has its own subscription and hour bank)
create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.my_company() references public.companies (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  landlord_id uuid references public.landlords (id) on delete set null,
  tier text not null default 'basic',
  price numeric not null default 49,
  -- copied from the plan tier when it starts
  hours_each integer not null default 1,
  every_months integer not null default 2,
  hour_cap integer not null default 6,
  expire_months integer not null default 12,
  status text not null default 'pending' check (status in ('pending', 'active', 'past_due', 'cancelled')),
  stripe_subscription_id text unique,
  started_at timestamptz,
  next_hour_at timestamptz,
  current_period_end timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists memberships_one_per_house_idx on public.memberships (property_id) where status <> 'cancelled';

-- The hour bank: one row per hour. Each hour expires 12 months after it's added.
create table if not exists public.hour_credits (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  membership_id uuid references public.memberships (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  kind text not null default 'plan' check (kind in ('plan', 'referral', 'manual')),
  added_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  job_id uuid references public.jobs (id) on delete set null,
  request_id uuid,
  note text not null default ''
);
create index if not exists hour_credits_property_idx on public.hour_credits (property_id, expires_at);

create or replace function public.new_token()
returns text language sql volatile as $$
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
$$;

-- A repair request from the public request page, a text, or typed in by us
create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.my_company() references public.companies (id) on delete cascade,
  property_id uuid references public.properties (id) on delete set null,
  unit_id uuid references public.units (id) on delete set null,
  address text not null default '',
  unit_label text not null default '',
  lat double precision,
  lng double precision,
  source text not null default 'web' check (source in ('web', 'text', 'owner', 'landlord')),
  is_member boolean not null default false,
  requester_name text not null default '',
  requester_phone text not null default '',
  requester_email text not null default '',
  requester_kind text not null default 'tenant' check (requester_kind in ('tenant', 'landlord', 'other')),
  tenant_id uuid references public.tenants (id) on delete set null,
  verified boolean not null default false,
  -- [{"key":"unclog","label":"Unclog a sink","text":"","tried":["..."],"guide":"unclog"}]
  issues jsonb not null default '[]'::jsonb,
  description text not null default '',
  original_text text not null default '',   -- what they wrote, before translating
  language text not null default 'en',
  urgency text not null default 'soon' check (urgency in ('emergency', 'soon', 'whenever')),
  tenant_urgency text not null default 'soon',
  best_days text[] not null default '{}',
  best_hours text not null default '',
  punch_list text not null default '',      -- a pasted list (non-members)
  status text not null default 'new' check (status in ('new', 'scheduled', 'done', 'closed')),
  scheduled_at timestamptz,
  done_at timestamptz,
  job_id uuid references public.jobs (id) on delete set null,
  needs_approval boolean not null default false,
  photo_needed boolean not null default false,
  address_needed boolean not null default false,
  over_hour boolean not null default false,
  status_token text not null unique default public.new_token(),
  notified_at timestamptz,
  feedback text check (feedback in ('up', 'down')),
  feedback_note text not null default '',
  feedback_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists service_requests_company_idx on public.service_requests (company_id, status, created_at desc);
create index if not exists service_requests_property_idx on public.service_requests (property_id, created_at desc);

-- Photos sent with a request (files in the private "requests" storage bucket)
create table if not exists public.request_photos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  request_id uuid not null references public.service_requests (id) on delete cascade,
  path text not null unique,
  kind text not null default 'issue' check (kind in ('issue', 'sticker', 'list')),
  issue_index integer,
  created_at timestamptz not null default now()
);
create index if not exists request_photos_request_idx on public.request_photos (request_id);

-- Asking the landlord to approve a repair or parts (by a secure link, no login)
create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.my_company() references public.companies (id) on delete cascade,
  request_id uuid references public.service_requests (id) on delete cascade,
  job_id uuid references public.jobs (id) on delete cascade,
  property_id uuid references public.properties (id) on delete set null,
  landlord_id uuid references public.landlords (id) on delete set null,
  kind text not null default 'repair' check (kind in ('repair', 'parts')),
  title text not null default '',
  details text not null default '',
  estimate_hours numeric,
  estimate_amount numeric,
  parts jsonb not null default '[]'::jsonb,   -- [{"name":"...","qty":1,"price":12.5}] (price includes markup)
  token text not null unique default public.new_token(),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'cancelled')),
  auto boolean not null default false,          -- approved by the landlord's auto-approve limit
  decided_at timestamptz,
  decision_note text not null default '',
  charge_status text not null default 'none' check (charge_status in ('none', 'pending', 'charged', 'failed')),
  stripe_payment_intent text,
  charged_at timestamptz,
  expires_at timestamptz not null default now() + interval '30 days',
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists approvals_request_idx on public.approvals (request_id);
create index if not exists approvals_company_idx on public.approvals (company_id, created_at desc);

-- House profile: appliances, fixtures and systems, with condition
create table if not exists public.property_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  unit_id uuid references public.units (id) on delete set null,
  room text not null default '',
  kind text not null default 'appliance' check (kind in ('appliance', 'fixture', 'filter', 'system', 'other')),
  name text not null,
  brand text not null default '',
  model text not null default '',
  serial text not null default '',
  notes text not null default '',
  condition text check (condition in ('good', 'fair', 'worn')),
  replace_soon boolean not null default false,  -- "Worn, replace soon" (shown to the landlord)
  worn_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists property_items_property_idx on public.property_items (property_id);
drop trigger if exists property_items_company on public.property_items;
create trigger property_items_company before insert or update of property_id on public.property_items
  for each row execute function public.company_from_property();

-- First visit (intake) and later inspections, room by room, Good / Fair / Worn
create table if not exists public.inspections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  unit_id uuid references public.units (id) on delete set null,
  kind text not null default 'intake' check (kind in ('intake', 'inspection', 'winter', 'spring')),
  -- [{"room":"Kitchen","label":"Sink","rating":"fair","note":"","item_id":null}]
  results jsonb not null default '[]'::jsonb,
  summary text not null default '',
  done_at timestamptz,
  shared boolean not null default true,       -- the landlord can see it
  by_user uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists inspections_property_idx on public.inspections (property_id);
drop trigger if exists inspections_company on public.inspections;
create trigger inspections_company before insert or update of property_id on public.inspections
  for each row execute function public.company_from_property();

-- Photos of a house (rooms, model stickers, worn items, inspections). Files in the "house" bucket.
create table if not exists public.property_photos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  item_id uuid references public.property_items (id) on delete cascade,
  inspection_id uuid references public.inspections (id) on delete cascade,
  room text not null default '',
  path text not null unique,
  kind text not null default 'room' check (kind in ('room', 'sticker', 'worn', 'inspection')),
  created_at timestamptz not null default now()
);
create index if not exists property_photos_property_idx on public.property_photos (property_id);
drop trigger if exists property_photos_company on public.property_photos;
create trigger property_photos_company before insert or update of property_id on public.property_photos
  for each row execute function public.company_from_property();

-- Troubleshooting guides for the request page (written and published by the owner)
create table if not exists public.guides (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.my_company() references public.companies (id) on delete cascade,
  issue_key text not null,
  title jsonb not null default '{}'::jsonb,   -- {"en":"...","he":"..."}
  steps jsonb not null default '[]'::jsonb,   -- [{"q":{"en":"...","he":"..."},"tip":{...}}]
  published boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (company_id, issue_key)
);

-- Phones that get emergency alerts (web push)
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  company_id uuid default public.my_company() references public.companies (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- Texts forwarded from Google Voice (kept so nothing is lost, even if ignored)
create table if not exists public.inbound_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  from_phone text not null default '',
  body text not null default '',
  photo_count integer not null default 0,
  verdict text not null default 'new' check (verdict in ('new', 'request', 'ignored', 'error')),
  reason text not null default '',
  request_id uuid references public.service_requests (id) on delete set null,
  received_at timestamptz not null default now()
);

-- Spam protection: recent submissions from the public page (nobody can read this)
create table if not exists public.public_hits (
  id bigserial primary key,
  kind text not null,
  ip text not null default '',
  phone_key text not null default '',
  company_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists public_hits_recent_idx on public.public_hits (created_at);

-- ---------------------------------------------------------------
-- Who can see what
--   * Everyone in a company sees and works its requests, houses and plans
--   * A landlord sees only houses approved for them, and nothing else
--   * The public request page, approval links and status links never touch
--     these tables directly: they go through the functions in part 3, which
--     return only what that page needs
-- ---------------------------------------------------------------
create or replace function public.landlord_owns(p uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.properties where id = p and landlord_id in (select public.my_landlord_ids()))
$$;

do $$
declare t text;
begin
  foreach t in array array['service_settings', 'landlords', 'tenants', 'property_claims', 'memberships',
                           'hour_credits', 'service_requests', 'request_photos', 'approvals', 'property_items',
                           'inspections', 'property_photos', 'guides', 'push_subscriptions', 'inbound_messages',
                           'public_hits']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
  foreach t in array array['landlords', 'tenants', 'property_claims', 'memberships', 'hour_credits',
                           'service_requests', 'request_photos', 'approvals', 'property_items', 'inspections',
                           'property_photos', 'guides', 'inbound_messages']
  loop
    execute format('drop policy if exists "my company''s requests" on public.%I', t);
    execute format('create policy "my company''s requests" on public.%I for all to authenticated
      using (company_id = public.my_company()) with check (company_id = public.my_company())', t);
  end loop;
end $$;

-- Settings: the company sees them; only the owner changes them
drop policy if exists "see my company's request settings" on public.service_settings;
create policy "see my company's request settings" on public.service_settings for select to authenticated
  using (company_id = public.my_company());
drop policy if exists "owner changes request settings" on public.service_settings;
create policy "owner changes request settings" on public.service_settings for all to authenticated
  using (company_id = public.my_company() and public.i_am_owner())
  with check (company_id = public.my_company() and public.i_am_owner());

-- Landlords: their own account, houses approved for them, and what's on those houses
drop policy if exists "landlord sees own account" on public.landlords;
create policy "landlord sees own account" on public.landlords for select to authenticated
  using (user_id = auth.uid());
drop policy if exists "landlord sees own houses" on public.properties;
create policy "landlord sees own houses" on public.properties for select to authenticated
  using (landlord_id in (select public.my_landlord_ids()));
drop policy if exists "landlord sees own units" on public.units;
create policy "landlord sees own units" on public.units for select to authenticated
  using (public.landlord_owns(property_id));
drop policy if exists "landlord manages own tenants" on public.tenants;
create policy "landlord manages own tenants" on public.tenants for all to authenticated
  using (public.landlord_owns(property_id)) with check (public.landlord_owns(property_id));
drop policy if exists "landlord sees own claims" on public.property_claims;
create policy "landlord sees own claims" on public.property_claims for select to authenticated
  using (landlord_id in (select public.my_landlord_ids()));
do $$
declare t text;
begin
  foreach t in array array['memberships', 'hour_credits', 'service_requests', 'approvals', 'property_items',
                           'property_photos']
  loop
    execute format('drop policy if exists "landlord sees own houses" on public.%I', t);
    execute format('create policy "landlord sees own houses" on public.%I for select to authenticated
      using (public.landlord_owns(property_id))', t);
  end loop;
end $$;
drop policy if exists "landlord sees shared inspections" on public.inspections;
create policy "landlord sees shared inspections" on public.inspections for select to authenticated
  using (shared and public.landlord_owns(property_id));
drop policy if exists "landlord sees request photos" on public.request_photos;
create policy "landlord sees request photos" on public.request_photos for select to authenticated
  using (exists (select 1 from public.service_requests r where r.id = request_id and public.landlord_owns(r.property_id)));

-- Alerts: each person manages their own phones
drop policy if exists "own alert phones" on public.push_subscriptions;
create policy "own alert phones" on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.is_server()
returns boolean
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  ) = 'service_role'
$$;

-- The visitor's internet address (to slow down spam)
create or replace function public.visitor_ip()
returns text
language sql stable
as $$
  select coalesce(
    h ->> 'cf-connecting-ip', h ->> 'x-real-ip', trim(split_part(h ->> 'x-forwarded-for', ',', 1)), ''
  )
  from (select coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb as h) x
$$;

-- Spam protection: refuse when one visitor or phone sends too much
create or replace function public.check_rate(what text, company uuid, phone text default '')
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_ip text := public.visitor_ip();
  v_pk text := right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10);
begin
  delete from public.public_hits where created_at < now() - interval '2 days';
  if what = 'check' then
    if v_ip <> '' and (select count(*) from public.public_hits where kind = 'check' and ip = v_ip
                     and created_at > now() - interval '10 minutes') >= 40 then
      raise exception 'Too many tries. Please wait a few minutes.';
    end if;
  else
    if v_ip <> '' and ((select count(*) from public.public_hits where kind = what and ip = v_ip
                      and created_at > now() - interval '10 minutes') >= 5
                  or (select count(*) from public.public_hits where kind = what and ip = v_ip
                      and created_at > now() - interval '1 day') >= 20) then
      raise exception 'Too many requests from here. Please call us instead.';
    end if;
    if v_pk <> '' and (select count(*) from public.public_hits where kind = what and phone_key = v_pk
                     and created_at > now() - interval '1 day') >= 8 then
      raise exception 'Too many requests from this phone today. Please call us instead.';
    end if;
    if (select count(*) from public.public_hits where kind = what and company_id = company
        and created_at > now() - interval '1 day') >= 300 then
      raise exception 'We are getting too many requests right now. Please call us.';
    end if;
  end if;
  insert into public.public_hits (kind, ip, phone_key, company_id) values (what, v_ip, v_pk, company);
end;
$$;

-- What the public request page shows (no private data)
create or replace function public.request_page(slug text)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'name', c.name,
    'phone', coalesce(nullif(c.phone, ''), st.business_phone, ''),
    'emergency_phone', coalesce(nullif(s.emergency_phone, ''), nullif(c.phone, ''), st.business_phone, ''),
    'whatsapp', s.whatsapp,
    'emergency_fee', s.emergency_fee,
    'plan', (select t.value from jsonb_array_elements(s.plan_tiers) t where (t.value ->> 'active')::boolean limit 1),
    'guides', coalesce((select jsonb_agg(jsonb_build_object('issue_key', g.issue_key, 'title', g.title, 'steps', g.steps))
                        from public.guides g where g.company_id = c.id and g.published), '[]'::jsonb)
  )
  from public.service_settings s
  join public.companies c on c.id = s.company_id
  left join public.settings st on st.id = c.id::text
  where s.public_slug = lower(trim(slug))
$$;

-- Find a company's house by its address
create or replace function public.find_property(company uuid, addr text)
returns public.properties
language sql stable security definer set search_path = public
as $$
  select * from public.properties
  where company_id = company and address_key = public.address_key(addr) and address_key <> ''
  order by (landlord_id is not null) desc, created_at
  limit 1
$$;

-- Step 1 of the request page: is this house on the plan, and what units does it have?
create or replace function public.check_address(slug text, addr text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  company uuid := (select company_id from public.service_settings where public_slug = lower(trim(slug)));
  p public.properties;
begin
  if company is null then raise exception 'This request page doesn''t exist.'; end if;
  perform public.check_rate('check', company);
  p := public.find_property(company, addr);
  if p.id is null then
    return jsonb_build_object('known', false, 'member', false, 'units', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'known', true,
    'member', exists (select 1 from public.memberships m where m.property_id = p.id and m.status in ('active', 'past_due')),
    'units', coalesce((select jsonb_agg(u.label order by u.label) from public.units u where u.property_id = p.id), '[]'::jsonb)
  );
end;
$$;

-- Send a request from the public page. Returns the private status link's token.
create or replace function public.submit_request(slug text, payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  company uuid := (select company_id from public.service_settings where public_slug = lower(trim(slug)));
  addr text := left(trim(coalesce(payload ->> 'address', '')), 200);
  v_phone text := left(trim(coalesce(payload ->> 'phone', '')), 30);
  v_pk text := right(regexp_replace(coalesce(payload ->> 'phone', ''), '\D', '', 'g'), 10);
  v_urgency text := coalesce(payload ->> 'urgency', 'soon');
  v_key text := coalesce(payload ->> 'upload_key', '');
  v_issues jsonb := coalesce(payload -> 'issues', '[]'::jsonb);
  v_photos jsonb := coalesce(payload -> 'photos', '[]'::jsonb);
  p public.properties;
  v_member boolean := false;
  t public.tenants;
  l public.landlords;
  v_kind text := coalesce(payload ->> 'kind', 'tenant');
  v_unit uuid;
  req public.service_requests;
  ph jsonb;
  i integer;
begin
  if company is null then raise exception 'This request page doesn''t exist.'; end if;
  -- Bots fill the hidden field or send the form instantly: pretend it worked
  if coalesce(payload ->> 'hp', '') <> '' or coalesce((payload ->> 'elapsed_ms')::numeric, 0) < 3000 then
    return jsonb_build_object('token', '', 'member', false);
  end if;
  perform public.check_rate('request', company, v_phone);
  if length(addr) < 5 then raise exception 'Please enter the address.'; end if;
  if length(v_pk) < 10 then raise exception 'Please enter a phone number we can reach you at.'; end if;
  if trim(coalesce(payload ->> 'name', '')) = '' then raise exception 'Please enter your name.'; end if;
  if v_urgency not in ('emergency', 'soon', 'whenever') then v_urgency := 'soon'; end if;
  if v_kind not in ('tenant', 'landlord', 'other') then v_kind := 'tenant'; end if;
  if jsonb_typeof(v_issues) <> 'array' or jsonb_array_length(v_issues) = 0 then
    if trim(coalesce(payload ->> 'punch_list', '')) = '' then raise exception 'Please say what needs fixing.'; end if;
    v_issues := '[]'::jsonb;
  end if;
  if jsonb_array_length(v_issues) > 12 then raise exception 'Too many issues in one request.'; end if;
  if jsonb_typeof(v_photos) <> 'array' or jsonb_array_length(v_photos) > 24 then raise exception 'Too many photos.'; end if;
  -- Keep only the fields we know, and keep them short
  v_issues := coalesce((
    select jsonb_agg(jsonb_build_object(
      'key', left(coalesce(x ->> 'key', 'other'), 30),
      'label', left(coalesce(x ->> 'label', ''), 120),
      'text', left(coalesce(x ->> 'text', ''), 1000),
      'tried', coalesce((select jsonb_agg(left(y, 300)) from jsonb_array_elements_text(
                 case when jsonb_typeof(x -> 'tried') = 'array' then x -> 'tried' else '[]'::jsonb end) y), '[]'::jsonb)
    ))
    from jsonb_array_elements(v_issues) x
  ), '[]'::jsonb);

  -- The house: on file already, or a new address account
  p := public.find_property(company, addr);
  if p.id is null then
    insert into public.properties (company_id, address, source, lat, lng)
    values (company, addr, 'request', (payload ->> 'lat')::double precision, (payload ->> 'lng')::double precision)
    returning * into p;
  end if;
  v_member := exists (select 1 from public.memberships m where m.property_id = p.id and m.status in ('active', 'past_due'));
  select id into v_unit from public.units
  where property_id = p.id and lower(label) = lower(trim(coalesce(payload ->> 'unit', ''))) limit 1;
  -- Known tenant (or the landlord)? Then the request is verified
  select * into t from public.tenants
  where property_id = p.id and phone_key = v_pk and active and length(v_pk) = 10
  order by (unit_id is not distinct from v_unit) desc limit 1;
  select * into l from public.landlords where landlords.id = p.landlord_id and right(regexp_replace(landlords.phone, '\D', '', 'g'), 10) = v_pk;
  if l.id is not null then v_kind := 'landlord'; end if;

  insert into public.service_requests (
    company_id, property_id, unit_id, address, unit_label, lat, lng, source, is_member,
    requester_name, requester_phone, requester_email, requester_kind, tenant_id, verified,
    issues, description, original_text, language, urgency, tenant_urgency, best_days, best_hours, punch_list,
    photo_needed, needs_approval
  ) values (
    company, p.id, coalesce(v_unit, t.unit_id), addr, left(trim(coalesce(payload ->> 'unit', '')), 40),
    coalesce((payload ->> 'lat')::double precision, p.lat), coalesce((payload ->> 'lng')::double precision, p.lng),
    'web', v_member,
    left(trim(payload ->> 'name'), 80), v_phone, left(trim(coalesce(payload ->> 'email', '')), 120), v_kind, t.id,
    t.id is not null or l.id is not null,
    v_issues, left(coalesce(payload ->> 'description', ''), 3000), '',
    case when payload ->> 'language' = 'he' then 'he' else 'en' end,
    v_urgency, v_urgency,
    coalesce((select array_agg(left(d, 12)) from jsonb_array_elements_text(
      case when jsonb_typeof(payload -> 'best_days') = 'array' then payload -> 'best_days' else '[]'::jsonb end) d), '{}'),
    left(coalesce(payload ->> 'best_hours', ''), 60),
    left(coalesce(payload ->> 'punch_list', ''), 5000),
    false,
    v_member and l.id is null and exists (select 1 from jsonb_array_elements(v_issues) x where x ->> 'key' = 'other')
  ) returning * into req;

  -- Photos the page uploaded (only from this form's own upload folder)
  for ph in select * from jsonb_array_elements(v_photos) loop
    if (ph ->> 'path') !~ ('^incoming/' || v_key || '/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|heic|heif)$')
       or length(v_key) <> 32
       or not exists (select 1 from storage.objects o where o.bucket_id = 'requests' and o.name = ph ->> 'path') then
      continue;
    end if;
    insert into public.request_photos (company_id, request_id, path, kind, issue_index)
    values (company, req.id, ph ->> 'path',
            case when ph ->> 'kind' in ('sticker', 'list') then ph ->> 'kind' else 'issue' end,
            (ph ->> 'issue')::integer)
    on conflict (path) do nothing;
  end loop;
  -- Photos are needed for every issue (not for emergencies)
  if v_urgency <> 'emergency' then
    for i in 0 .. jsonb_array_length(v_issues) - 1 loop
      if not exists (select 1 from public.request_photos where request_id = req.id and kind = 'issue' and issue_index = i) then
        update public.service_requests set photo_needed = true where id = req.id;
      end if;
    end loop;
  end if;
  return jsonb_build_object('token', req.status_token, 'member', v_member, 'emergency', v_urgency = 'emergency');
end;
$$;

-- The private status link: Received → Scheduled (day and time) → Done
create or replace function public.request_status(token text)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'status', r.status,
    'scheduled_at', r.scheduled_at,
    'done_at', r.done_at,
    'created_at', r.created_at,
    'urgency', r.urgency,
    'issues', coalesce((select jsonb_agg(coalesce(nullif(x ->> 'label', ''), x ->> 'text')) from jsonb_array_elements(r.issues) x), '[]'::jsonb),
    'company', c.name,
    'phone', coalesce(nullif(c.phone, ''), ''),
    'feedback', r.feedback,
    'review_url', case when r.feedback = 'up' then s.review_url else '' end
  )
  from public.service_requests r
  join public.companies c on c.id = r.company_id
  left join public.service_settings s on s.company_id = r.company_id
  where r.status_token = request_status.token and length(request_status.token) = 64
$$;

-- Thumbs up → our Google review link; thumbs down → privately to us
create or replace function public.leave_feedback(token text, happy boolean, note text default '')
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  r public.service_requests;
begin
  select * into r from public.service_requests where status_token = leave_feedback.token and length(leave_feedback.token) = 64;
  if r.id is null then raise exception 'This link doesn''t work any more.'; end if;
  if r.feedback is null then
    update public.service_requests
    set feedback = case when happy then 'up' else 'down' end, feedback_note = left(coalesce(note, ''), 2000), feedback_at = now()
    where id = r.id;
  elsif not happy and coalesce(note, '') <> '' then
    update public.service_requests set feedback_note = left(note, 2000) where id = r.id;
  end if;
  return jsonb_build_object('review_url',
    case when happy then coalesce((select review_url from public.service_settings where company_id = r.company_id), '') else '' end);
end;
$$;

-- The landlord's approval link (no login): what we're asking them to approve
create or replace function public.approval_view(token text)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'kind', a.kind, 'title', a.title, 'details', a.details,
    'estimate_hours', a.estimate_hours, 'estimate_amount', a.estimate_amount, 'parts', a.parts,
    'status', a.status, 'expired', a.expires_at < now(), 'decided_at', a.decided_at,
    'address', split_part(coalesce(p.address, r.address, ''), ',', 1),
    'unit', coalesce(r.unit_label, ''),
    'issues', coalesce((select jsonb_agg(coalesce(nullif(x ->> 'label', ''), x ->> 'text')) from jsonb_array_elements(r.issues) x), '[]'::jsonb),
    'description', coalesce(r.description, ''),
    'photo_count', (select count(*) from public.request_photos rp where rp.request_id = a.request_id),
    'company', c.name, 'phone', c.phone
  )
  from public.approvals a
  join public.companies c on c.id = a.company_id
  left join public.service_requests r on r.id = a.request_id
  left join public.properties p on p.id = a.property_id
  where a.token = approval_view.token and length(approval_view.token) = 64
$$;

-- The landlord taps Approve or Decline
create or replace function public.decide_approval(token text, approve boolean, note text default '')
returns text
language plpgsql security definer set search_path = public
as $$
declare
  a public.approvals;
begin
  select * into a from public.approvals where approvals.token = decide_approval.token and length(decide_approval.token) = 64 for update;
  if a.id is null then raise exception 'This link doesn''t work any more.'; end if;
  if a.status <> 'pending' then return a.status; end if;
  if a.expires_at < now() then raise exception 'This link has expired. Please call us.'; end if;
  update public.approvals
  set status = case when approve then 'approved' else 'declined' end, decided_at = now(),
      decision_note = left(coalesce(note, ''), 1000),
      charge_status = case when approve and kind = 'parts' and coalesce(estimate_amount, 0) > 0 then 'pending' else charge_status end
  where id = a.id;
  if a.request_id is not null and approve then
    update public.service_requests set needs_approval = false, updated_at = now() where id = a.request_id;
  end if;
  return case when approve then 'approved' else 'declined' end;
end;
$$;

-- ---------------------------------------------------------------
-- The hour bank
-- ---------------------------------------------------------------
-- Add the hours a plan has earned since it was last checked (while active)
create or replace function public.accrue_hours(m uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  ms public.memberships;
  banked integer;
  k integer;
begin
  select * into ms from public.memberships where id = m for update;
  if ms.id is null then return; end if;
  if not (public.is_server() or coalesce(ms.company_id = public.my_company(), false)) then
    raise exception 'Not allowed.';
  end if;
  if ms.status <> 'active' or ms.next_hour_at is null then return; end if;
  while ms.next_hour_at <= now() loop
    for k in 1 .. greatest(ms.hours_each, 0) loop
      select count(*) into banked from public.hour_credits
      where membership_id = ms.id and used_at is null and expires_at > ms.next_hour_at;
      if banked < ms.hour_cap then
        insert into public.hour_credits (company_id, membership_id, property_id, kind, added_at, expires_at)
        values (ms.company_id, ms.id, ms.property_id, 'plan', ms.next_hour_at,
                ms.next_hour_at + make_interval(months => ms.expire_months));
      end if;
    end loop;
    ms.next_hour_at := ms.next_hour_at + make_interval(months => greatest(ms.every_months, 1));
  end loop;
  update public.memberships set next_hour_at = ms.next_hour_at where id = ms.id;
end;
$$;

-- Daily: bring every active plan's hours up to date (our server only)
create or replace function public.accrue_all_hours()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  m uuid;
  n integer := 0;
begin
  if not public.is_server() then raise exception 'Not allowed.'; end if;
  for m in select id from public.memberships where status = 'active' and next_hour_at <= now() loop
    perform public.accrue_hours(m);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Change a plan's status (from Stripe, or by the owner). Hours are only added
-- while active; coming back from past due or cancelled doesn't add missed hours.
create or replace function public.set_membership_status(m uuid, new_status text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  ms public.memberships;
  v_tier jsonb;
begin
  select * into ms from public.memberships where id = m;
  if ms.id is null then raise exception 'No such plan.'; end if;
  if not (public.is_server() or coalesce(ms.company_id = public.my_company() and public.i_am_owner(), false)) then
    raise exception 'Not allowed.';
  end if;
  if new_status not in ('pending', 'active', 'past_due', 'cancelled') then raise exception 'Unknown status.'; end if;
  if ms.status = 'active' then perform public.accrue_hours(m); end if;
  if new_status = 'active' and ms.status <> 'active' then
    if ms.started_at is null then
      -- Starting: copy the tier's terms; the first hour is added right away
      select t.value into v_tier from public.service_settings s, jsonb_array_elements(s.plan_tiers) t
      where s.company_id = ms.company_id and t.value ->> 'id' = ms.tier;
      update public.memberships set
        status = 'active', started_at = now(), next_hour_at = now(), cancelled_at = null,
        hours_each = coalesce((v_tier ->> 'hours')::integer, hours_each),
        every_months = coalesce((v_tier ->> 'every_months')::integer, every_months),
        hour_cap = coalesce((v_tier ->> 'cap')::integer, hour_cap),
        expire_months = coalesce((v_tier ->> 'expire_months')::integer, expire_months)
      where id = m;
    else
      -- Back to active: skip the hours missed while it wasn't paid
      update public.memberships set status = 'active', cancelled_at = null,
        next_hour_at = case when next_hour_at < now()
          then next_hour_at + make_interval(months => every_months
               * ceil(extract(epoch from now() - next_hour_at) / extract(epoch from make_interval(months => every_months)))::integer)
          else next_hour_at end
      where id = m;
    end if;
    -- Paying for a house links it to the landlord automatically
    update public.properties p set landlord_id = ms.landlord_id
    where p.id = ms.property_id and ms.landlord_id is not null;
    update public.property_claims set status = 'approved', decided_at = now()
    where property_id = ms.property_id and landlord_id = ms.landlord_id and status = 'pending';
    perform public.accrue_hours(m);
  else
    update public.memberships set status = new_status,
      cancelled_at = case when new_status = 'cancelled' then coalesce(cancelled_at, now()) else cancelled_at end
    where id = m;
  end if;
end;
$$;

-- Use one hour from a house's bank for a visit (the oldest hour first)
create or replace function public.use_hour(house uuid, job uuid default null, request uuid default null)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  credit uuid;
  company uuid := (select company_id from public.properties where id = house);
begin
  if not (public.is_server() or coalesce(company = public.my_company(), false)) then raise exception 'Not allowed.'; end if;
  perform public.accrue_hours(m.id) from public.memberships m where m.property_id = house and m.status = 'active';
  select id into credit from public.hour_credits
  where property_id = house and used_at is null and expires_at > now()
  order by expires_at limit 1 for update;
  if credit is null then raise exception 'This house has no hours left in its bank.'; end if;
  update public.hour_credits set used_at = now(), job_id = job, request_id = request where id = credit;
  return (select count(*) from public.hour_credits where property_id = house and used_at is null and expires_at > now());
end;
$$;

-- A free hour for the landlord who referred someone (after the new landlord's first payment)
create or replace function public.reward_referral(new_landlord uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  l public.landlords;
  house uuid;
begin
  if not public.is_server() then raise exception 'Not allowed.'; end if;
  select * into l from public.landlords where id = new_landlord for update;
  if l.referred_by is null or l.referral_rewarded_at is not null then return; end if;
  select m.property_id into house from public.memberships m
  where m.landlord_id = l.referred_by and m.status = 'active' order by m.started_at limit 1;
  if house is null then return; end if;  -- the referrer has no active plan: nothing to add to
  insert into public.hour_credits (company_id, property_id, kind, expires_at, note)
  select company_id, house, 'referral', now() + interval '12 months', 'Referred ' || coalesce(nullif(l.name, ''), l.email)
  from public.properties where id = house;
  update public.landlords set referral_rewarded_at = now() where id = l.id;
end;
$$;

-- ---------------------------------------------------------------
-- Landlord accounts
-- ---------------------------------------------------------------
-- A landlord adds a house to their account (the owner approves it, or paying does)
create or replace function public.claim_house(landlord uuid, addr text, unit_labels text[] default '{}')
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  l public.landlords;
  p public.properties;
  lbl text;
  claim uuid;
begin
  select * into l from public.landlords where id = landlord and user_id = auth.uid();
  if l.id is null then raise exception 'Please log in first.'; end if;
  if length(trim(coalesce(addr, ''))) < 5 then raise exception 'Please enter the address.'; end if;
  if (select count(*) from public.property_claims where landlord_id = l.id and status = 'pending') >= 20 then
    raise exception 'You have many houses waiting for approval already.';
  end if;
  p := public.find_property(l.company_id, addr);
  if p.id is null then
    insert into public.properties (company_id, address, source) values (l.company_id, left(trim(addr), 200), 'landlord')
    returning * into p;
    foreach lbl in array coalesce(unit_labels, '{}') loop
      if trim(lbl) <> '' then
        insert into public.units (company_id, property_id, label) values (l.company_id, p.id, left(trim(lbl), 40));
      end if;
    end loop;
  end if;
  insert into public.property_claims (company_id, landlord_id, property_id)
  values (l.company_id, l.id, p.id)
  on conflict (landlord_id, property_id) do update set status = case when property_claims.status = 'declined' then 'pending' else property_claims.status end
  returning id into claim;
  return claim;
end;
$$;

-- The owner approves (or declines) a landlord's house in one tap
create or replace function public.decide_claim(claim uuid, approve boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  c public.property_claims;
begin
  select * into c from public.property_claims where id = claim;
  if c.id is null or c.company_id is distinct from public.my_company() then raise exception 'Not allowed.'; end if;
  update public.property_claims set status = case when approve then 'approved' else 'declined' end, decided_at = now()
  where id = claim;
  if approve then
    update public.properties set landlord_id = c.landlord_id where id = c.property_id;
  else
    update public.properties set landlord_id = null where id = c.property_id and landlord_id = c.landlord_id;
  end if;
end;
$$;

-- A landlord's email choices (both off unless they turn them on)
create or replace function public.set_my_notifications(new_request boolean, repair_done boolean)
returns void
language sql security definer set search_path = public
as $$
  update public.landlords set notify_new_request = new_request, notify_done = repair_done where user_id = auth.uid()
$$;

-- Move-out: the landlord books a turnover walkthrough (it becomes a lead for us)
create or replace function public.request_move_out(house uuid, unit uuid, move_out date, note text default '')
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  p public.properties;
  l public.landlords;
  j uuid;
begin
  if not public.landlord_owns(house) then raise exception 'Not allowed.'; end if;
  select * into p from public.properties where id = house;
  select * into l from public.landlords where id = p.landlord_id;
  insert into public.jobs (company_id, customer_name, customer_phone, customer_email, address, notes, stage, lead_status,
                           property_id, unit_id, move_out_date, client_id, created_by)
  values (p.company_id, coalesce(nullif(l.name, ''), l.email), l.phone, l.email,
          p.address || coalesce(', ' || (select label from public.units where id = unit and property_id = house), ''),
          'Move-out turnover requested by the landlord. ' || left(coalesce(note, ''), 1000),
          'lead', 'new', house, (select id from public.units where id = unit and property_id = house), move_out, l.client_id, null)
  returning id into j;
  return j;
end;
$$;

-- Everything on a landlord's status screen: per house and in total.
-- The owner can see the same for any of their landlords.
create or replace function public.landlord_summary(landlord uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  l public.landlords;
  threshold integer;
begin
  select * into l from public.landlords where id = landlord;
  if l.id is null or not coalesce(l.user_id = auth.uid() or l.company_id = public.my_company(), false) then
    raise exception 'Not allowed.';
  end if;
  threshold := coalesce((select repeat_threshold from public.service_settings where company_id = l.company_id), 3);
  return jsonb_build_object(
    'landlord', jsonb_build_object('id', l.id, 'name', l.name, 'email', l.email, 'phone', l.phone,
      'notify_new_request', l.notify_new_request, 'notify_done', l.notify_done, 'referral_code', l.referral_code,
      'auto_approve_limit', coalesce(l.auto_approve_limit, (select parts_auto_approve from public.service_settings where company_id = l.company_id))),
    'company', (select jsonb_build_object('name', c.name, 'phone', c.phone, 'slug', s.public_slug)
                from public.companies c left join public.service_settings s on s.company_id = c.id where c.id = l.company_id),
    'claims', coalesce((select jsonb_agg(jsonb_build_object('id', pc.id, 'address', pp.address, 'status', pc.status) order by pc.created_at desc)
                        from public.property_claims pc join public.properties pp on pp.id = pc.property_id
                        where pc.landlord_id = l.id and pc.status <> 'approved'), '[]'::jsonb),
    'houses', coalesce((select jsonb_agg(h order by h ->> 'address') from (
      select jsonb_build_object(
        'id', p.id, 'address', p.address,
        'units', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'label', u.label) order by u.label) from public.units u where u.property_id = p.id), '[]'::jsonb),
        'plan', (select jsonb_build_object('id', m.id, 'tier', m.tier, 'status', m.status, 'price', m.price, 'started_at', m.started_at)
                 from public.memberships m where m.property_id = p.id and m.status <> 'cancelled' limit 1),
        'hours_left', (select count(*) from public.hour_credits hc where hc.property_id = p.id and hc.used_at is null and hc.expires_at > now()),
        'hours_used_year', (select count(*) from public.hour_credits hc where hc.property_id = p.id and hc.used_at > now() - interval '12 months'),
        'next_expiry', (select min(expires_at) from public.hour_credits hc where hc.property_id = p.id and hc.used_at is null and hc.expires_at > now()),
        'open_requests', (select count(*) from public.service_requests r where r.property_id = p.id and r.status in ('new', 'scheduled')),
        'jobs_done', (select count(*) from public.jobs j where j.property_id = p.id and j.stage = 'job'
                      and not exists (select 1 from public.punch_items pi where pi.job_id = j.id and pi.status <> 'done')
                      and exists (select 1 from public.punch_items pi where pi.job_id = j.id)),
        'items_fixed', (select count(*) from public.punch_items pi join public.jobs j on j.id = pi.job_id
                        where j.property_id = p.id and j.stage = 'job' and pi.status = 'done'),
        'repeats', coalesce((select jsonb_agg(jsonb_build_object('key', k, 'label', lbl, 'count', n)) from (
            select x ->> 'key' k, max(x ->> 'label') lbl, count(*) n
            from public.service_requests r, jsonb_array_elements(r.issues) x
            where r.property_id = p.id and r.created_at > now() - interval '12 months' and x ->> 'key' <> 'other'
            group by x ->> 'key' having count(*) >= threshold) rr), '[]'::jsonb),
        'worn', coalesce((select jsonb_agg(jsonb_build_object('id', pi.id, 'name', pi.name, 'room', pi.room, 'note', pi.worn_note))
                          from public.property_items pi where pi.property_id = p.id and pi.replace_soon), '[]'::jsonb),
        'filter_due', case when p.last_filter_at is null then null else p.last_filter_at + make_interval(months =>
                        coalesce(p.filter_months, (select filter_months from public.service_settings where company_id = p.company_id), 4)) end
      ) h
      from public.properties p where p.landlord_id = l.id
    ) hh), '[]'::jsonb)
  );
end;
$$;

-- One house's history for its landlord: visits with what was fixed and the photos
create or replace function public.house_history(house uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not (public.landlord_owns(house) or exists (select 1 from public.properties where id = house and company_id = public.my_company())) then
    raise exception 'Not allowed.';
  end if;
  return jsonb_build_object(
    'visits', coalesce((select jsonb_agg(v order by v ->> 'date' desc) from (
      select jsonb_build_object(
        'id', j.id, 'date', coalesce(j.job_date::text, j.created_at::date::text),
        'items', coalesce((select jsonb_agg(jsonb_build_object('id', pi.id, 'title', pi.title, 'location', pi.location, 'status', pi.status) order by pi.position)
                           from public.punch_items pi where pi.job_id = j.id), '[]'::jsonb),
        'photos', coalesce((select jsonb_agg(jsonb_build_object('path', ph.storage_path, 'kind', ph.kind, 'item_id', ph.item_id))
                            from public.photos ph join public.punch_items pi on pi.id = ph.item_id
                            where pi.job_id = j.id and ph.kind in ('before', 'after')), '[]'::jsonb),
        'hours_used', (select count(*) from public.hour_credits hc where hc.job_id = j.id)
      ) v
      from public.jobs j where j.property_id = house and j.stage = 'job'
    ) vv), '[]'::jsonb),
    'requests', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'created_at', r.created_at, 'status', r.status,
                            'urgency', r.urgency, 'unit', r.unit_label, 'scheduled_at', r.scheduled_at,
                            'issues', r.issues, 'needs_approval', r.needs_approval) order by r.created_at desc)
                          from public.service_requests r where r.property_id = house), '[]'::jsonb)
  );
end;
$$;

-- Landlords may see the before/after photos of jobs at their houses
create or replace function public.landlord_sees_photo(path text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select case when split_part(path, '/', 1) ~ '^[0-9a-f-]{36}$' then exists (
    select 1 from public.punch_items pi join public.jobs j on j.id = pi.job_id
    where pi.id = split_part(path, '/', 1)::uuid and j.stage = 'job' and public.landlord_owns(j.property_id)
  ) else false end
$$;

-- Request photo files: the company, and the house's landlord
create or replace function public.can_see_request_file(path text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.request_photos rp join public.service_requests r on r.id = rp.request_id
    where rp.path = can_see_request_file.path
      and (rp.company_id = public.my_company() or public.landlord_owns(r.property_id))
  )
$$;

-- House profile files are stored as "<house id>/<file>"
create or replace function public.house_file_company(path text)
returns uuid
language sql stable security definer set search_path = public
as $$
  select case when split_part(path, '/', 1) ~ '^[0-9a-f-]{36}$'
    then (select company_id from public.properties where id = split_part(path, '/', 1)::uuid) end
$$;

-- Owner-only and server-only functions are never callable from the public page
revoke execute on function public.accrue_hours(uuid), public.accrue_all_hours(), public.set_membership_status(uuid, text),
  public.use_hour(uuid, uuid, uuid), public.reward_referral(uuid), public.claim_house(uuid, text, text[]),
  public.decide_claim(uuid, boolean), public.set_my_notifications(boolean, boolean), public.request_move_out(uuid, uuid, date, text),
  public.landlord_summary(uuid), public.house_history(uuid), public.check_rate(text, uuid, text),
  public.find_property(uuid, text) from public, anon;
grant execute on function public.request_page(text), public.check_address(text, text), public.submit_request(text, jsonb),
  public.request_status(text), public.leave_feedback(text, boolean, text), public.approval_view(text),
  public.decide_approval(text, boolean, text) to anon, authenticated;

-- ---------------------------------------------------------------
-- Photo storage for requests and house profiles (both private)
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('requests', 'requests', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']),
       ('house', 'house', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do nothing;

-- The request page may only ADD photos, into a new random folder. It can't
-- read, list, change or delete anything.
drop policy if exists "request page adds photos" on storage.objects;
create policy "request page adds photos" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'requests' and name ~ '^incoming/[0-9a-f]{32}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|heic|heif)$');
drop policy if exists "read request photos" on storage.objects;
create policy "read request photos" on storage.objects for select to authenticated
  using (bucket_id = 'requests' and public.can_see_request_file(name));
drop policy if exists "delete request photos" on storage.objects;
create policy "delete request photos" on storage.objects for delete to authenticated
  using (bucket_id = 'requests' and exists (select 1 from public.request_photos rp where rp.path = name and rp.company_id = public.my_company()));

drop policy if exists "company manages house photos" on storage.objects;
create policy "company manages house photos" on storage.objects for all to authenticated
  using (bucket_id = 'house' and public.house_file_company(name) = public.my_company())
  with check (bucket_id = 'house' and public.house_file_company(name) = public.my_company());
drop policy if exists "landlord reads house photos" on storage.objects;
create policy "landlord reads house photos" on storage.objects for select to authenticated
  using (bucket_id = 'house' and split_part(name, '/', 1) ~ '^[0-9a-f-]{36}$' and public.landlord_owns(split_part(name, '/', 1)::uuid));
drop policy if exists "landlord reads job photos" on storage.objects;
create policy "landlord reads job photos" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and public.landlord_sees_photo(name));

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

-- Tell the app's data service to pick up the changes above right away
notify pgrst, 'reload schema';
