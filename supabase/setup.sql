-- =====================================================================
-- Lumen: Supabase database setup
--
-- HOW TO USE
--   1. In your Supabase project, open "SQL Editor" (left sidebar).
--   2. Click "New query", paste this whole file, and click "Run".
--   3. You should see "Success. No rows returned".
--
-- Safe to run more than once: it creates what is missing and replaces
-- the security rules, but never deletes your data.
--
-- What it creates
--   Tables:  profiles, videos, comments, comment_likes, video_ratings,
--            subscriptions, playlists, reports
--   Storage: "videos" bucket (MP4/WebM, max 50 MB each)
--            "thumbnails" bucket (PNG/JPEG/WebP, max 5 MB each)
--   Rules:   Row Level Security on every table, so people can only
--            change their own things. Anyone can read public content.
--
-- Sample videos that ship with the site (ids like "v-aurora") are not
-- stored here, but people can still comment on, like and subscribe to
-- them; those reactions are stored here and shared with everyone.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Profiles: one row per account, created automatically on sign-up.
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  username     text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null check (char_length(display_name) between 1 and 40),
  bio          text not null default '' check (char_length(bio) <= 500),
  initial      text not null default '?' check (char_length(initial) between 1 and 2),
  color        text not null default '#1d4ed8' check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at   timestamptz not null default now()
);

-- Copies username and display name from the sign-up form into profiles.
-- Invalid values are rejected by the checks above, which makes sign-up fail
-- with an error instead of creating a broken account.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta  jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  dname text  := nullif(trim(meta ->> 'display_name'), '');
  col   text  := meta ->> 'color';
begin
  insert into public.profiles (id, username, display_name, initial, color)
  values (
    new.id,
    lower(trim(meta ->> 'username')),
    left(coalesce(dname, 'New user'), 40),
    upper(left(coalesce(dname, 'N'), 1)),
    case when col ~ '^#[0-9a-fA-F]{6}$' then col else '#1d4ed8' end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ---------------------------------------------------------------------
-- Videos uploaded by users. Files live in Storage; this holds metadata.
-- ---------------------------------------------------------------------
create table if not exists public.videos (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 100),
  description text not null default '' check (char_length(description) <= 5000),
  category    text not null check (category in ('Music', 'Gaming', 'Science', 'Coding', 'Sports')),
  visibility  text not null default 'public' check (visibility in ('public', 'unlisted', 'private')),
  video_path  text not null,
  thumb_path  text,
  duration    real not null default 0 check (duration >= 0),
  size        bigint not null default 0 check (size between 0 and 52428800),
  views       bigint not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists videos_owner_idx   on public.videos (owner_id);
create index if not exists videos_created_idx on public.videos (created_at desc);


-- ---------------------------------------------------------------------
-- Reactions. video_id is text so it can point at either an uploaded
-- video (its uuid) or a built-in sample video (e.g. "v-aurora").
-- ---------------------------------------------------------------------
create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  video_id   text not null,
  author_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  parent_id  uuid references public.comments (id) on delete cascade,
  body       text not null check (char_length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists comments_video_idx on public.comments (video_id, created_at desc);

create table if not exists public.comment_likes (
  comment_id uuid not null references public.comments (id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create table if not exists public.video_ratings (
  video_id   text not null,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  value      smallint not null check (value in (1, -1)),
  created_at timestamptz not null default now(),
  primary key (video_id, user_id)
);
create index if not exists video_ratings_video_idx on public.video_ratings (video_id);

-- channel_id is a built-in channel id (e.g. "northwind") or a profile uuid.
create table if not exists public.subscriptions (
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  channel_id text not null check (char_length(channel_id) between 1 and 64),
  created_at timestamptz not null default now(),
  primary key (user_id, channel_id)
);
create index if not exists subscriptions_channel_idx on public.subscriptions (channel_id);

-- Playlists are private to their owner.
create table if not exists public.playlists (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name       text not null check (char_length(trim(name)) between 1 and 60),
  video_ids  text[] not null default '{}' check (cardinality(video_ids) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists playlists_owner_idx on public.playlists (owner_id);

-- Reports go to you, the site owner. Read them in Table Editor > reports.
create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  video_id    text not null,
  reporter_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  reason      text not null check (char_length(trim(reason)) between 1 and 500),
  created_at  timestamptz not null default now(),
  unique (video_id, reporter_id)
);


-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------

-- True if the current user may see this video: a built-in sample, or an
-- uploaded video that passes the videos table's own read rules.
create or replace function public.video_visible(vid text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select vid ~ '^v-[a-z0-9-]+$'
      or exists (select 1 from public.videos v where v.id::text = vid);
$$;

-- Replies may only be one level deep, and on the same video as the parent.
create or replace function public.check_comment_parent()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.parent_id is not null and not exists (
    select 1 from public.comments p
    where p.id = new.parent_id and p.parent_id is null and p.video_id = new.video_id
  ) then
    raise exception 'Replies can only be one level deep, on the same video';
  end if;
  return new;
end;
$$;

drop trigger if exists comments_check_parent on public.comments;
create trigger comments_check_parent
  before insert on public.comments
  for each row execute function public.check_comment_parent();

-- Keep playlists' updated_at current.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists playlists_touch on public.playlists;
create trigger playlists_touch
  before update on public.playlists
  for each row execute function public.touch_updated_at();

-- When a video is deleted, remove its comments, ratings and reports too.
create or replace function public.cleanup_deleted_video()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.comments      where video_id = old.id::text;
  delete from public.video_ratings where video_id = old.id::text;
  delete from public.reports       where video_id = old.id::text;
  return old;
end;
$$;

drop trigger if exists videos_cleanup on public.videos;
create trigger videos_cleanup
  after delete on public.videos
  for each row execute function public.cleanup_deleted_video();

-- Count a view. Runs with elevated rights so viewers can bump the counter
-- without being allowed to edit anything else on the video.
create or replace function public.increment_view(vid uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.videos set views = views + 1
  where id = vid and visibility <> 'private';
$$;

revoke all on function public.increment_view(uuid) from public;
grant execute on function public.increment_view(uuid) to anon, authenticated;


-- ---------------------------------------------------------------------
-- Column permissions: users may only write the columns that make sense.
-- (For example, nobody can set their own view count.)
-- ---------------------------------------------------------------------
revoke insert, update on public.profiles from anon, authenticated;
grant update (display_name, bio, initial, color) on public.profiles to authenticated;

revoke insert, update on public.videos from anon, authenticated;
grant insert (id, title, description, category, visibility, video_path, thumb_path, duration, size)
  on public.videos to authenticated;
grant update (title, description, category, visibility, thumb_path) on public.videos to authenticated;

-- Owner ids, timestamps and counters are always filled in by the database.
revoke insert, update on public.comments      from anon, authenticated;
revoke insert, update on public.comment_likes from anon, authenticated;
revoke insert, update on public.video_ratings from anon, authenticated;
revoke insert, update on public.subscriptions from anon, authenticated;
revoke insert, update on public.reports       from anon, authenticated;
revoke insert, update on public.playlists     from anon, authenticated;
grant insert (video_id, parent_id, body)  on public.comments      to authenticated;
grant insert (comment_id)                 on public.comment_likes to authenticated;
grant insert (video_id, value)            on public.video_ratings to authenticated;
grant update (value)                      on public.video_ratings to authenticated;
grant insert (channel_id)                 on public.subscriptions to authenticated;
grant insert (video_id, reason)           on public.reports       to authenticated;
grant insert (id, name, video_ids)        on public.playlists     to authenticated;
grant update (name, video_ids)            on public.playlists     to authenticated;


-- ---------------------------------------------------------------------
-- Row Level Security: who can read and write which rows.
-- ---------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.videos        enable row level security;
alter table public.comments      enable row level security;
alter table public.comment_likes enable row level security;
alter table public.video_ratings enable row level security;
alter table public.subscriptions enable row level security;
alter table public.playlists     enable row level security;
alter table public.reports       enable row level security;

-- profiles: everyone can read; you can edit only your own.
drop policy if exists "profiles: read all"   on public.profiles;
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: read all"   on public.profiles for select using (true);
create policy "profiles: update own" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- videos: public and unlisted are readable by anyone (unlisted are simply
-- not listed by the site); private only by the owner.
drop policy if exists "videos: read visible" on public.videos;
drop policy if exists "videos: insert own"   on public.videos;
drop policy if exists "videos: update own"   on public.videos;
drop policy if exists "videos: delete own"   on public.videos;
create policy "videos: read visible" on public.videos for select
  using (visibility in ('public', 'unlisted') or owner_id = (select auth.uid()));
create policy "videos: insert own" on public.videos for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and video_path like (select auth.uid())::text || '/%'
    and (thumb_path is null or thumb_path like (select auth.uid())::text || '/%')
  );
create policy "videos: update own" on public.videos for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and (thumb_path is null or thumb_path like (select auth.uid())::text || '/%'));
create policy "videos: delete own" on public.videos for delete to authenticated
  using (owner_id = (select auth.uid()));

-- comments: readable if the video is; write as yourself; delete your own,
-- or any comment on a video you own.
drop policy if exists "comments: read"   on public.comments;
drop policy if exists "comments: insert" on public.comments;
drop policy if exists "comments: delete" on public.comments;
create policy "comments: read" on public.comments for select
  using (public.video_visible(video_id));
create policy "comments: insert" on public.comments for insert to authenticated
  with check (author_id = (select auth.uid()) and public.video_visible(video_id));
create policy "comments: delete" on public.comments for delete to authenticated
  using (
    author_id = (select auth.uid())
    or exists (select 1 from public.videos v where v.id::text = video_id and v.owner_id = (select auth.uid()))
  );

-- comment likes, ratings, subscriptions: everyone can read (for counts);
-- you can add and remove only your own.
drop policy if exists "comment_likes: read"   on public.comment_likes;
drop policy if exists "comment_likes: insert" on public.comment_likes;
drop policy if exists "comment_likes: delete" on public.comment_likes;
create policy "comment_likes: read"   on public.comment_likes for select using (true);
create policy "comment_likes: insert" on public.comment_likes for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "comment_likes: delete" on public.comment_likes for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "video_ratings: read"   on public.video_ratings;
drop policy if exists "video_ratings: insert" on public.video_ratings;
drop policy if exists "video_ratings: update" on public.video_ratings;
drop policy if exists "video_ratings: delete" on public.video_ratings;
create policy "video_ratings: read"   on public.video_ratings for select using (true);
create policy "video_ratings: insert" on public.video_ratings for insert to authenticated
  with check (user_id = (select auth.uid()) and public.video_visible(video_id));
create policy "video_ratings: update" on public.video_ratings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "video_ratings: delete" on public.video_ratings for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "subscriptions: read"   on public.subscriptions;
drop policy if exists "subscriptions: insert" on public.subscriptions;
drop policy if exists "subscriptions: delete" on public.subscriptions;
create policy "subscriptions: read"   on public.subscriptions for select using (true);
create policy "subscriptions: insert" on public.subscriptions for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "subscriptions: delete" on public.subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));

-- playlists: completely private to the owner.
drop policy if exists "playlists: own" on public.playlists;
create policy "playlists: own" on public.playlists for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- reports: anyone signed in can file one; only you (in the dashboard) can read them.
drop policy if exists "reports: insert" on public.reports;
create policy "reports: insert" on public.reports for insert to authenticated
  with check (reporter_id = (select auth.uid()) and public.video_visible(video_id));


-- ---------------------------------------------------------------------
-- Storage buckets and rules. Files are stored under "<user id>/...",
-- and you can only upload, replace or delete files in your own folder.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('videos',     'videos',     true, 52428800, array['video/mp4', 'video/webm']),
  ('thumbnails', 'thumbnails', true, 5242880,  array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "lumen files: read own"   on storage.objects;
drop policy if exists "lumen files: upload own" on storage.objects;
drop policy if exists "lumen files: update own" on storage.objects;
drop policy if exists "lumen files: delete own" on storage.objects;
-- Anyone can watch files through their public link; this rule lets you
-- manage (list, replace, delete) the files in your own folder.
create policy "lumen files: read own" on storage.objects for select to authenticated
  using (bucket_id in ('videos', 'thumbnails') and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "lumen files: upload own" on storage.objects for insert to authenticated
  with check (bucket_id in ('videos', 'thumbnails') and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "lumen files: update own" on storage.objects for update to authenticated
  using (bucket_id in ('videos', 'thumbnails') and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id in ('videos', 'thumbnails') and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "lumen files: delete own" on storage.objects for delete to authenticated
  using (bucket_id in ('videos', 'thumbnails') and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Done!
