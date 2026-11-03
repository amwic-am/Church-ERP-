-- Demo people ─────────────────────────────────────────────────────────────────
-- Parish members, Sunday-school students, their guardians and the teaching staff.
-- Ids are fixed literals (a1/a3/a4/a2 prefixes) because the later files and the
-- role scopes point at them; the demo sign-in accounts are looked up by email so
-- this file does not depend on the ids GoTrue handed out.
--
-- Applied with:  supabase db query --linked -f supabase/seed/01_people.sql

begin;

-- ─── name pools ──────────────────────────────────────────────────────────────
-- Two pools so a generated person reads like a real name and not like a counter.
create temporary table first_names (i int generated always as identity, name text, is_female boolean);
insert into first_names (name, is_female) values
  ('አበበ', false), ('ዳግም', false), ('ገብረ', false), ('ኃይለ', false), ('መልካሙ', false),
  ('ተስፋዬ', false), ('ብርሃኔ', false), ('ናሁም', false), ('ዮናስ', false), ('ሰሎሞን', false),
  ('ካሌብ', false), ('ጽጌ', false), ('አንግዳ', false), ('ሚካኤል', false), ('ገብርኤል', false),
  ('ሰላም', true), ('ትርሃስ', true), ('ሚያ', true), ('ልጇ', true), ('ብርሃኔ', true),
  ('ሐና', true), ('ስብሐት', true), ('ዮሐንስ', true), ('ማሪያም', true), ('ገጠም', true),
  ('ዘውዲቱ', true), ('ሉሲ', true), ('አትካልት', true), ('ፍረወይኒ', true), ('ሐዳስ', true),
  ('ሙሉገታ', true), ('አበባ', true), ('ዘላቸው', true), ('ሐጻይት', true), ('ትዕግስት', true);

create temporary table last_names (i int generated always as identity, name text);
insert into last_names (name) values
  ('በቀለ'), ('ገብረ ማርያም'), ('ተስፋዬ'), ('አለሙ'), ('ወልደ ጊዮርጊስ'), ('ካሳ'), ('እስክንድር'),
  ('ገብረ ክርስቶስ'), ('መኮነን'), ('አንደት'), ('ብርሃኑ'), ('ዮሐንስ'), ('ማሞ'), ('ሐይቄ'),
  ('ጽጌ'), ('አዳና'), ('በያነህ'), ('ቅዱስ'), ('ወልዴ'), ('ናንተ');

-- ─── profiles for the demo sign-in accounts ──────────────────────────────────
-- GoTrue created each row with an empty name; the ERP shows this field everywhere.
update public.profiles p
   set full_name_am = v.name_am,
       phone = v.phone,
       email = split_part(p.email, '@', 1) || '@tekleteoflos.demo',
       gender = v.gender::public.gender,
       member_status = 'active',
       parish = 'ቀርሳ ፈለገ ብርሐን',
       joined_at = v.joined_at
  from (values
    ('superadmin',        'ዋና አስተዳዳሪ ኃ/ገ/ሚኪኤል',      '+251 911 220 0001', 'male',   date '2014-01-12'),
    ('registrar',         'መዝጋቢ ሐዋርያት ዮሐንስ',           '+251 911 220 0002', 'male',   date '2015-09-04'),
    ('finance',           'ፋይናንስ ኃላፊ ለገሠ እስክንድር',      '+251 911 220 0003', 'male',   date '2016-02-21'),
    ('approver',          'ፋይናንስ አጻዳቂ ገ/ሚካኤል ብርሃኔ',    '+251 911 220 0004', 'male',   date '2013-11-08'),
    ('editor',            'የድረ ገጽ አዘጋጅ ዳግም ገ/እግዚአብሔር', '+251 911 220 0005', 'male',   date '2019-05-17'),
    ('approver-content',  'አባ ገ/ስላሴ ካሳ',                 '+251 911 220 0006', 'male',   date '2012-03-02'),
    ('media',             'ሰላምነሽ ወ/ሮ ካሳ',                '+251 911 220 0007', 'female', date '2020-01-09'),
    ('teacher',           'መልካሙ ተስፋዬ',                   '+251 911 220 0008', 'male',   date '2018-09-29'),
    ('dept',              'ጸጋዬ አበበ',                     '+251 911 220 0009', 'male',   date '2017-06-15'),
    ('student',           'ናትናኤል መኮነን',                  '+251 911 220 0010', 'male',   date '2021-02-06'),
    ('parent',            'ሰላም ተስፋዬ',                    '+251 911 220 0011', 'female', date '2016-10-11'),
    ('member',            'ብርሃኔ ገብረ ማርያም',               '+251 911 220 0012', 'male',   date '2019-12-20')
  ) as v(local_part, name_am, phone, gender, joined_at)
 where p.email = v.local_part || '@tekleteoflos.demo'
    or p.id = (select id from auth.users where email = v.local_part || '@tekleteoflos.demo');

-- The account this platform was built for gets the same treatment plus a grant,
-- so the person who owns the project can sign in without a demo password.
update public.profiles set full_name_am = coalesce(nullif(full_name_am, ''), 'አስተዳዳሪ')
 where email = 'mesfinabel511@gmail.com';

-- ─── parish members ──────────────────────────────────────────────────────────
-- 60 members. The demo accounts that represent a real person (the department
-- head, the finance officer, the media minister, a plain member) also get a
-- `members` row linked to their auth user, because departments and giving record
-- a member, not a login.
insert into public.members (id, user_id, member_code, full_name_am, gender, birth_date, phone, email, address_am, parish, status, joined_on, is_volunteer, is_clergy)
select ('a1000000-0000-4000-8000-00000000' || lpad(g::text, 4, '0'))::uuid,
       null,
       'TK-' || lpad(g::text, 4, '0'),
       f.name || ' ' || l.name,
       (case when f.is_female then 'female' else 'male' end)::public.gender,
       -- 18 to 74 years old, spread so the roster does not look one-year-old.
       current_date - (6570 + (g * 137) % 20440),
       '+251 9' || lpad(((g * 7312) % 100000000)::text, 8, '0'),
       null,
               (array ['ቀርሳ ፈለገ ብርሐን', 'አዲስ ዓለም', 'ሐውልት', 'ፒያሳ', 'መካኒኛ', 'ቦሌ', 'ላፍቶ'])[ (g % 6) + 1 ],
       'ቀርሳ ፈለገ ብርሐን',
       (case when g % 17 = 0 then 'transferred' when g % 23 = 0 then 'inactive' else 'active' end)::public.member_status,
       current_date - (g * 61) % 3300,
       g % 3 = 0,
       g % 19 = 0
  from generate_series(1, 60) as g
  join lateral (select name, is_female from first_names where i = (g * 13) % 35 + 1) f on true
  join lateral (select name from last_names where i = (g * 7) % 20 + 1) l on true
on conflict (id) do nothing;

-- Link the four demo logins that stand for a member of the parish.
update public.members m
   set user_id = u.id,
       full_name_am = v.name_am,
       phone = v.phone,
       member_code = 'TK-' || v.code
  from (values
    ('dept',             'a1000000-0000-4000-8000-000000000009', 'ጸጋዬ አበበ',        '+251 911 220 0009', '0009'),
    ('finance',          'a1000000-0000-4000-8000-000000000012', 'ለገሠ እስክንድር',      '+251 911 220 0003', '0012'),
    ('media',            'a1000000-0000-4000-8000-000000000018', 'ሰላምነሽ ካሳ',        '+251 911 220 0007', '0018'),
    ('member',           'a1000000-0000-4000-8000-000000000025', 'ብርሃኔ ገብረ ማርያም',  '+251 911 220 0012', '0025'),
    ('approver',         'a1000000-0000-4000-8000-000000000031', 'ገ/ሚካኤል ብርሃኔ',     '+251 911 220 0004', '0031'),
    ('registrar',        'a1000000-0000-4000-8000-000000000003', 'ሐዋርያት ዮሐንስ',      '+251 911 220 0002', '0003'),
    ('approver-content', 'a1000000-0000-4000-8000-000000000005', 'አባ ገ/ስላሴ ካሳ',      '+251 911 220 0006', '0005')
  ) as v(local_part, member_id, name_am, phone, code)
  join auth.users u on u.email = v.local_part || '@tekleteoflos.demo'
 where m.id = v.member_id::uuid;

-- ─── teaching staff ──────────────────────────────────────────────────────────
insert into public.teacher_profiles (id, user_id, staff_code, full_name_am, title_am, specializations, qualification, phone, email, bio_am, hired_on, is_active, can_teach_liturgy)
select ('a2000000-0000-4000-8000-00000000' || lpad(g::text, 4, '0'))::uuid,
       null,
       'T-' || lpad(g::text, 3, '0'),
       f.name || ' ' || l.name,
       case when g % 5 = 0 then 'ከመምህራን ኃላፊ' when g % 3 = 0 then 'የክፍል መምህር' else 'መምህር' end,
       case when g % 4 = 0 then array ['ሥርዓተ ኣምልኮ', 'መዝሙረ ዳዊት']
            when g % 2 = 0 then array ['መጻሕፍት ክፍለ ጽሑፍ', 'ትርጉመ ቅዱሳት']
            else array ['የቅዱሳት ሕይወት', 'ልጆች ትምህርተ ሐሳብ'] end,
       case when g % 4 = 0 then 'ዲፕሎማ — የመንፈሳዊ ትምህርት' else 'የስልጣን ማረጋገጫ — ቅዱሳት መጻሕፍት' end,
       '+251 9' || lpad(((g * 4211) % 100000000)::text, 8, '0'),
       'teacher' || g || '@tekleteoflos.demo',
       'በተክለቴዎፍሎስ ሰንበት ት/ቤት ' || (12 - g % 9)::text || ' ዓመት አገልግሏል፤ የልጆችና የወጣቶች ክፍል ትምህርተ ሐሳቦችን ይያዛል።',
       current_date - (g * 210) % 3800,
       g % 13 <> 0,
       g % 6 <> 0
  from generate_series(1, 12) as g
  join lateral (select name from first_names where i = (g * 17) % 35 + 1) f on true
  join lateral (select name from last_names where i = (g * 9) % 20 + 1) l on true
on conflict (id) do nothing;

update public.teacher_profiles
   set user_id = (select id from auth.users where email = 'teacher@tekleteoflos.demo'),
       full_name_am = 'መልካሙ ተስፋዬ',
       title_am = 'የክፍል መምህር',
       phone = '+251 911 220 0008',
       email = 'teacher@tekleteoflos.demo',
       is_active = true
 where id = 'a2000000-0000-4000-8000-000000000001';

-- ─── students ────────────────────────────────────────────────────────────────
-- 48 students. `level_key` matches `class_levels.key`, which is how the class
-- seed places each child in a group; the demo student account is number one.
insert into public.student_profiles (id, student_code, linked_user_id, full_name_am, gender, birth_date, eth_birth_date, phone, address_am, parish, status, level_key, enrolled_on, health_notes)
select ('a3000000-0000-4000-8000-00000000' || lpad(g::text, 4, '0'))::uuid,
       'STK-' || lpad(g::text, 4, '0'),
       case when g = 1 then (select id from auth.users where email = 'student@tekleteoflos.demo') end,
       f.name || ' ' || l.name,
       (case when f.is_female then 'female' else 'male' end)::public.gender,
       -- Age from the level, so a "ደረጃ ፩" child really is four to seven.
       current_date - (((case (g % 6)
                           when 0 then 5 when 1 then 9 when 2 then 13 when 3 then 18 when 4 then 30 else 42 end)
                        * 365) + (g * 29) % 300),
               (array ['ኅዳር ፳፻፲፬', 'ጥር ፳፻፲፭', 'የካቲት ፳፻፲፮', 'ሰኔ ፳፻፲፯'])[ (g % 4) + 1 ],
       '+251 9' || lpad(((g * 6431) % 100000000)::text, 8, '0'),
               (array ['ቀርሳ ፈለገ ብርሐን አካባቢ', 'ሐውልት', 'መካኒኛ ጉጉርብ', 'ቦሌ ኮንዶሚኒየም'])[ (g % 4) + 1 ],
       'ቀርሳ ፈለገ ብርሐን',
       (case when g % 24 = 0 then 'inactive' else 'active' end)::public.member_status,
       (array ['l1','l2','l3','youth','adult','teacher'])[ (g % 6) + 1 ],
       current_date - (g * 71) % 1200,
       null
  from generate_series(1, 48) as g
  join lateral (select name, is_female from first_names where i = (g * 19) % 35 + 1) f on true
  join lateral (select name from last_names where i = (g * 11) % 20 + 1) l on true
on conflict (id) do nothing;

update public.student_profiles
   set full_name_am = 'ናትናኤል መኮነን', level_key = 'l2', status = 'active',
       birth_date = current_date - 3285, phone = '+251 911 220 0010'
 where id = 'a3000000-0000-4000-8000-000000000001';

-- ─── guardians ───────────────────────────────────────────────────────────────
insert into public.guardians (id, user_id, full_name_am, phone, email, occupation, address_am, parish, is_active)
select ('a4000000-0000-4000-8000-00000000' || lpad(g::text, 4, '0'))::uuid,
       case when g = 1 then (select id from auth.users where email = 'parent@tekleteoflos.demo') end,
       f.name || ' ' || l.name,
       '+251 9' || lpad(((g * 8123) % 100000000)::text, 8, '0'),
       'guardian' || g || '@tekleteoflos.demo',
               (array ['ነጋዴ', 'መምህር', 'ሐኪም', 'ሐይማኖት ሠራተኛ', 'የባንክ ሠራተኛ', 'በየቀኑ ሥራ'])[ (g % 6) + 1 ],
               (array ['ቀርሳ ፈለገ ብርሐን', 'ሐውልት', 'መካኒኛ', 'ቦሌ'])[ (g % 4) + 1 ],
       'ቀርሳ ፈለገ ብርሐን',
       true
  from generate_series(1, 10) as g
  join lateral (select name from first_names where i = (g * 23) % 35 + 1) f on true
  join lateral (select name from last_names where i = (g * 3) % 20 + 1) l on true
on conflict (id) do nothing;

update public.guardians
   set full_name_am = 'ሰላም ተስፋዬ', phone = '+251 911 220 0011', occupation = 'መምህር'
 where id = 'a4000000-0000-4000-8000-000000000001';

-- Each guardian takes two or three students, the first guardian the demo student.
insert into public.guardian_students (guardian_id, student_id, relation_am, is_primary, can_consent)
select ('a4000000-0000-4000-8000-00000000' || lpad(((k - 1) / 5 + 1)::text, 4, '0'))::uuid,
       ('a3000000-0000-4000-8000-00000000' || lpad(k::text, 4, '0'))::uuid,
       case when k % 4 = 0 then 'እህት' when k % 7 = 0 then 'አያት' else 'እናት' end,
       k % 5 = 1,
       true
  from generate_series(1, 45) as k
on conflict (guardian_id, student_id) do nothing;

-- ─── volunteers ──────────────────────────────────────────────────────────────
insert into public.volunteer_profiles (id, member_id, skills, interests, availability, service_areas, status, hours_logged)
select ('d3000000-0000-4000-8000-00000000' || lpad(g::text, 4, '0'))::uuid,
       ('a1000000-0000-4000-8000-00000000' || lpad(g::text, 4, '0'))::uuid,
       case when g % 3 = 0 then array ['ፎቶግራፍ', 'ቪዲዮ ኤዲቲንግ', 'የድረ ገጽ ንድፍ']
            when g % 3 = 1 then array ['መምህርነት', 'የልጆች ክንክን', 'የመዝሙር ድምፅ']
            else array ['ሒሳብና ጽሕፈት', 'የጉብኝት አገልግሎት'] end,
       case (g % 4)
            when 0 then array ['የወጣቶች አገልግሎት', 'መማሪያ ሥራ']
            when 1 then array ['የቸገሪ ዕርዳታ', 'ጉብኝት']
            when 2 then array ['ሥርዓተ ኣምልኮ', 'ዕጣንና ዝማሬ']
            else array ['መዝሙር', 'የኮረብ አገልግሎት'] end,
       (array ['ቅዳሜ', 'እሁድ', 'ሁሉም ቀን'])[ (g % 3) + 1 ],
       array ['አዲስ አበባ'],
       case when g % 9 = 0 then 'pending' else 'active' end,
       ((g * 37) % 180)::numeric
  from generate_series(1, 18) as g
on conflict (id) do nothing;

commit;
