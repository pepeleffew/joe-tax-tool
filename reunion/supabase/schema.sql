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

-- ---------- CLASSMATE OVERRIDES (admin: move to In Memory, fix year) --
create table if not exists public.classmate_overrides (
  classmate_id text primary key,
  status       text check (status in ('active','missing','memory')),
  passed_year  text,
  note         text,
  updated_at   timestamptz not null default now(),
  updated_by   text
);
alter table public.classmate_overrides enable row level security;

drop policy if exists co_read_all on public.classmate_overrides;
create policy co_read_all on public.classmate_overrides for select using (true);

drop policy if exists co_admin_write on public.classmate_overrides;
create policy co_admin_write on public.classmate_overrides
  for all using (public.is_admin()) with check (public.is_admin());

-- ===================================================================
-- SELF-SERVICE PROFILE EDITING (claim your profile, edit your own only)
-- ===================================================================

-- Private map of known emails -> classmate id (populated separately, never
-- exposed to the client; only the SECURITY DEFINER function below reads it).
create table if not exists public.email_map (
  email        text primary key,
  classmate_id text not null
);
alter table public.email_map enable row level security;   -- no policies = no client access

-- Ownership claims.
create table if not exists public.profile_claims (
  id           uuid primary key default gen_random_uuid(),
  classmate_id text not null,
  user_id      uuid not null references auth.users(id),
  email        text,
  status       text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at   timestamptz not null default now()
);
alter table public.profile_claims enable row level security;
create unique index if not exists pc_one_owner    on public.profile_claims (classmate_id) where status = 'approved';
create unique index if not exists pc_one_per_user on public.profile_claims (user_id)      where status = 'approved';

drop policy if exists pc_read on public.profile_claims;
create policy pc_read on public.profile_claims for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists pc_insert on public.profile_claims;
create policy pc_insert on public.profile_claims for insert to authenticated with check (user_id = auth.uid() and status = 'pending');
drop policy if exists pc_admin_upd on public.profile_claims;
create policy pc_admin_upd on public.profile_claims for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists pc_admin_del on public.profile_claims;
create policy pc_admin_del on public.profile_claims for delete using (public.is_admin());

-- Does the current user own this classmate profile?
create or replace function public.owns_classmate(cid text) returns boolean
language sql stable as $$
  select exists (select 1 from public.profile_claims c
    where c.classmate_id = cid and c.user_id = auth.uid() and c.status = 'approved')
$$;

-- Auto-verify by matching the signed-in email against the private map.
create or replace function public.claim_my_profile() returns text
language plpgsql security definer set search_path = public as $$
declare cid text; myemail text;
begin
  myemail := lower(coalesce(auth.jwt() ->> 'email', ''));
  if myemail = '' then return null; end if;
  select classmate_id into cid from public.email_map where email = myemail limit 1;
  if cid is null then return null; end if;
  if exists (select 1 from public.profile_claims where user_id = auth.uid() and status = 'approved') then
    return (select classmate_id from public.profile_claims where user_id = auth.uid() and status = 'approved' limit 1);
  end if;
  if exists (select 1 from public.profile_claims where classmate_id = cid and status = 'approved') then
    return null;                       -- already owned by someone else
  end if;
  insert into public.profile_claims (classmate_id, user_id, email, status)
    values (cid, auth.uid(), myemail, 'approved');
  return cid;
end $$;
grant execute on function public.claim_my_profile() to authenticated;

-- ---------- TRIBUTES (remembrances on In Memory pages) --------------
-- Signed-in classmates leave a memory on a specific classmate's memorial.
-- Lands as 'pending'; only the admin approves. Public sees 'approved' only.
create table if not exists public.tributes (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  classmate_id text not null,
  author_id    uuid references auth.users(id),
  author_name  text not null,
  author_email text,
  message      text not null check (char_length(message) between 1 and 2000),
  status       text not null default 'pending'
               check (status in ('pending','approved','rejected'))
);
alter table public.tributes enable row level security;

drop policy if exists tr_read_approved on public.tributes;
create policy tr_read_approved on public.tributes
  for select using (status = 'approved' or public.is_admin());

drop policy if exists tr_insert_auth on public.tributes;
create policy tr_insert_auth on public.tributes
  for insert to authenticated
  with check (status = 'pending' and author_id = auth.uid());

drop policy if exists tr_admin_update on public.tributes;
create policy tr_admin_update on public.tributes
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists tr_admin_delete on public.tributes;
create policy tr_admin_delete on public.tributes
  for delete using (public.is_admin());

create index if not exists tr_by_classmate on public.tributes (classmate_id) where status = 'approved';

-- Public, self-edited profile fields (name/story/city/etc.) — owner or admin.
create table if not exists public.profile_edits (
  classmate_id text primary key,
  fields       jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now()
);
alter table public.profile_edits enable row level security;
drop policy if exists pe_read on public.profile_edits;
create policy pe_read on public.profile_edits for select using (true);
drop policy if exists pe_write on public.profile_edits;
create policy pe_write on public.profile_edits for all
  using (public.owns_classmate(classmate_id) or public.is_admin())
  with check (public.owns_classmate(classmate_id) or public.is_admin());
