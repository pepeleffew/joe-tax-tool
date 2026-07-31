-- =====================================================================
-- Soddy-Daisy Class of 1993 — living-layer schema
-- Run this once in Supabase: Dashboard -> SQL Editor -> New query ->
-- paste all of this -> Run.
--
-- Model: classmates sign in (magic link) and SUBMIT photos, guestbook
-- notes, and RSVPs. Everything lands as 'pending'. The public site shows
-- only 'approved' rows. Only the admin (adminEmail) can approve/reject.
-- =====================================================================

-- Who is the admin? (matches SUPA_CONFIG.adminEmail in the site)
create or replace function public.is_admin() returns boolean
language sql stable as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'joe.c.leffew@gmail.com'
$$;

-- ---------- PHOTOS ---------------------------------------------------
create table if not exists public.photos (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  album         text not null default 'general',      -- r10 | r20 | r25 | next | candids | general
  caption       text,
  storage_path  text not null,
  uploader_id   uuid references auth.users(id),
  uploader_email text,
  uploader_name text,
  status        text not null default 'pending'
                check (status in ('pending','approved','rejected'))
);
alter table public.photos enable row level security;

drop policy if exists photos_read_approved on public.photos;
create policy photos_read_approved on public.photos
  for select using (status = 'approved' or public.is_admin());

drop policy if exists photos_insert_auth on public.photos;
create policy photos_insert_auth on public.photos
  for insert to authenticated
  with check (status = 'pending' and uploader_id = auth.uid());

drop policy if exists photos_admin_update on public.photos;
create policy photos_admin_update on public.photos
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists photos_admin_delete on public.photos;
create policy photos_admin_delete on public.photos
  for delete using (public.is_admin());

-- ---------- GUESTBOOK ------------------------------------------------
create table if not exists public.guestbook (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  author_id    uuid references auth.users(id),
  author_name  text not null,
  author_email text,
  message      text not null check (char_length(message) between 1 and 2000),
  status       text not null default 'pending'
               check (status in ('pending','approved','rejected'))
);
alter table public.guestbook enable row level security;

drop policy if exists gb_read_approved on public.guestbook;
create policy gb_read_approved on public.guestbook
  for select using (status = 'approved' or public.is_admin());

drop policy if exists gb_insert_auth on public.guestbook;
create policy gb_insert_auth on public.guestbook
  for insert to authenticated
  with check (status = 'pending' and author_id = auth.uid());

drop policy if exists gb_admin_update on public.guestbook;
create policy gb_admin_update on public.guestbook
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists gb_admin_delete on public.guestbook;
create policy gb_admin_delete on public.guestbook
  for delete using (public.is_admin());

-- ---------- RSVPs ----------------------------------------------------
create table if not exists public.rsvps (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id    uuid references auth.users(id),
  name       text not null,
  email      text,
  guests     int not null default 1 check (guests between 0 and 20),
  attending  boolean not null default true,
  note       text
);
alter table public.rsvps enable row level security;

-- Only the admin can read the RSVP list; classmates can add their own.
drop policy if exists rsvp_admin_read on public.rsvps;
create policy rsvp_admin_read on public.rsvps
  for select using (public.is_admin() or user_id = auth.uid());

drop policy if exists rsvp_insert_auth on public.rsvps;
create policy rsvp_insert_auth on public.rsvps
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists rsvp_admin_all on public.rsvps;
create policy rsvp_admin_all on public.rsvps
  for update using (public.is_admin()) with check (public.is_admin());

-- ---------- STORAGE BUCKET FOR PHOTOS --------------------------------
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

drop policy if exists storage_photos_read on storage.objects;
create policy storage_photos_read on storage.objects
  for select using (bucket_id = 'photos');

drop policy if exists storage_photos_write on storage.objects;
create policy storage_photos_write on storage.objects
  for insert to authenticated with check (bucket_id = 'photos');

drop policy if exists storage_photos_admin_del on storage.objects;
create policy storage_photos_admin_del on storage.objects
  for delete using (bucket_id = 'photos' and public.is_admin());
