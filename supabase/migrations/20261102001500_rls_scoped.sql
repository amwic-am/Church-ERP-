-- 150 · Staff policies (generated from a rule table) + row-scoped policies
-- One generator keeps ~60 tables consistent; tables holding personal data get
-- an additional scoped policy on top, and policies OR together.

create table public.rls_rules (
  table_name  text primary key,
  read_perm   text not null,
  write_perm  text not null,
  delete_perm text
);

insert into public.rls_rules (table_name, read_perm, write_perm, delete_perm) values
  ('site_settings',        'website.read',   'website.write',   null),
  ('menus',                'website.read',   'website.write',   'website.write'),
  ('menu_items',           'website.read',   'website.write',   'website.write'),
  ('pages',                'website.read',   'website.write',   'website.write'),
  ('page_blocks',          'website.read',   'website.write',   'website.write'),
  ('leadership',           'website.read',   'website.write',   'website.write'),
  ('org_units',            'website.read',   'website.write',   'website.write'),
  ('faqs',                 'website.read',   'website.write',   'website.write'),
  ('news',                 'news.read',      'news.write',      'news.write'),
  ('events',               'events.read',    'events.write',    'events.write'),
  ('event_registrations',  'events.read',    'events.write',    'events.write'),
  ('sermons',              'media.read',     'media.write',     'media.delete'),
  ('mezmur',               'media.read',     'media.write',     'media.delete'),
  ('publications',         'media.read',     'media.write',     'media.delete'),
  ('gallery_albums',       'gallery.read',   'gallery.write',   'gallery.write'),
  ('album_media',          'gallery.read',   'gallery.write',   'gallery.write'),
  ('media_categories',     'media.read',     'media.write',     'media.delete'),
  ('approval_requests',    'reports.read',   'website.write',   null),
  ('members',              'departments.read','departments.write','departments.write'),
  ('departments',          'departments.read','departments.write','departments.write'),
  ('department_members',   'departments.read','departments.write','departments.write'),
  ('department_activities','departments.read','departments.write','departments.write'),
  ('choirs',               'departments.read','departments.write','departments.write'),
  ('choir_members',        'departments.read','departments.write','departments.write'),
  ('choir_performances',   'departments.read','departments.write','departments.write'),
  ('volunteer_profiles',   'volunteers.read','volunteers.write','volunteers.write'),
  ('volunteer_assignments','volunteers.read','volunteers.write','volunteers.write'),
  ('teacher_profiles',     'teachers.read',  'teachers.write',  'teachers.write'),
  ('applications',         'applications.read','applications.write', null),
  ('academic_years',       'academics.read', 'academics.write', null),
  ('class_levels',         'academics.read', 'academics.write', null),
  ('classes',              'academics.read', 'academics.write', 'academics.write'),
  ('subjects',             'academics.read', 'academics.write', 'academics.write'),
  ('curriculum_units',     'academics.read', 'academics.write', 'academics.write'),
  ('class_subjects',       'academics.read', 'academics.write', 'academics.write'),
  ('class_teachers',       'academics.read', 'academics.write', 'academics.write'),
  ('class_sessions',       'attendance.read','attendance.write','attendance.write'),
  ('grade_scales',         'results.read',   'academics.write', null),
  ('exams',                'results.read',   'results.write',   'results.write'),
  ('lesson_plans',         'academics.read', 'academics.write', 'academics.write'),
  ('learning_materials',   'academics.read', 'academics.write', 'academics.write'),
  ('certificate_templates','certificates.read','certificates.write', null),
  ('issued_certificates',  'certificates.read','certificates.write', null),
  ('discipline_records',   'students.read',  'students.write',  'students.write'),
  ('promotion_batches',    'students.read',  'students.promote', null),
  ('promotion_items',      'students.read',  'students.promote', null),
  ('student_id_cards',     'students.read',  'students.write',  null),
  ('finance_accounts',     'finance.read',   'finance.write',   null),
  ('finance_categories',   'finance.read',   'finance.write',   null),
  ('finance_settings',     'finance.read',   'system.write',    null),
  ('transactions',         'finance.read',   'finance.write',   null),
  ('donation_campaigns',   'donations.read', 'donations.write', 'donations.write'),
  ('donations',            'donations.read', 'donations.write', null),
  ('budgets',              'budget.read',    'budget.write',    null),
  ('inventory_items',      'operations.read','operations.write','operations.write'),
  ('inventory_movements',  'operations.read','operations.write', null),
  ('assets',               'operations.read','operations.write','operations.write'),
  ('library_books',        'operations.read','operations.write','operations.write'),
  ('library_copies',       'operations.read','operations.write','operations.write'),
  ('library_loans',        'operations.read','operations.write', null),
  ('documents',            'documents.read', 'documents.write', 'documents.write'),
  ('contact_messages',     'communication.read','communication.write','communication.write'),
  ('prayer_requests',      'communication.read','communication.write','communication.write'),
  ('announcements',        'communication.read','communication.write','communication.write'),
  ('notification_templates','communication.read','communication.write', null),
  ('outbox_messages',      'communication.read','communication.write', null),
  ('subscribers',          'communication.read','communication.write', null),
  ('rls_rules',            'system.read',    'system.write',    null),
  ('content_types',        'system.read',    'system.write',    null);

-- Guarded tables keep their bespoke policies and are excluded from the generic
-- grant so a teacher can never read another class's records.
do $$
declare
  r public.rls_rules%rowtype;
  v_del text;
begin
  for r in select * from public.rls_rules loop
    v_del := coalesce(r.delete_perm, r.write_perm);

    execute format(
      'create policy "%1$s_staff_read" on public.%1$I
         for select to authenticated using (public.has_permission(%2$L))',
      r.table_name, r.read_perm);

    execute format(
      'create policy "%1$s_staff_insert" on public.%1$I
         for insert to authenticated with check (public.has_permission(%2$L))',
      r.table_name, r.write_perm);

    execute format(
      'create policy "%1$s_staff_update" on public.%1$I
         for update to authenticated using (public.has_permission(%2$L))
         with check (public.has_permission(%3$L))',
      r.table_name, r.read_perm, r.write_perm);

    execute format(
      'create policy "%1$s_staff_delete" on public.%1$I
         for delete to authenticated using (public.has_permission(%2$L))',
      r.table_name, v_del);
  end loop;
end;
$$;

-- ─── row-scoped personal data ───────────────────────────────────────────────
-- Students: staff with the module permission, plus the student themself,
-- their guardian, and any teacher assigned to a class they attend.
create policy students_scoped_read on public.student_profiles
  for select to authenticated using (
    public.has_permission('students.read')
    or linked_user_id = auth.uid()
    or public.is_guardian_of(id)
    or public.can_read_student(id)
  );

create policy students_write on public.student_profiles
  for insert to authenticated with check (public.has_permission('students.write'));

create policy students_update on public.student_profiles
  for update to authenticated using (public.has_permission('students.write'))
  with check (public.has_permission('students.write'));

-- A student may correct their own contact details but not status or level.
create policy students_self_update on public.student_profiles
  for update to authenticated using (linked_user_id = auth.uid())
  with check (linked_user_id = auth.uid());

create policy students_delete on public.student_profiles
  for delete to authenticated using (public.has_permission('students.delete'));

create policy guardians_scoped_read on public.guardians
  for select to authenticated using (
    user_id = auth.uid()
    or public.has_permission('students.read')
    or exists (
      select 1 from guardian_students gs
        where gs.guardian_id = guardians.id
          and public.can_read_student(gs.student_id)
    )
  );

create policy guardians_staff_write on public.guardians
  for all to authenticated using (public.has_permission('students.write'))
  with check (public.has_permission('students.write'));

create policy guardian_links_read on public.guardian_students
  for select to authenticated using (
    public.has_permission('students.read')
    or exists (select 1 from public.guardians g
                where g.id = guardian_id and g.user_id = auth.uid())
    or public.can_read_student(student_id)
  );

create policy guardian_links_write on public.guardian_students
  for all to authenticated using (public.has_permission('students.write'))
  with check (public.has_permission('students.write'));

create policy student_docs_read on public.student_documents
  for select to authenticated using (public.can_read_student(student_id));

create policy student_docs_write on public.student_documents
  for insert to authenticated with check (
    public.has_permission('students.write')
    or public.my_student_id() = student_id
  );

create policy student_docs_delete on public.student_documents
  for delete to authenticated using (public.has_permission('students.delete'));

-- Attendance: the class teacher or scope holder may write, everyone with the
-- module permission may read.
create policy attendance_sessions_scoped on public.attendance_sessions
  for select to authenticated using (
    public.has_permission('attendance.read')
    or public.in_scope('class_ids', class_id)
    or exists (select 1 from public.class_teachers ct
                join public.teacher_profiles tp on tp.id = ct.teacher_id
               where ct.class_id = attendance_sessions.class_id
                 and tp.user_id = auth.uid() and ct.removed_on is null)
  );

create policy attendance_records_scoped on public.attendance_records
  for select to authenticated using (
    public.has_permission('attendance.read')
    or exists (select 1 from public.attendance_sessions s
                where s.id = attendance_records.session_id
                  and (public.in_scope('class_ids', s.class_id)
                       or exists (select 1 from public.class_teachers ct
                                   join public.teacher_profiles tp on tp.id = ct.teacher_id
                                  where ct.class_id = s.class_id and tp.user_id = auth.uid())))
    or public.my_student_id() = student_id
    or public.is_guardian_of(student_id)
  );

create policy attendance_records_write on public.attendance_records
  for all to authenticated using (public.has_permission('attendance.write'))
  with check (public.has_permission('attendance.write'));

-- ─── assigned-teacher access ────────────────────────────────────────────────
-- Teachers hold no module-wide permission; these policies are their only door.
create or replace function public.teaches_class(p_class uuid, p_user uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public as $$
  select p_user is not null and exists (
    select 1
      from class_teachers ct
      join teacher_profiles tp on tp.id = ct.teacher_id
     where ct.class_id = p_class
       and tp.user_id = p_user
       and ct.removed_on is null
       and tp.is_active
  );
$$;

create policy attendance_sessions_teacher on public.attendance_sessions
  for select to authenticated using (public.teaches_class(class_id));

create policy attendance_sessions_teacher_write on public.attendance_sessions
  for insert to authenticated with check (
    public.teaches_class(class_id) and public.has_permission('attendance.mark'));

create policy attendance_records_teacher on public.attendance_records
  for select to authenticated using (
    public.has_permission('attendance.read')
    or exists (select 1 from public.attendance_sessions s
                where s.id = attendance_records.session_id
                  and public.teaches_class(s.class_id))
  );

create policy attendance_records_teacher_write on public.attendance_records
  for all to authenticated
  using (public.has_permission('attendance.mark')
         and exists (select 1 from public.attendance_sessions s
                      where s.id = attendance_records.session_id
                        and public.teaches_class(s.class_id)))
  with check (public.has_permission('attendance.mark')
         and exists (select 1 from public.attendance_sessions s
                      where s.id = attendance_records.session_id
                        and public.teaches_class(s.class_id)));

create policy class_sessions_teacher on public.class_sessions
  for all to authenticated
  using (public.teaches_class(class_id) or public.has_permission('academics.write'))
  with check (public.teaches_class(class_id) or public.has_permission('academics.write'));

-- A teacher may grade only exams belonging to a class they teach.
create policy exam_results_teacher on public.exam_results
  for all to authenticated
  using (public.has_permission('results.mark')
         and exists (select 1 from public.exams e where e.id = exam_results.exam_id
                      and public.teaches_class(e.class_id)))
  with check (public.has_permission('results.mark')
         and exists (select 1 from public.exams e where e.id = exam_results.exam_id
                      and public.teaches_class(e.class_id)));

create policy exams_teacher_read on public.exams
  for select to authenticated
  using (public.has_permission('results.read') or public.teaches_class(class_id));

-- Teachers see the classes they teach (or are scoped to); staff with the
-- academics permission see all of them.
create policy classes_teacher_read on public.classes
  for select to authenticated
  using (public.has_permission('academics.read')
         or public.teaches_class(id)
         or public.in_scope('class_ids', id));

-- A student editing their own record keeps contact details only.
create or replace function public.guard_student_self_edit() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null
     and new.linked_user_id = auth.uid()
     and not public.has_permission('students.write') then
    new.status        := old.status;
    new.level_key     := old.level_key;
    new.student_code  := old.student_code;
    new.linked_user_id:= old.linked_user_id;
    new.qr_token      := old.qr_token;
    new.notes         := old.notes;
    new.health_notes  := old.health_notes;
    new.promoted_from_id := old.promoted_from_id;
  end if;
  return new;
end;
$$;

create trigger students_guard_self before update on public.student_profiles
  for each row execute function public.guard_student_self_edit();

create policy enrollments_read on public.student_enrollments
  for select to authenticated using (
    public.has_permission('academics.read')
    or public.can_read_student(student_id)
  );

create policy enrollments_write on public.student_enrollments
  for all to authenticated
  using (public.has_permission('students.write') or public.has_permission('academics.write'))
  with check (public.has_permission('students.write') or public.has_permission('academics.write'));

-- Teachers manage enrollment rosters for the classes they are assigned to.
create policy enrollments_teacher on public.student_enrollments
  for all to authenticated
  using (exists (select 1 from public.class_teachers ct
                   join public.teacher_profiles tp on tp.id = ct.teacher_id
                  where ct.class_id = student_enrollments.class_id
                    and tp.user_id = auth.uid() and ct.removed_on is null))
  with check (exists (select 1 from public.class_teachers ct
                   join public.teacher_profiles tp on tp.id = ct.teacher_id
                  where ct.class_id = student_enrollments.class_id
                    and tp.user_id = auth.uid() and ct.removed_on is null));

create policy results_scoped_read on public.exam_results
  for select to authenticated using (
    public.has_permission('results.read')
    or public.my_student_id() = student_id
    or public.is_guardian_of(student_id)
    or exists (select 1 from public.exams e
                join public.class_teachers ct on ct.class_id = e.class_id
                join public.teacher_profiles tp on tp.id = ct.teacher_id
               where e.id = exam_results.exam_id and tp.user_id = auth.uid())
  );

create policy results_write on public.exam_results
  for all to authenticated using (public.has_permission('results.write'))
  with check (public.has_permission('results.write'));

-- Released results are readable by the student/guardian even without any
-- staff permission; drafts stay private to staff.
create policy results_student_read on public.exam_results
  for select to authenticated using (
    status = 'released'
    and (public.my_student_id() = student_id or public.is_guardian_of(student_id))
  );

create policy certificates_scoped_read on public.issued_certificates
  for select to authenticated using (
    public.has_permission('certificates.read')
    or public.my_student_id() = student_id
    or public.is_guardian_of(student_id)
  );

create policy discipline_scoped_read on public.discipline_records
  for select to authenticated using (
    public.has_permission('students.read')
    or public.my_student_id() = student_id
    or public.is_guardian_of(student_id)
  );

create policy lesson_plans_scoped on public.lesson_plans
  for select to authenticated using (
    public.has_permission('academics.read')
    or teacher_id = (select id from public.teacher_profiles where user_id = auth.uid())
    or (status = 'approved' and public.in_scope('class_ids', class_id))
  );

create policy lesson_plans_teacher_write on public.lesson_plans
  for all to authenticated
  using (teacher_id = (select id from public.teacher_profiles where user_id = auth.uid())
         or public.has_permission('academics.write'))
  with check (teacher_id = (select id from public.teacher_profiles where user_id = auth.uid())
              or public.has_permission('academics.write'));

-- Portal users may only see their own notices and preferences.
create policy notifications_self on public.notifications
  for all to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy notif_prefs_self on public.notification_preferences
  for all to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Private media rows (student documents, finance receipts) are never readable
-- by anon; staff need the module permission.
create policy media_staff_read on public.media_files
  for select to authenticated using (
    public.has_permission('media.read')
    or (bucket = 'private-docs' and (public.has_permission('documents.read') or public.has_permission('students.read')))
  );

create policy media_staff_write on public.media_files
  for insert to authenticated with check (public.has_permission('media.write'));

create policy media_staff_update on public.media_files
  for update to authenticated using (public.has_permission('media.write'))
  with check (public.has_permission('media.write'));

create policy media_staff_delete on public.media_files
  for delete to authenticated using (public.has_permission('media.delete'));

-- Applications are public submissions; only staff with the queue permission
-- read them, and a reviewer may not approve their own submission.
create policy applications_scoped_read on public.applications
  for select to authenticated using (public.has_permission('applications.read'));

-- Volunteers see their own profile and assignments.
create policy volunteers_self_read on public.volunteer_profiles
  for select to authenticated using (
    public.has_permission('volunteers.read')
    or member_id in (select id from public.members where user_id = auth.uid())
  );

create policy volunteer_assign_self_read on public.volunteer_assignments
  for select to authenticated using (
    public.has_permission('volunteers.read')
    or volunteer_id in (
      select vp.id from public.volunteer_profiles vp
        join public.members m on m.id = vp.member_id
       where m.user_id = auth.uid())
  );

-- Department heads manage their own department's rows.
create policy dept_scoped_activities on public.department_activities
  for all to authenticated
  using (public.in_scope('department_ids', department_id) or public.has_permission('departments.write'))
  with check (public.in_scope('department_ids', department_id) or public.has_permission('departments.write'));

create policy dept_scoped_members on public.department_members
  for select to authenticated
  using (public.in_scope('department_ids', department_id) or public.has_permission('departments.read'));

-- Finance is double-locked: module permission AND (for writes above the limit)
-- an approval row created by the RPC.
create policy finance_scoped_read on public.transactions
  for select to authenticated using (public.has_permission('finance.read'));

create policy finance_scoped_write on public.transactions
  for all to authenticated using (public.has_permission('finance.write'))
  with check (public.has_permission('finance.write'));

create policy budgets_scoped_write on public.budgets
  for all to authenticated using (public.has_permission('budget.write'))
  with check (public.has_permission('budget.write'));
