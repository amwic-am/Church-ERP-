-- A content block names its own sort column in `settings.order_by`, so a public
-- feed view has to expose the dates an item actually became available. It did
-- not: v_public_mezmur hid `created_at`, and neither the sermons nor the
-- publications view carried it, so a "newest first" feed — including the one the
-- home page ships with — failed with `column ... created_at does not exist`
-- instead of showing hymns.
--
-- The new columns are appended: Postgres will not renumber an existing view's
-- columns, and the site's typed readers already depend on these positions.
-- Sermon notes and publication bodies stay on the base tables, which RLS scopes
-- to the office, so the views remain as leak-proof as they were.

create or replace view public.v_public_sermons
as
select s.id, s.title_am, s.preacher_am, s.scripture_ref, s.topic_am, s.summary_am,
       s.delivered_on, s.language, s.listen_count, s.tags,
       am.public_url as audio_url, vm.public_url as video_url, s.video_url as external_video_url,
       s.published_at, s.created_at
  from sermons s
  left join media_files am on am.id = s.audio_media_id
  left join media_files vm on vm.id = s.video_media_id
 where s.state = 'published';

create or replace view public.v_public_mezmur
as
select mz.id, mz.title_am, mz.lyrics_am, mz.composer_am, mz.choir_am, mz.theme_am,
       mz.language, mz.duration_secs, mz.play_count, mz.tags, mz.is_scripture,
       am.public_url as audio_url, sm.public_url as sheet_url, mz.video_url,
       mz.published_at, mz.created_at
  from mezmur mz
  left join media_files am on am.id = mz.audio_media_id
  left join media_files sm on sm.id = mz.sheet_media_id
 where mz.state = 'published';

-- `published_on` is the liturgical issue date and stays the primary sort;
-- `created_at` is what the office records when a bulletin was drafted.
create or replace view public.v_public_publications
as
select p.id, p.title_am, p.kind, p.issue_label, p.summary_am, p.pages, p.price, p.currency,
       p.published_on, p.download_count, p.tags,
       fm.public_url as file_url, cm.public_url as cover_url,
       p.created_at
  from publications p
  left join media_files fm on fm.id = p.file_media_id
  left join media_files cm on cm.id = p.cover_media_id
 where p.state = 'published';

-- `create or replace view` keeps the object, so the anon/authenticated grants
-- from the original migration survive; restated here so this file stands alone.
grant select on public.v_public_sermons, public.v_public_mezmur, public.v_public_publications
  to anon, authenticated;
