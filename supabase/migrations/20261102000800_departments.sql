-- 08 · Members, departments, mezmur & choir, volunteering

create table public.members (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users (id) on delete set null,
  member_code       text unique,
  full_name_am      text not null,
  full_name_en      text,
  baptismal_name_am text,
  gender            public.gender,
  birth_date        date,
  phone             text,
  email             text,
  address_am        text,
  parish            text,
  photo_media_id    uuid references public.media_files (id) on delete set null,
  status            public.member_status not null default 'active',
  joined_on         date,
  is_volunteer      boolean not null default false,
  is_clergy         boolean not null default false,
  notes             text,
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index members_name_trgm on public.members using gin (full_name_am extensions.gin_trgm_ops);
create index members_user_idx on public.members (user_id);
create index members_status_idx on public.members (status, is_volunteer);

create table public.departments (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name_am        text not null,
  name_en        text,
  summary_am     text,
  mission_am     text,
  icon           text,                                 -- lucide icon name
  accent_color   text,
  head_member_id uuid references public.members (id) on delete set null,
  coordinator_member_id uuid references public.members (id) on delete set null,
  contact_phone  text,
  contact_email  text,
  sort_order     integer not null default 0,
  is_public      boolean not null default true,
  state          public.content_state not null default 'published',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.department_members (
  id            uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments (id) on delete cascade,
  member_id     uuid not null references public.members (id) on delete cascade,
  role_key      text not null default 'member'
                 check (role_key in ('head','vice_head','secretary','treasurer','coordinator','member','advisor')),
  title_am      text,
  joined_on     date not null default current_date,
  ended_on      date,
  status        text not null default 'active' check (status in ('active','inactive','transferred')),
  note_am       text,
  created_at    timestamptz not null default now(),
  unique (department_id, member_id)
);

create index dept_members_member_idx on public.department_members (member_id, status);

create table public.department_activities (
  id             uuid primary key default gen_random_uuid(),
  department_id  uuid not null references public.departments (id) on delete cascade,
  event_id       uuid references public.events (id) on delete set null,
  title_am       text not null,
  kind           text not null default 'meeting'
                  check (kind in ('meeting','service','outreach','training','performance','visit','project','other')),
  activity_on    date not null,
  location_am    text,
  summary_am     text,
  outcome_am     text,
  participants   jsonb not null default '[]',    -- [{member_id, role}]
  hours          numeric(6,2),
  budget_spent   numeric(14,2),
  currency       text not null default 'ETB',
  photos         jsonb not null default '[]',    -- [media_id]
  status         text not null default 'planned' check (status in ('planned','ongoing','completed','cancelled')),
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index dept_activities_idx on public.department_activities (department_id, activity_on desc);

-- ─── mezmur & choir ──────────────────────────────────────────────────────────
create table public.choirs (
  id           uuid primary key default gen_random_uuid(),
  name_am      text not null,
  name_en      text,
  department_id uuid references public.departments (id) on delete set null,
  conductor_member_id uuid references public.members (id) on delete set null,
  summary_am   text,
  photo_media_id uuid references public.media_files (id) on delete set null,
  is_public    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.choir_members (
  choir_id     uuid not null references public.choirs (id) on delete cascade,
  member_id    uuid not null references public.members (id) on delete cascade,
  voice_part   text check (voice_part in ('soprano','alto','tenor','bass','leader','kebero','washint','krar','other')),
  joined_on    date not null default current_date,
  status       text not null default 'active' check (status in ('active','inactive')),
  primary key (choir_id, member_id)
);

create table public.choir_performances (
  id           uuid primary key default gen_random_uuid(),
  choir_id     uuid references public.choirs (id) on delete set null,
  event_id     uuid references public.events (id) on delete set null,
  performed_on date not null,
  setlist      jsonb not null default '[]',       -- [{mezmur_id, order}]
  attendance   jsonb not null default '[]',       -- [member_id]
  notes_am     text,
  created_at   timestamptz not null default now()
);

-- ─── volunteering ────────────────────────────────────────────────────────────
create table public.volunteer_profiles (
  id             uuid primary key default gen_random_uuid(),
  member_id      uuid not null unique references public.members (id) on delete cascade,
  application_id uuid references public.applications (id) on delete set null,
  skills         text[] not null default '{}',
  interests      text[] not null default '{}',
  availability   text,
  service_areas  text[] not null default '{}',
  status         text not null default 'active' check (status in ('pending','active','on_hold','inactive')),
  hours_logged   numeric(8,2) not null default 0,
  approved_by    uuid references public.profiles (id) on delete set null,
  approved_on    date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.volunteer_assignments (
  id            uuid primary key default gen_random_uuid(),
  volunteer_id  uuid not null references public.volunteer_profiles (id) on delete cascade,
  activity_id   uuid references public.department_activities (id) on delete set null,
  event_id      uuid references public.events (id) on delete set null,
  department_id uuid references public.departments (id) on delete set null,
  role_am       text,
  hours         numeric(6,2) not null default 0,
  assigned_on   date not null default current_date,
  status        text not null default 'assigned' check (status in ('assigned','completed','cancelled')),
  note_am       text,
  created_at    timestamptz not null default now()
);

create index volunteer_assign_idx on public.volunteer_assignments (volunteer_id, status);

-- Logged hours are recomputed from completed assignments, so status changes and
-- deletions can never leave a volunteer profile out of balance.
create or replace function public.recalc_volunteer_hours(p_volunteer uuid) returns void
language sql security definer set search_path = public as $$
  update volunteer_profiles vp
     set hours_logged = coalesce((
           select sum(va.hours) from volunteer_assignments va
            where va.volunteer_id = vp.id and va.status = 'completed'
         ), 0)
   where vp.id = p_volunteer;
$$;

-- Hours and service counts are recomputed from every log, whatever the writer
-- happens to be allowed to see, so the volunteer record stays the one agreed number.
create or replace function public.sync_volunteer_hours() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalc_volunteer_hours(old.volunteer_id);
    return old;
  end if;
  perform public.recalc_volunteer_hours(new.volunteer_id);
  if tg_op = 'UPDATE' and new.volunteer_id is distinct from old.volunteer_id then
    perform public.recalc_volunteer_hours(old.volunteer_id);
  end if;
  return new;
end;
$$;

create trigger volunteer_hours_sync
  after insert or update or delete on public.volunteer_assignments
  for each row execute function public.sync_volunteer_hours();

-- ─── deferred department links ───────────────────────────────────────────────
alter table public.events
  add constraint events_department_fk foreign key (department_id) references public.departments (id) on delete set null;
alter table public.gallery_albums
  add constraint albums_department_fk foreign key (department_id) references public.departments (id) on delete set null;
alter table public.classes
  add constraint classes_department_fk foreign key (department_id) references public.departments (id) on delete set null;

create trigger members_touch      before update on public.members                for each row execute function public.touch_updated_at();
create trigger departments_touch  before update on public.departments            for each row execute function public.touch_updated_at();
create trigger activities_touch   before update on public.department_activities  for each row execute function public.touch_updated_at();
create trigger choirs_touch       before update on public.choirs                 for each row execute function public.touch_updated_at();
create trigger volunteers_touch   before update on public.volunteer_profiles     for each row execute function public.touch_updated_at();
