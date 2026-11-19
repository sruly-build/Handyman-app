-- Full database update, step 2 of 7. Run the steps in order (each is safe to run again).
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
    -- Part photos: "parts/<job id>/<file>"
    when split_part(path, '/', 1) = 'parts' and split_part(path, '/', 2) ~ '^[0-9a-f-]{36}$'
      then public.can_access_job(split_part(path, '/', 2)::uuid)
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
