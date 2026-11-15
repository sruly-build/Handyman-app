-- Punch list items: the day you plan to do each one (so items can be done together)
alter table public.punch_items add column if not exists planned_date date;
notify pgrst, 'reload schema';
