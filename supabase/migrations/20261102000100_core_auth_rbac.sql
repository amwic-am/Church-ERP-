-- 01 · Core: extensions, enums, RBAC, profiles, audit helpers
-- Every table lives in `public` and is RLS-protected in migration 130.

create extension if not exists pg_trgm with schema extensions;

-- ─── shared enums ────────────────────────────────────────────────────────────
create type public.content_state as enum
  ('draft', 'submitted', 'changes_requested', 'approved', 'published', 'archived');

create type public.application_status as enum
  ('pending', 'under_review', 'interview', 'approved', 'rejected', 'withdrawn');

create type public.gender as enum ('male', 'female');

create type public.member_status as enum
  ('active', 'inactive', 'transferred', 'deceased', 'pending');

create type public.attendance_status as enum
  ('present', 'absent', 'late', 'excused');

create type public.transaction_type as enum ('income', 'expense', 'transfer');

create type public.payment_method as enum
  ('cash', 'bank_transfer', 'check', 'card', 'mobile_money', 'other');

create type public.delivery_channel as enum ('email', 'sms', 'push', 'in_app');

create type public.delivery_status as enum
  ('queued', 'sending', 'sent', 'delivered', 'failed', 'provider_not_configured');

-- ─── generic triggers ────────────────────────────────────────────────────────
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ─── roles / permissions ─────────────────────────────────────────────────────
create table public.roles (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique check (key ~ '^[a-z][a-z0-9_]{1,59}$'),
  name_am     text not null,
  name_en     text,
  description text,
  is_system   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Permission keys are `<module>.<action>` and form the closed catalogue the
-- Roles & Permissions screen can grant; app code must not invent new ones.
create table public.permissions (
  key        text primary key check (key ~ '^[a-z_]+\.[a-z_]+$'),
  module     text not null,
  action     text not null,
  name_am    text not null,
  created_at timestamptz not null default now()
);

create table public.role_permissions (
  role_id        uuid not null references public.roles (id) on delete cascade,
  permission_key text not null references public.permissions (key) on delete cascade,
  granted_at     timestamptz not null default now(),
  primary key (role_id, permission_key)
);

-- `scope` narrows a grant to specific records, e.g.
-- {"department_ids": ["…"], "class_ids": ["…"]}
create table public.user_roles (
  user_id    uuid not null references auth.users (id) on delete cascade,
  role_id    uuid not null references public.roles (id) on delete cascade,
  scope      jsonb not null default '{}'::jsonb,
  granted_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

-- ─── profiles ────────────────────────────────────────────────────────────────
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  full_name_am  text not null default '',
  full_name_en  text,
  phone         text,
  email         text,
  avatar_path   text,
  gender        public.gender,
  birth_date    date,
  member_status public.member_status not null default 'active',
  parish        text,
  joined_at     date,
  is_active     boolean not null default true,
  preferences   jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index profiles_full_name_trgm on public.profiles using gin (full_name_am extensions.gin_trgm_ops);

-- ─── audit log ───────────────────────────────────────────────────────────────
create table public.audit_logs (
  id         bigint generated always as identity primary key,
  user_id    uuid,
  user_label text,
  action     text not null,
  table_name text not null,
  record_id  text,
  old_values jsonb,
  new_values jsonb,
  ip         text,
  created_at timestamptz not null default now()
);

create index audit_logs_created_at on public.audit_logs (created_at desc);
create index audit_logs_table_idx on public.audit_logs (table_name, created_at desc);

-- Actor resolution order: Edge Function → authenticated JWT → trigger caller.
create or replace function public.actor_user_id() returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('app.user_id', true), '')::uuid,
    auth.uid()
  );
$$;

create or replace function public.log_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_op text := lower(substring(tg_op from 1 for 4));
begin
  if tg_op = 'DELETE' then
    insert into audit_logs (user_id, action, table_name, record_id, old_values)
    values (actor_user_id(), 'delete', tg_table_name, old.id::text, to_jsonb(old));
    return old;
  else
    insert into audit_logs (user_id, action, table_name, record_id, old_values, new_values)
    values (
      actor_user_id(),
      case when v_op = 'inse' then 'create' else 'update' end,
      tg_table_name,
      new.id::text,
      case when v_op = 'upda' then to_jsonb(old) else null end,
      to_jsonb(new)
    );
    return new;
  end if;
end;
$$;

-- Attach audit tracking to a table; called once per table in migration 130.
create or replace function public.enable_audit(p_table text) returns void
language plpgsql security definer set search_path = public as $$
begin
  execute format('drop trigger if exists audit_%I on public.%I', p_table, p_table);
  execute format(
    'create trigger audit_%I after insert or update or delete on public.%I
       for each row execute function public.log_audit()',
    p_table, p_table
  );
end;
$$;

-- ─── auth user bootstrap ─────────────────────────────────────────────────────
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name_am, full_name_en, email, phone, gender, birth_date)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name_am', ''),
    new.raw_user_meta_data ->> 'full_name_en',
    new.email,
    new.raw_user_meta_data ->> 'phone',
    nullif(new.raw_user_meta_data ->> 'gender', '')::public.gender,
    nullif(new.raw_user_meta_data ->> 'birth_date', '')::date
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_user_email_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update profiles set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- ─── permission helpers ──────────────────────────────────────────────────────
-- SECURITY DEFINER + owned by the migrating role: the inner reads bypass RLS,
-- which is what lets policies on `profiles` call these without recursing.

create or replace function public.role_keys_of(p_user uuid)
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(
    array_agg(distinct r.key) filter (where r.key is not null),
    '{}'::text[]
  )
  from user_roles ur
  join roles r on r.id = ur.role_id
  where ur.user_id = p_user;
$$;

create or replace function public.role_keys(p_user uuid default auth.uid())
returns text[] language sql stable security definer set search_path = public as $$
  select public.role_keys_of(p_user);
$$;

create or replace function public.is_super_admin(p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select p_user is not null and 'super_admin' = any (public.role_keys_of(p_user));
$$;

create or replace function public.has_permission(p_permission text, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select p_user is not null and (
    'super_admin' = any (public.role_keys_of(p_user))
    or exists (
      select 1
      from user_roles ur
      join role_permissions rp on rp.role_id = ur.role_id
      where ur.user_id = p_user and rp.permission_key = p_permission
    )
  );
$$;

-- Array form: true when any of the listed permissions is granted.
create or replace function public.has_any_permission(p_permissions text[], p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from unnest(coalesce(p_permissions, '{}'::text[])) as p where public.has_permission(p, p_user));
$$;

-- Scoped grants: {"class_ids": [...]} / {"department_ids": [...]} / {"student_ids":[...]}
create or replace function public.scope_ids(p_scope_key text, p_user uuid default auth.uid())
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(
    array_agg(distinct (elem #>> '{}'))::uuid[],
    '{}'::uuid[]
  )
  from user_roles ur,
       jsonb_array_elements(ur.scope -> p_scope_key) as elem
  where ur.user_id = p_user
    and jsonb_typeof(ur.scope -> p_scope_key) = 'array';
$$;

create or replace function public.in_scope(p_scope_key text, p_id uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_super_admin(p_user) or p_id = any (public.scope_ids(p_scope_key, p_user));
$$;

-- Students are not staff: a portal user is matched on the linked auth id.
-- Domain-scoped helpers (can_read_student / is_guardian_of / my_student_id)
-- are declared in 20261102000500 after their tables exist.
