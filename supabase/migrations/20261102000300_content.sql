-- 03 · Content: news, events, sermons, mezmur, publications, albums, approvals

create table public.news (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title_am     text not null,
  title_en     text,
  summary_am   text,
  body_am      text,
  body_en      text,
  category_am  text not null default 'ዜና',
  tags         text[] not null default '{}',
  cover_media_id uuid,
  author_id    uuid references public.profiles (id),
  state        public.content_state not null default 'draft',
  is_featured  boolean not null default false,
  allow_comments boolean not null default false,
  views        integer not null default 0,
  published_at timestamptz,
  submitted_at timestamptz,
  reviewed_by  uuid references public.profiles (id),
  review_notes text,
  seo          jsonb not null default '{}'::jsonb,
  created_by   uuid references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index news_state_published on public.news (state, published_at desc);
create index news_title_trgm on public.news using gin (title_am extensions.gin_trgm_ops);

-- Liturgical events carry both the Gregorian instant (sorting / calendars) and
-- the Ethiopian date the congregation actually reads.
create table public.events (
  id                   uuid primary key default gen_random_uuid(),
  slug                 text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title_am             text not null,
  title_en             text,
  summary_am           text,
  body_am              text,
  event_type           text not null default 'program'
                        check (event_type in ('worship','fasting','feast','program','class','meeting','conference','outreach','other')),
  liturgical_season    text,
  starts_at            timestamptz not null,
  ends_at              timestamptz,
  all_day              boolean not null default false,
  eth_date             text,                          -- ፩ ሰኞ ጥር ፳፻፲፱ stored as rendered text
  venue_am             text,
  venue_en             text,
  location_url         text,
  capacity             integer,
  registration_required boolean not null default false,
  registration_deadline timestamptz,
  fee                  numeric(12,2),
  currency             text not null default 'ETB',
  cover_media_id       uuid,
  tags                 text[] not null default '{}',
  state                public.content_state not null default 'draft',
  is_featured          boolean not null default false,
  published_at         timestamptz,
  submitted_at         timestamptz,
  reviewed_by          uuid references public.profiles (id),
  review_notes         text,
  seo                  jsonb not null default '{}'::jsonb,
  created_by           uuid references public.profiles (id),
  department_id        uuid,                          -- fk added in 0080
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);

create index events_starts_idx on public.events (starts_at);
create index events_state_idx on public.events (state, starts_at desc);

create table public.event_registrations (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events (id) on delete cascade,
  full_name_am text not null,
  phone        text,
  email        text,
  parish       text,
  participants integer not null default 1 check (participants between 1 and 50),
  notes        text,
  source       text not null default 'website' check (source in ('website','erp','phone')),
  status       text not null default 'registered'
                check (status in ('registered','attended','cancelled','no_show')),
  checked_in_by uuid references public.profiles (id),
  checked_in_at timestamptz,
  created_at   timestamptz not null default now(),
  unique (event_id, phone, full_name_am)
);

create index event_reg_event_idx on public.event_registrations (event_id, status);

create table public.sermons (
  id            uuid primary key default gen_random_uuid(),
  title_am      text not null,
  title_en      text,
  preacher_am   text not null,
  preacher_en   text,
  scripture_ref text,
  topic_am      text,
  summary_am    text,
  delivered_on  date not null,
  event_id      uuid references public.events (id) on delete set null,
  audio_media_id uuid,
  video_media_id uuid,
  video_url     text,
  transcript_am text,
  language      text not null default 'am',
  listen_count  integer not null default 0,
  tags          text[] not null default '{}',
  state         public.content_state not null default 'draft',
  published_at  timestamptz,
  review_notes  text,
  created_by    uuid references public.profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index sermons_delivered_idx on public.sermons (delivered_on desc);

create table public.mezmur (
  id            uuid primary key default gen_random_uuid(),
  title_am      text not null,
  title_en      text,
  lyrics_am     text,
  composer_am   text,
  arranger_am   text,
  choir_am      text,
  audio_media_id uuid,
  video_url     text,
  sheet_media_id uuid,
  theme_am      text,                                 -- ዕይታ / ሥርዓት category
  language      text not null default 'am',
  duration_secs integer,
  play_count    integer not null default 0,
  is_scripture  boolean not null default false,
  tags          text[] not null default '{}',
  state         public.content_state not null default 'draft',
  published_at  timestamptz,
  review_notes  text,
  created_by    uuid references public.profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index mezmur_theme_idx on public.mezmur (theme_am, state);

create table public.publications (
  id           uuid primary key default gen_random_uuid(),
  title_am     text not null,
  title_en     text,
  kind         text not null default 'book'
                check (kind in ('book','bulletin','magazine','newsletter','study','leaflet','annual_report')),
  issue_label  text,
  summary_am   text,
  body_am      text,
  file_media_id uuid,
  cover_media_id uuid,
  pages        integer,
  price        numeric(12,2),
  currency     text not null default 'ETB',
  published_on date,
  state        public.content_state not null default 'draft',
  tags         text[] not null default '{}',
  download_count integer not null default 0,
  created_by   uuid references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.gallery_albums (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title_am     text not null,
  title_en     text,
  description_am text,
  event_id     uuid references public.events (id) on delete set null,
  department_id uuid,                                 -- fk added in 0080
  taken_on     date,
  cover_media_id uuid,
  state        public.content_state not null default 'draft',
  is_public    boolean not null default true,
  published_at timestamptz,
  review_notes text,
  created_by   uuid references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ─── generic approval workflow ───────────────────────────────────────────────
-- Content, finance and academic requests all route through one queue so the
-- ERP "Approval Workflow" screen and approver roles stay in one place.
create table public.approval_requests (
  id            uuid primary key default gen_random_uuid(),
  domain        text not null check (domain in ('content','finance','academic','operations')),
  entity_table  text not null,
  entity_id     uuid not null,
  entity_label  text,
  action        text not null default 'publish' check (action in ('publish','unpublish','expense','budget','promotion','discount','archive','other')),
  amount        numeric(14,2),
  currency      text not null default 'ETB',
  payload       jsonb not null default '{}'::jsonb,
  reason        text,
  status        text not null default 'pending'
                 check (status in ('pending','approved','rejected','cancelled','needs_info')),
  submitted_by  uuid references public.profiles (id) on delete set null,
  assigned_role text,                                 -- role key allowed to approve
  decided_by    uuid references public.profiles (id) on delete set null,
  decided_at    timestamptz,
  decision_note text,
  required_amount_limit numeric(14,2),                -- over this, escalate role
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index approval_open_idx on public.approval_requests (status, domain, created_at desc);

create trigger news_touch         before update on public.news         for each row execute function public.touch_updated_at();
create trigger events_touch       before update on public.events       for each row execute function public.touch_updated_at();
create trigger sermons_touch      before update on public.sermons      for each row execute function public.touch_updated_at();
create trigger mezmur_touch       before update on public.mezmur       for each row execute function public.touch_updated_at();
create trigger publications_touch before update on public.publications for each row execute function public.touch_updated_at();
create trigger albums_touch       before update on public.gallery_albums for each row execute function public.touch_updated_at();
create trigger approvals_touch    before update on public.approval_requests for each row execute function public.touch_updated_at();
