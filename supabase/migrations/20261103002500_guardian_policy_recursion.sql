-- Signing in as a parent used to end with `infinite recursion detected in
-- policy for relation "guardian_students"` and no children at all.
--
-- `guardian_links_read` checked the link's owner with a plain
-- `exists (select 1 from guardians …)`, and `guardians_scoped_read` checked for
-- a readable child with a plain `exists (select 1 from guardian_students …)`.
-- A policy's subqueries run under the caller's own row-level security, so each
-- table's policy re-entered the other's, and Postgres stopped after detecting
-- the cycle rather than answering the query.
--
-- Both checks now live in SECURITY DEFINER functions. The function body runs as
-- its owner (`postgres`, which holds BYPASSRLS), so its reads do not evaluate
-- the caller's policies and the chain ends after one hop. The visibility rules
-- are unchanged: each still answers only whether *this* row belongs to, or is
-- visible from, the current user.

create or replace function public.owns_guardian(p_guardian uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select p_user is not null and exists (
    select 1 from guardians g
     where g.id = p_guardian and g.user_id = p_user
  );
$$;

create or replace function public.guardian_has_visible_child(p_guardian uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select p_user is not null and exists (
    select 1 from guardian_students gs
     where gs.guardian_id = p_guardian
       and public.can_read_student(gs.student_id, p_user)
  );
$$;

comment on function public.owns_guardian(uuid, uuid) is
  'Guardian-row ownership, wrapped so the guardian policies do not call each other through RLS.';
comment on function public.guardian_has_visible_child(uuid, uuid) is
  'Does this guardian link to at least one student the caller may read? Wrapped for the same reason.';

drop policy if exists guardian_links_read on public.guardian_students;
create policy guardian_links_read on public.guardian_students
  for select to authenticated using (
    public.has_permission('students.read')
    or public.owns_guardian(guardian_id)
    or public.can_read_student(student_id)
  );

drop policy if exists guardians_scoped_read on public.guardians;
create policy guardians_scoped_read on public.guardians
  for select to authenticated using (
    user_id = auth.uid()
    or public.has_permission('students.read')
    or public.guardian_has_visible_child(id)
  );
