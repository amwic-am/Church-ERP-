-- 12 · Content workflow registry + draft → approval → publish RPCs
-- One registry drives every publishable table, so the ERP approval queue and
-- the public site can never disagree about what "published" means.

create table public.content_types (
  key                text primary key,
  table_name         text not null,
  label_column       text not null default 'title_am',
  state_column       text not null default 'state',
  published_column   text,
  submitted_column   text,
  reviewed_column    text,
  notes_column       text,
  approve_permission text not null,
  submit_permission  text not null,
  portal_path        text
);

insert into public.content_types
  (key, table_name, label_column, state_column, published_column, submitted_column, reviewed_column, notes_column,
   approve_permission, submit_permission, portal_path)
values
  ('news',         'news',              'title_am',    'state', 'published_at', 'submitted_at', 'reviewed_by', 'review_notes', 'news.publish',          'news.write',          '/erp/news'),
  ('event',        'events',            'title_am',    'state', 'published_at', 'submitted_at', 'reviewed_by', 'review_notes', 'events.publish',        'events.write',        '/erp/events'),
  ('page',         'pages',             'title_am',    'state', 'published_at', 'submitted_at', 'reviewed_by', 'review_notes', 'website.publish',       'website.write',       '/erp/pages'),
  ('sermon',       'sermons',           'title_am',    'state', 'published_at', null,           'reviewed_by', 'review_notes', 'media.publish',         'media.write',         '/erp/sermons'),
  ('mezmur',       'mezmur',            'title_am',    'state', 'published_at', null,           null,          'review_notes', 'media.publish',         'media.write',         '/erp/mezmur'),
  ('publication',  'publications',      'title_am',    'state', 'published_on', null,           null,          null,          'media.publish',         'media.write',         '/erp/publications'),
  ('album',        'gallery_albums',    'title_am',    'state', 'published_at', null,           'reviewed_by', 'review_notes', 'gallery.publish',       'gallery.write',       '/erp/gallery'),
  ('announcement', 'announcements',     'title_am',    'state', 'publish_at',   null,           'reviewed_by', 'review_notes', 'communication.publish', 'communication.write', '/erp/announcements'),
  ('faq',          'faqs',              'question_am', 'state', null,           null,           null,          null,          'website.publish',       'website.write',       '/erp/faqs'),
  ('leader',       'leadership',        'name_am',     'state', null,           null,           null,          null,          'website.publish',       'website.write',       '/erp/leadership'),
  ('material',     'learning_materials','title_am',    'state', null,           null,           null,          null,          'academics.publish',     'academics.write',     '/erp/materials');

create or replace function public.content_meta(p_type text) returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(ct) from content_types ct where ct.key = p_type;
$$;

-- Resolve the registry row, the permission check and the current state in one
-- call so each transition below stays short and auditable.
create or replace function public.content_guard(
  p_type text, p_id uuid, p_permission text, p_actor uuid default auth.uid()
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_meta jsonb;
  v_row jsonb;
begin
  select to_jsonb(ct) into v_meta from content_types ct where ct.key = p_type;
  if v_meta is null then
    raise exception 'unknown content type %', p_type;
  end if;

  if not public.has_permission(p_permission, p_actor) then
    raise exception 'missing permission %', p_permission;
  end if;

  execute format('select jsonb_build_object(''state'', t.%I, ''label'', t.%I) from public.%I t where t.id = $1',
    v_meta ->> 'state_column', v_meta ->> 'label_column', v_meta ->> 'table_name')
    into v_row using p_id;

  if v_row is null then
    raise exception '% % not found', p_type, p_id;
  end if;

  return v_meta || v_row;
end;
$$;

-- ─── transitions ─────────────────────────────────────────────────────────────
create or replace function public.set_content_state(
  p_meta jsonb, p_id uuid, p_state text,
  p_reviewer uuid default null, p_note text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_sets text := quote_ident(p_meta ->> 'state_column')
              || format(' = %L::public.content_state', p_state);
begin
  if p_meta ->> 'published_column' is not null
     and p_state in ('published', 'archived') then
    v_sets := v_sets || ', ' || quote_ident(p_meta ->> 'published_column')
              || case when p_state = 'published' then ' = now()' else ' = null' end;
  end if;

  if p_meta ->> 'submitted_column' is not null and p_state = 'submitted' then
    v_sets := v_sets || ', ' || quote_ident(p_meta ->> 'submitted_column') || ' = coalesce('
              || quote_ident(p_meta ->> 'submitted_column') || ', now())';
  end if;

  if p_reviewer is not null and p_meta ->> 'reviewed_column' is not null then
    v_sets := v_sets || ', ' || quote_ident(p_meta ->> 'reviewed_column') || ' = ' || quote_literal(p_reviewer);
  end if;

  if p_note is not null and p_meta ->> 'notes_column' is not null then
    v_sets := v_sets || ', ' || quote_ident(p_meta ->> 'notes_column') || ' = ' || quote_literal(p_note);
  end if;

  execute format('update public.%I set %s where id = $1', p_meta ->> 'table_name', v_sets) using p_id;
end;
$$;

create or replace function public.submit_content(p_type text, p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v jsonb;
  v_request public.approval_requests%rowtype;
begin
  v := public.content_guard(p_type, p_id, (select submit_permission from content_types where key = p_type));

  if v ->> 'state' not in ('draft', 'changes_requested') then
    raise exception 'only a draft or returned % can be submitted (found %)', p_type, v ->> 'state';
  end if;

  perform public.set_content_state(v, p_id, 'submitted');

  insert into approval_requests (domain, entity_table, entity_id, entity_label, action,
                                 submitted_by, assigned_role, payload)
  values ('content', v ->> 'table_name', p_id, v ->> 'label', 'publish',
          actor_user_id(), 'content_approver', jsonb_build_object('content_type', p_type))
  returning * into v_request;

  return jsonb_build_object('approval_id', v_request.id, 'status', v_request.status,
                            'entity_table', v_request.entity_table, 'entity_id', p_id);
end;
$$;

-- approve / reject move an item through the queue; publish / unpublish / archive
-- move it on the site. Approving never publishes by itself.
create or replace function public.decide_content(
  p_type text, p_id uuid, p_decision text, p_note text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v jsonb;
  v_permission text;
  v_open uuid;
  v_actor uuid := actor_user_id();
  v_final text;
begin
  if p_decision not in ('approve','reject','publish','unpublish','archive') then
    raise exception 'unsupported content decision %', p_decision;
  end if;

  v_permission := case
    when p_decision in ('approve','reject') then (select approve_permission from content_types where key = p_type)
    else (select submit_permission from content_types where key = p_type)
  end;

  v := public.content_guard(p_type, p_id, v_permission);

  select id into v_open from approval_requests
   where entity_table = v ->> 'table_name' and entity_id = p_id and status = 'pending'
   order by created_at desc limit 1;

  -- Separation of duties: an author never approves their own submission.
  if p_decision in ('approve','reject') and exists (
    select 1 from approval_requests where id = v_open and submitted_by = v_actor
  ) then
    raise exception 'የራስዎ ማስገቢያ ስለሆነ ማረጋገጫ ወይም ውድቅ ማድረግ አይችሉም';
  end if;

  if p_decision = 'approve' then
    if v ->> 'state' <> 'submitted' then
      raise exception 'only a submitted % can be approved (found %)', p_type, v ->> 'state';
    end if;
    perform public.set_content_state(v, p_id, 'approved', v_actor, p_note);
    update approval_requests
       set status = 'approved', decided_by = v_actor, decided_at = now(), decision_note = p_note
     where id = v_open;
    v_final := 'approved';

  elsif p_decision = 'reject' then
    perform public.set_content_state(v, p_id, 'changes_requested', v_actor, p_note);
    update approval_requests
       set status = 'rejected', decided_by = v_actor, decided_at = now(), decision_note = p_note
     where id = v_open;
    v_final := 'changes_requested';

  elsif p_decision = 'publish' then
    if v ->> 'state' not in ('approved','archived') then
      raise exception 'content must be approved before publishing (found %)', v ->> 'state';
    end if;
    perform public.set_content_state(v, p_id, 'published', v_actor, p_note);
    update approval_requests
       set status = 'approved', decided_by = v_actor, decided_at = now(), decision_note = coalesce(p_note, 'published')
     where id = v_open;
    v_final := 'published';

  elsif p_decision = 'unpublish' then
    perform public.set_content_state(v, p_id, 'approved', v_actor, p_note);
    v_final := 'approved';

  else
    perform public.set_content_state(v, p_id, 'archived', v_actor, p_note);
    v_final := 'archived';
  end if;

  return jsonb_build_object('type', p_type, 'id', p_id, 'state', v_final, 'decision', p_decision);
end;
$$;

-- The approver queue, joined across content types for one ERP screen.
create or replace function public.pending_approvals(p_domain text default null)
returns table (
  id uuid, domain text, entity_table text, entity_id uuid, entity_label text,
  action text, amount numeric, currency text, status text, reason text,
  submitted_by uuid, submitter_name text, submitted_at timestamptz,
  assigned_role text, content_type text
)
language sql stable security definer set search_path = public as $$
  select ar.id, ar.domain, ar.entity_table, ar.entity_id, ar.entity_label,
         ar.action, ar.amount, ar.currency, ar.status, ar.reason,
         ar.submitted_by, p.full_name_am, ar.created_at, ar.assigned_role,
         ct.key
    from approval_requests ar
    left join profiles p on p.id = ar.submitted_by
    left join content_types ct on ct.table_name = ar.entity_table
   where (p_domain is null or ar.domain = p_domain)
     and ar.status = 'pending'
   order by ar.created_at;
$$;
