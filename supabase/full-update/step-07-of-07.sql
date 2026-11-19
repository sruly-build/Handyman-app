-- Full database update, step 7 of 7. Run the steps in order (each is safe to run again).
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

-- Live invoice links: a private web page per job where the customer sees the
-- estimate or invoice (every line, discounts, payments and what's still due),
-- always up to date. Only someone with the link can open it.
create table if not exists public.bill_links (
  job_id uuid primary key references public.jobs (id) on delete cascade,
  token text not null unique default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  estimate jsonb not null default '{}'::jsonb,   -- the latest estimate (lines and total), kept fresh by the app
  note text not null default '',                 -- e.g. how to pay
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  viewed_at timestamptz,                         -- last time the customer opened it
  view_count integer not null default 0
);
alter table public.bill_links enable row level security;
drop policy if exists "my company's jobs only" on public.bill_links;
create policy "my company's jobs only" on public.bill_links for all to authenticated
  using (public.is_my_job(job_id)) with check (public.is_my_job(job_id));
grant select, insert, update, delete on public.bill_links to authenticated;

-- What the customer's page shows. Nothing else about the business or job.
create or replace function public.public_bill(tok text, peek boolean default false)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  link public.bill_links;
  j public.jobs;
  inv public.invoices;
  c public.companies;
  v_paid numeric;
begin
  if tok is null or length(tok) < 32 then return null; end if;
  select * into link from public.bill_links where token = tok;
  if link.job_id is null then return null; end if;
  select * into j from public.jobs where id = link.job_id;
  select * into c from public.companies where id = j.company_id;
  select * into inv from public.invoices where job_id = j.id;
  select coalesce(sum(amount), 0) into v_paid from public.payments where job_id = j.id;
  if not peek then
    update public.bill_links set viewed_at = now(), view_count = view_count + 1 where job_id = link.job_id;
  end if;
  return jsonb_build_object(
    'company', jsonb_build_object('name', coalesce(c.name, ''), 'phone', coalesce(c.phone, ''), 'email', coalesce(c.email, ''), 'address', coalesce(c.address, '')),
    'customer', jsonb_build_object('name', j.customer_name, 'address', j.address),
    'note', link.note,
    'kind', case when inv.id is null then 'estimate' else 'invoice' end,
    'number', inv.number,
    'date', coalesce(inv.created_at, link.updated_at),
    'status', coalesce(inv.status, 'unpaid'),
    'lines', coalesce(inv.lines, link.estimate -> 'lines', '[]'::jsonb),
    'total', coalesce(inv.total, (link.estimate ->> 'total')::numeric, 0),
    'paid', v_paid
  );
end;
$$;
grant execute on function public.public_bill(text, boolean) to anon, authenticated;

-- Live invoice links can show before and after photos (only when you turn it on)
alter table public.bill_links add column if not exists show_photos boolean not null default false;

-- Is this file a before/after photo of a job whose live link shows photos?
create or replace function public.bill_photo_allowed(path text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.photos ph
    join public.punch_items pi on pi.id = ph.item_id
    join public.bill_links bl on bl.job_id = pi.job_id
    where ph.storage_path = path and ph.kind in ('before', 'after') and bl.show_photos
  )
$$;
grant execute on function public.bill_photo_allowed(text) to anon, authenticated;

-- The customer's page can open exactly those photos (nothing else in the photos folder)
drop policy if exists "live bill photos" on storage.objects;
create policy "live bill photos" on storage.objects for select to anon, authenticated
  using (bucket_id = 'photos' and public.bill_photo_allowed(name));

create or replace function public.public_bill(tok text, peek boolean default false)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  link public.bill_links;
  j public.jobs;
  inv public.invoices;
  c public.companies;
  v_paid numeric;
  v_photos jsonb := '[]'::jsonb;
begin
  if tok is null or length(tok) < 32 then return null; end if;
  select * into link from public.bill_links where token = tok;
  if link.job_id is null then return null; end if;
  select * into j from public.jobs where id = link.job_id;
  select * into c from public.companies where id = j.company_id;
  select * into inv from public.invoices where job_id = j.id;
  select coalesce(sum(amount), 0) into v_paid from public.payments where job_id = j.id;
  if link.show_photos then
    select coalesce(jsonb_agg(x order by x ->> 'item'), '[]'::jsonb) into v_photos from (
      select jsonb_build_object(
        'item', pi.title,
        'before', coalesce((select jsonb_agg(ph.storage_path order by ph.created_at) from public.photos ph where ph.item_id = pi.id and ph.kind = 'before'), '[]'::jsonb),
        'after', coalesce((select jsonb_agg(ph.storage_path order by ph.created_at) from public.photos ph where ph.item_id = pi.id and ph.kind = 'after'), '[]'::jsonb)
      ) x
      from public.punch_items pi
      where pi.job_id = j.id and exists (select 1 from public.photos ph where ph.item_id = pi.id and ph.kind in ('before', 'after'))
    ) t;
  end if;
  if not peek then
    update public.bill_links set viewed_at = now(), view_count = view_count + 1 where job_id = link.job_id;
  end if;
  return jsonb_build_object(
    'company', jsonb_build_object('name', coalesce(c.name, ''), 'phone', coalesce(c.phone, ''), 'email', coalesce(c.email, ''), 'address', coalesce(c.address, '')),
    'customer', jsonb_build_object('name', j.customer_name, 'address', j.address),
    'note', link.note,
    'kind', case when inv.id is null then 'estimate' else 'invoice' end,
    'number', inv.number,
    'date', coalesce(inv.created_at, link.updated_at),
    'status', coalesce(inv.status, 'unpaid'),
    'lines', coalesce(inv.lines, link.estimate -> 'lines', '[]'::jsonb),
    'total', coalesce(inv.total, (link.estimate ->> 'total')::numeric, 0),
    'paid', v_paid,
    'photos', v_photos
  );
end;
$$;
grant execute on function public.public_bill(text, boolean) to anon, authenticated;

notify pgrst, 'reload schema';
