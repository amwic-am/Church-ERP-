-- 170 · Configuration seed: roles' grants, site settings, navigation, pages,
--       Sunday School levels, subjects, grading, chart of accounts, departments.
-- This is configuration, not demo content: no students, no news, no donations.

-- ─── first admin ─────────────────────────────────────────────────────────────
-- Sign up in the app, then run in the SQL editor:
--   select public.bootstrap_super_admin('you@example.com');
create or replace function public.bootstrap_super_admin(p_email text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid;
  v_role uuid;
begin
  select id into v_uid from auth.users where lower(email) = lower(p_email) limit 1;
  if v_uid is null then
    raise exception 'no auth user with email %', p_email;
  end if;

  select id into v_role from roles where key = 'super_admin';

  insert into profiles (id, full_name_am, email, member_status)
  values (v_uid, coalesce((select raw_user_meta_data ->> 'full_name_am' from auth.users where id = v_uid), 'ዋና አስተዳዳሪ'), p_email, 'active')
  on conflict (id) do update set email = excluded.email;

  insert into user_roles (user_id, role_id)
  values (v_uid, v_role)
  on conflict do nothing;

  return v_uid;
end;
$$;

revoke all on function public.bootstrap_super_admin(text) from public;
grant execute on function public.bootstrap_super_admin(text) to service_role;

-- ─── role → permission grants ────────────────────────────────────────────────
-- Editors write and submit; only content_approver may approve, so the
-- publication step always involves a second person.
insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
  from public.roles r, public.permissions p
 where r.key = 'website_editor'
   and p.key in ('website.read','website.write','news.read','news.write',
                 'events.read','events.write','gallery.read','gallery.write',
                 'media.read','media.write',
                 'departments.read','academics.read','teachers.read','reports.read')
union all
select r.id, p.key
  from public.roles r, public.permissions p
 where r.key = 'content_approver'
   and p.key in ('website.read','website.publish','news.read','news.publish','events.read','events.publish',
                 'gallery.read','gallery.publish','media.read','media.publish','communication.read',
                 'communication.publish','academics.read','academics.publish','reports.read','audit.read')
union all
select r.id, p.key
  from public.roles r, public.permissions p
 where r.key = 'registrar'
   and p.key in ('students.read','students.write','students.delete','students.promote','applications.read',
                 'applications.write','teachers.read','academics.read','academics.write','attendance.read',
                 'results.read','certificates.read','certificates.write','reports.read','reports.export',
                 'departments.read','documents.read','documents.write','volunteers.read')
union all
-- `attendance.mark` / `results.mark` only mean "may mark inside the classes
-- they are assigned to"; the row filter is teaches_class() in migration 150.
select r.id, p.key
  from public.roles r, public.permissions p
 where r.key = 'teacher'
   and p.key in ('attendance.mark','results.mark',
                 'certificates.read','documents.read')
union all
select r.id, p.key
  from public.roles r, public.permissions p
 where r.key = 'department_head'
   and p.key in ('departments.read','departments.write','volunteers.read','volunteers.write',
                 'events.read','events.write','media.read','media.write','gallery.read','gallery.write',
                 'communication.read','communication.write','budget.read','operations.read',
                 'students.read','academics.read','reports.read')
union all
select r.id, p.key
  from public.roles r, public.permissions p
 where r.key = 'finance_officer'
   and p.key in ('finance.read','finance.write','donations.read','donations.write','budget.read',
                 'budget.write','reports.read','reports.export','finance.export','operations.read',
                 'events.read','departments.read')
union all
select r.id, p.key
  from public.roles r, public.permissions p
 where r.key = 'finance_approver'
   and p.key in ('finance.read','finance.approve','budget.read','budget.approve','donations.read',
                 'reports.read','reports.export','audit.read')
union all
select r.id, p.key
  from public.roles r, public.permissions p
 where r.key = 'media_minister'
   and p.key in ('media.read','media.write','media.delete','media.publish','gallery.read',
                 'gallery.write','gallery.publish','events.read','departments.read')
union all
select r.id, p.key
  from public.roles r, public.permissions p
 where r.key in ('member','parent','volunteer','student')
   and p.key = 'departments.read'
on conflict (role_id, permission_key) do nothing;

-- Portal roles hold no back-office permission on purpose: students, parents and
-- volunteers reach their own rows through the scoped policies in migration 150,
-- never through a module-wide grant.

-- ─── site settings ───────────────────────────────────────────────────────────
insert into public.site_settings (key, group_name, label_am, hint_am, value, value_type, is_public, sort_order) values
  ('church_name_am','general','የቤተ ክርስቲያን ስም',null,
   '"ቀርሳ ፈለገ ብርሐን ቅድስት ልደታ ለማርያም እና አቡነ ገብርኤል መንፈስ ቅዱስ ቤ/ክ"'::jsonb,'string',true,10),
  ('sunday_school_name_am','general','የሰንበት ት/ቤት ስም',null,'"ተክለቴዎፍሎስ ሰንበት ት/ቤት"'::jsonb,'string',true,20),
  ('tagline_am','general','የመግቢያ መልእክት','በዋናው ገጽ ሥር መግቢያው በታች ይታያል',
   '"ስብከት፣ ትምህርት እና የመንፈስ ዕድገትን በአንድ ቤተ ክርስቲያን ውስጥ እናገናኛለን።"'::jsonb,'text',true,30),
  ('about_am','general','ስለ ት/ቤቱ',null,
   '"ተክለቴዎፍሎስ ሰንበት ት/ቤት የቤተ ክርስቲያኗን ምኅታዎች በእምነት፣ በጸሎት፣ በመዝሙርና በቅዱሳት መጻሕፍት ትርጉም የሚያሳድግ የመንፈስ ትምህርት ተቋም ነው። ለሕፃናት፣ ለወጣቶች እና ለአባቶች/እመቤቶች የተለያየ ዕርሳስ አዘጋጅተናል።"'::jsonb,'text',true,40),
  ('vision_am','general','ዕይታ',null,'"የቤተ ክርስቲያን እምነትን በቅዱሳት አባቶት ትምህርት መሠረት ጥልቅና ዘላቂ አድርገን ማስተማር።"'::jsonb,'text',true,50),
  ('mission_am','general','ተልእኮ',null,'"መንፈሳዊ ትምህርት፣ የመዝሙር ሥርዓት እና ማህበራዊ ኃላፊነትን በአቅም ሰጪዎች አማካኝነት ማገናዘብ።"'::jsonb,'text',true,60),
  ('address_am','contact','አድራሻ',null,'"—"'::jsonb,'text',true,10),
  ('phone','contact','ስልክ',null,'""'::jsonb,'string',true,20),
  ('email','contact','ኢሜይል',null,'""'::jsonb,'string',true,30),
  ('service_times_am','contact','የአገልግሎት ሰዓት',null,'"እሑድ ጠዋት"'::jsonb,'text',true,40),
  ('facebook_url','social','ፌስቡክ',null,'""'::jsonb,'url',true,10),
  ('youtube_url','social','ዩቲዩብ',null,'""'::jsonb,'url',true,20),
  ('telegram_channel','social','ቴሌግራም',null,'""'::jsonb,'url',true,30),
  ('site_title_am','seo','የድረ ገጽ ርዕስ',null,'"ተክለቴዎፍሎስ ሰንበት ት/ቤት"'::jsonb,'string',true,10),
  ('site_description_am','seo','የመግለጽ ጽሑፍ',null,'"ቅድስት ልደታ ለማርያም ቤተ ክርስቲያን ሰንበት ት/ቤት መድረክ"'::jsonb,'text',true,20),
  ('default_locale','system','ቋንቋ',null,'"am"'::jsonb,'select',false,10),
  ('currency','finance','ሚዛብ',null,'"ETB"'::jsonb,'select',true,10),
  ('provider_email','system','የኢሜይል አገልግሎት','ባዶ ከሆነ መልእክቶች ማድረሻ አገልግሎት አልተጀመረም ተብለው ይቆያሉ','""'::jsonb,'string',false,20),
  ('provider_sms','system','የSMS አገልግሎት','ባዶ ከሆነ መልእክቶች ማድረሻ አገልግሎት አልተጀመረም ተብለው ይቆያሉ','""'::jsonb,'string',false,30)
on conflict (key) do nothing;

insert into public.finance_settings (key, value, label_am) values
  ('currency','"ETB"','የገንዘብ መጠን ምልክት'),
  ('auto_approve_limit','50000','ራስ-ሰር የሚጸደቅ ከፍተኛ ወጪ'),
  ('fiscal_year_start_month','1','የበጀት ዓመት መጀመሪያ ወር')
on conflict (key) do nothing;

-- ─── navigation ──────────────────────────────────────────────────────────────
insert into public.menus (location, label_am) values
  ('header','ዋና መሠረተ ገጽ'),
  ('footer','የግርጭ መሰረት')
on conflict (location) do nothing;

-- ─── pages ───────────────────────────────────────────────────────────────────
insert into public.pages (slug, title_am, template, state, published_at, is_nav_hidden) values
  ('home','መነሻ','home','published',now(),true),
  ('about-us','ስለ ት/ቤቱ','generic','published',now(),false),
  ('history','ታሪካችን','generic','published',now(),false),
  ('vision-mission','ዕይታና ተልእኮ','generic','published',now(),false),
  ('spiritual-leadership','መንፈሳዊ አመራር','leadership','published',now(),false),
  ('organization-structure','የሥራ አደረጃጀት','structure','published',now(),false),
  ('spiritual-education','መንፈሳዊ ትምህርት','generic','published',now(),false),
  ('classes','ክፍሎችና ፕሮግራሞች','listing','published',now(),false),
  ('teachers','መምህራን','listing','published',now(),false),
  ('departments','ክፍሎች','listing','published',now(),false),
  ('mezmur-choir','መዝሙርና መኮረብ','listing','published',now(),false),
  ('news','ዜናና ማስታወሻዎች','listing','published',now(),false),
  ('events','ልዩ ክንውኖዎች','listing','published',now(),false),
  ('photo-gallery','የፎቶ ማህደር','gallery','published',now(),false),
  ('video-gallery','ቪዲዮ ማህደር','gallery','published',now(),false),
  ('sermons','ቃረንና ክስተት','listing','published',now(),false),
  ('publications','ህትመቶች','listing','published',now(),false),
  ('registration','ተማሪ መመዝገብ','contact','published',now(),false),
  ('volunteer','አቅም ሰጪ መሆን','contact','published',now(),false),
  ('donate','ልገሳ','generic','published',now(),false),
  ('contact','ኢ-ሜይል/አግኙን','contact','published',now(),false),
  ('faq','ተካራኝ ጥያቄዎች','faq','published',now(),false),
  ('privacy','የግል መረጃ ጥበቃ','generic','published',now(),false)
on conflict (slug) do nothing;

-- Homepage sections drive the public landing page from the ERP.
insert into public.page_blocks (page_id, section_key, block_type, title_am, body_am, items, settings, sort_order)
select p.id, b.section_key, b.block_type, b.title_am, b.body_am, b.items, b.settings, b.sort_order
  from public.pages p
 cross join (values
   ('hero','hero',null,null,'[]'::jsonb,'{"overlay":"liturgical"}'::jsonb,10),
   ('welcome','richtext','እንኳን ደህና መጡ',null,'[]'::jsonb,'{}'::jsonb,20),
   ('about','richtext',null,null,'[]'::jsonb,'{}'::jsonb,30),
   ('departments','card_grid','ክፍሎቻችን',null,'[]'::jsonb,'{"source":"departments"}'::jsonb,40),
   ('education','card_grid','መንፈሳዊ ትምህርት',null,'[]'::jsonb,'{"source":"classes"}'::jsonb,50),
   ('news','media_list','የቅርብ ጊዜ ዜና',null,'[]'::jsonb,'{"source":"news","limit":3}'::jsonb,60),
   ('events','media_list','የሚመጡ ልዩ ክንውኖች',null,'[]'::jsonb,'{"source":"events","limit":4}'::jsonb,70),
   ('media','media_list','መዝሙርና ቃረን',null,'[]'::jsonb,'{"source":"mezmur","limit":4}'::jsonb,80),
   ('gallery','media_list','ፎቶ ማህደር',null,'[]'::jsonb,'{"source":"albums","limit":6}'::jsonb,90),
   ('join','cta','ዛሬ ይቀላቀሉ',null,'[]'::jsonb,'{"primaryHref":"/registration","secondaryHref":"/volunteer"}'::jsonb,100),
   ('donate','cta','በልገሳ ይደግፉ',null,'[]'::jsonb,'{"primaryHref":"/donate"}'::jsonb,110),
   ('contact','contact','አግኙን',null,'[]'::jsonb,'{}'::jsonb,120)
 ) as b(section_key, block_type, title_am, body_am, items, settings, sort_order)
where p.slug = 'home'
  and not exists (
    select 1 from public.page_blocks pb where pb.page_id = p.id and pb.section_key = b.section_key
  );

-- ─── Sunday School structure ─────────────────────────────────────────────────
insert into public.academic_years (label_am, eth_year, is_current) values
  ('፳፻፲፱ ሥ.ዓ', 2019, true)
on conflict (label_am) do nothing;

insert into public.class_levels (key, name_am, order_no, age_min, age_max, description_am) values
  ('l1','ደረጃ ፩ - ሕፃናት',10,4,7,'መሠረታዊ የእምነት ትምህርት በመሣልና በመዝሙር'),
  ('l2','ደረጃ ፪ - ሕፃናት',20,8,11,'የቅዱሳት ሕይወትና የጸሎት ልምድ'),
  ('l3','ደረጃ ፫ - ወጣቶች',30,12,15,'የእምነት ትንተናና የመንፈስ ጽሑፍ ሥርዓተ ትርጓሜ'),
  ('youth','የወጣቶች ክፍል',40,16,25,'ትርጉመ ቅዱሳት መጻሕፍት፣ የሕይወት ጥያቄዎች'),
  ('adult','አባቶችና እመቤቶች',50,26,null,'ጥልቅ የአባቶች ትምህርትና የሥርዓተ ኣምልኮ ጥናት'),
  ('teacher','የመምህራን ትምህርት',60,null,null,'ለመምህርነት የሚዘጋጁ ተማሪዎች')
on conflict (key) do nothing;

update public.class_levels l set next_level_id = (
  select n.id from class_levels n where n.order_no = (
    select min(x.order_no) from class_levels x where x.order_no > l.order_no))
 where l.next_level_id is null;

insert into public.subjects (code, name_am, category_am, order_no, weekly_hours) values
  ('S100','እግዚአብሔር አብ፣ ወልድና መንፈስ ቅዱስ','መሠረተ እምነት',10,1),
  ('S110','ትንቢተ እግዚአብሔር','መሠረተ እምነት',20,1),
  ('S120','የመለኮት ምሥጢር','መሠረተ እምነት',30,1),
  ('S200','የክርስቶስ ድሐነት','የመዓልታት ትርጉም',40,2),
  ('S210','ቅዱሳት መጻሕፍት ትርጉም','የትርጉም ጥናት',50,2),
  ('S220','የቤተ ክርስቲያን ታሪክ','ታሪክ',60,1),
  ('S300','ሥርዓተ ኣምልኮ','ሥርዓት',70,2),
  ('S310','የጸሎት ትምህርት (ሰዓት)','ሥርዓት',80,1),
  ('S320','መዝሙረ ዳዊት','መዝሙር',90,2),
  ('S330','የቅዱሳት ሕይወት','መሣል',100,1),
  ('S400','የስብከተ ምሳሌ ጽሑፍ','ትርጉም',110,1),
  ('S410','ሥነ ምግባርና የሕይወት ጥያቄዎች','ክርስቲያናዊ ሕይወት',120,1)
on conflict (code) do nothing;

insert into public.grade_scales (name_am, letter, min_percent, max_percent, remark_am, order_no) values
  ('ከፍተኛ ውጤት','A+',90,100,'በጣም ጥሩ',10),
  ('ረቂቅ','A',80,89.99,'ጥሩ',20),
  ('ሰላᣭ','B',70,79.99,'መካከለኛ',30),
  ('ቆራጥ','C',60,69.99,'ቂኝ',40),
  ('ተራዳዳሪ','D',50,59.99,'ትግል ያስፈልገዋል',50),
  ('ወደቀ','F',0,49.99,'ዳግም መማር አለበት',60)
on conflict do nothing;

-- ─── chart of accounts ───────────────────────────────────────────────────────
insert into public.finance_accounts (code, name_am, kind, currency, sort_order) values
  ('1000','የጥሬ ሳጥን','asset','ETB',10),
  ('1100','ባንክ ሂሳብ','asset','ETB',20),
  ('2000','ያልተቋረጠ ገቢ','liability','ETB',30),
  ('4000','አጠቃላይ ገቢ','income','ETB',40),
  ('4100','የልገሳ ማዕከል','income','ETB',50),
  ('4200','የት/ቤት ገቢ','income','ETB',60),
  ('5000','የት/ቤት ወጪ','expense','ETB',70),
  ('5100','አጠቃላይ ወጪ','expense','ETB',80),
  ('6000','የግንባታ ማዕከል','fund','ETB',90),
  ('6100','የልገሳ ማዕከል','fund','ETB',100)
on conflict (code) do nothing;

insert into public.finance_categories (name_am, kind, account_id, is_donation_eligible, sort_order)
select v.name, v.kind, a.id, v.eligible, v.sort
  from (values
    ('ልገሳ (እጅ)','income',     '4100', true, 10),
    ('ልዩ ልገሳ','income',        '4100', true, 20),
    ('የመዝሙር ቀን ገቢ','income',  '4000', true, 30),
    ('የዕጣ ፈንታ ገቢ','income',   '4000', false,40),
    ('የተማሪ ምዝገባ','income',    '4200', false,50),
    ('መጻሕፍትና ትምህርት ግብዣ','expense','5000', false,60),
    ('የመምህራን ዕገታ','expense',  '5000', false,70),
    ('ሥልጠናና ኮንፈረንስ','expense','5000', false,80),
    ('ጉዞና ትራንስፖርት','expense',  '5100', false,90),
    ('ኤሌክትሪክ/ውሃ/ኢንተርኔት','expense','5100', false,100),
    ('የሥርዓት ዕቃ ግብይት','expense','5100', false,110),
    ('ማህበራዊ ዕርዳታ','expense',   '5100', false,120)
  ) as v(name, kind, account_code, eligible, sort)
  left join public.finance_accounts a on a.code = v.account_code
where a.id is not null
on conflict (name_am, kind) do nothing;

-- ─── departments ─────────────────────────────────────────────────────────────
insert into public.departments (slug, name_am, name_en, summary_am, icon, sort_order, state) values
  ('mezmur','የመዝሙር ክፍል','Mezmur Department','የዕገታ፣ የኮረብና የሥርዓት መዝሙር አገልግሎት','music',10,'published'),
  ('spiritual-education','መንፈሳዊ ትምህርት','Spiritual Education','ሰንበት ት/ቤት ዕርሳስ፣ የመምህራን ጉዞና የተማሪ ምዘጋብ','book-open',20,'published'),
  ('media','ሚዲያ ክፍል','Media Department','ፎቶ፣ ቪዲዮ፣ ድረ ገጽና ማህበራዊ ገጻቶች','video',30,'published'),
  ('evangelism','ወንጌል ስርጭት','Evangelism','የወንጌል ሥራና አዲስ ተማሪ ማግኘት','globe',40,'published'),
  ('social-affairs','ማህበራዊ ጉዳይ','Social Affairs','ለቸገሪዎች ዕርዳታ፣ ጎረቤትና ቤተ ሰብ ጉብኝት','heart-handshake',50,'published'),
  ('arts-drama','ሥነ ጥበብና ዘገባ','Arts & Drama','መሣል፣ ዘገባና የቤተ ክርስቲያን ጥበብ','palette',60,'published'),
  ('volunteer-services','አቅም ሰጪ አገልግሎት','Volunteer Services','የአቅም ሰጪ ዝግጅትና የክንውኖ ዕርዳታ','users',70,'published')
on conflict (slug) do nothing;

-- ─── certificate template ────────────────────────────────────────────────────
insert into public.certificate_templates (name_am, kind, heading_am, body_am, issuer_am, signature_name_am, signature_title_am)
values
  ('የትምህርት ደረጃ ማጠናቀቂያ ሰርተፍኬት','completion','በተክለቴዎፍሎስ ሰንበት ት/ቤት',
   'ይህ ሰርተፍኬት የተሰጠው {{student}} የ{{year}} ዓመት የሰንበት ት/ቤት ትምህርቱን በተመለከተ በማጠናቀቁ ነው። በ{{date}} ተሰጠ።',
   'ተክለቴዎፍሎስ ሰንበት ት/ቤት',null,null),
  ('የመምህር አገልግሎት እውታና ማስረጃ','teacher_appreciation','የአገልግሎት እውታና',
   '{{student}} ለቤተ ክርስቲያኗ በመምህርነት ላይ የፈጸመውን አገልግሎት ለማስመስግን በ{{date}} ተሰጠ።',
   'ተክለቴዎፍሎስ ሰንበት ት/ቤት',null,null)
on conflict do nothing;

-- ─── default notification templates ─────────────────────────────────────────
insert into public.notification_templates (key, channel, name_am, subject_am, body_am) values
  ('application_received','email','አዲስ ማመልከቻ ተቀብሏል','የማመልከቻዎ ደርሶናል',
   'እንኳን ደህና መጡ {{name}}። ማመልከቻዎ (ማጣሪያ {{reference}}) ተቀብሎ በመርምር ላይ ነው።'),
  ('application_approved','email','ማመልከቻዎ ጸድቋል','ማመልከቻዎ ተጸድቋል',
   '{{name}} ማመልከቻዎ ጸድቋል። ዝርዝር ለማየት {{link}} ይጎብኙ።'),
  ('contact_reply','email','መልእክትዎ ተመልሷል','ስለ መልእክትዎ',
   '{{name}} መልእክትዎ የተመለሰ ሲሆን መልሱ፦ {{reply}}'),
  ('certificate_issued','in_app','ሰርተፍኬት ተሰጥቶዎታል','ሰርተፍኬት',
   '{{name}} ለ{{title}} ሰርተፍኬት ተሰጥቶዎታል፤ የማረጋገጫ ኮድ {{code}}።'),
  ('donation_receipt','email','የልገሳ ደረሰኝ','ልገሳዎ ደርሶናል',
   '{{name}} ለ{{purpose}} የሰጡት {{amount}} ተቀብሏል፤ ደረሰኝ ቁጥር {{receipt}}።')
on conflict (key) do nothing;

-- ─── navigation tree ─────────────────────────────────────────────────────────
insert into public.menu_items (menu_id, label_am, page_id, sort_order)
select m.id, v.label, p.id, v.sort
  from public.menus m
  cross join (values
    ('መነሻ','home',10),
    ('ስለ እኛ','about-us',20),
    ('ትምህርት','spiritual-education',30),
    ('ክፍሎች','departments',40),
    ('ሚዲያ','photo-gallery',50),
    ('ዜናና ልዩ ክንውኖ','news',60),
    ('ይቀላቀሉ','volunteer',70),
    ('ልገሳ','donate',80),
    ('አግኙን','contact',90),
    ('ግቢ',null,100)
  ) as v(label, slug, sort)
  left join public.pages p on p.slug = v.slug
 where m.location = 'header'
   and not exists (select 1 from public.menu_items i where i.menu_id = m.id and i.label_am = v.label);

insert into public.menu_items (menu_id, parent_id, label_am, page_id, collection, sort_order)
select m.id, par.id, v.label, p.id, v.collection, v.sort
  from public.menus m
  join public.menu_items par on par.menu_id = m.id
  cross join (values
    ('ስለ እኛ','መንፈሳዊ አመራር','spiritual-leadership',null,10),
    ('ስለ እኛ','ታሪካችን','history',null,20),
    ('ስለ እኛ','ዕይታና ተልእኮ','vision-mission',null,30),
    ('ስለ እኛ','የሥራ አደረጃጀት','organization-structure',null,40),
    ('ትምህርት','ክፍሎችና ፕሮግራሞች','classes',null,10),
    ('ትምህርት','መምህራን','teachers',null,20),
    ('ትምህርት','ተማሪ መመዝገብ','registration',null,30),
    ('ሚዲያ','የፎቶ ማህደር','photo-gallery',null,10),
    ('ሚዲያ','ቪዲዮ ማህደር','video-gallery',null,20),
    ('ሚዲያ','መዝሙር ማህደር','mezmur-choir',null,30),
    ('ሚዲያ','ቃረን','sermons',null,40),
    ('ሚዲያ','ህትመቶች','publications',null,50),
    ('ዜናና ልዩ ክንውኖ','ዜና','news',null,10),
    ('ዜናና ልዩ ክንውኖ','ልዩ ክንውኖዎች','events',null,20),
    ('ይቀላቀሉ','አባል መሆን','registration',null,10),
    ('ይቀላቀሉ','አቅም ሰጪ','volunteer',null,20),
    ('ይቀላቀሉ','ኢ-ግብር','contact',null,30),
    ('ግቢ','ተማሪ ግቢ',null,'portal:student',10),
    ('ግቢ','መምህር ግቢ',null,'portal:teacher',20),
    ('ግቢ','አስተዳዳሪ ግቢ',null,'portal:admin',30)
  ) as v(parent_label, label, slug, collection, sort)
  left join public.pages p on p.slug = v.slug
 where m.location = 'header'
   and par.label_am = v.parent_label
   and not exists (
     select 1 from public.menu_items c
      where c.menu_id = m.id and c.parent_id = par.id and c.label_am = v.label);

insert into public.menu_items (menu_id, label_am, page_id, sort_order)
select m.id, v.label, p.id, v.sort
  from public.menus m
  cross join (values
    ('የግል መረጃ ጥበቃ','privacy',10),
    ('ተካራኝ ጥያቄዎች','faq',20),
    ('አግኙን','contact',30),
    ('ልገሳ','donate',40)
  ) as v(label, slug, sort)
  left join public.pages p on p.slug = v.slug
 where m.location = 'footer'
   and not exists (select 1 from public.menu_items i where i.menu_id = m.id and i.label_am = v.label);
