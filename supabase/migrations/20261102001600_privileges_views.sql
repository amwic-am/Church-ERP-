-- 160 · Privileges, storage policies, read views, audit coverage

-- ─── table privileges ────────────────────────────────────────────────────────
-- Supabase provisions these defaults on every project. Stated here so the schema
-- is self-contained: access is then limited by row level security, not by
-- missing table grants, and a plain Postgres target behaves the same way.
do $$
declare
  t record;
begin
  for t in
    select c.relname from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r','p','v')
  loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t.relname);
    execute format('grant all on public.%I to service_role', t.relname);
  end loop;
end;
$$;

grant usage, select on all sequences in schema public to authenticated, service_role;
grant all on all tables in schema storage to anon, authenticated, service_role;

alter default privileges in schema public grant all on tables to authenticated, service_role;
alter default privileges in schema public grant all on sequences to authenticated, service_role;

-- ─── least privilege for the anonymous role ─────────────────────────────────
do $$
declare
  t record;
begin
  for t in
    select c.relname from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r','p')
  loop
    execute format('revoke all on public.%I from anon', t.relname);
  end loop;
end;
$$;

-- Anonymous reads follow the published-content policies of migration 140 to the
-- letter: every table that grants anon a SELECT policy also gets the table
-- privilege, so row level security is the filter and no policy is left
-- unenforceable for want of a grant. Nothing else is readable, and the
-- v_public_* views below stay available as joined, column-safe shortcuts.
do $$
declare
  r record;
begin
  for r in
    select distinct c.relname
      from pg_policies pol
      join pg_namespace n on n.nspname = pol.schemaname
      join pg_class c on c.relnamespace = n.oid and c.relname = pol.tablename
     where pol.schemaname = 'public'
       and pol.cmd in ('SELECT', 'ALL')
       and 'anon' = any (pol.roles)
  loop
    execute format('grant select on public.%I to anon', r.relname);
  end loop;
end;
$$;

-- Anonymous traffic writes nothing. The public forms in migration 1800 call
-- SECURITY DEFINER endpoints that validate the input and stamp the fields a
-- visitor must not control.

-- ─── RPC grants ──────────────────────────────────────────────────────────────
grant execute on function public.verify_certificate(text),
                  public.search_site(text, integer) to anon, authenticated;

grant execute on function
  public.submit_content(text, uuid),
  public.decide_content(text, uuid, text, text),
  public.pending_approvals(text),
  public.approve_application(uuid, text),
  public.reject_application(uuid, text),
  public.link_student_account(text),
  public.link_guardian_account(text),
  public.save_attendance(uuid, date, jsonb, uuid, text),
  public.close_attendance_session(uuid, uuid),
  public.attendance_summary(uuid, date, date),
  public.student_report_card(uuid, uuid),
  public.class_ranking(uuid, uuid),
  public.run_promotion(uuid),
  public.issue_certificate(uuid, uuid, text),
  public.decide_transaction(uuid, text, text),
  public.finance_summary(date, date),
  public.dashboard_kpis(),
  public.reply_to_message(uuid, text, text),
  public.queue_email(text, text, text, jsonb),
  public.recount_attendance_session(uuid),
  public.can_read_student(uuid, uuid),
  public.is_guardian_of(uuid, uuid),
  public.my_student_id(uuid),
  public.has_permission(text, uuid),
  public.role_keys(uuid),
  public.is_super_admin(uuid)
  to authenticated;

revoke all on function public.claim_outbox(integer) from public;
grant execute on function public.claim_outbox(integer) to service_role;

revoke all on function public.mark_outbox_result(uuid, boolean, text) from public;
grant execute on function public.mark_outbox_result(uuid, boolean, text) to service_role;

-- ─── storage ─────────────────────────────────────────────────────────────────
create policy media_read_anon on storage.objects
  for select to anon using (bucket_id = 'media');

create policy media_write_staff on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and public.has_permission('media.write'));

create policy media_update_staff on storage.objects
  for update to authenticated
  using (bucket_id = 'media' and public.has_permission('media.write'));

create policy media_delete_staff on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and public.has_permission('media.delete'));

-- private-docs layout is u/<user-id>/… or student/<student-id>/…
create policy private_docs_read on storage.objects
  for select to authenticated using (
    bucket_id = 'private-docs'
    and (
      split_part(name, '/', 1) = 'u'
        and split_part(name, '/', 2) = auth.uid()::text
      or public.has_permission('documents.read')
      or exists (select 1 from public.student_documents sd
                  where sd.bucket = 'private-docs' and sd.storage_path = storage.objects.name
                    and public.can_read_student(sd.student_id))
    )
  );

-- Uploads into private-docs are limited to staff with the document permission
-- and to a student's own folder.
create policy private_docs_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'private-docs'
    and (
      public.has_permission('documents.write')
      or (split_part(name, '/', 1) = 'u' and split_part(name, '/', 2) = auth.uid()::text)
      or (split_part(name, '/', 1) = 'student'
          and public.my_student_id() = split_part(name, '/', 2)::uuid)
    )
  );

-- ─── public read views ───────────────────────────────────────────────────────
-- These views run with owner rights and are the only public read path: each one
-- filters `state = 'published'` itself and lists only columns a visitor may see.

create or replace view public.v_public_news
as
select n.id, n.slug, n.title_am, n.title_en, n.summary_am, n.category_am, n.tags,
       n.is_featured, n.published_at, n.views,
       m.public_url as cover_url, m.width, m.height, m.alt_am
  from news n
  left join media_files m on m.id = n.cover_media_id
 where n.state = 'published';

create or replace view public.v_public_events
as
select e.id, e.slug, e.title_am, e.title_en, e.summary_am, e.event_type,
       e.starts_at, e.ends_at, e.all_day, e.eth_date, e.venue_am, e.capacity,
       e.registration_required, e.registration_deadline, e.fee, e.currency,
       e.is_featured, e.department_id, d.name_am as department_name, d.slug as department_slug,
       m.public_url as cover_url,
       (select count(*) from event_registrations r
         where r.event_id = e.id and r.status <> 'cancelled') as registrations
  from events e
  left join departments d on d.id = e.department_id
  left join media_files m on m.id = e.cover_media_id
 where e.state = 'published';

create or replace view public.v_public_media
as
select f.id, f.public_url, f.kind, f.title_am, f.caption_am, f.alt_am,
       f.width, f.height, f.duration_secs, f.tags, f.mime_type, f.created_at,
       coalesce(
         (select jsonb_agg(jsonb_build_object('album_id', am.album_id, 'order', am.sort_order))
            from album_media am where am.media_id = f.id),
         '[]'::jsonb) as albums
  from media_files f
 where f.state = 'published' and f.is_public and f.bucket = 'media';

create or replace view public.v_public_albums
as
select a.id, a.slug, a.title_am, a.title_en, a.description_am, a.taken_on,
       a.published_at, a.event_id, a.department_id,
       cm.public_url as cover_url,
       (select count(*) from album_media x
         join media_files pm on pm.id = x.media_id
        where x.album_id = a.id and pm.state = 'published' and pm.is_public) as photo_count,
       coalesce(
         (select jsonb_agg(jsonb_build_object('id', m.id, 'url', m.public_url,
                                              'caption', am.caption_am, 'order', am.sort_order)
                            order by am.sort_order)
            from album_media am
            join media_files m on m.id = am.media_id
           where am.album_id = a.id and m.state = 'published' and m.is_public),
         '[]'::jsonb) as photos
  from gallery_albums a
  left join lateral (
         select am2.media_id
           from album_media am2
           join media_files m2 on m2.id = am2.media_id
          where am2.album_id = a.id and m2.state = 'published' and m2.is_public
          order by am2.sort_order
          limit 1
  ) first_photo on true
  left join media_files cm
    on cm.id = coalesce(a.cover_media_id, first_photo.media_id)
 where a.state = 'published' and a.is_public;

create or replace view public.v_public_sermons
as
select s.id, s.title_am, s.preacher_am, s.scripture_ref, s.topic_am, s.summary_am,
       s.delivered_on, s.language, s.listen_count, s.tags,
       am.public_url as audio_url, vm.public_url as video_url, s.video_url as external_video_url
  from sermons s
  left join media_files am on am.id = s.audio_media_id
  left join media_files vm on vm.id = s.video_media_id
 where s.state = 'published';

create or replace view public.v_public_mezmur
as
select mz.id, mz.title_am, mz.lyrics_am, mz.composer_am, mz.choir_am, mz.theme_am,
       mz.language, mz.duration_secs, mz.play_count, mz.tags, mz.is_scripture,
       am.public_url as audio_url, sm.public_url as sheet_url, mz.video_url
  from mezmur mz
  left join media_files am on am.id = mz.audio_media_id
  left join media_files sm on sm.id = mz.sheet_media_id
 where mz.state = 'published';

create or replace view public.v_public_publications
as
select p.id, p.title_am, p.kind, p.issue_label, p.summary_am, p.pages, p.price, p.currency,
       p.published_on, p.download_count, p.tags,
       fm.public_url as file_url, cm.public_url as cover_url
  from publications p
  left join media_files fm on fm.id = p.file_media_id
  left join media_files cm on cm.id = p.cover_media_id
 where p.state = 'published';

-- The public Teachers page shows a directory, never the staff record itself.
create or replace view public.v_public_teachers
as
select t.id, t.full_name_am, t.full_name_en, t.title_am, t.specializations,
       t.qualification, t.bio_am, m.public_url as photo_url
  from teacher_profiles t
  left join media_files m on m.id = t.photo_media_id
 where t.is_active;

create or replace view public.v_public_classes
as
select c.id, c.code, c.name_am, c.room_am, c.meets_summary_am, c.schedule, c.capacity,
       c.age_min, c.age_max, c.description_am,
       l.key as level_key, l.name_am as level_name, l.order_no as level_order,
       d.name_am as department_name, d.slug as department_slug,
       (select count(*) from student_enrollments e
         where e.class_id = c.id and e.status = 'enrolled') as enrolled_count
  from classes c
  left join class_levels l on l.id = c.level_id
  left join departments d on d.id = c.department_id
 where c.is_active;

create or replace view public.v_site_menu
as
select m.location, i.id, i.parent_id, i.label_am, i.label_en, i.href, i.collection,
       i.is_featured, i.sort_order,
       case when i.page_id is not null then '/' || nullif(p.slug, 'home') else null end as page_slug
  from menus m
  join menu_items i on i.menu_id = m.id and m.is_visible and i.is_visible
  left join pages p on p.id = i.page_id and p.state = 'published'
 order by m.location, i.sort_order;

create or replace view public.v_public_departments
as
select d.id, d.slug, d.name_am, d.name_en, d.summary_am, d.mission_am, d.icon, d.accent_color,
       d.contact_phone, d.contact_email, d.sort_order,
       hm.full_name_am as head_name,
       (select count(*) from department_members x
         where x.department_id = d.id and x.status = 'active') as member_count,
       (select count(*) from department_activities a
         where a.department_id = d.id and a.status = 'completed') as activity_count
  from departments d
  left join members hm on hm.id = d.head_member_id
 where d.is_public and d.state = 'published';

create or replace view public.v_public_faqs
as
select id, category_am, question_am, answer_am, sort_order
  from faqs where state = 'published';

create or replace view public.v_public_leadership
as
select l.id, l.name_am, l.title_am, l.role_key, l.bio_am, l.sort_order, m.public_url as photo_url
  from leadership l
  left join media_files m on m.id = l.media_id
 where l.state = 'published';

create or replace view public.v_public_campaigns
as
select c.id, c.slug, c.name_am, c.summary_am, c.goal_amount, c.currency,
       c.starts_on, c.ends_on, c.is_featured, m.public_url as cover_url,
       coalesce((select sum(d.amount) from donations d
                  where d.campaign_id = c.id and d.status in ('paid','partially_paid')), 0) as raised_amount
  from donation_campaigns c
  left join media_files m on m.id = c.cover_media_id
 where c.is_active and c.state = 'published';

grant select on public.v_public_news, public.v_public_events, public.v_public_media,
                public.v_public_albums, public.v_public_sermons, public.v_public_mezmur,
                public.v_public_publications, public.v_public_teachers, public.v_public_classes,
                public.v_site_menu, public.v_public_departments, public.v_public_faqs,
                public.v_public_leadership, public.v_public_campaigns
  to anon, authenticated;

-- ─── audit coverage ──────────────────────────────────────────────────────────
-- Only tables with a single `id` primary key can be audited by the generic
-- trigger, so the list is explicit rather than derived from the catalogue.
do $$
declare
  v_tables text[] := array[
    'profiles','user_roles','roles','role_permissions','permissions',
    'student_profiles','student_documents','student_id_cards','guardians','guardian_students',
    'teacher_profiles','applications','members','volunteer_profiles','volunteer_assignments',
    'departments','department_members','department_activities',
    'classes','subjects','curriculum_units','class_teachers','student_enrollments','class_sessions',
    'exams','exam_results','lesson_plans','learning_materials','promotion_batches',
    'issued_certificates','certificate_templates','discipline_records',
    'attendance_sessions','attendance_records',
    'finance_accounts','finance_categories','transactions','donations','donation_campaigns','budgets','finance_settings',
    'inventory_items','inventory_movements','assets','library_books','library_copies','library_loans','documents',
    'news','events','event_registrations','sermons','mezmur','publications','gallery_albums',
    'pages','page_blocks','menus','menu_items','site_settings','leadership','org_units','faqs',
    'announcements','contact_messages','prayer_requests','subscribers','outbox_messages',
    'approval_requests','media_files'
  ];
  v_name text;
begin
  foreach v_name in array v_tables loop
    if exists (
      select 1 from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = v_name
         and exists (select 1 from pg_attribute a
                      where a.attrelid = c.oid and a.attname = 'id' and a.attnum > 0)
    ) then
      perform public.enable_audit(v_name);
    end if;
  end loop;
end;
$$;
