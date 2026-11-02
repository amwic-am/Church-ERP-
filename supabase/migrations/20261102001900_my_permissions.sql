-- ============================================================
-- 19. What the signed-in person may do, in one call
--
-- `role_keys()` already answers "which roles am I", and every real refusal is
-- still produced by row-level security. But the interface has to know which
-- modules to draw, which tabs to hide and which portal to open — and a student
-- cannot read `role_permissions` (that table is for the roles editor). This
-- function hands a person their own grants; anyone else's require system.read.
-- ============================================================

create or replace function public.my_permissions(p_user uuid default auth.uid())
returns text[] language sql stable security definer set search_path = public as $$
  select case
    when p_user is null then '{}'::text[]
    when p_user = auth.uid() or public.has_permission('system.read', auth.uid()) then coalesce((
      select array_agg(distinct rp.permission_key order by rp.permission_key)
      from user_roles ur
      join role_permissions rp on rp.role_id = ur.role_id
      where ur.user_id = p_user
    ), '{}'::text[])
    else '{}'::text[]
  end;
$$;

comment on function public.my_permissions(uuid) is
  'The caller''s own permission keys, for menu and button visibility only. Postgres still decides everything else.';

revoke all on function public.my_permissions(uuid) from public;
grant execute on function public.my_permissions(uuid) to authenticated;
