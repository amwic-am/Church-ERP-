-- 07 · Attendance: roll-call sessions and per-student records

create table public.attendance_sessions (
  id             uuid primary key default gen_random_uuid(),
  class_id       uuid not null references public.classes (id) on delete cascade,
  session_id     uuid references public.class_sessions (id) on delete set null,
  taken_on       date not null,
  starts_at      time,
  label_am       text,                                  -- e.g. "ዕርገት ማርያም – ንባብ"
  teacher_id     uuid references public.teacher_profiles (id) on delete set null,
  taken_by       uuid references public.profiles (id) on delete set null,
  expected_count integer not null default 0,
  present_count  integer not null default 0,
  absent_count   integer not null default 0,
  late_count     integer not null default 0,
  excused_count  integer not null default 0,
  status         text not null default 'open' check (status in ('open','closed','corrected')),
  closed_at      timestamptz,
  notes_am       text,
  created_at     timestamptz not null default now()
);

create unique index attendance_session_unique on public.attendance_sessions
  (class_id, taken_on, starts_at) nulls not distinct;

create index attendance_sessions_date_idx on public.attendance_sessions (taken_on desc);
create index attendance_sessions_class_idx on public.attendance_sessions (class_id, taken_on desc);

create table public.attendance_records (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.attendance_sessions (id) on delete cascade,
  student_id   uuid not null references public.student_profiles (id) on delete cascade,
  status       public.attendance_status not null default 'present',
  minutes_late integer not null default 0,
  reason_am    text,
  guardian_contacted boolean not null default false,
  recorded_by  uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (session_id, student_id)
);

create index attendance_student_idx on public.attendance_records (student_id, status);

-- Session counters are recomputed from the records so the ERP list view,
-- reports and the student portal never disagree.
create or replace function public.recount_attendance_session(p_session uuid) returns void
language sql security definer set search_path = public as $$
  update attendance_sessions s
     set expected_count = (
           select count(*) from student_enrollments e
            where e.class_id = s.class_id and e.status = 'enrolled'
         ),
         present_count = (select count(*) from attendance_records r where r.session_id = s.id and r.status = 'present'),
         absent_count  = (select count(*) from attendance_records r where r.session_id = s.id and r.status = 'absent'),
         late_count    = (select count(*) from attendance_records r where r.session_id = s.id and r.status = 'late'),
         excused_count = (select count(*) from attendance_records r where r.session_id = s.id and r.status = 'excused')
   where s.id = p_session;
$$;

-- The stored headcounts are a recount of every record in the session, not of
-- the rows the person saving happens to be allowed to see.
create or replace function public.sync_attendance_session() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform public.recount_attendance_session(old.session_id);
    return old;
  end if;
  perform public.recount_attendance_session(new.session_id);
  return new;
end;
$$;

create trigger attendance_records_sync
  after insert or update or delete on public.attendance_records
  for each row execute function public.sync_attendance_session();

-- Marking a session closed also marks the owning class session attended.
create or replace function public.close_attendance_session(p_session uuid, p_actor uuid default auth.uid())
returns public.attendance_sessions language plpgsql security definer set search_path = public as $$
declare
  v public.attendance_sessions%rowtype;
begin
  if not (public.has_permission('attendance.write', p_actor) or public.is_super_admin(p_actor)) then
    raise exception 'not allowed to close an attendance session';
  end if;

  update attendance_sessions
     set status = 'closed', closed_at = now(), taken_by = coalesce(taken_by, p_actor)
   where id = p_session
  returning * into v;

  if not found then
    raise exception 'attendance session % not found', p_session;
  end if;

  if v.session_id is not null then
    update class_sessions set attendance_taken = true where id = v.session_id;
  end if;

  perform public.recount_attendance_session(p_session);
  return v;
end;
$$;

create trigger attendance_records_touch before update on public.attendance_records
  for each row execute function public.touch_updated_at();
