-- ===============================================================
-- Request Inbox & Landlord Maintenance Plan — part 3 of 5
-- The public request page, status links and approval links
-- (Run parts 1 and 2 first. Safe to run more than once.)
-- ===============================================================

-- Called by our own server (Stripe, texts, daily jobs), never by a browser
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

notify pgrst, 'reload schema';
