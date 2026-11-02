-- 140 · Row Level Security
-- Pattern: RLS is ON for every public table. Public (anon) traffic can read only
-- rows the CMS marked published, and can insert only into the five intake
-- queues. Staff access is driven by the permission catalogue; sensitive records
-- additionally require a row-level relationship.

-- ─── enable on everything ────────────────────────────────────────────────────
do $$
declare
  t record;
begin
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p')
       and c.relname not in ('spatial_ref_sys', 'geography_columns', 'geometry_columns', 'raster_columns', 'raster_overviews')
  loop
    -- `enable` (not `force`) so the owner and the service role keep bypassing
    -- RLS, which the SECURITY DEFINER helpers and the Edge Functions rely on.
    execute format('alter table public.%I enable row level security', t.relname);
  end loop;
end;
$$;

-- ─── permission catalogue ────────────────────────────────────────────────────
insert into public.permissions (key, module, action, name_am) values
  ('website.read','website','read','የድረ ገጽን ማየት'),
  ('website.write','website','write','የድረ ገጽን ማስተዳደር'),
  ('website.publish','website','publish','ወደ ድረ ገጽ ማሳወቅ'),
  ('news.read','news','read','ዜና ማየት'),
  ('news.write','news','write','ዜና መፃፍ'),
  ('news.publish','news','publish','ዜና ማሳወቅ'),
  ('events.read','events','read','ምርቀት/ልዩ ክንውኖ ማየት'),
  ('events.write','events','write','ልዩ ክንውኖ መፍጠር'),
  ('events.publish','events','publish','ልዩ ክንውኖ ማሳወቅ'),
  ('gallery.read','gallery','read','ምስል ማየት'),
  ('gallery.write','gallery','write','ምስል ማስተዳደር'),
  ('gallery.publish','gallery','publish','ምስል ማሳወቅ'),
  ('media.read','media','read','ሚዲያ ማየት'),
  ('media.write','media','write','ሚዲያ መስቀል/ማስተዳደር'),
  ('media.publish','media','publish','ሚዲያ ማሳወቅ'),
  ('media.delete','media','delete','ሚዲያ መሰረዝ'),
  ('students.read','students','read','ተማሪዎችን ማየት'),
  ('students.write','students','write','ተማሪ መፍጠር/ማሻሻል'),
  ('students.delete','students','delete','ተማሪ መሰረዝ'),
  ('students.promote','students','promote','ተማሪ ማሻገር'),
  ('applications.read','applications','read','ማመልከቻዎችን ማየት'),
  ('applications.write','applications','write','ማመልከቻን ማስተዳደር'),
  ('teachers.read','teachers','read','መምህራንን ማየት'),
  ('teachers.write','teachers','write','መምህራንን ማስተዳደር'),
  ('academics.read','academics','read','ትምህርታዊ ማስታወሻ ማየት'),
  ('academics.write','academics','write','ትምህርታዊ ማስታወሻ ማስተዳደር'),
  ('academics.publish','academics','publish','ትምህርታዊ ነገር ማሳወቅ'),
  ('attendance.read','attendance','read','ሐዘር መከታተያ ማየት'),
  ('attendance.mark','attendance','mark','የተሰጠ ክፍል ሐዘር መከታተያ መመዝገብ'),
  ('attendance.write','attendance','write','ሐዘር መከታተያ መመዝገብ'),
  ('results.read','results','read','ውጤት ማየት'),
  ('results.mark','results','mark','የተሰጠ ክፍል ውጤት መመዝገብ'),
  ('results.write','results','write','ውጤት መመዝገብ'),
  ('results.release','results','release','ውጤት ማሳወቅ'),
  ('certificates.read','certificates','read','ሰርተፍኬት ማየት'),
  ('certificates.write','certificates','write','ሰርተፍኬት መስጠት'),
  ('departments.read','departments','read','ክፍሎችን ማየት'),
  ('departments.write','departments','write','ክፍሎችን ማስተዳደር'),
  ('volunteers.read','volunteers','read','አቅም ሰጪዎችን ማየት'),
  ('volunteers.write','volunteers','write','አቅም ሰጪዎችን ማስተዳደር'),
  ('finance.read','finance','read','ፋይናንስ ማየት'),
  ('finance.write','finance','write','ፋይናንስ መመዝገብ'),
  ('finance.approve','finance','approve','ፋይናንስ ማጽደቅ'),
  ('finance.export','finance','export','ፋይናንስ ማውጣት'),
  ('donations.read','donations','read','ልገሳ ማየት'),
  ('donations.write','donations','write','ልገሳ መመዝገብ'),
  ('budget.read','budget','read','በጀት ማየት'),
  ('budget.write','budget','write','በጀት ማዘጋጀት'),
  ('budget.approve','budget','approve','በጀት ማጽደቅ'),
  ('operations.read','operations','read','ሥራዊ ጉዳይ ማየት'),
  ('operations.write','operations','write','ሥራዊ ጉዳይ ማስተዳደር'),
  ('documents.read','documents','read','ሰነዶችን ማየት'),
  ('documents.write','documents','write','ሰነዶችን ማስተዳደር'),
  ('communication.read','communication','read','መልእክት ማየት'),
  ('communication.write','communication','write','መልእክት መልሰው ማሳለጥ'),
  ('communication.publish','communication','publish','ማስታወቂያ ማሳወቅ'),
  ('reports.read','reports','read','ሪፖርት ማየት'),
  ('reports.export','reports','export','ሪፖርት ማውጣት'),
  ('system.read','system','read','ስርዓተ ኣዘራረብ ማየት'),
  ('system.write','system','write','ስርዓተ ኣዘራረብ ማስተዳደር'),
  ('audit.read','audit','read','የሥነ ምግባር መዝገብ ማየት');

-- ─── seed roles ──────────────────────────────────────────────────────────────
insert into public.roles (key, name_am, name_en, description, is_system) values
  ('super_admin',        'ዋና አስተዳዳሪ',            'Super Administrator', 'ሙሉ ሥርዓቱን ይቆጣጠራል', true),
  ('website_editor',     'የድረ ገጽ አዘጋጅ',          'Website Editor', 'ይዘት ያዘጋጃል፣ ያሳውቃልም', true),
  ('content_approver',   'ይዘት ሸምጋኚ',              'Content Approver', 'ይዘትን ይመረምራል እንዲሁም ያሳወቃል', true),
  ('registrar',          'ዳይሬክተር/መዝጋቢ',           'Registrar', 'ተማሪዎችና ምዝገባ', true),
  ('teacher',            'መምህር',                   'Teacher', 'የተሰጠ ክፍል ብቻ', true),
  ('department_head',    'የክፍል ኃላፊ',               'Department Head', 'የራሱ ክፍል', true),
  ('finance_officer',    'ፋይናንስ ኃላፊ',              'Finance Officer', 'ገቢ/ወጪ መዝጋበሪያ', true),
  ('finance_approver',   'ፋይናንስ አጻዳቂ',             'Finance Approver', 'ከፍተኛ ወጪ ያጽድቃል', true),
  ('media_minister',     'የሚዲያ ኃላፊ',               'Media Minister', 'ሐሳብ/ፎቶ/ቪዲዮ', true),
  ('member',             'አባል',                     'Member', 'የቤተ ክርስቲያን አባል', true),
  ('student',            'ተማሪ',                    'Student', 'የራሱ መረጃ ብቻ', true),
  ('parent',             'ወላጅ',                    'Parent', 'ልጆች መረጃ ብቻ', true),
  ('volunteer',          'አቅም ሰጪ',                 'Volunteer', 'ወጪ ባሌ ሥራ', true);

-- The super admin holds every permission. The per-role grants live in
-- migration 170 so the whole matrix is maintained in one place.
insert into public.role_permissions (role_id, permission_key)
select r.id, p.key from public.roles r, public.permissions p where r.key = 'super_admin';

-- ─── anon: published public content only ────────────────────────────────────
create policy site_settings_public on public.site_settings
  for select to anon using (is_public);

create policy menus_public on public.menus
  for select to anon using (is_visible);

create policy menu_items_public on public.menu_items
  for select to anon using (is_visible and exists (select 1 from public.menus m where m.id = menu_id and m.is_visible));

create policy pages_public on public.pages
  for select to anon using (state = 'published');

create policy page_blocks_public on public.page_blocks
  for select to anon using (is_visible and exists (select 1 from public.pages p where p.id = page_id and p.state = 'published'));

create policy news_public on public.news
  for select to anon using (state = 'published');

create policy events_public on public.events
  for select to anon using (state = 'published');

create policy sermons_public on public.sermons
  for select to anon using (state = 'published');

create policy mezmur_public on public.mezmur
  for select to anon using (state = 'published');

create policy publications_public on public.publications
  for select to anon using (state = 'published');

create policy albums_public on public.gallery_albums
  for select to anon using (state = 'published' and is_public);

create policy media_public on public.media_files
  for select to anon using (state = 'published' and is_public and bucket = 'media');

create policy faqs_public on public.faqs
  for select to anon using (state = 'published');

create policy leadership_public on public.leadership
  for select to anon using (state = 'published');

create policy org_units_public on public.org_units
  for select to anon using (is_visible);

create policy departments_public on public.departments
  for select to anon using (is_public and state = 'published');

create policy campaigns_public on public.donation_campaigns
  for select to anon using (is_active and state = 'published');

create policy levels_public on public.class_levels
  for select to anon using (is_active);

create policy classes_public on public.classes
  for select to anon using (is_active);

create policy subjects_public on public.subjects
  for select to anon using (is_active);

create policy years_public on public.academic_years
  for select to anon using (true);

create policy teacher_directory_public on public.teacher_profiles
  for select to anon using (is_active);

create policy announcements_public on public.announcements
  for select to anon using (state = 'published' and audience ->> 'public' = 'true');

create policy materials_public on public.learning_materials
  for select to anon using (state = 'published' and is_public);

create policy library_public on public.library_books
  for select to anon using (true);

-- ─── anon: public intake queues ─────────────────────────────────────────────
-- Status is pinned so a visitor cannot approve their own application.
create policy applications_public_submit on public.applications
  for insert to anon with check (
    status = 'pending'
    and source = 'website'
    and kind in ('student','teacher','volunteer','member')
    and length(trim(full_name_am)) > 1
  );

create policy contact_public_submit on public.contact_messages
  for insert to anon with check (status = 'new' and length(trim(message_am)) > 4);

create policy prayer_public_submit on public.prayer_requests
  for insert to anon with check (status = 'pending' and length(trim(request_am)) > 4);

create policy donations_public_submit on public.donations
  for insert to anon with check (
    source = 'website'
    and status in ('pledged','paid')
    and (is_pledge = true or received_on is not null)
  );

create policy event_reg_public_submit on public.event_registrations
  for insert to anon with check (source = 'website' and status = 'registered');

create policy subscribers_public_submit on public.subscribers
  for insert to anon with check (status = 'subscribed');

-- ─── profiles & roles ────────────────────────────────────────────────────────
create policy profiles_self on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_super_admin() or public.has_permission('system.read'));

create policy profiles_update_self on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- A user editing their own profile cannot re-activate themselves or rewrite
-- another account's status; the trigger below keeps admin-owned columns intact.
create or replace function public.guard_profile_self_edit() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null
     and new.id = auth.uid()
     and not (public.is_super_admin() or public.has_permission('system.write')) then
    new.is_active     := old.is_active;
    new.member_status := old.member_status;
    new.email         := old.email;
  end if;
  return new;
end;
$$;

create trigger profiles_guard_self before update on public.profiles
  for each row execute function public.guard_profile_self_edit();

create policy profiles_admin_write on public.profiles
  for all to authenticated using (public.has_permission('system.write'))
  with check (public.has_permission('system.write'));

create policy user_roles_read on public.user_roles
  for select to authenticated using (user_id = auth.uid() or public.has_permission('system.read'));

create policy user_roles_write on public.user_roles
  for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

create policy roles_read on public.roles
  for select to authenticated using (public.has_permission('system.read') or public.is_super_admin());

create policy roles_write on public.roles
  for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

create policy permissions_read on public.permissions
  for select to authenticated using (true);

create policy permissions_write on public.permissions
  for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

create policy role_perms_read on public.role_permissions
  for select to authenticated using (public.has_permission('system.read') or public.is_super_admin());

create policy role_perms_write on public.role_permissions
  for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

-- Staff may see colleague profiles; a portal user sees their own row only.
create policy content_types_read on public.content_types
  for select to authenticated using (true);

create policy audit_read on public.audit_logs
  for select to authenticated using (public.has_permission('audit.read'));
