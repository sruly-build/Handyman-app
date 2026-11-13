-- ===============================================================
-- Request Inbox & Landlord Maintenance Plan — part 1 of 5
-- Settings, landlords, houses, tenants, memberships and the hour bank
-- (Safe to run more than once.)
-- ===============================================================

-- Landlords can log in too. They never belong to a company, so they never
-- see any company's jobs, prices or customers: only their own approved houses.
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

notify pgrst, 'reload schema';
