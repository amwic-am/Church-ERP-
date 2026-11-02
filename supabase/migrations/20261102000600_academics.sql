-- 06 · Academics: years, levels, classes, subjects, curriculum, enrollment,
--      sessions, exams, results, lesson plans, materials, promotion, certificates

create table public.academic_years (
  id         uuid primary key default gen_random_uuid(),
  label_am   text not null unique,                      -- ፳፻፲፱ ሥ.ዓ
  eth_year   integer,
  starts_on  date,
  ends_on    date,
  is_current boolean not null default false,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index academic_years_current_one on public.academic_years (is_current) where is_current;

create table public.class_levels (
  id             uuid primary key default gen_random_uuid(),
  key            text not null unique check (key ~ '^[a-z][a-z0-9_]*$'),
  name_am        text not null,
  order_no       integer not null default 0,
  age_min        integer,
  age_max        integer,
  description_am text,
  next_level_id  uuid references public.class_levels (id) on delete set null,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

create table public.classes (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,
  name_am          text not null,
  level_id         uuid references public.class_levels (id) on delete set null,
  academic_year_id uuid references public.academic_years (id) on delete set null,
  department_id    uuid,                                -- fk added in 08
  room_am          text,
  capacity         integer,
  meets_summary_am text,
  schedule         jsonb not null default '[]',   -- [{day: 0-6, start:"09:00", end:"10:00"}]
  age_min          integer,
  age_max          integer,
  description_am   text,
  is_active        boolean not null default true,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index classes_year_idx on public.classes (academic_year_id, is_active);

create table public.subjects (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,
  name_am        text not null,
  name_en        text,
  level_id       uuid references public.class_levels (id) on delete set null,
  category_am    text,
  description_am text,
  weekly_hours   numeric(4,2),
  order_no       integer not null default 0,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.curriculum_units (
  id             uuid primary key default gen_random_uuid(),
  subject_id     uuid not null references public.subjects (id) on delete cascade,
  level_id       uuid references public.class_levels (id) on delete set null,
  unit_no        integer not null,
  title_am       text not null,
  summary_am     text,
  objectives_am  text,
  scripture_refs text,
  duration_weeks integer not null default 1,
  materials      jsonb not null default '[]',
  is_published   boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (subject_id, level_id, unit_no)
);

create table public.class_subjects (
  class_id   uuid not null references public.classes (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  primary key (class_id, subject_id)
);

create table public.class_teachers (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid not null references public.classes (id) on delete cascade,
  teacher_id  uuid not null references public.teacher_profiles (id) on delete cascade,
  subject_id  uuid references public.subjects (id) on delete cascade,
  role_key    text not null default 'lead' check (role_key in ('lead','assistant','guest')),
  assigned_on date not null default current_date,
  removed_on  date,
  created_at  timestamptz not null default now()
);

-- A teacher holds one lead row per class/subject pair (null subject = whole class).
create unique index class_teachers_unique on public.class_teachers
  (class_id, teacher_id, subject_id) nulls not distinct;

create table public.student_enrollments (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references public.student_profiles (id) on delete cascade,
  class_id         uuid not null references public.classes (id) on delete cascade,
  academic_year_id uuid references public.academic_years (id) on delete set null,
  status           text not null default 'enrolled'
                    check (status in ('enrolled','graduated','transferred','dropped','suspended')),
  enrolled_on      date not null default current_date,
  ended_on         date,
  seat_note        text,
  created_at       timestamptz not null default now()
);

create unique index enrollment_unique on public.student_enrollments
  (student_id, class_id, academic_year_id) nulls not distinct;
create index enrollment_class_idx on public.student_enrollments (class_id, status);
create index enrollment_student_idx on public.student_enrollments (student_id, status);

create table public.class_sessions (
  id               uuid primary key default gen_random_uuid(),
  class_id         uuid not null references public.classes (id) on delete cascade,
  subject_id       uuid references public.subjects (id) on delete set null,
  unit_id          uuid references public.curriculum_units (id) on delete set null,
  held_on          date not null,
  starts_at        time,
  ends_at          time,
  topic_am         text,
  teacher_id       uuid references public.teacher_profiles (id) on delete set null,
  summary_am       text,
  homework_am      text,
  attendance_taken boolean not null default false,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now()
);

create unique index session_unique on public.class_sessions (class_id, held_on, starts_at) nulls not distinct;
create index sessions_date_idx on public.class_sessions (held_on desc);

create table public.grade_scales (
  id          uuid primary key default gen_random_uuid(),
  name_am     text not null,
  letter      text not null,
  min_percent numeric(5,2) not null,
  max_percent numeric(5,2) not null,
  remark_am   text,
  order_no    integer not null default 0,
  check (max_percent >= min_percent)
);

create table public.exams (
  id               uuid primary key default gen_random_uuid(),
  class_id         uuid not null references public.classes (id) on delete cascade,
  subject_id       uuid references public.subjects (id) on delete set null,
  academic_year_id uuid references public.academic_years (id) on delete set null,
  title_am         text not null,
  exam_type        text not null default 'final'
                    check (exam_type in ('quiz','oral','written','practical','midterm','final')),
  exam_on          date,
  total_marks      numeric(6,2) not null default 100 check (total_marks > 0),
  weight_percent   numeric(5,2) not null default 100,
  pass_mark        numeric(6,2),
  state            public.content_state not null default 'draft',
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index exams_class_idx on public.exams (class_id, exam_on desc);

create table public.exam_results (
  id          uuid primary key default gen_random_uuid(),
  exam_id     uuid not null references public.exams (id) on delete cascade,
  student_id  uuid not null references public.student_profiles (id) on delete cascade,
  marks       numeric(6,2),
  percent     numeric(5,2),
  grade_letter text,
  status      text not null default 'draft' check (status in ('draft','graded','released','absent')),
  remarks_am  text,
  entered_by  uuid references public.profiles (id) on delete set null,
  entered_at  timestamptz,
  released_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (exam_id, student_id)
);

create index exam_results_student_idx on public.exam_results (student_id, status);

-- Percent and letter grade are derived server-side so every portal, report and
-- export agrees on the same number. The trigger reads the grade scale and exam
-- totals, so it runs with owner rights: a teacher who cannot list every scale
-- must still get the same letter as the registrar.
create or replace function public.sync_exam_result() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_total numeric;
  v_scale public.grade_scales%rowtype;
begin
  if new.marks is null then
    new.percent := null;
    new.grade_letter := null;
    return new;
  end if;

  select total_marks into v_total from public.exams where id = new.exam_id;
  if v_total is null or v_total = 0 then
    raise exception 'exam % has no positive total_marks', new.exam_id;
  end if;
  if new.marks < 0 or new.marks > v_total then
    raise exception 'marks % out of range for exam total %', new.marks, v_total;
  end if;

  new.percent := round(new.marks * 100.0 / v_total, 2);

  select * into v_scale
    from public.grade_scales gs
   where gs.id is not null
     and new.percent between gs.min_percent and gs.max_percent
   order by gs.min_percent desc
   limit 1;

  if found then
    new.grade_letter := v_scale.letter;
  end if;

  if new.status = 'draft' and new.marks is not null then
    new.status := 'graded';
  end if;

  return new;
end;
$$;

create trigger exam_results_sync
  before insert or update on public.exam_results
  for each row execute function public.sync_exam_result();

create table public.lesson_plans (
  id            uuid primary key default gen_random_uuid(),
  teacher_id    uuid not null references public.teacher_profiles (id) on delete cascade,
  class_id      uuid references public.classes (id) on delete set null,
  subject_id    uuid references public.subjects (id) on delete set null,
  unit_id       uuid references public.curriculum_units (id) on delete set null,
  plan_for      date not null,
  title_am      text not null,
  objectives_am text,
  content_am    text,
  activities_am text,
  materials_am  text,
  assessment_am text,
  reflection_am text,
  status        text not null default 'draft' check (status in ('draft','submitted','approved','rejected')),
  reviewed_by   uuid references public.profiles (id) on delete set null,
  review_notes  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.learning_materials (
  id             uuid primary key default gen_random_uuid(),
  title_am       text not null,
  kind           text not null default 'document'
                  check (kind in ('note','slide','audio','video','book','worksheet','link')),
  summary_am     text,
  class_id       uuid references public.classes (id) on delete cascade,
  subject_id     uuid references public.subjects (id) on delete cascade,
  unit_id        uuid references public.curriculum_units (id) on delete set null,
  media_id       uuid references public.media_files (id) on delete set null,
  external_url   text,
  is_public      boolean not null default false,
  state          public.content_state not null default 'draft',
  download_count integer not null default 0,
  uploaded_by    uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.promotion_batches (
  id            uuid primary key default gen_random_uuid(),
  title_am      text not null,
  from_year_id  uuid references public.academic_years (id) on delete set null,
  to_year_id    uuid references public.academic_years (id) on delete set null,
  from_level_id uuid references public.class_levels (id) on delete set null,
  to_level_id   uuid references public.class_levels (id) on delete set null,
  criteria      jsonb not null default '{}'::jsonb,      -- {min_percent: 60, max_absence_pct: 25}
  status        text not null default 'draft' check (status in ('draft','submitted','approved','executed','rejected')),
  decided_by    uuid references public.profiles (id) on delete set null,
  executed_at   timestamptz,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.promotion_items (
  batch_id           uuid not null references public.promotion_batches (id) on delete cascade,
  student_id         uuid not null references public.student_profiles (id) on delete cascade,
  from_class_id      uuid references public.classes (id) on delete set null,
  to_class_id        uuid references public.classes (id) on delete set null,
  average_percent    numeric(5,2),
  attendance_percent numeric(5,2),
  decision           text not null default 'pending' check (decision in ('pending','promote','hold','repeat')),
  note_am            text,
  primary key (batch_id, student_id)
);

create table public.certificate_templates (
  id                 uuid primary key default gen_random_uuid(),
  name_am            text not null,
  kind               text not null default 'completion'
                      check (kind in ('completion','merit','participation','teacher_appreciation','leadership')),
  heading_am         text,
  body_am            text,                               -- {{student}} {{class}} {{year}} {{date}}
  issuer_am          text,
  signature_name_am  text,
  signature_title_am text,
  logo_media_id      uuid references public.media_files (id) on delete set null,
  seal_media_id      uuid references public.media_files (id) on delete set null,
  design             jsonb not null default '{}'::jsonb,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table public.issued_certificates (
  id                uuid primary key default gen_random_uuid(),
  certificate_no    text not null unique,
  verification_code text not null unique,
  student_id        uuid not null references public.student_profiles (id) on delete cascade,
  template_id       uuid references public.certificate_templates (id) on delete set null,
  title_am          text not null,
  issued_on         date not null default current_date,
  academic_year_id  uuid references public.academic_years (id) on delete set null,
  class_id          uuid references public.classes (id) on delete set null,
  render_snapshot   jsonb not null default '{}'::jsonb,
  verified_at       timestamptz,
  issued_by         uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now()
);

create table public.discipline_records (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references public.student_profiles (id) on delete cascade,
  recorded_on      date not null default current_date,
  severity         text not null default 'note'
                    check (severity in ('note','warning','counselling','suspension','resolved')),
  description_am   text not null,
  action_am        text,
  guardian_informed boolean not null default false,
  handled_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger academic_years_touch before update on public.academic_years     for each row execute function public.touch_updated_at();
create trigger classes_touch        before update on public.classes            for each row execute function public.touch_updated_at();
create trigger subjects_touch       before update on public.subjects           for each row execute function public.touch_updated_at();
create trigger curriculum_touch     before update on public.curriculum_units   for each row execute function public.touch_updated_at();
create trigger exams_touch          before update on public.exams              for each row execute function public.touch_updated_at();
create trigger lesson_plans_touch   before update on public.lesson_plans       for each row execute function public.touch_updated_at();
create trigger materials_touch      before update on public.learning_materials for each row execute function public.touch_updated_at();
create trigger promotions_touch     before update on public.promotion_batches  for each row execute function public.touch_updated_at();
create trigger templates_touch      before update on public.certificate_templates for each row execute function public.touch_updated_at();
create trigger discipline_touch     before update on public.discipline_records for each row execute function public.touch_updated_at();
