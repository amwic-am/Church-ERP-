-- ============================================================
-- 21. The two public class views the site was missing
--
-- `v_public_classes` joins the level and department names but stops there: the
-- Sunday-school and classes pages could say nothing about who teaches a class,
-- because `class_teachers` and `teacher_profiles` grant anonymous reads only to
-- `v_public_teachers`. This adds the assigned names to the class view and gives
-- the levels their own public view, so the site reads a view everywhere instead
-- of the `class_levels` base table.
--
-- Both base tables are filtered by `is_active` alone — there is no draft state —
-- so these views expose exactly what the anonymous policies already did, with
-- the teacher join added.
-- ============================================================

-- Both views are replaced whole: a view cannot gain a column in place, and the
-- class view's column order changes when the teacher names join moves up.
drop view if exists public.v_public_class_levels;
drop view if exists public.v_public_classes;

-- `next_level_id` stays: the Sunday-school page names the level a child moves up
-- to, and the level cards are read from this view rather than the base table.
create view public.v_public_class_levels
as
select l.id, l.key, l.name_am, l.order_no, l.age_min, l.age_max, l.description_am,
       l.next_level_id,
       (select count(*) from classes c where c.level_id = l.id and c.is_active) as classes_count
  from class_levels l
 where l.is_active;

-- A view cannot gain a column in place, so the class view is rebuilt.
create view public.v_public_classes
as
select c.id, c.code, c.name_am, c.room_am, c.meets_summary_am, c.schedule, c.capacity,
       c.age_min, c.age_max, c.description_am,
       l.key as level_key, l.name_am as level_name, l.order_no as level_order,
       d.name_am as department_name, d.slug as department_slug,
       (select string_agg(t.full_name_am, '፣ '
                   order by case ct.role_key when 'lead' then 0 when 'assistant' then 1 else 2 end,
                            t.full_name_am)
          from class_teachers ct
          join teacher_profiles t on t.id = ct.teacher_id
         where ct.class_id = c.id and ct.removed_on is null and t.is_active) as teacher_names,
       (select count(*) from student_enrollments e
         where e.class_id = c.id and e.status = 'enrolled') as enrolled_count
  from classes c
  left join class_levels l on l.id = c.level_id
  left join departments d on d.id = c.department_id
 where c.is_active;

grant select on public.v_public_class_levels, public.v_public_classes to anon, authenticated;

comment on view public.v_public_class_levels is
  'Active class levels with how many active classes each one holds.';
comment on view public.v_public_classes is
  'Active classes with level, department, assigned teacher names and live enrolment count.';
