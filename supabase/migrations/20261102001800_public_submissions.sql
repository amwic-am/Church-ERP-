-- 1800 · Public submission endpoints
--
-- Anonymous visitors never write to a table directly. Each public form calls one
-- SECURITY DEFINER function that validates the input, stamps the fields the
-- submitter must not control (status, source, amount ceiling) and returns only
-- the receipt the visitor needs. The anon role therefore holds no table writes
-- at all, and every form has a single testable entry point.

-- ─── receipt numbers ─────────────────────────────────────────────────────────
-- Applications already get a tracking reference from a trigger in 00500;
-- donations need the same so a receipt exists before the treasurer reviews it.
create or replace function public.assign_donation_receipt() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_prefix text;
  v_seq    bigint;
begin
  if coalesce(new.receipt_no, '') <> '' then
    return new;
  end if;

  v_prefix := 'RCP-' || to_char(now(), 'YYYY');

  select count(*) + 1 into v_seq
    from donations
   where receipt_no like v_prefix || '-%';

  while exists (select 1 from donations
                 where receipt_no = v_prefix || '-' || lpad(v_seq::text, 6, '0')) loop
    v_seq := v_seq + 1;
  end loop;

  new.receipt_no := v_prefix || '-' || lpad(v_seq::text, 6, '0');
  return new;
end;
$$;

create trigger donations_assign_receipt before insert on public.donations
  for each row execute function public.assign_donation_receipt();

-- ─── validation helpers ──────────────────────────────────────────────────────
create or replace function public.public_text(
  p_value    text,
  p_field    text,
  p_min      integer default 1,
  p_max      integer default 4000,
  p_required boolean default true
) returns text
language plpgsql stable as $$
declare
  v text := btrim(coalesce(p_value, ''));
begin
  if v = '' then
    if p_required then
      raise exception 'እባክዎ % ይሙሉ', p_field;
    end if;
    return null;
  end if;
  if char_length(v) < p_min then
    raise exception '% በጣም አጭር ነው', p_field;
  end if;
  if char_length(v) > p_max then
    raise exception '% በጣም ረጅም ነው (ከ% ብዛት በላይ ሊሆን አይችልም)', p_field, p_max;
  end if;
  return v;
end;
$$;

create or replace function public.public_phone(p_value text) returns text
language plpgsql stable as $$
declare
  v_raw  text := btrim(coalesce(p_value, ''));
  v      text := btrim(regexp_replace(v_raw, '[^0-9+]', '', 'g'), '+');
  v_plus boolean := left(v_raw, 1) = '+';
begin
  if v = '' then return null; end if;
  if char_length(v) < 9 or char_length(v) > 12 then
    raise exception 'ስልክ ቁጥሩ ትክክለኛ አይመስልም';
  end if;
  return case when v_plus then '+' || v else v end;
end;
$$;

create or replace function public.public_email(p_value text) returns text
language plpgsql stable as $$
declare
  v text := lower(btrim(coalesce(p_value, '')));
begin
  if v = '' then return null; end if;
  if v !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'የኢሜይል አድራሻው ትክክለኛ አይመስልም';
  end if;
  return v;
end;
$$;

-- ─── registration / membership applications ──────────────────────────────────
create or replace function public.submit_application(p jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_kind  text := lower(btrim(coalesce(p ->> 'kind', '')));
  v_saved public.applications%rowtype;
begin
  if v_kind not in ('student','teacher','volunteer','member') then
    raise exception 'የማመልከቻ ዓይነቱ ትክክለኛ አይደለም';
  end if;

  insert into public.applications (
    kind, full_name_am, full_name_en, baptismal_name_am, email, phone, gender,
    birth_date, address_am, parish, guardian_name, guardian_phone,
    level_requested, department_pref, availability, motivation_am, extra,
    status, source)
  values (
    v_kind,
    public.public_text(p ->> 'full_name_am', 'ሙሉ ስም', 2, 120),
    public.public_text(p ->> 'full_name_en', 'ስም (እንግሊዝኛ)', 2, 120, false),
    public.public_text(p ->> 'baptismal_name_am', 'የገላ ስም', 2, 120, false),
    public.public_email(p ->> 'email'),
    public.public_phone(p ->> 'phone'),
    case when lower(coalesce(p ->> 'gender','')) in ('male','female')
         then (lower(p ->> 'gender'))::public.gender end,
    nullif(btrim(coalesce(p ->> 'birth_date', '')), '')::date,
    public.public_text(p ->> 'address_am', 'አድራሻ', 2, 500, false),
    public.public_text(p ->> 'parish', 'የመንፈስ ቅዱስ ጉባኤ', 2, 200, false),
    public.public_text(p ->> 'guardian_name', 'የአባት ወይም የእናት ስም', 2, 120, false),
    public.public_phone(p ->> 'guardian_phone'),
    public.public_text(p ->> 'level_requested', 'የተጠየቀ ደረጃ', 1, 120, false),
    public.public_text(p ->> 'department_pref', 'ክፍለ ጉዳይ ምርጫ', 1, 120, false),
    public.public_text(p ->> 'availability', 'የሰዓት አቅም', 1, 200, false),
    public.public_text(p ->> 'motivation_am', 'ሐሳብ / ምክንያት', 4, 2000, false),
    coalesce(p -> 'extra', '{}'::jsonb),
    -- Status and source stay the church's decision, never the visitor's.
    'pending', 'website')
  returning * into v_saved;

  return jsonb_build_object(
    'id', v_saved.id,
    'reference', v_saved.reference,
    'status', v_saved.status,
    'submitted_at', v_saved.submitted_at,
    'message_am', 'ማመልከቻዎ ተቀብሏል። እባክዎ ይህን መከታተያ ቁጥር አስቆይተው ይጠቀሙ።');
end;
$$;

-- Public status lookup. The tracking number alone is not enough: the visitor
-- must also prove they know the phone or email used on the form.
create or replace function public.check_application_status(p_reference text, p_contact text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_ref     text := upper(btrim(coalesce(p_reference, '')));
  v_contact text := lower(btrim(coalesce(p_contact, '')));
  v_digits  text := regexp_replace(v_contact, '[^0-9]', '', 'g');
  v_row     record;
begin
  if v_ref = '' or v_contact = '' then
    raise exception 'መከታተያ ቁጥርንና ስልክ ወይም ኢሜይል ይሙሉ';
  end if;

  select kind, reference, status, submitted_at, reviewed_at
    into v_row
    from applications
   where upper(reference) = v_ref
     and (lower(coalesce(phone, '')) = v_contact
          or right(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), 10) = right(v_digits, 10)
          or lower(coalesce(email, '')) = v_contact)
   limit 1;

  if not found then
    raise exception 'ማመልከቻ አልተገኘም';
  end if;

  return jsonb_build_object(
    'kind', v_row.kind,
    'reference', v_row.reference,
    'status', v_row.status,
    'submitted_at', v_row.submitted_at,
    'reviewed_at', v_row.reviewed_at,
    'status_am', case v_row.status
      when 'pending'      then 'በመጠባበቂያ ላይ'
      when 'under_review' then 'በግምገማ ላይ'
      when 'interview'    then 'ቃለ መጠይቅ ተመድቧል'
      when 'approved'     then 'ጸድቋል'
      when 'rejected'     then 'አልጸደቀም'
      when 'withdrawn'    then 'ተሰርዟል'
      else 'በመከታተል ላይ'
    end);
end;
$$;

-- ─── contact · prayer · donation · newsletter · event ────────────────────────
create or replace function public.submit_contact_message(p jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_topic text := lower(btrim(coalesce(nullif(p ->> 'topic', ''), 'general')));
  v_id uuid;
begin
  if v_topic not in ('general','registration','donation','media','prayer','volunteer','other') then
    v_topic := 'general';
  end if;

  insert into public.contact_messages
    (name_am, email, phone, subject_am, message_am, topic, source_url, status)
  values (
    public.public_text(p ->> 'name_am', 'ስም', 2, 120),
    public.public_email(p ->> 'email'),
    public.public_phone(p ->> 'phone'),
    public.public_text(p ->> 'subject_am', 'ርዕስ', 2, 200),
    public.public_text(p ->> 'message_am', 'መልእክት', 10, 4000),
    v_topic,
    nullif(btrim(coalesce(p ->> 'source_url', '')), ''),
    'new')
  returning id into v_id;

  return jsonb_build_object('id', v_id,
    'message_am', 'መልእክትዎ ደርሷል። እናመሰግናለን።');
end;
$$;

create or replace function public.submit_prayer_request(p jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_category text := lower(btrim(coalesce(nullif(p ->> 'category', ''), 'general')));
  v_contact  text := coalesce(public.public_phone(p ->> 'contact'),
                              public.public_email(p ->> 'contact'));
  v_id uuid;
begin
  if v_category not in ('healing','family','travel','work','thanksgiving','deceased','church','nation','general') then
    v_category := 'general';
  end if;

  insert into public.prayer_requests
    (name_am, contact, request_am, category, for_whom, is_public, status)
  values (
    public.public_text(p ->> 'name_am', 'ስም', 2, 120, false),
    v_contact,
    public.public_text(p ->> 'request_am', 'የጸሎት ጥያቄ', 10, 3000),
    v_category,
    public.public_text(p ->> 'for_whom', 'ለማን', 1, 120, false),
    coalesce(lower(coalesce(p ->> 'is_public', 'false')) in ('true','1','yes'), false),
    'pending')
  returning id into v_id;

  return jsonb_build_object('id', v_id,
    'message_am', 'የጸሎት ጥያቄዎ ተቀብሏል። መንፈስ ቅዱስ ይመስግን።');
end;
$$;

create or replace function public.submit_donation(p jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_amount numeric := coalesce((nullif(btrim(coalesce(p ->> 'amount', '')), ''))::numeric, 0);
  v_row    public.donations%rowtype;
begin
  if v_amount <= 0 then
    raise exception 'የመባጀት መጠኑ ትክክለኛ አይደለም';
  end if;
  if v_amount > 10000000 then
    raise exception 'ከገደቡ በላይ ለሆነ መጠን እባክዎ ቤተ ክርስቲያኑን በስልክ ይገናኙ';
  end if;

  insert into public.donations (
    campaign_id, donor_name_am, donor_name_en, phone, email, in_honour_of,
    amount, currency, method, purpose_am, is_pledge, pledged_on, due_on,
    received_on, source, status, notes)
  values (
    nullif(p ->> 'campaign_id', '')::uuid,
    public.public_text(p ->> 'donor_name_am', 'ስም', 2, 120),
    public.public_text(p ->> 'donor_name_en', 'ስም (እንግሊዝኛ)', 2, 120, false),
    public.public_phone(p ->> 'phone'),
    public.public_email(p ->> 'email'),
    public.public_text(p ->> 'in_honour_of', 'በስም / በሐሳብ', 1, 200, false),
    round(v_amount, 2),
    upper(coalesce(nullif(btrim(p ->> 'currency'), ''), 'ETB')),
    case when coalesce(p ->> 'method', '') in
              ('cash','bank_transfer','check','card','mobile_money','other')
         then (p ->> 'method')::public.payment_method else 'other' end,
    public.public_text(p ->> 'purpose_am', 'ዓላማ', 1, 300, false),
    -- A visitor can only promise money; the treasurer confirms what arrives.
    true,
    coalesce(nullif(p ->> 'pledged_on', '')::date, current_date),
    nullif(p ->> 'due_on', '')::date,
    null,
    'website', 'pledged',
    public.public_text(p ->> 'notes', 'ማስታወሻ', 1, 500, false))
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id, 'receipt_no', v_row.receipt_no,
    'amount', v_row.amount, 'status', v_row.status,
    'message_am', 'የመባጀት ሐሳብዎ ተቀብሏል። ደረሰኝ በመከታተያ ቁጥር ቀርቧል።');
end;
$$;

create or replace function public.subscribe_newsletter(
  p_email text, p_name_am text default null, p_phone text default null, p_topics text[] default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_email text := public.public_email(p_email);
  v_row   public.subscribers%rowtype;
begin
  if v_email is null then
    raise exception 'የኢሜይል አድራሻ ያስፈልጋል';
  end if;

  insert into public.subscribers (email, name_am, phone, topics, status, source, consent_at)
  values (
    v_email,
    public.public_text(p_name_am, 'ስም', 2, 120, false),
    public.public_phone(p_phone),
    coalesce(nullif(p_topics, '{}'), '{general}'),
    'subscribed', 'website', now())
  on conflict (email) do update
     set name_am = coalesce(excluded.name_am, subscribers.name_am),
         phone   = coalesce(excluded.phone, subscribers.phone),
         status  = 'subscribed',
         unsubscribed_at = null,
         consent_at = now()
  returning * into v_row;

  return jsonb_build_object('id', v_row.id, 'email', v_row.email,
    'message_am', 'ለመረጃ ማሳወቂያ ተመዝግበዋል።');
end;
$$;

create or replace function public.register_for_event(p_event_id uuid, p jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_event public.events%rowtype;
  v_row   public.event_registrations%rowtype;
  v_seats integer := coalesce(nullif(btrim(coalesce(p ->> 'participants', '')), '')::integer, 1);
  v_taken integer;
begin
  select * into v_event from events where id = p_event_id;
  if not found or v_event.state <> 'published' then
    raise exception 'ይህ ፕሮግራም ለህዝብ ክፍት አይደለም';
  end if;
  if v_event.registration_required = false then
    raise exception 'ለዚህ ፕሮግራም ምዝገባ አልተጠየቀም';
  end if;
  if v_event.registration_deadline is not null
     and v_event.registration_deadline < now() then
    raise exception 'የምዝገባ ጊዜው አልፏል';
  end if;
  if v_seats < 1 or v_seats > 50 then
    raise exception 'ተካፋይ ብዛት ከ1 እስከ 50 መሆን አለበት';
  end if;

  if v_event.capacity is not null then
    select coalesce(sum(participants), 0) + v_seats into v_taken
      from event_registrations
     where event_id = p_event_id and status in ('registered','attended');
    if v_taken > v_event.capacity then
      raise exception 'የፕሮግራሙ ቦታ ሙሉ ነው';
    end if;
  end if;

  insert into public.event_registrations (
    event_id, full_name_am, phone, email, parish, participants, notes, source, status)
  values (
    p_event_id,
    public.public_text(p ->> 'full_name_am', 'ስም', 2, 120),
    public.public_phone(p ->> 'phone'),
    public.public_email(p ->> 'email'),
    public.public_text(p ->> 'parish', 'የመንፈስ ቅዱስ ጉባኤ', 2, 200, false),
    v_seats,
    public.public_text(p ->> 'notes', 'ማስታወሻ', 1, 500, false),
    case when auth.uid() is null then 'website' else 'erp' end,
    'registered')
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id, 'event_id', v_row.event_id,
    'participants', v_row.participants, 'status', v_row.status,
    'message_am', 'ለፕሮግራሙ ተመዝግበዋል።');
end;
$$;

-- ─── reachability ────────────────────────────────────────────────────────────
-- The helpers are internal; only the seven endpoints face the outside world.
revoke all on function
    public.public_text(text, text, integer, integer, boolean),
    public.public_phone(text),
    public.public_email(text)
  from public, anon, authenticated, service_role;

grant execute on function
    public.submit_application(jsonb),
    public.check_application_status(text, text),
    public.submit_contact_message(jsonb),
    public.submit_prayer_request(jsonb),
    public.submit_donation(jsonb),
    public.subscribe_newsletter(text, text, text, text[]),
    public.register_for_event(uuid, jsonb)
  to anon, authenticated, service_role;

-- Direct anonymous writes are gone: every public submission now passes through
-- the validated functions above.
revoke insert on
    public.applications, public.contact_messages, public.prayer_requests,
    public.donations, public.subscribers, public.event_registrations
  from anon;

drop policy if exists applications_public_submit  on public.applications;
drop policy if exists contact_public_submit       on public.contact_messages;
drop policy if exists prayer_public_submit        on public.prayer_requests;
drop policy if exists donations_public_submit     on public.donations;
drop policy if exists subscribers_public_submit   on public.subscribers;
drop policy if exists event_reg_public_submit     on public.event_registrations;
