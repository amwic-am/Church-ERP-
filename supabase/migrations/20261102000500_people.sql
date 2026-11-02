-- 05 · People: students, guardians, teachers/staff, and every public application

create table public.student_profiles (
  id                uuid primary key default gen_random_uuid(),
  student_code      text not null unique,
  linked_user_id    uuid references auth.users (id) on delete set null,
  full_name_am      text not null,
  full_name_en      text,
  baptismal_name_am text,                             -- የጥምቀት ስም
  gender            public.gender,
  birth_date        date,
  eth_birth_date    text,
  phone             text,
  email             text,
  address_am        text,
  parish            text,
  photo_media_id    uuid references public.media_files (id) on delete set null,
  status            public.member_status not null default 'active',
  level_key         text,                              -- የመማሪያ ደረጃ (kids/youth/adult/…)
  enrolled_on       date,
  promoted_from_id  uuid references public.student_profiles (id) on delete set null,
  qr_token          text not null default md5(random()::text || clock_timestamp()::text),
  health_notes      text,
  notes             text,
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index student_name_trgm on public.student_profiles using gin (full_name_am extensions.gin_trgm_ops);
create index student_user_idx on public.student_profiles (linked_user_id);
create index student_status_idx on public.student_profiles (status, level_key);

create table public.guardians (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users (id) on delete set null,
  full_name_am  text not null,
  full_name_en  text,
  phone         text,
  email         text,
  occupation    text,
  address_am    text,
  parish        text,
  photo_media_id uuid references public.media_files (id) on delete set null,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index guardian_user_idx on public.guardians (user_id);

create table public.guardian_students (
  guardian_id   uuid not null references public.guardians (id) on delete cascade,
  student_id    uuid not null references public.student_profiles (id) on delete cascade,
  relation_am   text not null default 'ወላጅ',
  is_primary    boolean not null default false,
  can_consent   boolean not null default true,
  primary key (guardian_id, student_id)
);

create table public.student_documents (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.student_profiles (id) on delete cascade,
  bucket       text not null default 'private-docs',
  storage_path text not null,
  kind         text not null default 'other'
                check (kind in ('id_proof','baptism_cert','photo','medical','consent','transfer','other')),
  title_am     text,
  expires_on   date,
  uploaded_by  uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (bucket, storage_path)
);

-- Teachers are staff accounts; department heads and finance officers reuse the
-- same table so one roster serves the ERP, the site, and the teacher portal.
create table public.teacher_profiles (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users (id) on delete set null,
  staff_code      text unique,
  full_name_am    text not null,
  full_name_en    text,
  title_am        text,                                -- መምህር / ዳርስ ላቤ / አስተባባሪ
  specializations text[] not null default '{}',
  qualification   text,
  phone           text,
  email           text,
  photo_media_id  uuid references public.media_files (id) on delete set null,
  bio_am          text,
  hired_on        date,
  is_active       boolean not null default true,
  can_teach_liturgy boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index teacher_user_idx on public.teacher_profiles (user_id);
create index teacher_name_trgm on public.teacher_profiles using gin (full_name_am extensions.gin_trgm_ops);

-- One queue for every public form, discriminated by `kind`. Approving a
-- student/teacher/volunteer/member application materialises the real record.
create table public.applications (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null check (kind in ('student','teacher','volunteer','member','event')),
  reference      text not null unique,
  full_name_am   text not null,
  full_name_en   text,
  baptismal_name_am text,
  email          text,
  phone          text,
  gender         public.gender,
  birth_date     date,
  address_am     text,
  parish         text,
  guardian_name  text,
  guardian_phone text,
  level_requested text,
  department_pref text,
  skills         text[] not null default '{}',
  availability   text,
  motivation_am  text,
  documents      jsonb not null default '[]',   -- [{bucket, path, title}]
  extra          jsonb not null default '{}'::jsonb,
  status         public.application_status not null default 'pending',
  source         text not null default 'website' check (source in ('website','erp','phone','referral')),
  review_notes   text,
  reviewed_by    uuid references public.profiles (id) on delete set null,
  reviewed_at    timestamptz,
  -- conversion targets
  converted_student_id uuid references public.student_profiles (id) on delete set null,
  converted_teacher_id uuid references public.teacher_profiles (id) on delete set null,
  converted_user_id    uuid references public.profiles (id) on delete set null,
  submitted_at   timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index applications_kind_status on public.applications (kind, status, submitted_at desc);
create unique index applications_one_pending_member on public.applications (phone, kind)
  where kind = 'member' and status in ('pending','under_review');

-- Tracking numbers are issued by the database so a public form never has to
-- invent one: STU-2026-000123 / TCH-… / VOL-… / MEM-…
create or replace function public.assign_application_ref() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_prefix text;
  v_seq bigint;
begin
  if new.reference is not null and new.reference <> '' then
    return new;
  end if;

  v_prefix := upper(substr(new.kind, 1, 3)) || '-' || to_char(now(), 'YYYY');

  select count(*) + 1 into v_seq
    from applications
   where reference like v_prefix || '-%';

  -- Retry on the rare race between two concurrent inserts.
  while exists (select 1 from applications
                 where reference = v_prefix || '-' || lpad(v_seq::text, 6, '0')) loop
    v_seq := v_seq + 1;
  end loop;

  new.reference := v_prefix || '-' || lpad(v_seq::text, 6, '0');
  return new;
end;
$$;

create trigger applications_assign_ref before insert on public.applications
  for each row execute function public.assign_application_ref();

-- Student ID cards: printable record with the QR payload used for check-in.
create table public.student_id_cards (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.student_profiles (id) on delete cascade,
  serial       text not null unique,
  issued_on    date not null default current_date,
  expires_on   date,
  qr_payload   text not null,
  card_design  jsonb not null default '{}'::jsonb,
  printed_by   uuid references public.profiles (id) on delete set null,
  printed_at   timestamptz,
  created_at   timestamptz not null default now()
);

create trigger students_touch  before update on public.student_profiles   for each row execute function public.touch_updated_at();
create trigger guardians_touch before update on public.guardians           for each row execute function public.touch_updated_at();
create trigger teachers_touch  before update on public.teacher_profiles    for each row execute function public.touch_updated_at();
create trigger apps_touch      before update on public.applications        for each row execute function public.touch_updated_at();
