-- Demo access ─────────────────────────────────────────────────────────────────
-- The twelve sign-in accounts are only half of a demo: without `user_roles` the
-- ERP shows an empty shell and the portals refuse to open. This file grants the
-- system roles from migration 140 and the scopes the RLS policies read
-- (`class_ids`, `department_ids`), so each account sees exactly what its job
-- should see and nothing more.
--
-- Applied with:  supabase db query --linked -f supabase/seed/05_access.sql

begin;

drop table if exists who;

-- Local part of the demo email → the person it stands for. 01_people.sql created
-- the member / teacher / student / guardian rows these ids point at.
create temporary table who as
select u.id, split_part(u.email, '@', 1) as role
  from auth.users u
 where u.email like '%@tekleteoflos.demo';

insert into public.user_roles (user_id, role_id, scope, granted_by)
select w.id, r.id,
       case
         -- A teacher is limited to the classes assigned in class_teachers.
         when r.key = 'teacher' then
           jsonb_build_object('class_ids', coalesce((
             select jsonb_agg(distinct ct.class_id)
               from public.class_teachers ct
               join public.teacher_profiles tp on tp.id = ct.teacher_id
              where tp.user_id = w.id), '[]'::jsonb))
         -- A department head sees the department(s) they are responsible for.
         when r.key = 'department_head' then
           jsonb_build_object('department_ids', coalesce((
             select jsonb_agg(d.id) from public.departments d
              where d.slug in ('evangelism', 'social-affairs')), '[]'::jsonb))
         else '{}'::jsonb
       end,
       (select id from who where role = 'superadmin')
  from who w
  join public.roles r on r.key = case w.role
    when 'superadmin'        then 'super_admin'
    when 'registrar'         then 'registrar'
    when 'finance'           then 'finance_officer'
    when 'approver'          then 'finance_approver'
    when 'editor'            then 'website_editor'
    when 'approver-content'  then 'content_approver'
    when 'media'             then 'media_minister'
    when 'teacher'           then 'teacher'
    when 'dept'              then 'department_head'
    when 'student'           then 'student'
    when 'parent'            then 'parent'
    when 'member'            then 'member'
  end
on conflict (user_id, role_id) do nothing;

-- The teacher and the media minister also serve as volunteers, and the plain
-- member is on the parish register — two grants the ERP screens read directly.
insert into public.user_roles (user_id, role_id, scope, granted_by)
select w.id, r.id, '{}'::jsonb, (select id from who where role = 'superadmin')
  from who w
  join public.roles r on r.key = 'volunteer'
 where w.role in ('teacher', 'media')
on conflict (user_id, role_id) do nothing;

-- The account this platform was built for keeps the run of the place, so the
-- owner can sign in with their own address rather than a demo password.
insert into public.user_roles (user_id, role_id, scope)
select u.id, r.id, '{}'::jsonb
  from auth.users u
  join public.roles r on r.key = 'super_admin'
 where u.email = 'mesfinabel511@gmail.com'
on conflict (user_id, role_id) do nothing;

-- Every demo account that stands for a parish member also gets the `member`
-- role, because the giving and directory screens key off membership.
insert into public.user_roles (user_id, role_id, scope)
select w.id, r.id, '{}'::jsonb
  from who w
  join public.roles r on r.key = 'member'
 where w.role in ('dept', 'finance', 'media', 'approver', 'registrar', 'approver-content')
   and exists (select 1 from public.members m where m.user_id = w.id)
on conflict (user_id, role_id) do nothing;

-- A demo that cannot reach a screen has not been seeded. Every grant is checked
-- through the same helpers RLS uses, so a mistake here fails the run loudly.
select r.key as role_key,
       count(*) as users,
       coalesce(max(jsonb_array_length(ur.scope -> 'class_ids')), 0)      as class_scope_grants,
       coalesce(max(jsonb_array_length(ur.scope -> 'department_ids')), 0) as department_scope_grants
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
 group by r.key
 order by r.key;

commit;
