-- ===============================================================
-- Request Inbox & Landlord Maintenance Plan — part 2 of 5
-- Requests, approvals, house profiles, guides, and who can see what
-- (Run part 1 first. Safe to run more than once.)
-- ===============================================================

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

notify pgrst, 'reload schema';
