-- Supabase's default privileges hand EXECUTE on every function created in
-- `public` to `anon`, `authenticated`, `service_role` *and* `PUBLIC`, which
-- quietly overruled the per-function grants written in migrations 1600, 1700,
-- 1800, 1900 and 2000. All 82 functions in this schema — 74 of them SECURITY
-- DEFINER — ended up callable from a signed-out browser, and PostgREST publishes
-- `public` functions as RPC endpoints, so `POST /rest/v1/rpc/finance_summary`,
-- `…/rpc/dashboard_kpis`, `…/rpc/student_report_card?id=…` answered anonymous
-- requests, and staff actions (`decide_transaction`, `run_promotion`,
-- `approve_application`, `bootstrap_super_admin`, `set_content_state`) were
-- reachable with no login at all. Whether each body then refused on its own
-- permission check is an implementation detail; the surface should not exist.
--
-- This closes the anonymous hole and restores the two restrictions that default
-- privileges also erased: the queue drainers are `service_role` only, so a
-- signed-in volunteer cannot drain the mail queue either.
--
-- `anon` keeps only what a visitor genuinely calls: the seven public form
-- endpoints (1800), site search and the certificate checker (1600), and the
-- helpers written inside row-level security expressions — those evaluate with
-- the caller's own privileges, so revoking them would turn every policy into a
-- permission error instead of a denial. Each of them answers a question about
-- the *current* user, so a signed-out caller simply gets `false`.

revoke execute on all functions in schema public from anon, public;

-- The Supabase service roles owned the rest of their access through `PUBLIC`:
-- a sign-up runs `handle_new_user` as `supabase_auth_admin`, and a storage
-- request evaluates our `media_write_staff` policy as `supabase_storage_admin`.
do $$
declare
  v_infra_roles text[] := array[
    'postgres', 'supabase_admin', 'supabase_auth_admin',
    'supabase_functions_admin', 'supabase_storage_admin', 'supabase_replication_admin'
  ];
  v_role text;
begin
  foreach v_role in array v_infra_roles loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      execute format('grant execute on all functions in schema public to %I', v_role);
    end if;
  end loop;
end
$$;

-- Endpoints the public website calls, and the helpers RLS calls. Granted to
-- every web role: a policy expression is evaluated as whoever is asking, so the
-- signed-in roles need the same seven helpers `anon` does.
do $$
declare
  v_open_fns text[] := array[
    'submit_application', 'check_application_status', 'submit_contact_message',
    'submit_prayer_request', 'submit_donation', 'subscribe_newsletter',
    'register_for_event', 'search_site', 'verify_certificate',
    'has_permission', 'in_scope', 'is_super_admin', 'my_student_id',
    'is_guardian_of', 'can_read_student', 'teaches_class'
  ];
  v_targets text;
  v_name text;
begin
  foreach v_name in array v_open_fns loop
    select string_agg(format('public.%s(%s)', quote_ident(p.proname),
                             pg_get_function_identity_arguments(p.oid)), ', ')
      into v_targets
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.proname = v_name;

    if v_targets is null then
      raise exception 'the open allowlist names public.% which does not exist', v_name;
    end if;
    execute 'grant execute on function ' || v_targets || ' to anon, authenticated, service_role';
  end loop;
end
$$;

-- `revoke … from public` above cannot express "these three belong to the worker
-- alone", because the earlier default privileges had already named
-- `authenticated` explicitly. Restate it.
revoke execute on function
    public.claim_outbox(integer),
    public.mark_outbox_result(uuid, boolean, text),
    public.bootstrap_super_admin(text)
  from authenticated;

-- Without this the next migration that creates a function reopens the hole.
alter default privileges in schema public revoke execute on functions from anon, public;
alter default privileges in schema public grant execute on functions to authenticated, service_role;
