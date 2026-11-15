-- Punch list items: the time you plan to do each one (on its planned day)
alter table public.punch_items add column if not exists planned_time time;
notify pgrst, 'reload schema';
