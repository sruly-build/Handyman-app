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
