-- Orders: a photo on each part (so you can see the part you need)
alter table public.parts add column if not exists photo_path text;
-- Part photos are stored as "parts/<job id>/<file>"; item photos stay "<item id>/<file>"
create or replace function public.can_access_photo_file(path text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select case
    when split_part(path, '/', 1) ~ '^[0-9a-f-]{36}$' then public.can_access_item(split_part(path, '/', 1)::uuid)
    when split_part(path, '/', 1) = 'parts' and split_part(path, '/', 2) ~ '^[0-9a-f-]{36}$'
      then public.can_access_job(split_part(path, '/', 2)::uuid)
    else false
  end
$$;
notify pgrst, 'reload schema';
