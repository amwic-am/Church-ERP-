-- Demo academics ──────────────────────────────────────────────────────────────
-- Ten classes, the curriculum they teach, four years of enrollment, ten Sundays
-- of roll call, graded exams, lesson plans, materials, ID cards, certificates
-- and the promotion batch the registrar is about to execute.
--
-- Built on the fixed ids in 01_people.sql and on the level / subject /
-- department / year configuration that migration 1700 already seeded, so every
-- row here points at something the ERP itself configured.
--
-- Applied with:  supabase db query --linked -f supabase/seed/02_classes.sql

begin;

-- ─── lookups ─────────────────────────────────────────────────────────────────
create temporary table cfg as
select (select id from public.academic_years where is_current limit 1) as year_id;

-- The demo sign-ins, addressed by the local part of their email. 01_people.sql
-- created the member/teacher/student rows these ids point at.
create temporary table who as
select u.id, split_part(u.email, '@', 1) as role
  from auth.users u
 where u.email like '%@tekleteoflos.demo';

-- ─── classes ─────────────────────────────────────────────────────────────────
insert into public.classes (id, code, name_am, level_id, academic_year_id, department_id,
                            room_am, capacity, meets_summary_am, schedule, age_min, age_max,
                            description_am, is_active, created_by)
select ('a5000000-0000-4000-8000-00000000' || lpad(v.n::text, 4, '0'))::uuid,
       v.code, v.name_am, l.id, c.year_id, d.id,
       v.room_am, v.capacity, v.meets_am, v.schedule::jsonb, v.age_min, v.age_max,
       v.desc_am, true, (select id from who where role = 'registrar')
  from (values
  (1, 'SS-L1A', 'ደረጃ ፩ — ሕፃናት ሀ', 'l1', 'spiritual-education', 'የት/ቤት ክፍል ፩ (የታችኛው ወለል)', 20,
   'እሁድ ጠዋት 8:30 – 9:15፣ በዓለት 4:00 – 4:40',
   '[{"day":0,"start":"08:30","end":"09:15"},{"day":4,"start":"16:00","end":"16:40"}]', 4, 7,
   'ልጆች እግዚአብሔርን በመዝሙር፣ በምሳሌና በመሣል የሚለማመዱበት መሠረታዊ ክፍል። የቤተሰብ ተሳትፎ በየወሩ ይጠበቃል።'),
  (2, 'SS-L1B', 'ደረጃ ፩ — ሕፃናት ለ', 'l1', 'spiritual-education', 'የት/ቤት ክፍል ፪ (የታችኛው ወለል)', 20,
   'እሁድ ጠዋት 8:30 – 9:15', '[{"day":0,"start":"08:30","end":"09:15"}]', 4, 7,
   'የመካኒኛ አካባቢ ልጆች ዋና ክፍል፤ ከደረጃ ፩ ሀ ጋር አንድ ዕርሳስ ቢሆንም የተማሪው አማካይ ዕድሜ ያንሳል።'),
  (3, 'SS-L2A', 'ደረጃ ፪ — ሕፃናት ሀ', 'l2', 'spiritual-education', 'የት/ቤት ክፍል ፫ (ሁለተኛ ወለል)', 18,
   'እሁድ ጠዋት 9:30 – 10:30፣ረቡዕ 4:30 – 5:30',
   '[{"day":0,"start":"09:30","end":"10:30"},{"day":3,"start":"16:30","end":"17:30"}]', 8, 11,
   'የቅዱሳት ሕይወት፣ የሰዓተ ጸሎት ልምድና የትርጉመ ንባብ መሠረት የሚያዘው ክፍል፤ የዚህ ዓመት የምዝገባ ቁጥር ከፍ ያለ ነው።'),
  (4, 'SS-L2B', 'ደረጃ ፪ — ሕፃናት ለ', 'l2', 'spiritual-education', 'የት/ቤት ክፍል ፬ (ሁለተኛ ወለል)', 18,
   'እሁድ ጠዋት 9:30 – 10:30', '[{"day":0,"start":"09:30","end":"10:30"}]', 8, 11,
   'ከሐውልትና ከፒያሳ የሚመጡ ልጆች ክፍል፤ የመዝሙር ልምምድ ከክፍል ፫ ጋር በጋራ ይደረጋል።'),
  (5, 'SS-L3A', 'ደረጃ ፫ — ወጣቶች', 'l3', 'spiritual-education', 'የመዝሙር ቤተ ሙኤዘዝ ፩', 22,
   'እሁድ ጠዋት 10:45 – 12:00', '[{"day":0,"start":"10:45","end":"12:00"}]', 12, 15,
   'የእምነት ትንተና፣ የመንፈስ ቅዱስ ጽሑፍ ትርጓሜና የሕይወት ጥያቄዎች በክፍለ ጊዜ የሚያዙበት የከፍተኛ ደረጃ ሕፃናት ክፍል።'),
  (6, 'SS-YTA', 'የወጣቶች ክፍል ሀ', 'youth', 'evangelism', 'የሐዋርያት ጎቄር ፩', 30,
   'እሁድ ከሰዓት 2:00 – 3:30', '[{"day":0,"start":"14:00","end":"15:30"}]', 16, 25,
   'ተማሪዎችና ወጣቶች የሚሰባሰቡበት፣ በየወሩ የወንጌል ጉዞ የሚዘጋጅበት ክፍል፤ የትርጉመ ቅዱሳት ጥናት ዋና ዕርሳሱ ነው።'),
  (7, 'SS-YTB', 'የወጣቶች ክፍል ለ', 'youth', 'spiritual-education', 'የሐዋርያት ጎቄር ፪', 30,
   'እሁድ ከሰዓት 2:00 – 3:30', '[{"day":0,"start":"14:00","end":"15:30"}]', 16, 25,
   'ከዕለተ ሥራና ከት/ቤት በኋላ የሚመጡ ወጣቶች ክፍል፤ የመጽሐፍ ቅዱስ ጥናት ከትንቢተ እግዚአብሔር ጋር ተያይዞ ይያዛል።'),
  (8, 'SS-ADA', 'አባቶችና እመቤቶች ሀ', 'adult', 'spiritual-education', 'ዕ.ማ ዋና አዳራሽ', 40,
   'እሁድ ከሰዓት 4:00 – 5:30', '[{"day":0,"start":"16:00","end":"17:30"}]', 26, null,
   'የቤተሰብ ጉዳይ፣ የሥርዓተ ኣምልኮ ጥልቅ ጥናትና የእምነት ንግግር የሚያዙ የአባቶችና የእመቤቶች ክፍል።'),
  (9, 'SS-ADB', 'አባቶችና እመቤቶች ለ', 'adult', 'social-affairs', 'ዕ.ማ ምሥራቅ ክፍል', 35,
   'ዕሁድ ከሰዓት 4:00 – 5:30', '[{"day":0,"start":"16:00","end":"17:30"}]', 26, null,
   'ለቸገሪዎች ዕርዳታ ከማህበራዊ ጉዳይ ክፍል ጋር የተያያዘ ክፍል፤ የጉብኝትና የመግባር ትምህርት በተግባር ይከታተላል።'),
  (10, 'SS-TCA', 'የመምህራን ትምህርት', 'teacher', 'spiritual-education', 'የመምህራን መኰነንያ ክፍል', 20,
   'ቅዳሜ 2:00 – 4:00', '[{"day":6,"start":"14:00","end":"16:00"}]', null, null,
   'ለመምህርነት የሚዘጋጁና አዲስ የተመደቡ መምህራን የሚስተዩበት ክፍል፤ የትምህርት ዕቅድ ጽሑፍና የማስተዳደር ሥርዓት ይያዛል።')
  ) as v(n, code, name_am, level_key, dept_slug, room_am, capacity, meets_am, schedule, age_min, age_max, desc_am)
  join public.class_levels l on l.key = v.level_key
  join public.departments d on d.slug = v.dept_slug
  cross join cfg c
on conflict (id) do nothing;

-- Each class gets the subjects its level actually covers.
insert into public.class_subjects (class_id, subject_id)
select c.id, s.id
  from (values
    ('SS-L1A','S100'),('SS-L1A','S200'),('SS-L1A','S320'),('SS-L1A','S330'),
    ('SS-L1B','S100'),('SS-L1B','S110'),('SS-L1B','S320'),('SS-L1B','S330'),
    ('SS-L2A','S100'),('SS-L2A','S120'),('SS-L2A','S200'),('SS-L2A','S310'),('SS-L2A','S330'),
    ('SS-L2B','S100'),('SS-L2B','S110'),('SS-L2B','S200'),('SS-L2B','S310'),('SS-L2B','S330'),
    ('SS-L3A','S120'),('SS-L3A','S210'),('SS-L3A','S220'),('SS-L3A','S300'),('SS-L3A','S320'),
    ('SS-YTA','S210'),('SS-YTA','S220'),('SS-YTA','S400'),('SS-YTA','S410'),
    ('SS-YTB','S110'),('SS-YTB','S210'),('SS-YTB','S410'),
    ('SS-ADA','S120'),('SS-ADA','S220'),('SS-ADA','S300'),('SS-ADA','S310'),('SS-ADA','S330'),
    ('SS-ADB','S200'),('SS-ADB','S300'),('SS-ADB','S330'),('SS-ADB','S410'),
    ('SS-TCA','S210'),('SS-TCA','S220'),('SS-TCA','S300'),('SS-TCA','S400')
  ) as v(cc, sc)
  join public.classes c on c.code = v.cc
  join public.subjects s on s.code = v.sc
on conflict do nothing;

-- The subjects now belong to the level that teaches them, which is how the
-- curriculum screen groups them.
update public.subjects s set level_id = l.id
  from (values
    ('S100','l1'),('S110','l1'),('S120','l2'),('S200','l1'),('S210','l3'),
    ('S220','l3'),('S300','adult'),('S310','l2'),('S320','l1'),('S330','l2'),
    ('S400','youth'),('S410','youth')
  ) as v(code, level_key)
  join public.class_levels l on l.key = v.level_key
 where s.code = v.code;

-- ─── curriculum ──────────────────────────────────────────────────────────────
insert into public.curriculum_units (subject_id, level_id, unit_no, title_am, summary_am,
                                     objectives_am, scripture_refs, duration_weeks,
                                     materials, is_published)
select s.id, l.id, v.unit_no, v.title_am, v.summary_am, v.objectives_am, v.refs_am, v.weeks,
       '["የተማሪ መጽሐፍ","ቁርስ ሰሌዳ","የምሳሌ ንባብ"]'::jsonb, true
  from (values
    ('S100','l1',1,'አብ — ፈጣሪና ጠባቂ',
     'ከዘፍጥረት መጽሐፍ ትምህርት፤ እግዚአብሔር አብ ሰማይንና ምድርን እንደፈጠረና ሰውን እንደጠበቀ።',
     'ተማሪው የአብን ስም በነጻ መልክ ይናገራል፤ የፍጥረት ቅደም ተከተል በዕጣን ያስታውሳል።','ዘም. ፴፫:፮፤ ኢሳ. ፮፬:፰',2),
    ('S100','l1',2,'ወልድ — ለእኛ የተወለደ',
     'የመድሃኒት ተስፋና ልደተ ክርስቶስ፤ በቤተ ልሔም የተገለጠው ምሥጢር።',
     'ተማሪው የልደት ታሪኩን በአጭሩ ይነግራል፤ "እግዚአብሔር ወልድ ሆኖ መጣ" ማለት ምን እንደሆነ ይገልጻል።','ሉቃ. ፪:፲-፳፤ ዮሐ. ፫:፲፮',2),
    ('S100','l1',3,'መንፈስ ቅዱስ — መመሪያዬ',
     'በጦማረ ሐዋርያት የተገለጠው መንፈስ ቅዱስና በዕለታዊ ሕይወት የሚሰጠው ጥንካሬ።',
     'ተማሪው የመንፈስ ቅዱስን ፍሬ ይዘከራል፤ በጸሎት እንዴት መጠየቅ እንደሚቻል ይለማመዳል።','ፍል. ፩:፴፩-፴፬፤ ዮሐ. ፲፮:፲፫',2),
    ('S110','l1',1,'ከአዳም እስከ ኖኅ',
     'የመጀመሪያዎቹ ትውልዶች፣ የኖኅ ማዕከልና የታሪክ ተስፋ።',
     'ተማሪው አምስት ነጥቦችን በቅደም ተከተል ይተረካል፤ የእግዚአብሔር ታዛዥነት ምሳሌ ይሰጣል።','ዘፍ. ፮-፱',3),
    ('S110','l1',2,'አብርሃም — የእምነት አባት',
     'የተስፋ ቃል ኪዳን፣ የዕጣን ሙከራና "ብርሃኔ አደርግሃለሁ" ተስፋ።',
     'ተማሪው ትንቢት ማለት እግዚአብሔር የሰጠ ቃል መሆኑን ይነግራል።','ዘፍ. ፲፪ ፲፯፤ ሮሜ ፬:፲፯-፳፩',2),
    ('S110','l1',3,'ሙሴና ዕርዳታው',
     'ወደ ግብፅ የተላከ ገዳጅ፣ የአሥሩ መቈፋዮችና የታራሜ ዕርዳታ።',
     'ተማሪው የገዳጅን ሕይወት ይዘከራል፤ ዕርዳታው ከሕጉ ጋር ያለውን ግንኙነት ያብራራል።','ዘፀ. ፫-፲፬',3),
    ('S120','l2',1,'አንድነት በሦስነት',
     'የቅዱሳት አባቶች ትምህርት፤ አንድ እግዚአብሔር በሦስት ብቸኛዎች መገለጡ።',
     'ተማሪው "አብ ወልድ መንፈስ ቅዱስ" በአንድነት እንደሆነ በራሱ አነጋገር ይናገራል።','ማቴ. ፳፰:፲፱፤ ፩ዮሐ ፭:፯',2),
    ('S120','l2',2,'ቅዱስ ትሪኢቶዎስ ብሔ',
     'አቕርቦትና አንድነት፤ በአብው እንኳን ወልው በመንፈስ ቅዱስ አንድ መኰነን።',
     'ተማሪው የብሔውን አጭር ትርጉም ይዘከራል፤ በቤተ ክርስቲያን መንፈስ ቅዱስ ውስጥ ያየዋል።','ዮሐ. ፲፬:፳፮',2),
    ('S120','l2',3,'ምሥጢሩን በሕይወት ማየት',
     'ከምሥጢሩ እስከ ተግባር — መስሎ ማምለኽ፣ በፍቅር አገልግሎት።',
     'ተማሪው የእምነቱን ትምህርት በሳምንት አንድ ጥሩ ተግባር ያሳያል።','ያዕ. ፪:፳፮',1),
    ('S200','l1',1,'ትዋበ ወለመ',
     'በእግዚአብሔር ፍቅር የተላከው መድሃኒትና የሰው ልጅ ኃጢአት ችግር።',
     'ተማሪው ኃጢአት ምን እንደሆነ በምሳሌ ይገልጻል፤ ትሥሕሔ ለምን እንደሆነች ይናገራል።','ሮሜ ፫:፳፫፤ ዮሐ. ፫:፲፮',2),
    ('S200','l1',2,'ሞተና በሦስተኛው ቀን ተነሥቶ',
     'ቅዱስ አርብ፣ ቅዱስ እሁድና ትሥለሰው ለተማሪው የተሰጠ ተስፋ።',
     'ተማሪው የሳምንቱን ቅዱሳን ቀላት ዘከሮ ይነግራል፤ ትሥሔ መሠረት እምነት መሆኑን ይቀበላል።','፩ቆሮ ፲፭:፫-፬',2),
    ('S200','l1',3,'ዕርገትና ወደ እግዚአብሔር መምጣት',
     'ዕርገተ ክርስቶስ፣ የመንፈስ ቅዱስ መምጣትና የቤተ ክርስቲያን መጀመሪያ።',
     'ተማሪው ዕርገትን ከፈሰው በኋላ ያለውን ተስፋ በራሱ አነጋገር ይተርካል።','ፍል ፩:፺-፲፩',1),
    ('S210','l3',1,'ብሉይ ኪዳን — ሕግና ትንቢት',
     'የግዕዝ ትርጉሞቹ ቅደም ተከተል፣ ሕግ፳ነቢዕና ሜአምምተ ንቢዕ።',
     'ተማሪው የመጻሕፍት ቡድኖችን ይለያል፤ አንድን ንባብ ከዕርሳሱ ጋር ያነባል።','ዘም. ፲፩፱:፲፬-፲፮',3),
    ('S210','l3',2,'አዲስ ኪዳን — ወንጌልና ሐዋርያት',
     'አሥር አራት ወንጌላዊ መጻሕፍት፣ ፍቅረ ክርስቶስ የተገለጠበት መንገድ።',
     'ተማሪው የአንድ ወንጌል ባህርይ ይነግራል፤ ሐዋርያትን ከሐዋርያት መምሪያ ጋር ያያዳል።','ዮሐ. ፳:፴፩',3),
    ('S210','l3',3,'ንባብን በአግዳዝ ማነጻጸር',
     'የአግዳዝ ዕሳፍ፣ የትርጉም ልዩነትና የማብራሪያ ዘዴ።',
     'ተማሪው አንድን ጥታ በሁለት ትርጉሞች አነቦ ልዩነቱን ይናገራል።','፬ኤዝ ፫:፳፪',2),
    ('S220','l3',1,'በመሮግዋ የተጀመረች ቤተ ክርስቲያን',
     'ከሃዋርያት እስከ አብያተ ክርስቲያናት ያለው የመጀመሪያ ዘመን።',
     'ተማሪው አምስት ነጥብ በቅደም ተከተል ይተረካል፤ የቤተ ክርስቲያንን ተልእኮ ይገልጻል።','ፍል ፪:፵፩-፬፯',2),
    ('S220','l3',2,'አባቶችና የካቲኬዜ ጉባኤዎች',
     'ቅዱሳት አባቶች፣ የካቲኬዜ ትምህርትና የእምነት ጥናት።',
     'ተማሪው ሦስት አባቶችን ስማቸውንና አገልግሎታቸውን ይዘክራል።','2ቆሮ ፩:፩',2),
    ('S220','l3',3,'የኢትዮጵያ ቤተ ክርስቲያን',
     'ከፍሬው ንግሥተ ነገሥት እስከ ዛሬ፣ የግዕዝ ስርዓትና የመዝሙር ቅርስ።',
     'ተማሪው የቤተ ክርስቲያኑን ዕድሜ በታሪክ ዘንግ ላይ ያሳያል፤ ሁለት ቅርሶችን ይዘከራል።','መዝ. ፹፯:፶',3),
    ('S300','adult',1,'ቅዳሴ — ደረጃዎቿ',
     'ከምሥጢረ ገብስ እስከ ቅርባን ያለው የቅዳሴ ቅደም ተከተልና ትርጉሙ።',
     'ተማሪው የቅዳሴውን ክፍሎች በቅደም ተከተል ይዘከራል፤ አንዱን ክፍል ለሌላው ይገልጻል።','ግብሪ ፪:፵፮',3),
    ('S300','adult',2,'ስብከተ ምሥጢርና ጸሎተ ሰዓት',
     'ንባብ፣ ስብከት፣ ጸሎትና በረከት — የአምልኮ አወቃቀር።',
     'ተማሪው በራሱ አባታችንን ለምሕራን በሥርዓቱ እንዴት እንደሚያዘው ይረዳል።','1ቆሮ ፥:፩',2),
    ('S300','adult',3,'ዕጣን፣ ንባብና ዝማሬ',
     'የሥርዓት ተግባራት ትርጉምና በሕዝብ መካከል የሚኖራቸው ቦታ።',
     'ተማሪው ዕጣን ለምን እንደሚያዘው ለልጅ በአጭሩ ይገልጻል።','ዘም. ፲፬፩:፪',2),
    ('S310','l2',1,'ሰዓታት — የቀን ጸሎቶች',
     'ከደግም እስከ አርብተ ቀን ያሉት ስድስት ጸሎተ ሰዓታትና ትርጉማቸው።',
     'ተማሪው የሰዓታቱን ቅደም ተከተል ዘክሮ ይናገራል፤ አንዱን ሰዓት ቤተሰቡን አሳትፎ ይጸልያል።','ዘም. ፥፩:፯',3),
    ('S310','l2',2,'ድጓና የልጆት ጸሎት',
     'የሕፃናት መቼት፣ ቅድመ ጉባኤ ጸሎትና የቤተሰብ ማሳመድ ሥርዓት።',
     'ተማሪው ለወንድሞቹና ለእህቶቹ በአጭር ጸሎት ይጸልያል።',
     'ማር ፲:፲፫-፲፮',2),
    ('S310','l2',3,'ጾምና በዓል — እንዴት እንደምንቀድስ',
     'የአርብ ጾም፣ የነፍሰ ገዳይ በዓላትና የሕይወት ቅደም ተከተል።',
     'ተማሪው አንድን በዓል በራሱ አነጋገር ትርጉሙን ለክፍሉ ይናገራል።','ኢሳ ፩:፲፩-፲፯',2),
    ('S320','l1',1,'መዝሙር በመጻሕፍት ውስጥ',
     'ዳዊት ነገሥት፣ መዝሙረ ዳዊትና የዝማሬ ትርጉም።',
     'ተማሪው አንድን አጭር መዝሙር በቃልና በድምፅ ይዘምራል።','ዘም. ፲፭:፩-፥',2),
    ('S320','l1',2,'ከበሮ፣ ዋሽንትና መራሪ',
     'የቤተ ክርስቲያን ጸሎት ንግግር ትርጉምና አጠቃቀም።',
     'ተማሪው ሦስቱን ንግግሮች ይለያል፤ የአንዱን ትርጉም ይነግራል።','1ዜማ ፲፩:፳፯',2),
    ('S320','l1',3,'በጉጉርብ መዘመር',
     'በክፍል፣ በቤተሰብና በቅዳሴ ውስጥ የመዝሙር ተሳትፎ።',
     'ተማሪው በኮረብ አንድን መዝሙር ተሳትፎ ይዘምራል፤ ለሌላው ሕፃን ያስተምራል።',
     'ኤፍ. ፭:፲፱',2),
    ('S330','l2',1,'ቅዱስ ማን ነው?',
     'የቅድስና ትርጉም፣ በሐዋርያትና በአባቶች ሕይወት የተገለጠው ምሳሌ።',
     'ተማሪው "ቅዱስ" ማለት ምን እንደሆነ በራሱ አነጋገር ይገልጻል።','1ቆሮ ፮:፲፩',2),
    ('S330','l2',2,'የአባቶች ሕይወት',
     'አቡነ ገብረ መንፈስ ቅዱስ፣ አቡነ ገርማና ሰባተ ማዕረግ — የኢትዮጵያ አባቶች።',
     'ተማሪው ከአባቶቹ አንዱን ሕይወት በአጭሩ ይተረካል፤ አንድን ተግባር ለራሱ ይመርጣል።',
     'ያዕ ፭:፲፩',3),
    ('S330','l2',3,'ሰማዕታትና እምነት ጽናት',
     'ቅዱስ እስጢፋኖስ እስከ ዘመነ ሰማዕት ያለው የጽናት ታሪኮ።',
     'ተማሪው በትንሽ ችግር ላይ እምነትን መጠበቅ እንደሚቻል ይናገራል።','ሓብ ፩:፬',2),
    ('S400','youth',1,'ምሳሌ ማንበብ',
     'የክርስቶስ ምሳሌዎች፣ ቅርፅና ዋና መልእክት መለየት።',
     'ተማሪው ከምሳሌ አንዱን ትርጉም በአንድ ዐቃቤ ቃል ይደምድማል።','ማቴ ፲፫',2),
    ('S400','youth',2,'የታሪክ ምሳሌ ጽሑፍ',
     'የራሱ ታሪክን በምሳሌ መቀየር — የስብከት ዕቅድ መነሻ።',
     'ተማሪው ሦስት ነጥብ ያለው አጭር ምሳሌ ይጽፋል፤ ለክፍሉ ያንብበዋል።','ማቴ ፩:፬',3),
    ('S400','youth',3,'የስብከት ዕቅድ ማዘጋጀት',
     'መግቢያ፣ አገልግሎት፣ ምሳሌና ጥሪ — አጭር የስብከት አወቃቀር።',
     'ተማሪው አምስት ደቂቃ ያለው ስብከት ዕቅድ ያዘጋጃል፤ ባለሙያ ይከታተለዋል።','ሮሜ ፲:፲፬-፲፯',2),
    ('S410','youth',1,'ትዕግስትና ተስፋ',
     'በትምህርት፣ በስራና በችግር ውስጥ የእምነት ጽናት።',
     'ተማሪው አንድን የራሱ ችግር ከመጽሐፍ ቅዱስ ጥታ ጋር አያይዞ ይገልጻል።','ያዕ ፩:፪-፬',2),
    ('S410','youth',2,'ስርክተትና የቤተሰብ ጉብኝት',
     'ከወጣት ዕድሜ ጋር የሚነሱ ጥያቄዎችና የቤተ ክርስቲያን መልክ።',
     'ተማሪው ጥያቄን በአክብሮት መመለስ እንደሚችል ይለማመዳል።','1ቆሮ ፮:፲፰-፳፩',3),
    ('S410','youth',3,'ገንዘብ፣ ሥራና አገልግሎት',
     'የዕጣን ትምህርት በወጣት ሕይወት — ሥራፌቅድና ማኅበራዊ ኃላፊነት።',
     'ተማሪው ለራሱ የሳምንት ኃላፊነት ዕቅድ ይሠራል፤ ለክፍሉ ይዘግባል።','ማቴ ፪፭:፳፩-፴፩',2)
  ) as v(code, level_key, unit_no, title_am, summary_am, objectives_am, refs_am, weeks)
  join public.subjects s on s.code = v.code
  join public.class_levels l on l.key = v.level_key
on conflict (subject_id, level_id, unit_no) do nothing;

-- ─── teachers per class ──────────────────────────────────────────────────────
-- Teacher 1 is the `teacher@tekleteoflos.demo` login, so it leads two classes
-- and the teacher portal has something real to open.
insert into public.class_teachers (class_id, teacher_id, subject_id, role_key, assigned_on)
select c.id,
       ('a2000000-0000-4000-8000-00000000' || lpad(v.tno::text, 4, '0'))::uuid,
       (select s.id from public.subjects s where s.code = v.sc),
       v.role, v.on_date
  from (values
    ('SS-L2A', 1, 'lead',      'S100', date '2018-09-29'),
    ('SS-TCA', 1, 'lead',      'S210', date '2018-09-29'),
    ('SS-L1A', 2, 'lead',      'S320', date '2019-03-03'),
    ('SS-L1A', 11,'assistant', null,   date '2022-01-08'),
    ('SS-L1B', 3, 'lead',      'S110', date '2019-03-03'),
    ('SS-L2B', 4, 'lead',      'S310', date '2020-09-13'),
    ('SS-L3A', 5, 'lead',      'S210', date '2017-10-01'),
    ('SS-YTA', 6, 'lead',      'S400', date '2021-02-14'),
    ('SS-YTA', 12,'assistant', null,   date '2023-09-10'),
    ('SS-YTB', 7, 'lead',      'S210', date '2021-02-14'),
    ('SS-ADA', 8, 'lead',      'S300', date '2016-01-10'),
    ('SS-ADB', 9, 'lead',      'S330', date '2016-01-10'),
    ('SS-L2A', 10,'assistant', 'S330', date '2024-02-11')
  ) as v(cc, tno, role, sc, on_date)
  join public.classes c on c.code = v.cc
on conflict (class_id, teacher_id, subject_id) do nothing;

-- ─── enrollment ──────────────────────────────────────────────────────────────
-- Every student lands in a class of their own level, split evenly between the
-- two groups where the level has more than one.
with s as (
  select sp.id, sp.level_key, sp.status,
         row_number() over (partition by sp.level_key order by sp.student_code) as n
    from public.student_profiles sp
),
target as (
  select s.id as student_id,
         case s.level_key
           when 'l1'     then 'SS-L1' || case when s.n <= 4 then 'A' else 'B' end
           when 'l2'     then 'SS-L2' || case when s.n <= 5 then 'A' else 'B' end
           when 'l3'     then 'SS-L3A'
           when 'youth'  then 'SS-YT' || case when s.n <= 4 then 'A' else 'B' end
           when 'adult'  then 'SS-AD' || case when s.n <= 4 then 'A' else 'B' end
           when 'teacher' then 'SS-TCA'
         end as code,
         s.n
    from s
)
insert into public.student_enrollments (student_id, class_id, academic_year_id, status, enrolled_on, seat_note)
select t.student_id, c.id, cfg.year_id,
       case when sp.status = 'active' then 'enrolled' else 'transferred' end,
       sp.enrolled_on,
       case when t.n % 9 = 0 then 'የቤተሰብ ጥያቄ — ከክፍል ጎን ለጎን' end
  from target t
  join public.classes c on c.code = t.code
  join public.student_profiles sp on sp.id = t.student_id
  cross join cfg
on conflict (student_id, class_id, academic_year_id) do nothing;

-- ─── sessions: the last ten Sundays ─────────────────────────────────────────
-- The first subject of the class is what each Sunday took, rotated across the
-- weeks; the newest session has no roll call yet so the teacher screen still
-- has something to do.
with csub as (
  select x.class_id, array_agg(x.subject_id order by s.order_no) as subs
    from public.class_subjects x
    join public.subjects s on s.id = x.subject_id
   group by x.class_id
),
sess as (
  select c.id as class_id, c.code,
         current_date - extract(dow from current_date)::int - (w * 7) as held_on,
         w,
         (c.schedule -> 0 ->> 'start')::time as starts_at,
         (c.schedule -> 0 ->> 'end')::time as ends_at,
         cs.subs[ ((w - 1) % array_length(cs.subs, 1)) + 1 ] as subject_id
    from public.classes c
    join csub cs on cs.class_id = c.id
   cross join generate_series(1, 10) as w
)
insert into public.class_sessions (class_id, subject_id, unit_id, held_on, starts_at, ends_at,
                                   topic_am, teacher_id, summary_am, homework_am,
                                   attendance_taken, created_by)
select s.class_id, s.subject_id, u.id, s.held_on, s.starts_at, s.ends_at,
       coalesce(u.title_am, 'የክፍል ጉባኤና ማስተዋወቂያ'),
       lead_teacher.teacher_id,
       'የ' || coalesce(u.title_am, 'ጉባኤው') || ' ትምህርት ተያዘ፤ አመሰጋግኦ ተገኝቷል።',
       case when u.scripture_refs is not null
            then 'የ' || u.scripture_refs || ' ንባብ ተመልክቶ ወደ ክፍል ይምለሱ።'
            else 'የዕርሳሱን መዝሙር በቤት ይዘምሩ።' end,
       s.w >= 2,
       (select id from who where role = 'registrar')
  from sess s
  left join lateral (
         select q.* from public.curriculum_units q
          where q.subject_id = s.subject_id
          order by q.unit_no
         offset (s.w - 1) % 3 limit 1
       ) u on true
  join lateral (
         select t.teacher_id from public.class_teachers t
          where t.class_id = s.class_id and t.role_key = 'lead' and t.removed_on is null
          order by t.assigned_on limit 1
       ) lead_teacher on true
on conflict (class_id, held_on, starts_at) do nothing;

-- ─── roll call ───────────────────────────────────────────────────────────────
insert into public.attendance_sessions (class_id, session_id, taken_on, starts_at, label_am,
                                        teacher_id, taken_by, status, closed_at, notes_am)
select cs.class_id, cs.id, cs.held_on, cs.starts_at,
       'እሁድ — ' || to_char(cs.held_on, 'DD/MM/YYYY'),
       cs.teacher_id, cs.created_by, 'closed',
       cs.held_on + (cs.ends_at + interval '10 minutes'),
       null
  from public.class_sessions cs
 where cs.attendance_taken
on conflict (class_id, taken_on, starts_at) do nothing;

-- Statuses are spread so a month of reports shows a real pattern rather than a
-- perfect hundred percent: roughly one absent, one late and one excused in
-- every six students.
with rec as (
  select a.id as session_id,
         a.class_id,
         a.taken_on,
         a.taken_by,
         en.student_id,
         row_number() over (partition by a.id order by sp.student_code) as seat,
         (extract(doy from a.taken_on)::int + row_number() over (partition by a.id order by sp.student_code) * 5
          + length(a.class_id::text)) % 13 as m
    from public.attendance_sessions a
    join public.student_enrollments en on en.class_id = a.class_id and en.status = 'enrolled'
    join public.student_profiles sp on sp.id = en.student_id
)
insert into public.attendance_records (session_id, student_id, status, minutes_late,
                                       reason_am, guardian_contacted, recorded_by)
select rec.session_id, rec.student_id,
       (case when rec.m = 0 then 'absent'
             when rec.m = 5 then 'late'
             when rec.m = 11 then 'excused'
             else 'present' end)::public.attendance_status,
       case when rec.m = 5 then 6 + rec.m % 17 else 0 end,
       case when rec.m = 0 then 'በሕመም ቤተሰብ ማሳወቅ ስለሆነ'
            when rec.m = 5 then 'የትራንስፖርት መዘግየት'
            when rec.m = 11 then 'የቤተሰብ ጉዳይ — መጠየቅ ላይ' end,
       rec.m = 0,
       rec.taken_by
  from rec
on conflict (session_id, student_id) do nothing;

-- ─── exams ───────────────────────────────────────────────────────────────────
-- Two graded exams per class and one final that is still on its way.
with spec as (
  select * from (values
    ('written', 'የሳምንተ ንባብ ፍተሻ',            7,  50.0, 20.0, 18.0, 'published'),
    ('midterm', 'የመካከለኛ ዓመት ፍተሻ',           3, 100.0, 35.0, 60.0, 'published'),
    ('final',   'የዓመት መደምደሚያ ፍተሻ',          -3, 100.0, 45.0, 60.0, 'submitted')
  ) as v(typ, title, weeks, total, weight, pass, st)
),
csub as (
  select x.class_id, array_agg(x.subject_id order by s.order_no) as subs
    from public.class_subjects x
    join public.subjects s on s.id = x.subject_id
   group by x.class_id
)
insert into public.exams (class_id, subject_id, academic_year_id, title_am, exam_type, exam_on,
                          total_marks, weight_percent, pass_mark, state, created_by)
select c.id, cs.subs[1], cfg.year_id,
       c.name_am || ' — ' || sp.title, sp.typ,
       current_date - (sp.weeks * 7),
       sp.total::numeric, sp.weight::numeric, sp.pass::numeric,
       sp.st::public.content_state,
       (select id from who where role = 'registrar')
  from public.classes c
  join csub cs on cs.class_id = c.id
  cross join spec sp
  cross join cfg
where c.is_active and not exists (select 1 from public.exams);

-- Results for every exam already held. Marks are spread 48–97 % of the total so
-- the grade scale produces A+ through D, and a student who was absent on the day
-- is recorded absent instead of getting a zero.
with q as (
  select e.id as exam_id, e.class_id, e.total_marks, e.exam_on,
         en.student_id,
         row_number() over (partition by e.id order by sp.student_code) as seat
    from public.exams e
    join public.student_enrollments en on en.class_id = e.class_id and en.status = 'enrolled'
    join public.student_profiles sp on sp.id = en.student_id
   where e.exam_on <= current_date
)
insert into public.exam_results (exam_id, student_id, marks, status, remarks_am,
                                 entered_by, entered_at, released_at)
select q.exam_id, q.student_id,
       case when q.seat % 23 = 0 then null
            else round(q.total_marks * (0.48 + ((q.seat * 17 + extract(day from q.exam_on)::int * 7) % 50) / 100.0)) end,
       case when q.seat % 23 = 0 then 'absent' else 'released' end,
       case when q.seat % 23 = 0 then 'በፍተሻው ላይ ሳይገኝ ቀርቷል፤ ዕድል ተሰጥቶ ይፈተሻል።'
            when q.seat % 3 = 0 then 'በእምነት ጽኑ፤ የመዝሙርና የንባብ ብልሃቱ አስደናቂ ነው።'
            when q.seat % 3 = 1 then 'ትምህርቱን በደንብ ይከታተላል፤ በቤት ጸሎት ማጠናከር ይጠበቅበታል።'
            else 'ጥሩ ዕድገት አሳይቷል፤ የተማሪው መጽሐፍ ንባብ ተጨማሪ ጥንካሬ ይኖረዋል።' end,
       (select id from who where role = 'registrar'),
       q.exam_on + 2, q.exam_on + 2
  from q
on conflict (exam_id, student_id) do nothing;

-- ─── lesson plans ────────────────────────────────────────────────────────────
-- A real spread of the review workflow, with the demo teacher's own plans first
-- so the teacher portal opens on something it can submit.
insert into public.lesson_plans (teacher_id, class_id, subject_id, unit_id, plan_for, title_am,
                                 objectives_am, content_am, activities_am, materials_am,
                                 assessment_am, reflection_am, status, reviewed_by, review_notes)
select ('a2000000-0000-4000-8000-00000000' || lpad(v.tno::text, 4, '0'))::uuid,
       c.id, s.id, u.id, current_date + v.after_days, v.title, v.obj, v.content, v.acts, v.mats,
       v.assess, v.reflect, v.status,
       case when v.status in ('approved','rejected') then (select id from who where role = 'approver-content') end,
       case v.status
          when 'approved' then 'ዕርሳሱ ለደረጃው ተስማሚ ነው፤ በክፍል ውስጥ ጊዜ ማካፈል ይጥን።'
          when 'rejected' then 'የትምህርቱ ዕቅድ ከላላዩ ክፍል ጋር አይዛመድም — ደረጃውን ይምረጡ።'
          when 'submitted' then null end
  from (values
    (1, 'SS-L2A', 'S100', 1,  2, 'አብ — ፈጣሪና ጠባቂ',
     'ልጆቹ የአብን ስም በነፃነት እንዲናገሩ፣ የፍጥረቱን ቅደም ተከተል እንዲዘክሩ።',
     'ከዘፍጥረት ፩ ጋር የተያያዘ ንባብ፣ የፀሐይ/ጨረቃ/ከዋክብት ምሳሌ በወንበዴ ማየት።',
     'የዕጣን ጸሎት፣ የ6 ቀናት ተራዳሚ ጨዋታ፣ የመዝሙር ድግግሞሽ',
     'የተማሪ መጽሐፍ፣ ቁርስ ሰሌዳ፣ የፍጥረት ምስል',
     'በዕጣን ላይ ያሉትን ሦስት ነጥቦች በአፍንጭ መጠየቅ',
     'ልጆቹ በበለጠ ጉጉርብ ተነስተዋል፤ ቀጣዩ ትምህርት የተራዳሚ ጨዋታውን ይጨምራል።', 'approved', 1),
    (1, 'SS-L2A', 'S330', 2,  9, 'አቡነ ገብረ መንፈስ ቅዱስ — በአንድ ሺህ ዓመት',
     'ተማሪው የአባቶቹን ተግባር ዘክሮ ለራሱ አንድ ምሳሌ መርጦ ይከተላል።',
     'የዘመኑ ሕዝብ ከግራት መተላለፉ፣ ዓሦን ማንሳቱና የሕዝብ አገልግሎት።',
     'ታሪኩን በምስል ማየት፣ የቡድን ውይይት፣ አጭር ጸሎት',
     'የአባቶች ታሪክ መጽሐፍ፣ የምሳሌ ንባብ',
     'እያንዳንዱ ልጅ የሰማዋውን አንድ ተግባር በድብዴላ ይጽፋል።',
     null, 'submitted', 1),
    (1, 'SS-TCA', 'S210', 4, 16, 'ንባብን በአግዳዝ ማነጻጸር — ለመምህራን',
     'አዲስ መምህራን አንድን ጥታ በሁለት ትርጉም አነቦ ልዩነቱን ለሕፃናት ማስረድ ይችላሉ።',
     'የግዕዝና የአማርኛ ንባብ ልዩነት፣ የማብራሪያ ዘዴና የጥያቄ መዋቅር።',
     'በሦስት ቡድን የጥታ ንባብ፣ የማብራሪያ ማቅረቢያ፣ እርስ በርስ ምልከታ',
     'መጽሐፍ ቅዱስ፣ የአግዳዝ ትርጉም፣ የስራ ቅጽ',
     'እያንዳንዱ ተማሪ አምስት ደቂቃ ማብራሪያ ያቀርባል፤ ቡድኑ ይመዘግናል።',
     null, 'draft', 1),
    (2, 'SS-L1A', 'S320', 1,  2, 'መዝሙር በመጻሕፍት ውስጥ',
     'ልጆቹ አንድ አጭር መዝሙር በድምፅና በእጥቅ ይዘምራሉ።', 'የዳዊት መዝሙር ትርጉም፣ የኮረብ ቦታና ሥርዓት።',
     'የድምፅ ልምምድ፣ የክብ ጉጉርብ፣ የቃል መዝከር ጨዋታ', 'የመዝሙር ንባብ ጽሑፍ፣ ከበሮ',
     'በሳምንቱ መዝሙር በቤት መዘመሩን በወላጅ ፊርማ ማረጋገጥ', 'ልጆቹ የመዝሙር ክፍሉን በጉጉት ተከታትለዋል።',
     'approved', 2),
    (3, 'SS-L1B', 'S110', 4,  9, 'ሙሴና ዕርዳታው',
     'ተማሪው የገዳጁን ታሪክ በዐምስት ነጥብ ይተረካል።', 'ወደ ግብፅ መልአክ፣ ዐሥር መቈፋይ፣ ውጫቸውና ታሪኩ።',
     'ታሪኩን በወንበዴ ማየት፣ የተራዳሚ ድርሻ ጨዋታ፣ ጸሎት', 'የልጆች ታሪክ መጽሐፍ፣ የወንበዴ ምስል',
     'በአፍንጭ ላይ ያሉትን ክፍሎች በቅደም ተከተል ማዋቀር', null, 'submitted', 2),
    (4, 'SS-L2B', 'S310', 7,  2, 'ሰዓታት — የቀን ጸሎቶች',
     'ተማሪው የደግምና የሰለሰ ጸሎት ቦታ ይዘከራል፤ በራሱ ጸሎት ይጀምራል።',
     'የሰዓታት ሠነ፣ የእያንዳንዱ ሰዓት ትርጉምና ጸሎተ ማሕሰምት።',
     'የሰዓት ሰንሰለት ማንበብ፣ በጋራ ጸሎት፣ የዕለት መዝገብ', 'አግዳዝ፣ የሰዓታት ሰንሰለት ሰዌር',
     'ለሳምንቱ የሰዓት ጸሎት መዝገብ በቤት ተሞልቶ ይመለስ', null, 'approved', 3),
    (5, 'SS-L3A', 'S210', 13, 16, 'አዲስ ኪዳን — ወንጌልና ሐዋርያት',
     'ተማሪው የአሥር አራቱን ወንጌላዊ መጻሕፍት ይለያል፤ አንዱን ባህርይ ይገልጻል።',
     'ወንጌል፣ ግብረ ሐዋርያት፣ መልእክተ ሐዋርያትና ራዕይ ደናጋሪት።',
     'የመጻሕፍት ካርድ ጨዋታ፣ የቡድን ጥናት፣ ዕረፍት', 'መጽሐፍ ቅዱስ፣ የመጻሕፍት ዝርዝር ሰዌር',
     'በአፍንጭ ላይ ያለውን የመጻሕፍት ዝርዝር ያለ ስህተት ማሟላት',
     'ክፍሉ ለጥናት ዝግጁ ነው፤ አዲስ ልጆች የመጻሕፍት ስማቸውን ይፈልጋሉ።', 'approved', 5),
    (6, 'SS-YTA', 'S400', 22,  9, 'የስብከት ዕቅድ ማዘጋጀት',
     'ወጣቱ አምስት ደቂቃ ያለው አጭር ስብከት ዕቅድ ያዘጋጃልና ለክፍሉ ያቀርባል።',
     'መግቢያ፣ መሠረተ ንባብ፣ ምሳሌና ጥሪ — አወቃቀርና የቅንብር ሥራ።',
     'በቡድን ዕቅድ መጻፍ፣ ማቅረቢያ፣ እርስ በርስ ምልከታ', 'የዕቅድ ቅጽ፣ መጽሐፍ ቅዱስ',
     'የእያንዳንዱ ልጅ ዕቅድ በአባ ምልከታ ይታይ፤ ሁለት ነጥብ ተመልሶ ይሰጣል።', null, 'submitted', 6),
    (7, 'SS-YTB', 'S410', 25,  2, 'ገንዘብ፣ ሥራና አገልግሎት',
     'ተማሪው ለራሱ የሳምንት የአገልግሎትና የኃላፊነት ዕቅድ ይሠራል።',
     'የዕጣን ትምህርት፣ የዕጣን ሥራ፣ ለቸገሪ መርዳትና የቤተሰብ ኃላፊነት።',
     'ጥያቄና መልስ፣ የሕይወት ምሳሌ ትንተና፣ የቡድን ውይይት', 'የውይይት መመሪያ፣ መጽሐፍ ቅዱስ',
     'የዕቅዱ ቅጽ በሳምንት መዘጋጃ ላይ ይገመራል', null, 'draft', 7),
    (8, 'SS-ADA', 'S300', 19,  9, 'ቅዳሴ — ደረጃዎቿ',
     'ተማሪው የቅዳሴውን ክፍሎች በቅደም ተከተል ይዘከራልና አንዱን ለሌላው ይገልጻል።',
     'ከምሥጢረ ገብስ እስከ ቅርባን ያለው ቅደም ተከተልና ትርጉሙ።',
     'ንባብ፣ የምሳሌ ትርጓሜ፣ የጋራ ጸሎት', 'ዕ.ማ መጽሐፍ፣ የስዕል ማሳያ',
     'በሳምንቱ ቅዳሴ ላይ ተሳትፎ በወለል ላይ ታይቶ ይመለከታል', 'ለአባቶች ክፍል ጥልቀቱ ተስማሚ ነው።',
     'approved', 8),
    (9, 'SS-ADB', 'S330', 20, 16, 'ሰማዕታትና እምነት ጽናት',
     'ተማሪው በዕለት ተዕለት ሕይወት እምነትን መጠበቅ እንደሚችል ምሳሌ ይሰጣል።',
     'ቅዱስ እስጢፋኖስ እስከ ዘመነ ሰማዕት ያለው ታሪክና ትርጉሙ።',
     'ታሪክ ንባብ፣ ውይይት፣ ጸሎት', 'የሰማዕት ታሪክ መጽሐፍ', 'የውይይት ማቅረቢያ በቡድን', null,
     'rejected', 9),
    (10,'SS-L2A', 'S330', 21,  2, 'ቅዱስ ማን ነው?',
     'ልጆቹ "ቅዱስ" የሚለው ቃል ምን ማለት እንደሆነ በራሳቸው አነጋገር ይናገራሉ።',
     'የቅድስና ትርጉም፣ የሐዋርያትና የአባቶች ሕይወት በምሳሌ።',
     'ጥያቄ መጠየቅ፣ የምሳሌ ንባብ፣ ሥዕል ማየት', 'የልጆች መጽሐፍ፣ የምሳሌ ሰዌር',
     'በክፍሉ መሐምድ ላይ ያሉ ልጆች ይለዩ ዘንድ ተስማሚ ነው', null, 'submitted', 10),
    (11,'SS-L1A', 'S320', 2, 23, 'ከበሮ፣ ዋሽንትና መራሪ',
     'ልጆቹ ሦስቱን የቤተ ክርስቲያን ንግግሮች ይለያሉ፤ አንዱን ትርጉም ይነግራሉ።',
     'የእያንዳንዱ ንግግር ቅርፅና በሥርዓት ውስጥ ቦታው።',
     'ንግግር ማረፍ፣ የድምፅ ንፅፅር መርዳት፣ የቡድን ዝማሬ', 'ከበሮ፣ ዋሽንት፣ መራሪ',
     'ልጆቹ በአፍንጭ ላይ እንዳሉትን ነጥቦች ይነግራሉ', null, 'draft', 11),
    (12,'SS-YTA', 'S410', 24, 23, 'ስርክተትና የቤተሰብ ጉብኝት',
     'ወጣቱ ጥያቄን በአክብሮት መመለስና የቤተሰብን ማከበር ይለማመዳል።',
     'ከወጣት ዕድሜ ጋር የሚነሱ ጥያቄዎችና የቤተ ክርስቲያን አቀራረብ።',
     'የጥያቄ ሳጥን፣ በቡድን መልክ ውይይት፣ ጸሎት', 'የውይይት መመሪያ',
     'እያንዳንዱ ቡድን አንድን ጥያቄ ለክፍሉ ምላሽ ይሰጣል', null, 'submitted', 12)
  ) as v(tno, cc, sc, unit_no, after_days, title, obj, content, acts, mats, assess, reflect, status, review_offset)
  join public.classes c on c.code = v.cc
  join public.subjects s on s.code = v.sc
  left join public.curriculum_units u on u.subject_id = s.id
                                      and u.unit_no = ((v.unit_no - 1) % 3) + 1
 where not exists (select 1 from public.lesson_plans)
on conflict do nothing;

-- ─── materials ───────────────────────────────────────────────────────────────
insert into public.learning_materials (title_am, kind, summary_am, class_id, subject_id,
                                       unit_id, external_url, is_public, state,
                                       download_count, uploaded_by)
select v.title, v.kind, v.summary, c.id, s.id, null, v.url,
       v.pub, v.st::public.content_state, v.dl,
       (select id from who where role = v.by)
  from (values
    ('ደረጃ ፩ — የመምህር መመሪያ (የ፳፻፲፱ ዓ.ም)','note',
     'ለደረጃ ፩ ክፍሎች የተዘጋጀ በሳምንት ዐሥሥራ ስድስት ትምህርቶች ዕቅድና የንባብ ማብራሪያ።',
     'SS-L1A','S100',null,null,true,'published',128,'registrar'),
    ('የሰዓታት ማስተዋወቂያ ሰዌር','slide',
     'የስድስቱ ጸሎተ ሰዓታት ቅደም ተከተልና ትርጉም በአጭር ምሳሌ የቀረበ ሰዌር።',
     'SS-L2B','S310',null,null,true,'published',74,'editor'),
    ('መዝሙረ ዳዊት — የልጆች ድምፅ ልምምድ','audio',
     'ለደረጃ ፩ና ፪ ልጆች በኮረብ መዘመር የተለመዱ አምስት መዝሙራት ድምፅ ሞልቶ።',
     'SS-L1A','S320',null,null,true,'published',203,'editor'),
    ('ቅዳሴ በአምሳል — ለአባቶች ክፍል','video',
     'የቅዳሴውን ደረጃዎች በቪዲዮ የሚያሳይ አስተምህሮ፤ ከእያንዳንዱ ክፍል ጋር ማብራሪያ ያቀርባል።',
     'SS-ADA','S300',null,null,true,'approved',56,'editor'),
    ('የቅዱሳት ሕይወት ማጠቃለያ መጽሐፍ','book',
     'ከአብያተ ክርስቲያን ቅዱሳት መካከል ለሕፃናት የተዘጋጀ የሕይወት ትንታኔና የጸሎት ክፍለ ጽሑፍ።',
     'SS-L2A','S330',null,null,false,'draft',12,'registrar'),
    ('የመምህራን የትምህርት ዕቅድ ቅጽ','worksheet',
     'ለእያንዳንዱ ሳምንት ዕርሳስ፣ ዓላማ፣ ተግባርና ምዘና የሚይዝ ባዶ ቅጽ።',
     'SS-TCA','S400',null,null,true,'published',91,'registrar'),
    ('የወጣቶች የውይይት መመሪያ','note',
     'ለወጣቶች ክፍል በጥያቄና መልክ የሚነሱ አሥራ ሁለት ርዕሶችና የመመለሻ መንገድ።',
     'SS-YTA','S410',null,null,true,'published',47,'editor'),
    ('የአግዳዝ ንባብ ማመዛዘኛ','worksheet',
     'አንድን ጥታ በግዕዝና በአማርኛ አነቦ ልዩነቱን ለመርዳት የሚረዳ የስራ ወረቀት።',
     'SS-L3A','S210',null,null,true,'approved',23,'editor'),
    ('መንፈሳዊ ትምህርት ትዕይንት — ቅዱስ ገብርኤል','video',
     'ለቀርሳ ፈለገ ብርሐን በዕርገት ሐዋርያት ቀን የተሠነዘረ አጭር ትዕይንት።',
     null,'S220',null,null,true,'published',310,'media'),
    ('የካቲት ፲፬ — የገብረ መንፈስ ቅዱስ በዓል መግለጫ','note',
     'የበዓሉ ታሪክ፣ የሥርዓት ቅደም ተከተልና ለት/ቤት የዝግጅት ዕቅድ።',
     null,'S330',null,null,true,'published',65,'approver-content'),
    ('የመምህርነት ሥልጠና ትዕዛዝ — ማስታወሻ','link',
     'ለአዲስ መምህራን በሃያ ደቂቃ የሚሰጥ የዕርሳስና የክፍል አስተዳደር ትዕዛዝ።',
     'SS-TCA','S400',null,'https://www.orthodox.net',true,'published',18,'registrar')
  ) as v(title, kind, summary, cc, sc, unit_no, url, pub, st, dl, by)
  left join public.classes c on c.code = v.cc
  join public.subjects s on s.code = v.sc
 where not exists (select 1 from public.learning_materials)
on conflict do nothing;

-- ─── discipline ──────────────────────────────────────────────────────────────
insert into public.discipline_records (student_id, recorded_on, severity, description_am,
                                       action_am, guardian_informed, handled_by)
select ('a3000000-0000-4000-8000-00000000' || lpad(v.n::text, 4, '0'))::uuid,
       current_date - v.days_ago, v.sev, v.desc_am, v.act, v.inf,
       (select id from who where role = 'registrar')
  from (values
    (7,  21, 'note', 'በክፍል ውስጥ ከጓደኞቹ ጋር በመናገር ትምህርቱ ተሰቋርጧል።',
     'በመምህር ቃል ኪዳን ተስተካክሏል፤ ከወላጁ ጋር በስልክ ተነጋግሯል።', true),
    (14, 34, 'warning', 'በሦስት ተከታታይ እሁድ ያለ ማሳወቂያ ቀርቷል።',
     'ሁለተኛው ደብዳቤ ለወላጅ ተልኳል፤ የክፍል መምህር ተከታታይ ጉብኝት ያደርጋል።', true),
    (22, 48, 'counselling', 'ከሌሎች ልጆች ጋር በመሳተፍ ችግር ሐደ።',
     'በአባ ምክክር ተስተካክሏል፤ ለሁለት ሳምንት ተከታታይ ማስተዋል ተደርጎባል።', true),
    (31, 12, 'note', 'የተማሪው መጽሐፍ ሳይዞ ለትምህርት መጥቷል።', 'በመምህር መመሪያ ተስተካክሏል።', false),
    (5,  63, 'resolved', 'በአጋጣሚ የተፈጠረ የእርስ በርስ ግጭት።',
     'በሁለቱ ልጆች ቅሳኔና በወላጅ ማረጋገጫ ተዘግቷል።', true),
    (40,  6, 'suspension', 'በቤተ ክርስቲያን ውስጥ ያለ ፍቃድ በመሮጥ የሥርዓት መሻበሽ',
     'ለአንድ እሁድ ከክፍል ተሰናብቶ በቤተሰብ ምክክር ላይ ተመድቧል።', true)
  ) as v(n, days_ago, sev, desc_am, act, inf)
 where not exists (select 1 from public.discipline_records)
on conflict do nothing;

-- ─── ID cards ────────────────────────────────────────────────────────────────
insert into public.student_id_cards (student_id, serial, issued_on, expires_on, qr_payload,
                                     card_design, printed_by, printed_at)
select en.student_id,
       'TK-CARD-' || lpad(row_number() over (order by sp.student_code)::text, 4, '0'),
       current_date - 40, current_date + 325,
       'tekleteoflos:' || sp.student_code || ':' || md5(sp.id::text),
       jsonb_build_object('template', 'default', 'level', sp.level_key, 'year', '፳፻፲፱ ሥ.ዓ'),
       (select id from who where role = 'registrar'), now() - interval '38 days'
  from public.student_enrollments en
  join public.student_profiles sp on sp.id = en.student_id
 where en.status = 'enrolled'
   and not exists (select 1 from public.student_id_cards)
on conflict (serial) do nothing;

-- ─── certificates ────────────────────────────────────────────────────────────
-- The teacher-training class finished its year, so the completion certificates
-- are already printed and the public verification screen has records to find.
insert into public.issued_certificates (certificate_no, verification_code, student_id,
                                        template_id, title_am, issued_on, academic_year_id,
                                        class_id, render_snapshot, verified_at, issued_by)
select 'CERT-2019-' || lpad(row_number() over (order by sp.student_code)::text, 4, '0'),
       upper(substr(md5(sp.id::text || 'certificate'), 1, 10)),
       sp.id, t.id,
       'የመምህራን ትምህርት ማጠናቀቂያ ሰርተፍኬት — ' || sp.full_name_am,
       current_date - 20, cfg.year_id, c.id,
       jsonb_build_object('student', sp.full_name_am, 'class', c.name_am,
                          'year', '፳፻፲፱ ሥ.ዓ', 'date', (current_date - 20)::text),
       now() - interval '12 days',
       (select id from who where role = 'registrar')
  from public.student_enrollments en
  join public.student_profiles sp on sp.id = en.student_id
  join public.classes c on c.id = en.class_id
  cross join cfg
  cross join (select id from public.certificate_templates where kind = 'completion' limit 1) t
 where en.status = 'enrolled' and c.code = 'SS-TCA'
on conflict (certificate_no) do nothing;

-- ─── promotion ───────────────────────────────────────────────────────────────
-- One approved batch ready to execute (ደረጃ ፪ → ፫) and one still being drafted,
-- with each decision driven by the exam average and the attendance the roll call
-- already recorded.
insert into public.promotion_batches (id, title_am, from_year_id, to_year_id, from_level_id,
                                      to_level_id, criteria, status, decided_by, created_by, executed_at)
select 'a6000000-0000-4000-8000-000000000001',
       'የ፳፻፲፱ ዓ.ም — ደረጃ ፪ ወደ ደረጃ ፫', cfg.year_id, cfg.year_id,
       (select id from public.class_levels where key = 'l2'),
       (select id from public.class_levels where key = 'l3'),
       '{"min_percent": 60, "max_absence_pct": 25}'::jsonb, 'approved',
       (select id from who where role = 'registrar'),
       (select id from who where role = 'registrar'), null
  from cfg
on conflict do nothing;

insert into public.promotion_batches (id, title_am, from_year_id, to_year_id, from_level_id,
                                      to_level_id, criteria, status, created_by)
select 'a6000000-0000-4000-8000-000000000002',
       'የ፳፻፲፱ ዓ.ም — የወጣቶች ክፍል ወደ አባቶችና እመቤቶች', cfg.year_id, cfg.year_id,
       (select id from public.class_levels where key = 'youth'),
       (select id from public.class_levels where key = 'adult'),
       '{"min_percent": 55, "max_absence_pct": 30}'::jsonb, 'draft',
       (select id from who where role = 'registrar')
  from cfg
on conflict do nothing;

-- Averages come from the results the exams already hold; attendance from the
-- roll call, so the promotion screen agrees with the reports screen.
with scored as (
  select en.student_id,
         avg(r.percent) filter (where r.status in ('graded','released')) as avg_percent,
         count(*) filter (where r.id is not null) as results
    from public.student_enrollments en
    join public.exams e on e.class_id = en.class_id
    left join public.exam_results r on r.exam_id = e.id and r.student_id = en.student_id
   where en.status = 'enrolled'
   group by en.student_id
),
attended as (
  select en.student_id,
         round(100.0 * count(*) filter (where a.status in ('present','late')) / nullif(count(*), 0), 2) as att_pct
    from public.student_enrollments en
    join public.attendance_sessions s on s.class_id = en.class_id
    join public.attendance_records a on a.session_id = s.id and a.student_id = en.student_id
   where en.status = 'enrolled'
   group by en.student_id
)
insert into public.promotion_items (batch_id, student_id, from_class_id, to_class_id,
                                   average_percent, attendance_percent, decision, note_am)
select 'a6000000-0000-4000-8000-000000000001', en.student_id, en.class_id,
       (select tc.id from public.classes tc
         join public.class_levels tl on tl.id = tc.level_id
        where tl.key = 'l3' limit 1),
       round(coalesce(s.avg_percent, 0), 2), coalesce(att.att_pct, 100),
       case when coalesce(s.avg_percent, 0) >= 60 and coalesce(att.att_pct, 100) >= 75 then 'promote'
            when coalesce(s.avg_percent, 0) >= 60 then 'hold'
            else 'repeat' end,
       case when coalesce(s.avg_percent, 0) >= 60 and coalesce(att.att_pct, 100) >= 75
                 then 'ወደ ደረጃ ፫ ይሻገራል፤ የፍተሻና የመገኘት ሁኔታው ተሟልቷል።'
            when coalesce(s.avg_percent, 0) >= 60
                 then 'ውጤቱ ቢያንስ ደረጃውን ቢሟላም መገኘቱ አልተሟላም — ወላጅ ማረጋገጫ ይጠበቃል።'
            else 'የፍተሻ ውጤቱ ከገደቡ በታች ስለሆነ ደረጃውን ይደግማል።' end
  from public.student_enrollments en
  join public.student_profiles sp on sp.id = en.student_id
  join public.class_levels l on l.id = (select level_id from public.classes where id = en.class_id)
  left join scored s on s.student_id = en.student_id
  left join attended att on att.student_id = en.student_id
 where en.status = 'enrolled' and l.key = 'l2'
on conflict (batch_id, student_id) do nothing;

insert into public.promotion_items (batch_id, student_id, from_class_id, to_class_id, decision)
select 'a6000000-0000-4000-8000-000000000002', en.student_id, en.class_id,
       (select tc.id from public.classes tc
         join public.class_levels tl on tl.id = tc.level_id
        where tl.key = 'adult' limit 1),
       'pending'
  from public.student_enrollments en
  join public.class_levels l on l.id = (select level_id from public.classes where id = en.class_id)
 where en.status = 'enrolled' and l.key = 'youth'
on conflict (batch_id, student_id) do nothing;

commit;
