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

notify pgrst, 'reload schema';
