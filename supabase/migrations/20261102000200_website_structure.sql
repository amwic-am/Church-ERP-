-- 02 · Website structure: settings, menus, CMS pages, blocks, leadership, FAQs

create table public.site_settings (
  key        text primary key,
  group_name text not null default 'general',
  label_am   text not null,
  hint_am    text,
  value      jsonb not null,
  value_type text not null default 'string'
             check (value_type in ('string','text','number','boolean','image','color','select','json','url','media_ref')),
  options    jsonb,                                  -- for value_type = 'select'
  is_public  boolean not null default true,          -- exposed to the anon site
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

create index site_settings_group_idx on public.site_settings (group_name, sort_order);

create table public.menus (
  id         uuid primary key default gen_random_uuid(),
  location   text not null unique,                   -- header | footer | portal_footer
  label_am   text not null,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Self-referencing tree; `page_id` for internal links, `href` for external ones.
create table public.menu_items (
  id          uuid primary key default gen_random_uuid(),
  menu_id     uuid not null references public.menus (id) on delete cascade,
  parent_id   uuid references public.menu_items (id) on delete cascade,
  label_am    text not null,
  label_en    text,
  page_id     uuid,                                    -- internal link (FK added after pages)
  href        text,
  collection  text,                                  -- news | events | gallery | sermons …
  is_visible  boolean not null default true,
  is_featured boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create index menu_items_menu_idx on public.menu_items (menu_id, parent_id nulls first, sort_order);

create table public.pages (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title_am     text not null,
  title_en     text,
  excerpt_am   text,
  template     text not null default 'generic'
               check (template in ('home','generic','article','listing','contact','faq','gallery','leadership','structure')),
  state        public.content_state not null default 'draft',
  is_nav_hidden boolean not null default false,
  published_at timestamptz,
  submitted_at timestamptz,
  reviewed_by  uuid references public.profiles (id),
  reviewed_at  timestamptz,
  review_notes text,
  seo          jsonb not null default '{}'::jsonb,
  created_by   uuid references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Ordered content sections. `section_key` binds a block to a fixed homepage or
-- page slot so the CMS editor can reorder without touching component code.
create table public.page_blocks (
  id          uuid primary key default gen_random_uuid(),
  page_id     uuid not null references public.pages (id) on delete cascade,
  section_key text not null,                          -- hero | about | departments | cta …
  block_type  text not null check (block_type in
              ('hero','richtext','stat_row','card_grid','media_list','cta','contact','faq','embed','timeline','quote')),
  title_am    text,
  title_en    text,
  body_am     text,
  body_en     text,
  items       jsonb not null default '[]',     -- cards / stats / list entries
  media_id    uuid,                                   -- fk added in 0040 with media table
  settings    jsonb not null default '{}'::jsonb,
  is_visible  boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index page_blocks_slot_idx on public.page_blocks (page_id, section_key, sort_order);

alter table public.menu_items
  add constraint menu_items_page_fk foreign key (page_id) references public.pages (id) on delete set null;

create table public.leadership (
  id         uuid primary key default gen_random_uuid(),
  name_am    text not null,
  name_en    text,
  title_am   text not null,                           -- ሊቀ ጳፓስ / ካህን / መንፈሳዊ አመራር
  role_key   text check (role_key in ('spiritual','pastoral','administrative','advisory')),
  bio_am     text,
  bio_en     text,
  media_id   uuid,
  contact    text,
  sort_order integer not null default 0,
  state      public.content_state not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Organization structure chart (spiritual → departments → units).
create table public.org_units (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references public.org_units (id) on delete cascade,
  name_am     text not null,
  name_en     text,
  head_label  text,                                   -- ሃላፊ
  head_name   text,
  summary_am  text,
  media_id    uuid,
  sort_order  integer not null default 0,
  is_visible  boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.faqs (
  id          uuid primary key default gen_random_uuid(),
  category_am text not null default 'አጠቃላይ',
  question_am text not null,
  answer_am   text not null,
  question_en text,
  answer_en   text,
  sort_order  integer not null default 0,
  state       public.content_state not null default 'draft',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger pages_touch       before update on public.pages       for each row execute function public.touch_updated_at();
create trigger page_blocks_touch before update on public.page_blocks for each row execute function public.touch_updated_at();
create trigger menus_touch       before update on public.menus       for each row execute function public.touch_updated_at();
create trigger leadership_touch  before update on public.leadership  for each row execute function public.touch_updated_at();
create trigger org_units_touch   before update on public.org_units   for each row execute function public.touch_updated_at();
create trigger faqs_touch        before update on public.faqs        for each row execute function public.touch_updated_at();
