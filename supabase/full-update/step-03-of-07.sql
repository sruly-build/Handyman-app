-- Full database update, step 3 of 7. Run the steps in order (each is safe to run again).
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
