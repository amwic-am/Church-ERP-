-- 04 · Media library + storage buckets
-- Storage *policies* live in 130 so they can reference the document tables.

create table public.media_categories (
  id         uuid primary key default gen_random_uuid(),
  name_am    text not null,
  slug       text not null unique,
  group_name text not null default 'site' check (group_name in ('site','academic','finance','operations')),
  is_public  boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.media_files (
  id             uuid primary key default gen_random_uuid(),
  bucket         text not null default 'media' check (bucket in ('media','private-docs')),
  storage_path   text not null,
  name           text not null,
  title_am       text,
  caption_am     text,
  alt_am         text,
  kind           text not null check (kind in ('image','audio','video','document','archive')),
  mime_type      text,
  byte_size      bigint check (byte_size is null or byte_size >= 0),
  width          integer,
  height         integer,
  duration_secs  integer,
  public_url     text,
  checksum       text,
  category_id    uuid references public.media_categories (id) on delete set null,
  tags           text[] not null default '{}',
  state          public.content_state not null default 'published',
  is_public      boolean not null default true,
  download_count integer not null default 0,
  uploaded_by    uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (bucket, storage_path)
);

create index media_files_kind_idx on public.media_files (kind, state, created_at desc);
create index media_files_category_idx on public.media_files (category_id);

-- Albums order their own photos; a photo may appear in several albums.
create table public.album_media (
  album_id   uuid not null references public.gallery_albums (id) on delete cascade,
  media_id   uuid not null references public.media_files (id) on delete cascade,
  sort_order integer not null default 0,
  caption_am text,
  primary key (album_id, media_id)
);

alter table public.page_blocks
  add constraint page_blocks_media_fk foreign key (media_id) references public.media_files (id) on delete set null;
alter table public.leadership
  add constraint leadership_media_fk foreign key (media_id) references public.media_files (id) on delete set null;
alter table public.org_units
  add constraint org_units_media_fk foreign key (media_id) references public.media_files (id) on delete set null;
alter table public.news
  add constraint news_cover_media_fk foreign key (cover_media_id) references public.media_files (id) on delete set null;
alter table public.events
  add constraint events_cover_media_fk foreign key (cover_media_id) references public.media_files (id) on delete set null;
alter table public.sermons
  add constraint sermons_audio_media_fk foreign key (audio_media_id) references public.media_files (id) on delete set null,
  add constraint sermons_video_media_fk foreign key (video_media_id) references public.media_files (id) on delete set null;
alter table public.mezmur
  add constraint mezmur_audio_media_fk foreign key (audio_media_id) references public.media_files (id) on delete set null,
  add constraint mezmur_sheet_media_fk foreign key (sheet_media_id) references public.media_files (id) on delete set null;
alter table public.publications
  add constraint publications_file_media_fk foreign key (file_media_id) references public.media_files (id) on delete set null,
  add constraint publications_cover_media_fk foreign key (cover_media_id) references public.media_files (id) on delete set null;
alter table public.gallery_albums
  add constraint albums_cover_media_fk foreign key (cover_media_id) references public.media_files (id) on delete set null;

insert into storage.buckets (id, name, public) values
  ('media', 'media', true),
  ('private-docs', 'private-docs', false)
on conflict (id) do nothing;

create trigger media_files_touch before update on public.media_files
  for each row execute function public.touch_updated_at();
