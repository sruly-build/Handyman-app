-- Full database update, step 1 of 7. Run the steps in order (each is safe to run again).
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
-- The day you plan to do this item (items on the same day are done together)
alter table public.punch_items add column if not exists planned_date date;
alter table public.punch_items add column if not exists planned_time time;
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
-- A photo of the part (so you can see what to buy)
alter table public.parts add column if not exists photo_path text;
-- A store link for the part
alter table public.parts add column if not exists link text;

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
