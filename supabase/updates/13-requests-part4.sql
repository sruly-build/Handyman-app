-- ===============================================================
-- Request Inbox & Landlord Maintenance Plan — part 4 of 5
-- The hour bank and landlord accounts
-- (Run parts 1 to 3 first. Safe to run more than once.)
-- ===============================================================
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
    'claims', coalesce((select jsonb_agg(jsonb_build_object('id', pc.id, 'property_id', pc.property_id, 'address', pp.address, 'status', pc.status) order by pc.created_at desc)
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

notify pgrst, 'reload schema';
