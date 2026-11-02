-- 11 · Communication: contact, prayer requests, announcements, in-app notices,
--      subscriber list, and the email/SMS outbox

create table public.contact_messages (
  id          uuid primary key default gen_random_uuid(),
  name_am     text not null,
  email       text,
  phone       text,
  subject_am  text not null,
  message_am  text not null,
  topic       text not null default 'general'
               check (topic in ('general','registration','donation','media','prayer','volunteer','other')),
  source_url  text,
  lang        text not null default 'am',
  status      text not null default 'new'
               check (status in ('new','in_progress','replied','archived','spam')),
  assigned_to uuid references public.profiles (id) on delete set null,
  replied_by  uuid references public.profiles (id) on delete set null,
  replied_at  timestamptz,
  reply_body  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index contact_status_idx on public.contact_messages (status, created_at desc);

create table public.prayer_requests (
  id           uuid primary key default gen_random_uuid(),
  name_am      text,                                    -- null = anonymous
  contact      text,
  request_am   text not null,
  category     text not null default 'general'
                check (category in ('healing','family','travel','work','thanksgiving','deceased','church','nation','general')),
  for_whom     text,
  is_public    boolean not null default false,
  status       text not null default 'pending'
                check (status in ('pending','active','answered','archived')),
  prayed_by    uuid references public.profiles (id) on delete set null,
  answered_note text,
  requested_on date not null default current_date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index prayer_status_idx on public.prayer_requests (status, requested_on desc);

-- Audience is a structured filter evaluated by the portal queries:
-- {"roles": ["teacher"], "department_ids": [], "class_ids": [], "student_levels": []}
create table public.announcements (
  id           uuid primary key default gen_random_uuid(),
  title_am     text not null,
  body_am      text not null,
  kind         text not null default 'general'
                check (kind in ('general','academic','liturgical','event','finance','department','urgency')),
  audience     jsonb not null default '{"roles":["*"]}'::jsonb,
  priority     text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  channels     delivery_channel[] not null default '{in_app}',
  publish_at   timestamptz,
  expires_at   timestamptz,
  state        public.content_state not null default 'draft',
  pinned       boolean not null default false,
  media_id     uuid references public.media_files (id) on delete set null,
  department_id uuid references public.departments (id) on delete set null,
  created_by   uuid references public.profiles (id) on delete set null,
  reviewed_by  uuid references public.profiles (id) on delete set null,
  review_notes text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index announcements_state_idx on public.announcements (state, publish_at desc);

create table public.notification_templates (
  id         uuid primary key default gen_random_uuid(),
  key        text not null unique,                      -- application_received …
  channel    public.delivery_channel not null default 'email',
  name_am    text not null,
  subject_am text,
  body_am    text not null,                             -- {{name}} {{reference}} …
  provider   text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Every outbound email/SMS is written here first; an Edge Function drains it.
create table public.outbox_messages (
  id             uuid primary key default gen_random_uuid(),
  template_key   text references public.notification_templates (key) on delete set null,
  channel        public.delivery_channel not null,
  recipient_user_id uuid references public.profiles (id) on delete set null,
  to_address     text not null,
  subject        text,
  body           text not null,
  provider       text,
  status         public.delivery_status not null default 'queued',
  attempts       integer not null default 0,
  last_error     text,
  related        jsonb not null default '{}'::jsonb,
  queued_at      timestamptz not null default now(),
  sent_at        timestamptz,
  delivered_at   timestamptz
);

create index outbox_pending_idx on public.outbox_messages (status, queued_at);

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  title_am   text not null,
  body_am    text,
  kind       text not null default 'system',
  link       text,
  severity   text not null default 'info' check (severity in ('info','success','warning','danger')),
  read_at    timestamptz,
  archived   boolean not null default false,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, read_at, created_at desc);

create table public.notification_preferences (
  user_id  uuid not null references public.profiles (id) on delete cascade,
  kind     text not null,
  channel  public.delivery_channel not null,
  enabled  boolean not null default true,
  primary key (user_id, kind, channel)
);

create table public.subscribers (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  name_am    text,
  phone      text,
  source     text not null default 'website' check (source in ('website','erp','event','newsletter')),
  status     text not null default 'subscribed' check (status in ('subscribed','unsubscribed','bounced')),
  consent_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  topics     text[] not null default '{general}',
  created_at timestamptz not null default now()
);

-- ─── fan-out: a public submission becomes a staff task, not a silent row ─────
create or replace function public.users_with_permission(p_permission text)
returns setof uuid language sql stable security definer set search_path = public as $$
  select distinct ur.user_id
    from user_roles ur
    join role_permissions rp on rp.role_id = ur.role_id
   where rp.permission_key = p_permission
  union
  select ur.user_id
    from user_roles ur
    join roles r on r.id = ur.role_id
   where r.key = 'super_admin';
$$;

create or replace function public.notify_staff(
  p_permission text,
  p_title text,
  p_body text,
  p_link text,
  p_kind text
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer := 0;
  v_uid uuid;
begin
  for v_uid in select users_with_permission(p_permission) loop
    insert into notifications (user_id, title_am, body_am, link, kind)
    values (v_uid, p_title, p_body, p_link, p_kind);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.on_public_submission() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_kind text;
  v_title text;
  v_body text;
  v_link text;
  v_perm text;
begin
  v_kind := tg_table_name;

  if v_kind = 'applications' then
    v_title := 'አዲስ ማመልከቻ: ' || coalesce(new.full_name_am, '—');
    v_body  := 'ዓይነት፦ ' || new.kind || ' · ማጣሪያ፦ ' || new.reference;
    v_link  := '/erp/applications/' || new.id;
    v_perm  := 'applications.write';
  elsif v_kind = 'contact_messages' then
    v_title := 'አዲስ መልእክት፦ ' || coalesce(new.subject_am, '—');
    v_body  := 'ከ' || coalesce(new.name_am, '—');
    v_link  := '/erp/contact-messages';
    v_perm  := 'communication.write';
  elsif v_kind = 'prayer_requests' then
    v_title := 'አዲስ የጸሎት ጥያቄ';
    v_body  := left(new.request_am, 120);
    v_link  := '/erp/prayer-requests';
    v_perm  := 'communication.write';
  elsif v_kind = 'donations' then
    v_title := 'አዲስ ልገሳ፦ ' || coalesce(new.donor_name_am, '—');
    v_body  := new.amount::text || ' ' || new.currency;
    v_link  := '/erp/donations/' || new.id;
    v_perm  := 'finance.read';
  elsif v_kind = 'event_registrations' then
    v_title := 'ዝግጅት ለተመዘገበ፦ ' || coalesce(new.full_name_am, '—');
    v_body  := 'ተሳታፊዎች፦ ' || new.participants;
    v_link  := '/erp/events';
    v_perm  := 'events.write';
  else
    return new;
  end if;

  perform public.notify_staff(v_perm, v_title, v_body, v_link, v_kind);
  return new;
end;
$$;

create trigger applications_notify  after insert on public.applications
  for each row execute function public.on_public_submission();
create trigger contact_notify       after insert on public.contact_messages
  for each row execute function public.on_public_submission();
create trigger prayer_notify        after insert on public.prayer_requests
  for each row execute function public.on_public_submission();
create trigger donations_notify     after insert on public.donations
  for each row execute function public.on_public_submission();
create trigger event_reg_notify     after insert on public.event_registrations
  for each row execute function public.on_public_submission();

create trigger contact_touch   before update on public.contact_messages   for each row execute function public.touch_updated_at();
create trigger prayer_touch    before update on public.prayer_requests    for each row execute function public.touch_updated_at();
create trigger announce_touch  before update on public.announcements      for each row execute function public.touch_updated_at();
create trigger templates_touch before update on public.notification_templates for each row execute function public.touch_updated_at();
