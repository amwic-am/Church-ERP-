-- 13 · Domain operations: the RPCs behind real ERP buttons
-- These are SECURITY DEFINER on purpose: teachers and department heads act
-- through narrow permission-checked entry points instead of raw table writes,
-- and every write path is covered by the audit triggers in migration 140.

-- ─── cross-domain scoping helpers (tables now exist) ─────────────────────────
create or replace function public.my_student_id(p_user uuid default auth.uid())
returns uuid language sql stable security definer set search_path = public as $$
  select id from student_profiles where linked_user_id = p_user limit 1;
$$;

create or replace function public.my_guardian_id(p_user uuid default auth.uid())
returns uuid language sql stable security definer set search_path = public as $$
  select id from guardians where user_id = p_user limit 1;
$$;

create or replace function public.is_student_portal_user(p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select p_user is not null and exists (select 1 from student_profiles where linked_user_id = p_user);
$$;

create or replace function public.is_guardian_of(p_student uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select p_user is not null and exists (
    select 1
      from guardian_students gs
      join guardians g on g.id = gs.guardian_id
     where gs.student_id = p_student and g.user_id = p_user
  );
$$;

-- Staff may read a student when granted globally, when the class is inside
-- their scope, or when they teach a class the student is enrolled in.
create or replace function public.can_read_student(p_student uuid, p_user uuid default auth.uid())
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_teacher uuid;
begin
  if p_user is null then return false; end if;
  if public.is_super_admin(p_user) then return true; end if;
  if public.has_permission('students.read', p_user) or public.has_permission('students.write', p_user) then
    return true;
  end if;
  if public.is_guardian_of(p_student, p_user) then return true; end if;

  if exists (
    select 1 from student_enrollments se
     where se.student_id = p_student
       and se.class_id = any (public.scope_ids('class_ids', p_user))
  ) then return true; end if;

  select id into v_teacher from teacher_profiles where user_id = p_user;
  if v_teacher is not null and exists (
    select 1
      from class_teachers ct
      join student_enrollments se on se.class_id = ct.class_id
     where ct.teacher_id = v_teacher and se.student_id = p_student
  ) then return true; end if;

  return false;
end;
$$;

-- ─── student codes ───────────────────────────────────────────────────────────
create sequence public.student_code_seq;

create or replace function public.assign_student_code() returns trigger
language plpgsql as $$
begin
  if new.student_code is null or new.student_code = '' then
    new.student_code := 'TT-' || to_char(coalesce(new.enrolled_on, current_date), 'YYYY')
                        || '-' || lpad(nextval('public.student_code_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

create trigger student_code before insert on public.student_profiles
  for each row execute function public.assign_student_code();

-- ─── applications ────────────────────────────────────────────────────────────
-- Approving a public form creates the real record, so nothing is entered twice.
create or replace function public.approve_application(p_id uuid, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v public.applications%rowtype;
  v_student  uuid;
  v_teacher  uuid;
  v_member   uuid;
  v_guardian uuid;
  v_volunteer uuid;
begin
  select * into v from applications where id = p_id;
  if not found then raise exception 'application % not found', p_id; end if;
  if v.status in ('approved','rejected','withdrawn') then
    raise exception 'application % is already %', p_id, v.status;
  end if;
  if not public.has_permission('applications.write') then
    raise exception 'missing applications.write permission';
  end if;

  if v.kind = 'student' then
    insert into student_profiles
      (full_name_am, full_name_en, baptismal_name_am, gender, birth_date, phone, email,
       address_am, parish, status, level_key, enrolled_on, notes, created_by)
    values
      (v.full_name_am, v.full_name_en, v.baptismal_name_am, v.gender, v.birth_date, v.phone, v.email,
       v.address_am, v.parish, 'active',
       coalesce(v.level_requested, (select key from class_levels order by order_no limit 1)),
       current_date, v.motivation_am, actor_user_id())
    returning id into v_student;

    if v.guardian_name is not null and coalesce(v.extra ->> 'link_guardian', 'true') <> 'false' then
      insert into guardians (full_name_am, phone, email, parish)
      values (v.guardian_name, v.guardian_phone, v.email, v.parish)
      returning id into v_guardian;

      insert into guardian_students (guardian_id, student_id, relation_am, is_primary)
      values (v_guardian, v_student, coalesce(v.extra ->> 'guardian_relation', 'ወላጅ'), true);
    end if;

    insert into student_documents (student_id, storage_path, kind, title_am)
    select v_student, d ->> 'path', coalesce(d ->> 'kind', 'other'), d ->> 'title'
      from jsonb_array_elements(v.documents) as d
     where coalesce(d ->> 'bucket', 'private-docs') = 'private-docs'
       and d ->> 'path' is not null;

  elsif v.kind = 'teacher' then
    insert into teacher_profiles
      (full_name_am, full_name_en, title_am, specializations, qualification, phone, email, hired_on, bio_am)
    values
      (v.full_name_am, v.full_name_en, coalesce(v.extra ->> 'title_am', 'መምህር'), v.skills,
       v.extra ->> 'qualification', v.phone, v.email, current_date, v.motivation_am)
    returning id into v_teacher;

  else
    insert into members
      (full_name_am, full_name_en, baptismal_name_am, gender, birth_date, phone, email,
       address_am, parish, status, joined_on, is_volunteer, created_by)
    values
      (v.full_name_am, v.full_name_en, v.baptismal_name_am, v.gender, v.birth_date, v.phone, v.email,
       v.address_am, v.parish, 'active', current_date, v.kind = 'volunteer', actor_user_id())
    returning id into v_member;

    if v.kind = 'volunteer' then
      insert into volunteer_profiles (member_id, application_id, skills, availability, service_areas)
      values (
        v_member, v.id, v.skills, v.availability,
        case when v.department_pref is not null then array[v.department_pref] else '{}'::text[] end
      )
      returning id into v_volunteer;
    end if;
  end if;

  update applications
     set status = 'approved',
         review_notes = p_note,
         reviewed_by = actor_user_id(),
         reviewed_at = now(),
         converted_student_id = v_student,
         converted_teacher_id = v_teacher
   where id = p_id;

  perform public.notify_staff('applications.write',
    'ማመልከቻ ጸድቋል፦ ' || v.full_name_am, 'ዓይነት፦ ' || v.kind,
    '/erp/applications/' || p_id, 'application_approved');

  return jsonb_build_object(
    'application_id', p_id, 'kind', v.kind,
    'student_id', v_student, 'teacher_id', v_teacher,
    'member_id', v_member, 'volunteer_id', v_volunteer
  );
end;
$$;

create or replace function public.reject_application(p_id uuid, p_note text)
returns public.applications
language plpgsql security definer set search_path = public as $$
declare
  v public.applications%rowtype;
begin
  if not public.has_permission('applications.write') then
    raise exception 'missing applications.write permission';
  end if;
  if p_note is null or length(trim(p_note)) < 3 then
    raise exception 'a rejection needs a reason';
  end if;

  update applications
     set status = 'rejected', review_notes = p_note,
         reviewed_by = actor_user_id(), reviewed_at = now()
   where id = p_id
  returning * into v;

  if not found then raise exception 'application % not found', p_id; end if;
  return v;
end;
$$;

-- Portal sign-up links an account to an existing record by verified email.
-- The address must be the signed-in user's own (Supabase verifies it at signup),
-- otherwise anyone could claim another student's record.
create or replace function public.link_student_account(p_email text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_student uuid;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not signed in'; end if;

  if not exists (select 1 from auth.users
                  where id = v_uid and lower(email) = lower(p_email)) then
    raise exception 'የመለያ አድራሻው እና የተጠቃሚው ኢሜይል ማዕረ መሆን አለባቸው';
  end if;

  select id into v_student
    from student_profiles
   where lower(coalesce(email, '')) = lower(p_email)
     and linked_user_id is null
     and status = 'active'
   order by created_at
   limit 1;

  if v_student is null then
    raise exception 'no unclaimed student record for %', p_email;
  end if;

  update student_profiles set linked_user_id = v_uid where id = v_student;
  return v_student;
end;
$$;

create or replace function public.link_guardian_account(p_email text)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not signed in'; end if;

  if not exists (select 1 from auth.users
                  where id = v_uid and lower(email) = lower(p_email)) then
    raise exception 'የመለያ አድራሻው እና የተጠቃሚው ኢሜይል ማዕረ መሆን አለባቸው';
  end if;

  update guardians set user_id = v_uid
   where user_id is null and lower(coalesce(email, '')) = lower(p_email);
  get diagnostics v_count = row_count;

  if v_count = 0 then
    raise exception 'no unclaimed guardian record for %', p_email;
  end if;
  return v_count;
end;
$$;

-- ─── attendance ──────────────────────────────────────────────────────────────
create or replace function public.save_attendance(
  p_class_id uuid,
  p_taken_on date,
  p_records jsonb,                        -- [{student_id,status,minutes_late,reason_am}]
  p_session_id uuid default null,
  p_label_am text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_session uuid;
  v_r jsonb;
  v_teacher uuid;
  v_uid uuid := actor_user_id();
begin
  select id into v_teacher from teacher_profiles where user_id = v_uid;

  if not (public.has_permission('attendance.write')
          or public.in_scope('class_ids', p_class_id)
          or (v_teacher is not null and exists (
               select 1 from class_teachers ct
                where ct.class_id = p_class_id and ct.teacher_id = v_teacher and ct.removed_on is null))) then
    raise exception 'not allowed to take attendance for this class';
  end if;

  insert into attendance_sessions (class_id, session_id, taken_on, label_am, teacher_id, taken_by, status)
  values (p_class_id, p_session_id, p_taken_on, p_label_am, v_teacher, v_uid, 'open')
  on conflict (class_id, taken_on, starts_at) do update
     set label_am   = excluded.label_am,
         taken_by   = coalesce(attendance_sessions.taken_by, excluded.taken_by),
         teacher_id = coalesce(attendance_sessions.teacher_id, excluded.teacher_id),
         status     = 'open'
  returning id into v_session;

  for v_r in select * from jsonb_array_elements(p_records) loop
    insert into attendance_records (session_id, student_id, status, minutes_late, reason_am, recorded_by)
    values (v_session,
            (v_r ->> 'student_id')::uuid,
            coalesce(v_r ->> 'status', 'present')::public.attendance_status,
            coalesce((v_r ->> 'minutes_late')::integer, 0),
            v_r ->> 'reason_am',
            v_uid)
    on conflict (session_id, student_id) do update
      set status = excluded.status,
          minutes_late = excluded.minutes_late,
          reason_am = excluded.reason_am,
          recorded_by = excluded.recorded_by;
  end loop;

  perform public.recount_attendance_session(v_session);
  return v_session;
end;
$$;

create or replace function public.attendance_summary(
  p_student uuid, p_from date default null, p_to date default null
) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'sessions', count(*),
    'present',  count(*) filter (where r.status = 'present'),
    'absent',   count(*) filter (where r.status = 'absent'),
    'late',     count(*) filter (where r.status = 'late'),
    'excused',  count(*) filter (where r.status = 'excused'),
    'present_percent',
      case when count(*) = 0 then null
           else round(100.0 * count(*) filter (where r.status in ('present','late')) / count(*), 1)
      end
  )
  from attendance_records r
  join attendance_sessions s on s.id = r.session_id
  where r.student_id = p_student
    and (p_from is null or s.taken_on >= p_from)
    and (p_to   is null or s.taken_on <= p_to);
$$;

-- ─── results ─────────────────────────────────────────────────────────────────
create or replace function public.student_report_card(p_student uuid, p_year uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb;
begin
  if not (public.can_read_student(p_student) or public.my_student_id() = p_student) then
    raise exception 'not allowed to read this student';
  end if;

  select jsonb_build_object(
    'results', coalesce(
      jsonb_agg(jsonb_build_object(
        'exam_id', e.id, 'title', e.title_am, 'type', e.exam_type, 'exam_on', e.exam_on,
        'subject', s.name_am, 'class', c.name_am, 'marks', r.marks, 'total', e.total_marks,
        'percent', r.percent, 'grade', r.grade_letter, 'status', r.status, 'remarks', r.remarks_am
      ) order by e.exam_on nulls last) filter (where r.status = 'released'),
      '[]'::jsonb),
    'average_percent', (
      select round(avg(r2.percent), 1) from exam_results r2
       where r2.student_id = p_student and r2.status = 'released' and r2.percent is not null
    ),
    'attendance', public.attendance_summary(p_student)
  )
  into v
  from exam_results r
  join exams e on e.id = r.exam_id
  join classes c on c.id = e.class_id
  left join subjects s on s.id = e.subject_id
  where r.student_id = p_student
    and (p_year is null or e.academic_year_id = p_year);

  if v is null then
    return jsonb_build_object('results', '[]'::jsonb, 'average_percent', null,
                              'attendance', public.attendance_summary(p_student));
  end if;
  return v;
end;
$$;

create or replace function public.class_ranking(p_class_id uuid, p_exam_id uuid)
returns table (student_id uuid, full_name_am text, marks numeric, percent numeric,
               grade_letter text, ranking bigint)
language sql stable security definer set search_path = public as $$
  select t.student_id, t.full_name_am, t.marks, t.percent, t.grade_letter, t.ranking
    from (
      select r.student_id, st.full_name_am, r.marks, r.percent, r.grade_letter,
             rank() over (order by r.percent desc nulls last) as ranking
        from exam_results r
        join exams e on e.id = r.exam_id
        join student_profiles st on st.id = r.student_id
       where r.exam_id = p_exam_id and e.class_id = p_class_id and r.status = 'released'
    ) t
   order by t.ranking;
$$;

-- ─── promotion ───────────────────────────────────────────────────────────────
create or replace function public.run_promotion(p_batch_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v public.promotion_batches%rowtype;
  i public.promotion_items%rowtype;
  v_current uuid;
  v_promoted integer := 0;
  v_held integer := 0;
begin
  if not public.has_permission('students.promote') then
    raise exception 'missing students.promote permission';
  end if;

  select * into v from promotion_batches where id = p_batch_id;
  if not found then raise exception 'promotion batch % not found', p_batch_id; end if;
  if v.status <> 'approved' then raise exception 'batch must be approved before it runs'; end if;

  select id into v_current from academic_years where is_current limit 1;

  for i in select * from promotion_items where batch_id = p_batch_id and decision = 'promote' loop
    update student_enrollments
       set status = 'graduated', ended_on = current_date
     where student_id = i.student_id and class_id = i.from_class_id and status = 'enrolled';

    if i.to_class_id is not null then
      insert into student_enrollments (student_id, class_id, academic_year_id, status)
      values (i.student_id, i.to_class_id, coalesce(v.to_year_id, v_current), 'enrolled')
      on conflict do nothing;
    end if;

    if v.to_level_id is not null then
      update student_profiles
         set level_key = (select key from class_levels where id = v.to_level_id)
       where id = i.student_id;
    end if;

    v_promoted := v_promoted + 1;
  end loop;

  for i in select * from promotion_items where batch_id = p_batch_id and decision in ('hold','repeat') loop
    update student_profiles
       set notes = concat_ws(' · ', nullif(notes, ''), 'በ' || v.title_am || ' ዳግም ተመዝግቧል')
     where id = i.student_id;
    v_held := v_held + 1;
  end loop;

  update promotion_batches set status = 'executed', executed_at = now() where id = p_batch_id;

  return jsonb_build_object('promoted', v_promoted, 'held', v_held, 'batch_id', p_batch_id);
end;
$$;

-- ─── certificates ────────────────────────────────────────────────────────────
create or replace function public.issue_certificate(p_student uuid, p_template uuid, p_title text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_student public.student_profiles%rowtype;
  v_tpl public.certificate_templates%rowtype;
  v_year public.academic_years%rowtype;
  v_no text;
  v_code text;
  v_id uuid;
begin
  if not public.has_permission('certificates.write') then
    raise exception 'missing certificates.write permission';
  end if;

  select * into v_student from student_profiles where id = p_student;
  if not found then raise exception 'student % not found', p_student; end if;

  select * into v_tpl from certificate_templates where id = p_template;
  if not found then raise exception 'template % not found', p_template; end if;

  select * into v_year from academic_years where is_current limit 1;

  select 'CTC-' || to_char(current_date, 'YYYY') || '-' || lpad((count(*) + 1)::text, 5, '0')
    into v_no from issued_certificates;

  v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10));

  insert into issued_certificates
    (certificate_no, verification_code, student_id, template_id, title_am, issued_on,
     academic_year_id, render_snapshot, issued_by)
  values (
    v_no, v_code, p_student, p_template,
    coalesce(nullif(p_title, ''), v_tpl.name_am), current_date,
    v_year.id,
    jsonb_build_object(
      'student', v_student.full_name_am,
      'baptismal', v_student.baptismal_name_am,
      'template_name', v_tpl.name_am,
      'heading', v_tpl.heading_am,
      'body', replace(replace(replace(coalesce(v_tpl.body_am, ''),
              '{{student}}', v_student.full_name_am),
              '{{date}}', to_char(current_date, 'YYYY-MM-DD')),
              '{{year}}', coalesce(v_year.label_am, '')),
      'signature_name', v_tpl.signature_name_am,
      'signature_title', v_tpl.signature_title_am,
      'issued_on', current_date
    ),
    actor_user_id()
  ) returning id into v_id;

  return jsonb_build_object('id', v_id, 'certificate_no', v_no, 'verification_code', v_code);
end;
$$;

-- Anon callers on the verify page learn only what a certificate proves. The
-- single row comes from a base that always exists, so a wrong code is answered
-- with `valid: false` instead of an empty result the page would have to guess at.
create or replace function public.verify_certificate(p_code text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'valid', c.id is not null,
    'certificate_no', c.certificate_no,
    'title', c.title_am,
    'holder', c.render_snapshot ->> 'student',
    'issued_on', c.issued_on
  )
  from (select 1) one_row
  left join issued_certificates c
    on btrim(coalesce(p_code, '')) <> ''
   and c.verification_code = upper(btrim(p_code))
  limit 1;
$$;

-- ─── finance ─────────────────────────────────────────────────────────────────
create or replace function public.decide_transaction(p_id uuid, p_decision text, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v public.transactions%rowtype;
  v_limit numeric;
  v_approval uuid;
begin
  if p_decision not in ('approve','reject','void') then
    raise exception 'decision must be approve, reject or void';
  end if;
  if not public.has_permission('finance.approve') then
    raise exception 'missing finance.approve permission';
  end if;

  select * into v from transactions where id = p_id;
  if not found then raise exception 'transaction % not found', p_id; end if;

  if p_decision = 'approve' then
    select (value #>> '{}')::numeric into v_limit from finance_settings where key = 'auto_approve_limit';

    -- Expenses above the limit escalate to the approval queue instead of
    -- silently booking. The queue row is kept and reported, not rolled back.
    if v_limit is not null and v.amount > v_limit
       and v.type = 'expense' and v.status = 'pending_approval' then
      insert into approval_requests (domain, entity_table, entity_id, entity_label, action,
                                     amount, currency, submitted_by, assigned_role, reason, status)
      values ('finance', 'transactions', p_id, v.description_am, 'expense', v.amount, v.currency,
              actor_user_id(), 'finance_approver', 'amount above auto-approve limit', 'pending')
      returning id into v_approval;

      return jsonb_build_object(
        'status', 'requires_approval',
        'transaction', to_jsonb(v),
        'approval_id', v_approval,
        'message_am',
        'ገደቡ ከፈቀደው ከፍ ስለሚል (' || v.amount || ' ' || v.currency || ' > ' || v_limit || ') '
        || 'የፋይናንስ ማረጋገጫ ያስፈልጋል።');
    end if;
  end if;

  update transactions
     set status = case p_decision
                    when 'approve' then 'approved'
                    when 'reject'  then 'rejected'
                    else 'void'
                  end,
         approved_by = case when p_decision = 'approve' then actor_user_id() else approved_by end,
         approved_at = case when p_decision = 'approve' then now() else approved_at end,
         rejection_note = case when p_decision in ('reject','void') then p_note else rejection_note end
   where id = p_id
  returning * into v;

  return jsonb_build_object('status', v.status, 'transaction', to_jsonb(v));
end;
$$;

create or replace function public.finance_summary(p_from date default null, p_to date default null)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'income',        coalesce(sum(t.amount) filter (where t.type = 'income'), 0),
    'expense',       coalesce(sum(t.amount) filter (where t.type = 'expense'), 0),
    'net',           coalesce(sum(t.amount) filter (where t.type = 'income'), 0)
                   - coalesce(sum(t.amount) filter (where t.type = 'expense'), 0),
    'donations',     coalesce((select sum(d.amount) from donations d
                                where d.status in ('paid','partially_paid')
                                  and (p_from is null or d.created_at::date >= p_from)
                                  and (p_to   is null or d.created_at::date <= p_to)), 0),
    'pending_count', coalesce((select count(*) from transactions where status = 'pending_approval'), 0),
    'by_category',   (
      select coalesce(jsonb_object_agg(x.name, x.total), '{}'::jsonb)
        from (select c.name_am as name, sum(t2.amount) as total
                from transactions t2
                join finance_categories c on c.id = t2.category_id
               where t2.status = 'approved'
                 and (p_from is null or t2.occurred_on >= p_from)
                 and (p_to   is null or t2.occurred_on <= p_to)
               group by c.name_am) x
    )
  )
  from transactions t
  where t.status = 'approved'
    and (p_from is null or t.occurred_on >= p_from)
    and (p_to   is null or t.occurred_on <= p_to);
$$;

-- ─── dashboard ───────────────────────────────────────────────────────────────
create or replace function public.dashboard_kpis()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'students_active',   (select count(*) from student_profiles where status = 'active'),
    'students_pending',  (select count(*) from applications where kind = 'student' and status in ('pending','under_review')),
    'teachers_active',   (select count(*) from teacher_profiles where is_active),
    'classes_active',    (select count(*) from classes where is_active),
    'applications_open', (select count(*) from applications where status in ('pending','under_review','interview')),
    'approvals_pending', (select count(*) from approval_requests where status = 'pending'),
    'content_drafts',    (select count(*) from news where state = 'draft'),
    'content_published', (select count(*) from news where state = 'published'),
    'events_upcoming',   (select count(*) from events where state = 'published' and starts_at >= now()),
    'unread_messages',   (select count(*) from contact_messages where status = 'new'),
    'prayer_open',       (select count(*) from prayer_requests where status in ('pending','active')),
    'income_month',      coalesce((select sum(amount) from transactions
                                    where type = 'income' and status = 'approved'
                                      and occurred_on >= date_trunc('month', current_date)), 0),
    'expense_month',     coalesce((select sum(amount) from transactions
                                    where type = 'expense' and status = 'approved'
                                      and occurred_on >= date_trunc('month', current_date)), 0),
    'donations_month',   coalesce((select sum(amount) from donations
                                    where status in ('paid','partially_paid')
                                      and created_at >= date_trunc('month', current_date)), 0),
    'attendance_rate',   (select round(100.0 * count(*) filter (where r.status in ('present','late'))
                                     / nullif(count(*), 0), 1)
                            from attendance_records r
                            join attendance_sessions s on s.id = r.session_id
                           where s.taken_on >= current_date - 60),
    'volunteers_active', (select count(*) from volunteer_profiles where status = 'active'),
    'departments',       (select count(*) from departments),
    'currency',          coalesce((select value #>> '{}' from finance_settings where key = 'currency'), 'ETB')
  );
$$;

-- ─── communication ───────────────────────────────────────────────────────────
create or replace function public.provider_configured(p_channel delivery_channel)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select value #>> '{}' from site_settings where key = 'provider_' || p_channel::text),
    ''
  ) <> '';
$$;

-- An Edge Function with the service key claims a batch. Claiming only marks the
-- row as `sending`; the result is written back by mark_outbox_result(), so a
-- message is never reported as sent before a provider has accepted it. Without a
-- configured provider the row is marked honestly rather than dropped.
-- One door for every outgoing email. A message with no provider configured is
-- parked with the reason written down, so the staff inbox shows why nothing left
-- the queue instead of pretending it was sent.
create or replace function public.queue_email(
  p_to text, p_subject text, p_body text, p_related jsonb default '{}'::jsonb
) returns public.outbox_messages
language plpgsql security definer set search_path = public as $$
declare
  v       public.outbox_messages%rowtype;
  v_ready boolean := public.provider_configured('email');
begin
  if p_to is null or btrim(p_to) = '' then
    raise exception 'no recipient for the message';
  end if;

  insert into outbox_messages (channel, to_address, subject, body, related, status, last_error)
  values ('email', btrim(p_to), p_subject, p_body, coalesce(p_related, '{}'::jsonb),
          case when v_ready then 'queued' else 'provider_not_configured' end::public.delivery_status,
          case when v_ready then null else 'የኢሜይል ማድረሻ አገልግሎት አልተጀመረም' end)
  returning * into v;
  return v;
end;
$$;

-- The delivery worker is the service role: an Edge Function holding the service
-- key. Nobody signed in from a browser may drain or rewrite the queue.
create or replace function public.is_delivery_worker() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(current_setting('app.service_role', true) = 'on', false)
      or pg_has_role(session_user, 'service_role', 'MEMBER');
$$;

create or replace function public.claim_outbox(p_limit integer default 20)
returns setof outbox_messages
language plpgsql security definer set search_path = public as $$
declare
  v public.outbox_messages%rowtype;
begin
  if not public.is_delivery_worker() then
    raise exception 'only the service role may claim outbox messages';
  end if;

  for v in
    select * from outbox_messages
     where status = 'queued'
     order by queued_at
     limit p_limit
     for update skip locked
  loop
    if public.provider_configured(v.channel) then
      update outbox_messages
         set attempts = attempts + 1, status = 'sending'
       where id = v.id;
    else
      update outbox_messages
         set attempts = attempts + 1,
             status = 'provider_not_configured',
             last_error = 'ማድረሻ አገልግሎት ለ' || v.channel::text || ' አልተጀመረም'
       where id = v.id;
    end if;

    return query select * from outbox_messages where id = v.id;
  end loop;
end;
$$;

-- Called by the delivery worker once the provider answers. Unsuccessful sends
-- return to the queue until the retry budget is spent.
create or replace function public.mark_outbox_result(p_id uuid, p_ok boolean, p_error text default null)
returns public.outbox_messages
language plpgsql security definer set search_path = public as $$
declare
  v public.outbox_messages%rowtype;
begin
  if not public.is_delivery_worker() then
    raise exception 'only the service role may update outbox results';
  end if;

  update outbox_messages
     set status = case
                    when p_ok then 'sent'
                    when attempts >= 3 then 'failed'
                    else 'queued'
                  end::public.delivery_status,
         sent_at = case when p_ok then now() else sent_at end,
         last_error = case when p_ok then null else left(coalesce(p_error, 'delivery failed'), 500) end
   where id = p_id
  returning * into v;

  if not found then raise exception 'outbox message % not found', p_id; end if;
  return v;
end;
$$;

create or replace function public.reply_to_message(p_id uuid, p_reply text, p_email text default null)
returns public.contact_messages
language plpgsql security definer set search_path = public as $$
declare
  v public.contact_messages%rowtype;
begin
  if not public.has_permission('communication.write') then
    raise exception 'missing communication.write permission';
  end if;

  update contact_messages
     set status = 'replied', reply_body = p_reply,
         replied_by = actor_user_id(), replied_at = now(),
         assigned_to = coalesce(assigned_to, actor_user_id())
   where id = p_id
  returning * into v;

  if not found then raise exception 'message % not found', p_id; end if;

  if p_email is not null then
    perform public.queue_email(p_email, 'ስለ መልእክትዎ እናመሰግናለን', p_reply,
                               jsonb_build_object('contact_message_id', p_id));
  end if;

  return v;
end;
$$;

-- ─── public site search (SECURITY INVOKER: RLS limits it to published rows) ──
-- Site search. Runs as the owner because anonymous visitors hold no table
-- privileges at all; the published filter is what makes that safe, and a query
-- shorter than two characters returns nothing rather than the whole archive.
create or replace function public.search_site(p_query text, p_limit integer default 20)
returns table (kind text, slug text, title text, summary text, published_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.kind, s.slug, s.title, s.summary, s.published_at
    from (
      select 'news'::text as kind, n.slug, n.title_am as title, n.summary_am as summary, n.published_at
    from news n where n.state = 'published' and lower(n.title_am) like '%' || lower(p_query) || '%'
  union all
  select 'event', e.slug, e.title_am, e.summary_am, e.published_at
    from events e where e.state = 'published' and lower(e.title_am) like '%' || lower(p_query) || '%'
  union all
  select 'sermon', null, s.title_am, s.summary_am, s.published_at
    from sermons s where s.state = 'published' and lower(s.title_am) like '%' || lower(p_query) || '%'
  union all
  select 'mezmur', null, m.title_am, m.theme_am, m.published_at
    from mezmur m where m.state = 'published' and lower(m.title_am) like '%' || lower(p_query) || '%'
  union all
  select 'album', a.slug, a.title_am, a.description_am, a.published_at
    from gallery_albums a where a.state = 'published' and lower(a.title_am) like '%' || lower(p_query) || '%'
  union all
  select 'page', p.slug, p.title_am, p.excerpt_am, p.published_at
    from pages p where p.state = 'published' and lower(p.title_am) like '%' || lower(p_query) || '%'
    ) s
   where char_length(btrim(coalesce(p_query, ''))) >= 2
   order by s.published_at desc nulls last
   limit p_limit;
$$;
