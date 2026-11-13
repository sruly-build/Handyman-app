-- ===============================================================
-- Request Inbox & Landlord Maintenance Plan — part 5 of 5
-- Landlord sign-up and photo storage
-- (Run parts 1 to 4 first. Safe to run more than once.)
-- ===============================================================
-- ---------------------------------------------------------------
-- Landlord sign-up: anyone can create a landlord account from the company's
-- request page. Until a house is approved for them, they see nothing.
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

-- ---------------------------------------------------------------
-- Photo storage for requests and house profiles (both private)
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('requests', 'requests', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']),
       ('house', 'house', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do nothing;

-- The request page may only ADD photos, into a new random folder. It can't
-- read, list, change or delete anything.
drop policy if exists "request page adds photos" on storage.objects;
create policy "request page adds photos" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'requests' and name ~ '^incoming/[0-9a-f]{32}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|heic|heif)$');
drop policy if exists "read request photos" on storage.objects;
create policy "read request photos" on storage.objects for select to authenticated
  using (bucket_id = 'requests' and public.can_see_request_file(name));
drop policy if exists "delete request photos" on storage.objects;
create policy "delete request photos" on storage.objects for delete to authenticated
  using (bucket_id = 'requests' and exists (select 1 from public.request_photos rp where rp.path = name and rp.company_id = public.my_company()));

drop policy if exists "company manages house photos" on storage.objects;
create policy "company manages house photos" on storage.objects for all to authenticated
  using (bucket_id = 'house' and public.house_file_company(name) = public.my_company())
  with check (bucket_id = 'house' and public.house_file_company(name) = public.my_company());
drop policy if exists "landlord reads house photos" on storage.objects;
create policy "landlord reads house photos" on storage.objects for select to authenticated
  using (bucket_id = 'house' and split_part(name, '/', 1) ~ '^[0-9a-f-]{36}$' and public.landlord_owns(split_part(name, '/', 1)::uuid));
drop policy if exists "landlord reads job photos" on storage.objects;
create policy "landlord reads job photos" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and public.landlord_sees_photo(name));

notify pgrst, 'reload schema';
