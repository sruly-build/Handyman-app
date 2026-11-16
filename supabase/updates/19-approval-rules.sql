-- Each landlord's own approval rules (when to ask, budget, emergencies), chosen at sign-up
alter table public.landlords add column if not exists approval_prefs jsonb;

-- A landlord (or the business they work with) reads the rules
create or replace function public.landlord_approval_prefs(landlord uuid)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select l.approval_prefs from public.landlords l
  where l.id = landlord and coalesce(l.user_id = auth.uid() or l.company_id = public.my_company(), false)
$$;

-- The landlord saves their own rules; the "go ahead without asking" amount follows them
create or replace function public.set_my_approval_prefs(prefs jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_mode text := coalesce(prefs ->> 'mode', 'over');
  v_limit numeric := least(greatest(coalesce((prefs ->> 'limit')::numeric, 150), 0), 1000000);
begin
  if jsonb_typeof(prefs) <> 'object' or length(prefs::text) > 4000 then
    raise exception 'Those approval rules could not be saved.';
  end if;
  update public.landlords
  set approval_prefs = prefs,
      auto_approve_limit = case v_mode when 'always' then 0 when 'never' then 1000000 else v_limit end
  where user_id = auth.uid();
end;
$$;

grant execute on function public.landlord_approval_prefs(uuid), public.set_my_approval_prefs(jsonb) to authenticated;

notify pgrst, 'reload schema';
