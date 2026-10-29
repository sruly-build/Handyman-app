-- Studio Assistant database. Paste all of this into Supabase → SQL Editor and click Run.
-- Safe to run again after an update: it never deletes your data.

-- Everything the app saves is one row per item ("doc"), grouped by kind:
-- settings, clients, leads, projects, tasks, emails, reachOuts, galleries, invoices,
-- plus payment, gcomment, gfav and iview rows that clients' actions add through the server.
create table if not exists public.docs (
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner, kind, id)
);

create index if not exists docs_kind_id on public.docs (kind, id);

alter table public.docs enable row level security;

drop policy if exists "owner reads" on public.docs;
drop policy if exists "owner writes" on public.docs;
create policy "owner reads" on public.docs for select using (owner = auth.uid());
create policy "owner writes" on public.docs for all using (owner = auth.uid()) with check (owner = auth.uid());

-- Tokens for Gmail and Dropbox. Only the server (service role) can read or write these;
-- the app itself can never see them.
create table if not exists public.secrets (
  owner uuid not null references auth.users (id) on delete cascade,
  provider text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner, provider)
);

alter table public.secrets enable row level security;
-- No policies on purpose: nobody but the service role gets in.

-- Project files (briefs, mood boards): private, each user only sees their own folder.
insert into storage.buckets (id, name, public)
values ('files', 'files', false)
on conflict (id) do nothing;

-- Logo: public, so client galleries and invoices can show it.
insert into storage.buckets (id, name, public)
values ('brand', 'brand', true)
on conflict (id) do nothing;

drop policy if exists "own files read" on storage.objects;
drop policy if exists "own files write" on storage.objects;
drop policy if exists "own files delete" on storage.objects;
drop policy if exists "own brand write" on storage.objects;
drop policy if exists "own brand update" on storage.objects;

create policy "own files read" on storage.objects for select
  using (bucket_id in ('files', 'brand') and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own files write" on storage.objects for insert
  with check (bucket_id in ('files', 'brand') and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own files delete" on storage.objects for delete
  using (bucket_id in ('files', 'brand') and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own brand update" on storage.objects for update
  using (bucket_id = 'brand' and (storage.foldername(name))[1] = auth.uid()::text);
