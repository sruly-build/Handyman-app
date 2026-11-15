-- A store link on each part (paste a link; the app fills in the name, price and picture)
alter table public.parts add column if not exists link text;
notify pgrst, 'reload schema';
