-- 04 · Public website content
-- The rows the 22 public pages read: news, events, sermons, mezmur, publications,
-- gallery albums, spiritual leadership, FAQs and the org-structure chart.
--
-- Everything here is additive and keyed (fixed ids, unique slugs, `on conflict do
-- nothing`), so re-running the seed against the live project never duplicates or
-- overwrites what an editor has since changed.
--
-- Applied with:  supabase db query --linked -f supabase/seed/04_site_content.sql

begin;

-- The seed files are applied one after another in a single session when they are
-- checked locally, and 02_classes.sql leaves its own lookups behind.
drop table if exists who, dept, seed_storage, demo_media, album_photo, org_seed;

-- The public views expose `media_files.public_url` verbatim, so the object is
-- addressed by its full storage URL here. One line to change if the project moves.
create temporary table seed_storage(origin text);
insert into seed_storage values
  ('https://zfeffrriruoflozdsloz.supabase.co/storage/v1/object/public/media');

-- The demo sign-ins, by the local part of their email. 01_people.sql created the
-- profile rows; content written by a named person is what makes the CMS screens
-- (my drafts, pending review) show something real.
create temporary table who as
select p.id, split_part(p.email, '@', 1) as role
  from public.profiles p
 where p.email like '%@tekleteoflos.demo';

create temporary table dept as
select d.id, d.slug from public.departments d;

-- ─── media categories ────────────────────────────────────────────────────────
insert into public.media_categories (id, name_am, slug, group_name, is_public, sort_order)
values
  ('ab100000-0000-4000-8000-000000000001', 'የድረ ገጽ ሥዕሎች',   'site-photos',     'site',       true, 10),
  ('ab100000-0000-4000-8000-000000000002', 'የመሸፈኛ ምስሎች',     'site-covers',     'site',       true, 20),
  ('ab100000-0000-4000-8000-000000000003', 'የቤተ ክርስቲያን ምልክት', 'branding',        'site',       true, 30),
  ('ab100000-0000-4000-8000-000000000004', 'የድምጽ ቅዳሜ',       'audio',           'site',       true, 40),
  ('ab100000-0000-4000-8000-000000000005', 'ቪዲዮ',             'video',           'site',       true, 50),
  ('ab100000-0000-4000-8000-000000000006', 'ሰነዶችና ጽሑፎች',     'documents',       'site',       true, 60),
  ('ab100000-0000-4000-8000-000000000007', 'የትምህርት ማሳያዎች',    'lesson-material', 'academic',   true, 70),
  ('ab100000-0000-4000-8000-000000000008', 'የተማሪ ሰነዶች',      'student-records', 'academic',   false, 80),
  ('ab100000-0000-4000-8000-000000000009', 'የሂሳብ ማስረጃዎች',     'finance-evidence','finance',    false, 90),
  ('ab100000-0000-4000-8000-000000000010', 'የቤተ ክርስቲያን ንብረት',  'asset-photos',    'operations', true, 110)
on conflict (slug) do nothing;

-- ─── demo photographs ────────────────────────────────────────────────────────
-- Declared once so the news, album and leadership sections below can point at
-- them by key instead of repeating a uuid.
create temporary table demo_media (
  key        text,
  id         uuid,
  path       text,
  title_am   text,
  caption_am text,
  alt_am     text,
  width      integer,
  height     integer,
  byte_size  bigint,
  category   text,
  tags       text
);

-- width/height/byte_size are the true values of the photo that
-- scripts/upload-demo-media.mjs puts at that path, so the media library and the
-- storage report read the same numbers the uploaded object has.
insert into demo_media (key, id, path, title_am, caption_am, alt_am, width, height, byte_size, category, tags) values
  ('church',    'ab200000-0000-4000-8000-000000000001', 'demo/church-exterior.jpg',
   'የቅድስት ልደታ ለማርያም ቤተ ክርስቲያን', 'በቀርሳ ፈለገ ብርሐን የሚገኝ የቤተ ክርስቲያኑ ግቢና የዕምራ ማዕከል።',
   'ከፀሐይ ግራ ተኩል የቆመ የዕምራ ጣሪያ ያለው የቤተ ክርስቲያን ግቢ፤ ፊቱ ላይ የሐዋርያት ሥዕል ታይቷል።',
   1920, 1440, 984622, 'site-photos', '{ቤተ ክርስቲያን,ግቢ,አዲስ አበባ}'),
  ('worship',   'ab200000-0000-4000-8000-000000000002', 'demo/worship-liturgy.jpg',
   'የዕገታና የሥርዓተ ኣምልኮ አገልግሎት', 'በቅዳሴ ጸሎት ወቅት የቆሙ አባቶችና እመቤቶች፤ ዕገታ በእጅ ሲዘፈን ታይቷል።',
   'በቤተ ክርስቲያን ውስጥ ነጭ ልብስ ለብሰው ዕገታ የሚዘፍኑ እና የሚጸልዩ ማኅበረ ሐዋርያት።',
   1920, 1080, 662614, 'site-photos', '{ዕገታ,ሥርዓተ ኣምልኮ,ጸሎት}'),
  ('class',     'ab200000-0000-4000-8000-000000000003', 'demo/sunday-school-class.jpg',
   'የሰንበት ትምህርት ክፍል', 'ደረጃ ፪ ተማሪዎች መምህራቸውን ሲያዳምጡ፤ በጭብጥ የቅዱሳት ሕይወት ትምህርት ይያዛል።',
   'በትምህርት ክፍል ውስጥ በወንበር ተቀምጠው መጽሐፍ ቅዱስና የተማሪ መጻሕፍት የያዙ ሕፃናት።',
   1920, 1440, 584173, 'site-photos', '{ሰንበት ትምህርት ቤት,ትምህርት,ሕፃናት}'),
  ('choir',     'ab200000-0000-4000-8000-000000000004', 'demo/choir-rehearsal.jpg',
   'የኮረብ ቡድን ልምምድ', 'የመዝሙር ክፍል ታዳሚዎች በአንድ ላይ ሲዘፍኑ፤ አመራሩ የዋዜማ ደጃፍ ላይ ቆሟል።',
   'በሁለት ደረጃ ተሰልፈው መዝሙር የሚዘፍኑ ወጣቶች፤ ፊታቸው ላይ ዋዜማና ክብር አለ።',
   974, 800, 203977, 'site-photos', '{መዝሙር,ኮረብ,ልምምድ}'),
  ('kebero',    'ab200000-0000-4000-8000-000000000005', 'demo/kebero-drums.jpg',
   'ከበሮና ዋዜማ', 'የኮረብ ቡድኑ የመሣል አገልግሎት፤ በየጎን ሁለት ከበሮ ተጭነው ይጫወታሉ።',
   'ቀይና ወርቃማ ልብስ የለበሱ መኮርብ ከበሮና ዋዜማ ይዘው ሲዘፍኑ ታይተዋል።',
   1920, 1080, 683161, 'site-photos', '{ከበሮ,ዋዜማ,መሣል}'),
  ('feast',     'ab200000-0000-4000-8000-000000000006', 'demo/feast-procession.jpg',
   'የቅዱስ ገብርኤል በዓል ሥርዐተ ልታኒ', 'በበዓሉ ጠዋት ዕገታና ታቦት ማንቃት የተደረገ ሥርዓት፤ ሕዝቡ በግቢው ዙሪያ ተሰልፏል።',
   'ንጉሠ ነገሥትና ታቦት የያዙ ያበሰሉ ሽማግሌዎች መሐልዮችን አንስተው የሚነኩበት የበዓል ሐዋርያት ሥርዓት።',
   1500, 1005, 314697, 'site-covers', '{በዓል,ሥርዐተ ልታኒ,ቅዱስ ገብርኤል}'),
  ('baptism',   'ab200000-0000-4000-8000-000000000007', 'demo/baptism-ceremony.jpg',
   'የጥመቀ ሥርዓት', 'በካህናት የተሠለፈ ጥመቀ፤ ቤተ ሰቡና የትምህርት ቤቱ አመራር ተገኝተዋል።',
   'በጥመቀ እንቁ ላይ የተወጠነ ልጅና በዙሪያው የቆሙ ነጭ ልብስ የለበሱ ካህናትና ማኅበረ ሐዋርያት።',
   1500, 1005, 314697, 'site-photos', '{ጥመቀ,ሥርዓት,እምነት}'),
  ('outreach',  'ab200000-0000-4000-8000-000000000008', 'demo/community-outreach.jpg',
   'የማህበራዊ ዕርዳታ ሥራ', 'ለቸገሪ ቤተ ሰቦች የወረቀትና የምግብ ዕርዳታ የተደረገበት ቀን፤ የወጣቶች ቡድን አገልግሎቱን ተሽጟል።',
   'ጥሬ እቃ የሞሉ ከረጢትና ሻካራ በግቢው ወለል ላይ ተደርድረው ሲሰጡ ታይቷል።',
   974, 800, 203977, 'site-photos', '{ዕርዳታ,ማህበራዊ ጉዳይ,ለጋሽ}'),
  ('youth',     'ab200000-0000-4000-8000-000000000009', 'demo/youth-fellowship.jpg',
   'የወጣቶች ማህበር ሥርጭት', 'በወጣቶች ክፍል የተዘጋጀ የወንጌል ሥርጭትና የጋራ ጸሎት ሥርዓት።',
   'በጨረቃ ብራና የታጠፉ ወጣቶች ዙሪያን ጠግነው ጸሎትና መዝሙር ሲያደርጉ ታይተዋል።',
   1920, 1080, 683161, 'site-photos', '{ወጣቶች,ወንጌል,ማህበር}'),
  ('library',   'ab200000-0000-4000-8000-000000000010', 'demo/church-library.jpg',
   'የመጻሕፍት ማዕከል', 'የአባቶች ትንሣኤና የቤተ ክርስቲያን ታሪክ መጻሕፍት የተደረዙበት የማንበብያ ክፍል።',
   'ከመሬት እስከ ጣሪያ መጻሕፍት የተደረዙ የእንጨት መከማቻዎችና በጠራቀሙ ላይ ሥራ የሚሰሩ ተማሪዎች።',
   1920, 2088, 765387, 'site-photos', '{መጻሕፍት,ማዕከል,ማንበብ}'),
  ('graduation','ab200000-0000-4000-8000-000000000011', 'demo/teacher-graduation.jpg',
   'የመምህራን ሥነ ሥርዓት', 'የመምህራን ትምህርት ደረጃ ያጠናቀቁ ተማሪዎች ምስክር ወረቀት የተሰጡበት ሥነ ሥርዓት።',
   'ሐምራዊ ልብስ የለበሱ መምህራን ምስክር ወረቀት ይዘው ሲሳላ ታይተዋል፤ ኃላፊዎች በደረጃ ቆመው ባኑዋል።',
   1920, 1278, 531119, 'site-covers', '{መምህራን,ምስክር,ሥነ ሥርዓት}'),
  ('mural',     'ab200000-0000-4000-8000-000000000012', 'demo/church-mural.jpg',
   'የቤተ ክርስቲያን ሥዕል', 'በግቢው ግድግዳ ላይ የቅዱስ ገብርኤልና የቅድስት ማርያም ሥዕል።',
   'በቀለም የተሳለ የቅዱስ ገብርኤል ሥዕል፤ በእጁ መስቀልና የዕገታ ቅጠል ይታያል።',
   1920, 1276, 1009691, 'site-photos', '{ሥዕል,ግድግዳ,ቅዱስ ገብርኤል}');

insert into public.media_files (id, bucket, storage_path, name, title_am, caption_am, alt_am,
                               kind, mime_type, width, height, byte_size, public_url,
                               category_id, tags, state, is_public)
select m.id, 'media', m.path, split_part(m.path, '/', 2), m.title_am, m.caption_am, m.alt_am,
       'image', 'image/jpeg', m.width, m.height, m.byte_size,
       b.origin || '/' || m.path,
       c.id, m.tags::text[], 'published', true
  from demo_media m
  cross join seed_storage b
  left join public.media_categories c on c.slug = m.category
on conflict (bucket, storage_path) do nothing;

-- ─── news ────────────────────────────────────────────────────────────────────
-- The newest rows are what the homepage `news` block reads, so they are dated
-- within the last month. `author_id` and `created_by` point at a real demo sign-in
-- so the CMS "my drafts" and approval-queue screens have something to show.
insert into public.news (slug, title_am, summary_am, body_am, category_am, tags,
                         cover_media_id, author_id, state, is_featured,
                         published_at, views, submitted_at, reviewed_by, created_by)
select v.slug, v.title_am, v.summary_am, v.body_am, v.category_am, v.tags::text[],
       dm.id, a.id, v.state::public.content_state, v.featured,
       case when v.state = 'published' then now() - (v.age_days * interval '1 day') end,
       v.views,
       case when v.state <> 'draft' then now() - (v.age_days * interval '1 day') - interval '6 hours' end,
       case when v.state = 'published' then ap.id end,
       a.id
  from (values
    ('theophany-season-opening',
     'ዘጠኝ የትምህርት ደረጃዎች በአዲሱ ዓመት ተከፍተዋል',
     'በተክለቴዎፍሎስ ሰንበት ት/ቤት ደረጃ ፩ እስከ የመምህራን ዝግጅት ያሉ ክፍሎች በዕርሳስ ዝግጅትና በወላጆች መገኘት ተከፍተዋል።',
     E'ት/ቤቱ በአዲሱ የትምህርት ዓመት ደረጃ ፩ እስከ የመምህራን ትምህርት ያሉ ዘጠኝ ክፍሎችን በክፍል ዝግጅት አከፍቷል። በመክፈቻው ቀን ለተማሪዎች የዕርሳስ መጻሕፍት፣ ለመምህራን የትምህርት ዕቅድና የመከታተያ መጻሕፍት ተዘጋጅቶ ከፍቷል።\n'
     ||'ክፍሉን የካህናት ቆንስልና የመንፈሳዊ አመራር ተወካይ ባዘጋጀው መልእክት ሲከፈት፣ ወላጆች የልጆቻቸውን የክፍል መርሐ ግብርና የምዘና መንገድ በዝርዝር ተስሟውል። ት/ቤቱ በየወሩ የወላጅ ስብሰባ አካሂዶ የተማሪውን እድገት በጋራ እንደሚከታተል ተገልጧል።',
     'ትምህርት', '{ሰንበት ትምህርት ቤት,ምዝገባ,ደረጃ}', 'class', 'published', true, 2, 486),
    ('choir-annual-concert',
     'የዕገታና የኮረብ ቡድኖች ዓመታዊ የመዝሙር ሥርዓት ተካሄደ',
     'በመዝሙር ክፍል የተዘጋጀና በአራት ኮረብ ቡድኖች የቀረበ ሰፊ የመዝሙር አገልግሎት ሕዝብ ተከታትሏል።',
     E'ከሐምሌ ጀምሮ በየሐዳሪው ልምምድ የተዘጋጀው ሥርዓት በእሁዱ ከሰዓት በዋናው አዳራሽ ተቅርቧል። የሕፃናት፣ የወጣቶች፣ የመካከለኛው ትውልድና የሽማግሌዎች ቡድኖች በአጠቃላይ ሐምሳ ዘጠኝ መዝሙሮችን በዕገታ፣ በዋዜማና በክብር አቅርበዋል።\n'
     ||'በሥርዓቱ መዝሙረ ዳዊት፣ የአባቶች ዕገታና ለበዓሉ የተዘጋጁ አዳሴ መዝሙሮች ተዘምረዋል፤ የተገኙ አባቶችና እመቤቶች አገልግሎቱን በጋራ መዝሙር ተቀብለዋል። የክፍሉ ኃላፊ ለዕገታ ተማሪዎችና ለተለጋሾች ሐሳብ አቅርቧል።',
     'መዝሙር', '{መዝሙር,ኮረብ,ዕገታ}', 'choir', 'published', true, 6, 731),
    ('social-affairs-food-support',
     'ለመኅላ ሁለት መቶ ቤተ ሰቦች የወርሃ ዕርዳታ ሥርዓት ተሰጥቷል',
     'የማህበራዊ ጉዳይ ክፍል በአባቶችና በእመቤቶች ልገሳ የተዘጋጀ የምግብና የትምህርት እቃ ዕርዳታ አቅርቧል።',
     E'በየወሩ በተለየ ቀን የሚሰጠው ዕርዳታ ለዚህ ወር ለመኅላ ሁለት መቶ ቤተ ሰቦች ደርሷል። በእያንዳንዱ ከረጢት ውስጥ ስንዴ፣ በዘይት፣ ምስርና ለልጆች የትምህርት እቃ ተዘጋጅቷል።\n'
     ||'ዕርዳታው የተከናወነው በመምህራንና በወጣቶች ቡድን በተመዘገበ የቤተ ሰብ ጉብኝት መሠረት ነው፤ በጉብኝቱ ወቅት የቤተ ሰቡን ጤናና የልጆችትምህርት ሁኔታ ጠይቀው በጸሎትና በምክር ተደግፈዋል። ክፍሉ ለተጨማሪ ቤተ ሰቦች ዝርዝሩን ክፍት ማድረጉን አስታውቋል።',
     'ማህበራዊ', '{ዕርዳታ,ጉብኝት,ለጋሽ}', 'outreach', 'published', true, 11, 612),
    ('teachers-training-graduation',
     'ዘጠኝ መምህራን የመምህርነት ደረጃ አጠናቅቀው በክፍል ተሰይመዋል',
     'ከየሁለቱ ዓመት የመምህራን ዝግጅት ደረጃ የተመረቁ ተማሪዎች ምስክር ወረቀት ተሰጥቷቸዋል፤ ስምንት ክፍሎች በእገዳ ተሟልተዋል።',
     E'የመምህራን ዝግጅት ደረጃ የገቡ ተማሪዎች በሁለት ዓመት ውስጥ የትምህርተ ሐሳብ አዘገጃጀት፣ የክፍል አስተዳደር፣ የቅዱሳት መጻሕፍት ትንተናና የአባቶች ትንሣኤ ጥናት ተከታትለዋል። በመጨረሻው ወር የተገምገሙት በተግባር የክፍል አስተዳደርና በማጠናቀሪያ ጽሑፍ ነው።\n'
     ||'የተመረቁት መምህራን በሕፃናትና በወጣቶች ክፍሎች፣ በመዝሙር ትምህርትና በተማሪ ምዘና ሥራ ተሰይመዋል። ት/ቤቱ በየወሩ የመምህራን ስብሰባና የጋራ ዕርሳስ ዝግጅት እያካሄደ መከታተሉን እንደሚቀጥል ተገልጧል።',
     'ትምህርት', '{መምህራን,ሥልጠና,ምስክር}', 'graduation', 'published', true, 18, 803),
    ('festival-of-archangel-gabriel',
     'የአቡነ ገብርኤል በዓል በሦስት ቀን ሥርዓትና በማኅበረ ሐዋርያት ተከብሮ ወደፊት',
     'በቤተ ክርስቲያኗ ስም የሚከበረው ዕለት በጸሎተ ሰዓት፣ በዕገታና በማኅበረ ሐዋርያት የጋራ አገልግሎት ተከብሮ ወደፊት።',
     E'በቅዱስ ገብርኤል በዓል በሦስት ቀን የተከናወነው ሥርዓት በሌሊት ጸሎተ ሰዓትና በዕገታ ጀምሮ፣ በቀኑ ማኅበረ ሐዋርያት በቤተ ክርስቲያኑ ዙሪያ ተሰልፈው ታቦት አንስተው ይነኩ፤ ከጸሎተ ሰዓት በኋላ ለማኅበረ ሐዋርያት የበዓል መልእክትና የጋራ ምግብ አገልግሎት ቀርቧል።\n'
     ||'ት/ቤቱ ለበዓሉ የዘጋጀውን የተማሪ ዕገታና የዕገታ ሥዕል ማሳያ በማህበራዊ ጉዳይ ክፍል ተቋቁሞ ለጎረቤቶች ዕርዳታ ዕድል ከፍቷል። በዕለቱ ለመኅላ መንፈሳውያንና ለአንስተኛ ቤተ ሰቦች ዕርዳታ እንደተሰጠ ተገልጧል።',
     'በዓል', '{በዓል,ቅዱስ ገብርኤል,ሥርዓት}', 'feast', 'published', true, 24, 964),
    ('ordination-of-three-deacons',
     'ሦስት ወጣቶች በዕገታና በአገልግሎት ዲቅነት ተሾሙ',
     'በቤተ ክርስቲያኑ ካህናት ቆንስል የተሾሙ ወጣቶች በሰንበት ት/ቤትና በመዝሙር ክፍል አገልግሎት ተመድበዋል።',
     E'በጾመ ነነዕና በተከታዩ ሐዳር ጸሎት የተሾሙት ሦስቱ ወጣቶች በዋናው ዕገታ ማዕከል፣ በሕፃናት የመዝሙር ትምህርትና በማህበራዊ ጉዳይ ሥራ ተመድበዋል። የሽምጥናና የመምህርነት ዝግጅት ለአራት ዐሥራ አራት ወራት ቀጥሏል።\n'
     ||'ካህናቱ በመሰየሚያ መልእክቱ የአገልግሎቱ የመጻሕፍት መሠረትና የቤተ ክርስቲያኑን ሥርዓት ጥበቃ የመሆን ግዴታ አስታውቋል። ት/ቤቱ አዲሶቹን አገልግሎተ ሐዋርያት በመማረክና በመዝሙር ደግፍ እንደሚቀበል ተናግሯል።',
     'መንፈሳዊ', '{ዲቅነት,አገልግሎት,ወጣቶች}', 'worship', 'published', false, 31, 540),
    ('media-archive-online',
     'ቅዳሴና ክስተት በድምጽ፦ ያለፉት ሃያ አራት የቃረን ማህደር በድረ ገጹ ቀርቧል',
     'የሚዲያ ክፍል ባዘጋጀው ማህደር ከዚህ በፊት የቀረቡ ንግዶችና የሥርዓት ክስተቶች በድምጽ ታምነው ይገኛሉ።',
     E'የቃረን ማህደሩ በየሰዓቱ የተዘጋጀ ድምጽ፣ የንብዕት ርዕስና የመጻሕፍት ትንሣኤ መረጃ ተያይዞ ቀርቧል። ተከታዮች በርዕስ፣ በመምጫና በወር ማጣሪያ የሚፈልጉትን በቀላሉ ያገኛሉ።\n'
     ||'ክፍሉ የሚመጡ አገልግሎቶችንና የሕዝብ ጠያቂዎችን በማሳወቂያ መልእክት ለመከታተል አማራጭ ከፍቷል። የማህደሩ ዕርገት የቀጠለ ሲሆን ያለፉት ማዕከላዊ ክስተቶች በደረጃ እየተዘጋጁ ለሕዝብ እንደሚቀርቡ ተገልጧል።',
     'ሚዲያ', '{ቃረን,ማህደር,ድምጽ}', 'library', 'published', false, 38, 388),
    ('new-classrooms-handed-over',
     'ሰባት የትምህርት ክፍሎችና የመጻሕፍት ማዕከል ግንባታ ተጠናቅቆ ለተማሪዎች ተረክቧል',
     'በልጋሽና በቤተ ሰቦች እገዳ የተሠሩ አዲስ ክፍሎች በአዲሱ ዓመት ገጽታ ለትምህርት ተዘጋጅተዋል።',
     E'ከዓመት በፊት የተጀመረው ግንባታ ሰባት ሰፊ ክፍሎች፣ የመምህራን መኰነንያ ክፍልና ለማንበብያ የሚያገለግል መጻሕፍት ማዕከል ያካትታል። በእያንዳንዱ ክፍል ውስጥ የመምሪያ ሰሌዳ፣ የማጫወቻ መሣሪያና በቂ ወንበር ተዘጋጅቷል።\n'
     ||'የግንባታው ወጪ በሕዝብና በተለጋሾች ልገሳ የተሸፈነ ሲሆን የቤተ ሰብ እገዳና የቅርብ ማህበረሰብ ተሳትፎ ማስታወሻ ቀርቷል። ት/ቤቱ ክፍሎቹ ከትምህርት በተጨማሪ በማህበራዊ ሥራና በመምህራን ሥልጠና እንደሚያገለግሉ አስታውቋል።',
     'ማህበራዊ', '{ግንባታ,ክፍሎች,ልገሳ}', 'church', 'published', false, 45, 452)
  ) as v(slug, title_am, summary_am, body_am, category_am, tags, media_key, state, featured, age_days, views)
  left join demo_media dm on dm.key = v.media_key
  join who a on a.role = 'editor'
  join who ap on ap.role = 'approver-content'
on conflict (slug) do nothing;

-- A second batch from the other writers, including one row still in the approval
-- queue and one draft — the states the CMS workflow screens filter on.
insert into public.news (slug, title_am, summary_am, body_am, category_am, tags,
                         cover_media_id, author_id, state, is_featured,
                         published_at, views, submitted_at, created_by)
select v.slug, v.title_am, v.summary_am, v.body_am, v.category_am, v.tags::text[],
       dm.id, a.id, v.state::public.content_state, v.featured,
       case when v.state = 'published' then now() - (v.age_days * interval '1 day') end,
       v.views,
       case when v.state <> 'draft' then now() - (v.age_days * interval '1 day') - interval '5 hours' end,
       a.id
  from (values
    ('youth-evangelism-trip',
     'የወጣቶች ክፍል ወንጌል ማስረጃና የቤተ ሰብ ጉብኝት ቀጠሮ አካሂዷል',
     'በወጣቶች ክፍል የተዘጋጀ ቀጠሮ የመንፈስ ጉዞና የቤተ ሰብ ጉብኝት ያካትታል።',
     E'የወጣቶች ቡድን በሐውልትና በተመጣጣኝ ርቀት ባሉ አካባቢዎች ለአርባ ስድስት ቤተ ሰቦች ጉብኝት አድርጿል። በጉብኝቱ የተማሪዎችና የቤተ ሰቦች ጉዳይ ተደራሽ ሲሆን ቤተ ሰቦች በምግብና በለብስ ተደግፈዋል።\n'
     ||'ተመላሽ ወጣቶች በጉዞው የተማሩትን በጋራ መዝሙርና በጸሎት አገልግሎት አከብረዋል፤ ለአዳዲስ ተማሪዎች የመጽሐፍ ቅዱስ ጥናት ክፍል ተጀምሮ ወደፊት። ክፍሉ በየወሩ ዝግጅት እያዘጋጀ መሆኑን አስታውቋል።',
     'መንፈሳዊ', '{ወጣቶች,ወንጌል,ጉብኝት}', 'youth', 'published', false, 52, 274),
    ('adults-bible-study-launch',
     'የአባቶችና የእመቤቶች ዙር የመጽሐፍ ቅዱስ ጥናት በጥልቅ ትንሣኤ ተጀምሮ',
     'በአዲሱ ዓመት የአባቶችና የእመቤቶች ክፍል የአባቶች ትንሣኤና የሥርዓተ ኣምልኮ ጥናት ዕርሳስ ሰፍቷል።',
     E'በየሰንበቱ የሚያዝ ጥናት ከዕርሳስና ከአባቶች ትንሣኤ ተወስዶ በማብራሪያና በክፍለ ጊዜ ውይይት ይከተላል፤ ተሳታፊዎች የቤተሰብና የሥርዓት ጥያቄዎችን በቀጥታ ለመምህር ያቀርባሉ።\n'
     ||'ክፍሉ ለአዳዲስ የቤተሰብ አባላትና ለተመለሱ ቤተ ሰቦች በየወሩ የማሳወቂያ ዕድል ከፍቷል። የመምህራን ቡድኑ ወርሃዊ የትምህርት ዕቅድና የማጠናቀሪያ ጥያቄ አዘጋጅቶ ለተሳታፊዎች አቅርቧል።',
     'ትምህርት', '{አባቶች,ጥናት,መጽሐፍ ቅዱስ}', 'mural', 'published', false, 59, 198),
    ('children-hymn-competition',
     'የሕፃናት የመዝሙር ውድድር ውጤትና ለተሸልሚዎች ማሳያ ቀርቷል',
     'በሕፃናትና በወጣቶች ደረጃ በተደረገ የመዝሙር ውድድር የተመረጡ ቡድኖችና ደጋፊዎች ተሰይመዋል።',
     E'በሦስት ደረጃ የተካሄደ ውድድር እያንዳንዱ ቡድን ከዝግጅትና ከትርጓሜ አንጻር በመምህራን ታይቶ ውጤቱ በሥርዓት ተገልጧል። ተሸልሚዎች መጻሕፍትና የመዝሙር መሣሪያ ተሰጥቷቸዋል።\n'
     ||'ውድድሩ ለልጆች የመዝሙር ፍቅርና የቡድን አሠራር ልምድ የሚያድግበት እድል ሰጥቷል፤ ወላጆችና መምህራን በመከታተያ ተሳትፈዋል። ት/ቤቱ ውድድሩን በየዓመቱ በተሻለ ደረጃ እንደሚያካሂድ ተናግሯል።',
     'ክስተት', '{ሕፃናት,መዝሙር,ውድድር}', 'kebero', 'published', false, 66, 236),
    ('donation-report-first-half',
     'የመጀመሪያው ግማህ ዓመት የልገሳና የወጪ ሒሳቅ ለጉባኤ ቀርቶ ጸድቋል',
     'በት/ቤቱ የሒሳብ ክፍል የተዘጋጀው ወርሃዊ ሒሳቅ ለመምህራንና ለአመራር ቀርቶ ማረጋገጫ ሰጥቷል።',
     E'በግማሽ ዓመቱ የተሰበሰበ ልገሳ በትምህርት፣ በግንባታ፣ በማህበራዊ ዕርዳታና በመዝሙር አገልግሎት መሠረት ሲከፋፈል፣ በእያንዳንዱ ዘርፍ የተወጣው ወጪ በደረሰኝ ተጠብቆ ቀርቧል።\n'
     ||'ጉባኤው ሒሳቁን በማጽደቅ ለሁለተኛው ግማህ የበጀት ዕቅድ ማሻሻያ አቅርቧል። ት/ቤቱ ሒሳቁን በየሦስት ወሩ ለተለጋሾችና ለማኅበረ ሐዋርያት ማካፈል እንደሚቀጥል ተገልጧል።',
     'ሒሳብ', '{ልገሳ,ሒሳብ,ጉባኤ}', null, 'published', false, 73, 173),
    ('volunteer-intake-open',
     'ለወርሃው የማህበራዊ ሥራና የመዝሙር ክፍሎች ተግባሪ ማመልከቻ ክፍት ሆኗል',
     'በት/ቤቱ አራት ዘርፎች ለመሳተፍ የሚያስችል ማመልከቻ በድረ ገጹና በግቢው መዝገብ ተከፍቷል።',
     E'የመዝሙር፣ የማህበራዊ ጉዳይ፣ የሚዲያና የወንጌል ስርጭት ክፍሎች ለአዲሶች ተግባሪዎች በሚዘጋጁት የአገልግሎት ዕቅድ መሠረት ማመልከቻ ይቀበላሉ። ተደራሽ የሆኑት በክፍሉ ኃላፊና በመንፈሳዊ አመራር ታይተው የምልከታ ውሳኔ ይደረግባቸዋል።\n'
     ||'ማመልከቻው የሚጠይቀው አገልግሎት ለማገዝ ያለውን ችሎታ፣ የሳምንት ሰዓትና የቤተሰብ ሁኔታ ብቻ ነው፤ ተቀባይነት የተሰጣቸው በየወሩ በሚሰጥ መመሪያና በአገልግሎት ልምምድ ይካተታሉ።',
     'አገልግሎት', '{ተገባሪ,ክፍል,ማመልከቻ}', 'youth', 'submitted', false, 1, 0),
    ('kebero-instrument-class',
     'የከበሮና የዋዜማ ትምህርት ለአዲሶች ተማሪዎች መከፈቱ ተነግሮ ዝርዝሩ ለማጽደቅ ቀርቧል',
     'የመዝሙር ክፍል ለመኮርብነት የሚዘጋጁ ሕፃናትና ወጣቶች በሚሳተፉበት ትምህርት ዕቅድ ላይ ሐሳብ ቀርቧል።',
     E'አዲሱ የመሣል ዝግጅት በሳምንት ሁለት ክፍለ ጊዜ የሚያዝ ሲሆን የመጀመሪያው ደረጃ በዋዜማና በክበል፣ ሁለተኛው በዕገታ ማዕከልና ሦስተኛው በኮረብ ቡድን አገልግሎት ይከናወናል። መሣሪያው በክፍሉ ተጠብቆ ለተማሪዎች ይቀርባል።\n'
     ||'ዕቅዱ በማኅበረ ሐዋርያትና በመምህራን ስብሰባ ማጽደቅ ሲያልፍ ለተግባር ይዘው ወደፊት። ወላጆች ስለ ክፍሉና ስለ ዝግጅቱ መርሐ ግብር በድረ ገጹ ማወቅ ይችላሉ።',
     'መዝሙር', '{ከበሮ,ዋዜማ,ትምህርት}', 'kebero', 'draft', false, 0, 0)
  ) as v(slug, title_am, summary_am, body_am, category_am, tags, media_key, state, featured, age_days, views)
  left join demo_media dm on dm.key = v.media_key
  join who a on a.role = 'media'
on conflict (slug) do nothing;

-- ─── events ──────────────────────────────────────────────────────────────────
-- Six past and five upcoming, so `/events` shows both the next four in the
-- homepage block and an archive, and a signed-in registrar has registrations to
-- check in. `eth_date` carries the liturgical date the congregation reads.
insert into public.events (slug, title_am, summary_am, body_am, event_type,
                           starts_at, ends_at, all_day, eth_date, venue_am,
                           capacity, registration_required, fee, currency,
                           cover_media_id, tags, department_id, state, is_featured,
                           published_at, created_by)
select v.slug, v.title_am, v.summary_am, v.body_am, v.event_type,
       ((current_date + v.start_day) + v.start_clock::time)::timestamptz,
       ((current_date + v.start_day) + v.end_clock::time)::timestamptz,
       false, v.eth_date, v.venue_am,
       v.capacity, v.needs_reg, v.fee, 'ETB',
       dm.id, v.tags::text[], (select id from dept where slug = v.dept),
       'published'::public.content_state, v.featured,
       now() - (abs(v.start_day) * interval '1 day'),
       (select id from who where role = v.author)
  from (values
    ('feast-of-gabriel-litany',
     'የቅዱስ ገብርኤል በዓል ሥርዐተ ልታኒ',
     'በሦስት ቀን የሚከናወን የበዓል ጸሎተ ሰዓት፣ ዕገታና ማኅበረ ሐዋርያት ሥርዓት፤ ማረጋገያ ይያዙ።',
     E'በዓሉ በሐዋርያት ማንቃትና በዕገታ ይጀምራል፤ ከጸሎተ ሰዓት በኋላ ለማኅበረ ሐዋርያት የጋራ ምግብ አገልግሎት ይሰጣል። የት/ቤቱ ተማሪዎችና ወላጆች በዕገታና በመዝሙር አገልግሎት ይሳተፋሉ።\n'
     ||'ማረጋገጭ የሚያዘው ቤተ ሰብ በዕለቱ ለሚሰጠው የምግብና የመከረት አገልግሎት ቁጥር ለማዘጋጀት ይጠቅማል።',
     'feast', 11, '06:00', '13:00', 'ጥር ፳፥ በዓል', 'ቅድስት ልደታ ለማርያም ቤተ ክርስቲያን — ዋናው አዳራሽ',
     600, true, null, 'feast', '{በዓል,ሥርዐተ ልታኒ,ገብርኤል}', 'mezmur', true, 'dept'),
    ('sunday-school-registration-open',
     'የሰንበት ትምህርት ቤት ምዝገባ ማመልከቻ ክፍት ሆኗል',
     'ለዕድሜ ፬ እስከ ፳፮ ለሆኑ ልጆችና ወጣቶች በደረጃ የሚመዘገብ ምዝገባ በድረ ገጹ ይከፈታል።',
     E'ማመልከቻው የሚጠይቀው የልጁን ሙሉ ስም፣ የልደት ዕድሜ፣ የቤተሰብ አድራሻና ቀድሞ የትምህርት ደረጃ ነው፤ ተቀባይነት ከተሰጠ በኋላ በምልከታ ክፍለ ጊዜ የደረጃ ክፍል ይወሰናል።\n'
     ||'ወላጆች የልጃቸውን የመገኘትና የውጤት መረጃ በግል ገጻቸው ሊከታተሉ ይችላሉ። ለፍሁድና ለቸገሪ ቤተ ሰቦች የትምህርት ግብዣ ድጋፍ አለ።',
     'class', 4, '08:30', '17:00', 'ጥር ፫', 'የት/ቤቱ መዝገብ — የታችኛው ወለል',
     200, true, null, 'class', '{ምዝገባ,ተማሪዎች,ወላጅ}', 'spiritual-education', true, 'registrar'),
    ('teachers-annual-retreat',
     'የመምህራን ዓመታዊ ሥልጠናና የዕርሳስ ዝግጅት',
     'ለሁሉት ክፍሎች መምህራን የሚዘጋጅ ቀን-ሁለት ሥልጠና፤ የትምህርተ ሐሳብና የማስተዳደር ጉዳይ ይያዛል።',
     E'ሥልጠናው በመምህራን ትምህርት ክፍል ኃላፊና በተጋሩ መምህራን ይያዛል፤ የክፍል አስተዳደር፣ የተማሪ ምዘናና የቤተሰብ ግንኙነት በተግባር ይከተላል። መካከለኛው ቀን የጋራ ዕገታና የምሥጢር ሥርዓት አለ።\n'
     ||'ተሳታፊዎች ከዚህ በፊት ያስተማሩትን በማካፈል የጋራ የዕርሳስ ማህደር ይዘጋጃል። ማረጋገጭ ለአገልግሎት ዝግጅት ያስፈልጋል።',
     'meeting', 18, '09:00', '16:30', 'ጥር ፲፩', 'የመምህራን መኰነንያ ክፍል',
     60, true, 150, 'meeting', '{መምህራን,ሥልጠና,ዕርሳስ}', 'spiritual-education', false, 'registrar'),
    ('community-food-distribution',
     'የቸገሪ ቤተ ሰቦች ወርሃዊ የምግብ ዕርዳታ',
     'በማህበራዊ ጉዳይ ክፍል ለተመዘገቡ ቤተ ሰቦች የሚሰጥ ዕርዳታና የቤተ ሰብ ጉብኝት።',
     E'ዕርዳታው የሚሰጠው በክፍሉ ባዘጋጀው ዝርዝር መሠረት ሲሆን ተገባሪዎች በማረጋገጭ ሰዓት ይቀርባሉ፤ ከምግብ ጋር የልብስና የትምህርት እቃ ድጋፍ ተያይዞ ይሰጣል።\n'
     ||'ለማስተዋወቅ የሚፈልጉ ተለጋሾች ከግብዣው በፊት ክፍሉን ማወቅ ይችላሉ፤ የተሰጠው እገዳ በሒሳብ ክፍል ተመዝግቦ ለጉባኤ ይቀርባል።',
     'outreach', 26, '09:00', '12:30', 'ጥር ፲፱', 'የቤተ ክርስቲያኗ ግቢ ምሥራቅ ክፍል',
     250, true, null, 'outreach', '{ዕርዳታ,ቤተ ሰብ,ተገባሪ}', 'social-affairs', false, 'dept'),
    ('youth-evangelism-weekend',
     'የወጣቶች የወንጌል ሥርጭትና ጉብኝት ቀጠሮ',
     'ለዕድሜ ፲፮–፳፭ ወጣቶች የሚዘጋጅ ሌሊት-ቀን ጉዞ፤ የጸሎትና የመንፈስ ትምህርት ዕርሳስ አለው።',
     E'ቀጠሮው በቅዳሜ ጸሎትና በመዝሙር ይጀምሮ፣ እሁድ ጠዋት ለአካባቢ ቤተ ሰቦች ጉብኝት ይወርዳል፤ መልሰው በማኅበረ ሐዋርያት የጋራ መዝሙርና ምግብ አገልግሎት ይከብራሉ።\n'
     ||'ተሳታፊዎች በአደንቢ ሁኔታና በቡድን ለመንቀሳቀስ ዝግጁ መሆን አለባቸው፤ የመጓጓዣና የምግብ ወጪ በልገሳ ይሸፈናል። ማረጋገጭ የቡድን ዝግጅት ላይ ተመስርቶ ይታያል።',
     'outreach', 40, '08:00', '16:00', 'ተሣሕሊ ፬', 'ከአዲስ አበባ ውጭ — በጉብኝት የሚዘጋጅ ቦታ',
     80, true, 300, 'outreach', '{ወጣቶች,ወንጌል,ጉዞ}', 'evangelism', true, 'dept'),
    ('nativity-vigil-service',
     'የልደት በዓል ሌሊተ ጸሎትና የሕፃናት መዝሙር',
     'ከሌሊቱ ሦስት ክፍል የሚያዝ ጸሎተ ሰዓት፣ የዕገታ አገልግሎትና የት/ቤቱ የሕፃናት መዝሙር።',
     E'ሥርዓቱ በሕፃናትና በወጣቶች መዝሙር ይጀምሮ፣ በማኅበረ ሐዋርያት ዕገታና በጸሎተ ሰዓት ይቀጥላል፤ በመጨረሻው ክፍል ለማኅበረ ሐዋርያት የበዓል ትንሣኤና የመልካት አገልግሎት ቀርቧል።\n'
     ||'ተማሪዎችና ወላጆች በሰዓቱ መሠረት በአዳራሹ መገኘት አለባቸው፤ የኮረብ ቡድኖች የዝግጅት ስብሰባ ከሥርዓቱ በፊት ይኖራል።',
     'worship', -9, '21:00', '23:45', 'ቅዳሜ ፳፬', 'ቅድስት ልደታ ለማርያም ቤተ ክርስቲያን',
     700, false, null, 'worship', '{ልደት,ጸሎተ ሰዓት,መዝሙር}', 'mezmur', true, 'media'),
    ('adults-bible-study-graduation',
     'የአባቶችና እመቤቶች ዙር ጥናት ማጠናቀሪያና ማሳያ',
     'ለዐሥራ ስድስት ሰብዓት የቆየ ጥናት በማጠናቀሪያ ጉባኤና በማሳያ መልእክት ተጠናቋል።',
     E'ተሳታፊዎች የተማሩትን የአባቶች ትንሣኤና የሥርዓተ ኣምልኮ ጥናት በጋራ በማካፈል ማሳያ ሰጥተዋል፤ ክፍሉ ለሚቀጥለው ዙር ዕርሳስና መርሐ ግብር አቅርቧል።\n'
     ||'በማጠናቀሪያው የተማሪዎች መከታተያና የቤተሰብ ጉዳይ ማሳያ ቀርቶ ለሁለተኛው ዙር ተሰጥኦ ተጀምሯል።',
     'program', -23, '14:00', '17:00', 'ታኅሣሥ ፳፩', 'ዕ.ማ ዋና አዳራሽ',
     180, false, null, 'program', '{አባቶች,ጥናት,ማጠናቀቂያ}', 'spiritual-education', false, 'registrar'),
    ('media-team-photo-archive',
     'የሚዲያ ክፍል የዓመቱ ፎቶና ቪዲዮ ማህደር ማጠናቀቂያ',
     'በአመቱ የተቀረጹ አገልግሎቶት ዳታ ተመዝግበው ለሕዝብ የቀረበ ማህደር ዝግጅቱ ተጠናቋል።',
     E'ክፍሉ በአመቱ የተደረጉ ሥርዓቶችና ክስተቶት ማህደር፣ በድረ ገጹና በማህበራዊ ገጻት ለማሳየት ዝግጁ አድርጎታል፤ የፎቶና የቃረን ማህደሩ በተናጠል የተመዘገበ ነው።\n'
     ||'ለሚቀጥለው አመት የቡድን ክፍሎችና የሥርዓት መከታተያ ዕቅድ ተሰጥኦ ተዘጋጅቷል። ተገባሪ ለመሆን የሚፈልጉ ወጣቶች መገናኘት ይችላሉ።',
     'program', -37, '13:00', '16:00', 'ታኅሣሥ ፯', 'የሚዲያ ክፍል መዝገብ',
     40, false, null, 'program', '{ሚዲያ,ፎቶ,ማህደር}', 'media', false, 'media'),
    ('choir-audition-round',
     'ለኮረብ ቡድኖች የድምጽ ምርጫና የመሣል ዝግጅት ተካሄዷል',
     'አዳዲስ ተማሪዎች በድምጽ ደረጃና በመሣል ችሎታ ተመርጠው በቡድኑ ተካተዋል።',
     E'ምርጫው በሐምሳ አራት ተማሪዎች መካከል በዋናው ዕገታና በኮረብ ክፍል ተካሄዷል፤ የተመረጡት በሶፕራኖ፣ በአልቶ፣ በቴናርና በባስ ተከፋፍለው በልምምድ ጀምረዋል።\n'
     ||'ለከበሮና ለዋዜማ የተመረጡ ወጣቶች በታላቅ መምህር ማዕከል በተዘጋጁ መርሐ ግብሮች እየተሳለፉ ነው። ያልተመረጡት በሚቀጥለው ምርጫ እድል አላቸው።',
     'program', -52, '10:00', '13:00', 'ቅዳሜ ፳፩', 'የመዝሙር ቤተ ሙኤዘዝ',
     70, false, null, 'program', '{ኮረብ,ምርጫ,ድምጽ}', 'mezmur', false, 'dept'),
    ('social-affairs-visit-round',
     'የታኅሣሥ ዙር የቤተ ሰብ ጉብኝትና የመንፈስ ድጋፍ ሥራ',
     'በመምህራንና በተገባሪዎች የተደረጉ ጉብኝቶት ውጤት ተመዘግቦ ዕርዳታ ተቀጥሏል።',
     E'በሦስት ሳምንት ውስጥ ለመንፈስ አንድ መቶ ሃያ ዘጠኝ ቤተ ሰቦች ተጎብኝተዋል፤ ጉዳያቸው በቅጽ ተመዝግቦ ለሐምሳ ሁለት ቤተ ሰቦች ዕርዳታ ወሳኝ ሆኗል።\n'
     ||'ከጉብኝቱ ጋር የጤና ምክር፣ ለልጆች የትምህርት ድጋፍና ለሽማግሌዎች የመንፈስ አገልግሎት ቀርቧል። ውጤቱ በጉባኤ ሲቀርብ የሚቀጥለው ዙር ዕቅድ ተጸድቋል።',
     'outreach', -68, '09:00', '15:00', 'ግንቦት ፫', 'በአካባቢው ጎረቤት ቤተ ሰቦች',
     null, false, null, 'outreach', '{ጉብኝት,ዕርዳታ,ማህበረሰብ}', 'social-affairs', false, 'dept'),
    ('annual-general-assembly',
     'የዓመቱ ጉባኤና የአገልግሎት ሒሳቅ ማቅረብ',
     'በመንፈሳዊ አመራርና በካህናት ቆንስል የተከፈተ ጉባኤ የዓመቱን ሒሳቅና እቅድ ጸድቋል።',
     E'ጉባኤው የጀመረው በጸሎትና በመዝሙር ሲሆን በክፍሎች ኃላፊዎች የተቀረበው አገልግሎትና ሒሳቅ ተዳምጧል፤ በምክር የተገኘው ውሳኔ ለሚቀጥለው ዓመት እቅድ መሠረት ሆኗል።\n'
     ||'ለአዲሶች ኃላፊዎች ምርጫና ማረጋገጭ ተደርጎ፣ ለግንባታና ለትምህርት ዕርዳታ የልገሳ ዕቅድ ተጸድቋል። ማጽደቅ የተሰጠው ውሳኔ በድረ ገጹ ለማኅበረ ሐዋርያት ቀርቧል።',
     'meeting', -80, '13:30', '17:30', 'ግንቦት ፳፬', 'ዕ.ማ ዋና አዳራሽ',
     300, false, null, 'meeting', '{ጉባኤ,እቅድ,ሒሳብ}', 'spiritual-education', false, 'registrar')
  ) as v(slug, title_am, summary_am, body_am, event_type, start_day, start_clock, end_clock,
         eth_date, venue_am, capacity, needs_reg, fee, tag_key, tags, dept, featured, author)
  left join demo_media dm on dm.key = v.tag_key
on conflict (slug) do nothing;

-- Registrations come from the seeded member list, so the check-in screen and the
-- attendance counters agree with a real directory. Past events are `attended`.
insert into public.event_registrations (event_id, full_name_am, phone, email, parish,
                                        participants, notes, source, status,
                                        checked_in_by, checked_in_at)
select e.id, m.full_name_am, m.phone, m.email, m.parish,
       (m.i % 3) + 1,
       case when m.i % 5 = 0 then 'ለቤተ ሰብ የሚዘጋጅ ቦታ እንዲኖራቸው ተጠይቀዋል።' end,
       case when m.i % 4 = 0 then 'phone' when m.i % 3 = 0 then 'erp' else 'website' end,
       case when e.starts_at < now() then 'attended' else 'registered' end,
       case when e.starts_at < now() then (select id from who where role = 'registrar') end,
       case when e.starts_at < now() then e.starts_at + interval '2 hours' end
  from (select row_number() over (order by full_name_am) as i,
               id, full_name_am, phone, email, parish
          from public.members
         where status = 'active' and phone is not null
         order by full_name_am
         limit 46) m
  join lateral (select id, starts_at
                  from public.events
                 where slug = (array ['nativity-vigil-service',
                                      'adults-bible-study-graduation',
                                      'media-team-photo-archive',
                                      'youth-evangelism-weekend',
                                      'sunday-school-registration-open',
                                      'teachers-annual-retreat',
                                      'community-food-distribution',
                                      'feast-of-gabriel-litany'])[(m.i % 8) + 1]) e on true
on conflict (event_id, phone, full_name_am) do nothing;

-- ─── sermons ─────────────────────────────────────────────────────────────────
-- No audio is bundled, so `audio_media_id` stays null and the site renders the
-- transcript instead of a player that would point at a missing object.
insert into public.sermons (title_am, preacher_am, scripture_ref, topic_am, summary_am,
                            delivered_on, transcript_am, language, listen_count,
                            tags, state, published_at, created_by)
select v.title_am, v.preacher_am, v.scripture_ref, v.topic_am, v.summary_am,
       current_date - (v.age_weeks * 7),
       v.transcript, 'am', v.listen, v.tags::text[],
       v.state::public.content_state,
       case when v.state = 'published' then current_date - (v.age_weeks * 7) end,
       (select id from who where role = 'media')
  from (values
    ('መንግሥቱ ዘለዐለም ወኢይዳም',
     'ቀ. አባ ገብረ ሥላሴ ወልደ ማርያም', 'መዝሙር ፲፬፭፡፲፫', 'የእግዚአብሔር ቆይታ',
     'የመንፈስ ቅዱስ ቤተ ክርስቲያን በዕለት ተዕለት ሕይወት ውስጥ እንዴት የእግዚአብሔርን መንፈስ እንደሚያክብር የሚገልጽ ንግድ።',
     E'የእግዚአብሔር መንፈስ በሕዝቡ መካከል የሚገለጠው በቃልና በአምልኮ ሥርዓት መሠረት ነው። መዝሙረ ዳዊት "መንግሥትህ መንፈስ ቅዱስ መንግሥተ ዘመን ኀላፍ" ብሎ የቤተ ክርስቲያኗን ቋሚነት ይመሠከራል።\n'
     ||'አባቶች እንደማስተማሩት መንፈሱ የሚገኘው በአምልኮ ውስጥ ብቻ አይደለም፤ በቤተ ሰብ፣ በሥራና በዕርዳታ መካከል የሚኖር ሕይወት የመንፈሱ መስክረ ኖል ነው። ስለዚህ አምልኮ ወደ ሕይወት ሲተረጎም የእግዚአብሔር መንፈስ እንደሚኖር ምሥክርነት ይሆናል።',
     '{መንፈስ ቅዱስ,አምልኮ}', 'published', 6, 148),
    ('ልጆችን ወደ መንግሥት ማምጣት',
     'ቀ. አባ ገብረ ሥላሴ ወልደ ማርያም', 'ማርቆስ ፲፥፲፬', 'የሰንበት ትምህርት ግዴታ',
     'ትምህርቱ የልጅን እምነት በዕድሜ ደረጃ ማዳግ እንደሆነና ወላጅ ለምን አሳታፊ መሆን እንዳለበት የሚያብራራ ንግድ።',
     E'ጐሣ የሚባል የሕፃናት አንድነት የተጻረፈው በካህናትና በወላጆች አብሮነት ነው፤ መምህር ብቻውን አያድግም። የቤተሰብ ጸሎትና የክፍል ትምህርት አንድ አሠራር ሆነው ሲሠሩ ልጁ የሚማረው በቃል ብቻ አይደለም።\n'
     ||'የአባቶች ትምህርት ለልጆች የሚሰጠው በምሳሌና በመዝሙር ነው፤ በተለይ በዕድሜ ፬ እስከ ፲፩ ባለው ደረጃ ውስጥ የተማረው የእምነት ይዘት የሕይወት መሠረት ይሆናል።',
     '{ትምህርት,ቤተሰብ}', 'published', 13, 205),
    ('ይቅርታ የሚሰጥ ልብ',
     'ቀ. አባ ፌቃደ ገብረ ክርስቶስ', 'ማቴዎስ ፲፰፡፳፩–፴፩', 'ዕርቅ',
     'በጉባኤ ውስጥ የሚፈጠሩ ግርጭቶች በይቅርታና በእምነት እንዴት እንደሚፈቱ የሚመሥክር ንግድ።',
     E'ክፍሉ በጸሎትና በምክር የሚጀምር ሲሆን ውጤቱ ዕርቅ ነው። በአባቶች ትንሣኤ የተማረውን ሕዝብ በግርጭት ጊዜ መናገር አይደለም፤ መጸለይና መስማት ነው።\n'
     ||'ይቅርታ የሚሰጥ ልብ የሚገለጸው በተግባር ነው፤ ለጉባኤው አባል የሚደረግ ጉብኝትና ለሚፈለግ ምክር መክፈት የበጎ ፈቃዱ መጀመሪያ ነው።',
     '{ዕርቅ,ጉባኤ}', 'published', 20, 96),
    ('የጾም ጥቅምና የጸሎት ኃይል',
     'ቀ. አባ ፌቃደ ገብረ ክርስቶስ', 'ኤርምያስ ፲፯፡፭–፰', 'ጾም',
     'ጾም ከምግብ ማቆም ባሻገር የነፍስን አቅጣጫ የሚያስተካክል መሆኑን የሚገልጽ ንግድ።',
     E'ጾም የሚጀምረው ከልብ ለውጥ ነው፤ ከዚህ ውጭ የሚደረግ ማቆየት ብቻ ለአባቶች አልተጻፈም። በጾም ጊዜ የሚደረግ ጸሎትና ዕርዳታ አንድ አገልግሎት ናቸው።\n'
     ||'ለቸገሪ ቤተ ሰቦች የሚሰጠው ክፍል ከጾሙ ጋር ሲታወስ የሕዝቡ እጅ እንደሚከፈት ይታያል፤ ጾም የማኅበረ ሐዋርያትን አቅም ወደ ዕርዳታ ይመራል።',
     '{ጾም,ጸሎት,ዕርዳታ}', 'published', 27, 132),
    ('አምሳልን በእምነት መውደድ',
     'ቀ. አባ ዮናስ ተሾመ', 'ዕብራውስ ፲፩፡፩–፮', 'እምነት',
     'አባቶች እንደለማሙዉት የተስፋ ቃል ላይ የተመሠረተ እምነት በሕይወት ውስጥ እንዴት እንደሚታየ የሚገልጽ ንግድ።',
     E'እምነት የተስፋው መሠረትና ያልታየነውን ቃል መውደድ ነው፤ የአባቶች ትንሣኤ እንዳስተማረው በሕይወት ውስጥ የሚገለጥ እንጂ ቃል ብቻ አይደለም።\n'
     ||'ተማሪዎችና መምህራን እምነታቸውን የሚያሳዩት በትምህርት፣ በአምልኮና በአገልግሎት ነው፤ የጉባኤው ማሳያ በእነዚህ ሦስት መንገዶች የሚገኝ ፍሬ ነው።',
     '{እምነት,አባቶች}', 'published', 34, 88),
    ('በልጆች ላይ የቤተሰብ ኃላፊነት',
     'ቀ. አባ ዮናስ ተሾመ', 'መሳሌ ፳፪፡፮', 'ቤተሰብ',
     'ትምህርቱ ከቤተሰብ ጀምሮ እንደሚቀጥልና የወላጅ ሚና በእምነት አሠልጦኝ ውስጥ ያለውን ቦታ የሚገልጽ ንግድ።',
     E'"ልጅን በሚገባው መንገድ አስተድፍ" የሚለው የመሳሌ ንግድ በአባቶች ትርጓሜ የቤተሰብን ቋሚ ሃላፊነት ያሳያል፤ ወላጅ የመጀመሪያው መምህር ነው።\n'
     ||'በት/ቤቱ ሥርዓት ውስጥ ወላጆች በየወሩ ይሰብሰባሉ፤ የልጁ መገኘትና የክፍል ውጤት በቤተሰብ ማሳያ ተከታትሎ ለመምህራን ይቀርባል። አንድነት በእነዚህ ሁለት አቅጣጫዎች ይገነባል።',
     '{ቤተሰብ,ልጆች}', 'published', 41, 117),
    ('የቤተ ክርስቲያን ሥርዓትና የዕለት ተዕለት ሕይወት',
     'ቀ. አባ ገብረ ሥላሴ ወልደ ማርያም', '2ቲሞቴዎስ ፫፡፩–፭', 'ሥርዓተ ኣምልኮ',
     'ሥርዓቱ ከአባቶች የተቀደሠ እንደሆነና የሕዝቡን ሕይወት እንዴት እንደሚመራ የሚያብራራ ንግድ።',
     E'ሥርዓተ ኣምልኮ የቤተ ክርስቲያኗን እምነት በቃልና በምሳሌ የሚገልጥ ሲሆን ከአባቶች የተቀደሠ መንገድ አለው፤ የተማረው በሌሊት ጸሎትና በዕገታ ይከበራል።\n'
     ||'በሥራ ላይ የሚገኝ ሕዝብ ሥርዓቱን ጠብቆ ሲኖር የእምነት ቋሚነት ይታያል፤ መምህራንና ወላጆች ልጆችን በዚህ መንገድ ያድርጋሉ።',
     '{ሥርዓት,አባቶች}', 'published', 48, 74),
    ('ለሚጠበቁት መንግሥት መጸለይ',
     'ቀ. አባ ፌቃደ ገብረ ክርስቶስ', '1ቲሞቴዎስ ፪፡፩–፬', 'ጸሎት',
     'በሐዳር ጉባኤ የሚደረግ ጸሎት የሕዝቡን ዕለታዊ ችግር እንዴት እንደሚያካትት የሚገልጽ ንግድ።',
     E'ጸሎት ለሁሉም ሰው እንዲሆን አባቶች አስተምረዋል፤ በተለይ ለቸገሪዎችና ለሚመሩ ተቋማት የሚደረግ መጸለይ የጉባኤው ግዴታ ነው።\n'
     ||'በየሐዳሩ የሚነበበው ዝርዝር የቤተ ሰቦችን ጉዳይ ያካትታል፤ የመምህራን ቡድን ይህን በማሳወቅ ለሚፈልጉት ድጋፍ እንዲዘጋጅ ይረዳል።',
     '{ጸሎት,ማህበረሰብ}', 'published', 55, 61),
    ('አዲስ ትውልድና የአባቶች ቅርስ',
     'ቀ. አባ ዮናስ ተሳፋዊ ተሾመ', 'መዝሙር ፯፩፡፩፯–፲፰', 'ተሻጋሪነት',
     'ለማስተማርና ለመማር የተዘጋጀ የቤተሰብና የት/ቤት ተሳትፎን የሚመለከት በማኅበረ ሐዋርያት የሚቀርብ ንግድ።',
     E'ቅርሱ የሚተላለፈው በመምህራንና በወላጆች ተግባር ነው፤ ያለ አብሮነት የሚደረግ ትምህርት ውጤት አይኖረውም። የአባቶች እምነት በአዲሱ ትውልድ ሕይወት ሲታይ የቤተ ክርስቲያኗ ማሳያ ነው።\n'
     ||'ት/ቤቱ በየዓመቱ የሚያደርገው ሥርዓት ተማሪዎች የሚማሩትን ማኅበረ ሐዋርያትን በመገለጽ የአባቶች ትምህርት እንዲኖር ዕድል ይሰጣል።',
     '{ትውልድ,ቅርስ}', 'submitted', 62, 0)
  ) as v(title_am, preacher_am, scripture_ref, topic_am, summary_am, transcript, tags, state, age_weeks, listen)
 where not exists (select 1 from public.sermons s where s.title_am = v.title_am);

-- ─── mezmur ──────────────────────────────────────────────────────────────────
-- The lyrics of the ancient Ge'eta hymns are the text the choir actually sings;
-- no audio object exists yet, so the site renders the words and the theme.
insert into public.mezmur (title_am, lyrics_am, composer_am, arranger_am, choir_am,
                           theme_am, language, duration_secs, play_count, is_scripture,
                           tags, state, published_at, created_by)
select v.title_am, v.lyrics_am, v.composer_am, v.arranger_am, v.choir_am,
       v.theme_am, 'am', v.secs, v.play, v.scripture,
       v.tags::text[], v.state::public.content_state,
       case when v.state = 'published' then now() - (v.age_weeks * interval '7 days') end,
       (select id from who where role = 'dept')
  from (values
    ('መንግሥትህ መንፈስ ቅዱስ',
     E'መንግሥትህ መንፈስ ቅዱስ፣ መንግሥተ ዘመን ኀላፍ።\nዘለዐለም ይመሥክር ለከ፣ ወልዐ ለሩሐ ወለውልድ።',
     'የቅዱስ ዳዊት ዕገታ (የዕገታ ማዕከል)', 'ዕገታ ማኅበር', 'አዋጅ ኮረብ',
     'መንፈስ ቅዱስ', 245, 1240, true, '{ዕገታ,መንፈስ,ንግሥት}', 'published', 3),
    ('አብሁ እግዚአብሔር',
     E'አብሁ እግዚአብሔር፣ አብሁ እግዚአብሔር።\nአብሁ እግዚአብሔር፣ ወልዐ ወመንፈስ ቅዱስ።',
     'የአብ ማዕከል ዕገታ', 'ዕገታ ማኅበር', 'አዋጅ ኮረብ',
     'አብ', 180, 986, true, '{አብ,አምልኮ}', 'published', 5),
    ('እግዚአብሔር በሰማይ',
     E'እግዚአብሔር በሰማይ ኀላዩ ወኢይዳም።\nወቅዱሳን መሐልዮት ይሰግዱ ለክ።',
     'የመልካት ዕገታ', 'ዕገታ ማኅበር', 'መልካተ ኮረብ',
     'መልካት', 210, 754, true, '{መልካት,መሐልዮት}', 'published', 8),
    ('ቅዱስ ቅዱስ ቅዱስ',
     E'ቅዱስ ቅዱስ ቅዱስ፣ እግዚአብሔር ሠራዊት።\nሙሉ ሰማይ ወአርድ ክብሩ።',
     'የቅዳሴ ዕገታ', 'ዕገታ ማኅበር', 'ዕገታ ማኅበር',
     'ቅዳሴ', 195, 1102, true, '{ቅዳሴ,ሳዶ}', 'published', 11),
    ('አሌሉያ',
     E'አሌሉያ፣ አሌሉያ፣ አሌሉያ ይኢላብሔ።\nደገሙ ኀብሩ ወኀይለ እግዚአብሔር።',
     'የዕገታ ማዕከል', 'ዕገታ ማኅበር', 'ሕፃናት ኮረብ',
     'አሌሉያ', 165, 633, true, '{አሌሉያ,ዕገታ}', 'published', 14),
    ('የእግዚአብሔር ደወሌ',
     E'በሰላም አስተዳድረን ለዘለዐለም ወአርዕስት።\nእግዚአብሔር ይቅር በለልን፣ ወአደነ ለልመልና።',
     'ባሕታዕ ጸጋዌ', 'አዳኔው ገብረ ሥላሴ', 'ዕገታ ማኅበር',
     'ንስሐ', 285, 421, false, '{ንስሐ,አዳኔው}', 'published', 17),
    ('አዳም ውስጥ በሔደ',
     E'አዳም ውስጥ በሔደ፣ እግዚአብሔር ወልዐ።\nቅድስት ወለዐትዎ፣ እግዚአብሔር ወልዐ።',
     'የልደት ዕገታ', 'ዕገታ ማኅበር', 'መልካተ ኮረብ',
     'ልደት', 220, 878, true, '{ልደት,ዕገታ}', 'published', 20),
    ('ንሥዕተ አብ',
     E'ንሥዕተ አብ ወወልዐ ወመንፈስ ቅዱስ፣ አሐዱ እግዚአብሔር።\nእግዚአብሔር አብ፣ እግዚአብሔር ወልዐ፣ እግዚአብሔር መንፈስ ቅዱስ።',
     'የንሣኔ ዕገታ', 'ዕገታ ማኅበር', 'አዋጅ ኮረብ',
     'ንሣኔ', 240, 1035, true, '{ንሣኔ,ስላሴ}', 'published', 24),
    ('ክብር ለእግዚአብሔር',
     null, 'የኮረብ ማዕከል', 'አዳኔው ኃይለ ማርያም', 'ዕገታ ማኅበር',
     'አምልኮ', 190, 312, false, '{ክብር,አምልኮ}', 'published', 28),
    ('እግዚአብሔር ኪንዮየ',
     null, 'ዕገታ ማዕከል', 'ዕገታ ማኅበር', 'ሕፃናት ኮረብ',
     'አድናቆት', 175, 288, true, '{ኪንዮየ,አድናቆት}', 'published', 32),
    ('መዝሙረ ሕዝብ',
     null, 'አዳኔው ጊርማ', 'ዕገታ ማኅበር', 'መልካተ ኮረብ',
     'ትምህርት', 205, 176, false, '{መዝሙር,ሕዝብ}', 'published', 36),
    ('ዕርዳታ ለእግዚአብሔር',
     null, 'ዕገታ ማዕከል', 'ዕገታ ማኅበር', 'ዕገታ ማኅበር',
     'ዕርዳታ', 230, 141, false, '{ዕርዳታ,ጸሎት}', 'published', 40),
    ('ጾመ ነነዕ',
     null, 'የጾመ ዕገታ', 'አዳኔው ተሾመ', 'አዋጅ ኮረብ',
     'ጾም', 260, 0, false, '{ጾም,ነነዕ}', 'submitted', 1),
    ('ለምዕል ወለዓለም',
     null, 'ዕገታ ማዕከል', 'ዕገታ ማኅበር', 'ሕፃናት ኮረብ',
     'ትውልድ', 185, 0, false, '{ትውልድ,ዕገታ}', 'draft', 0)
  ) as v(title_am, lyrics_am, composer_am, arranger_am, choir_am, theme_am,
         secs, play, scripture, tags, state, age_weeks)
 where not exists (select 1 from public.mezmur mz where mz.title_am = v.title_am);

-- ─── publications ────────────────────────────────────────────────────────────
insert into public.publications (title_am, kind, issue_label, summary_am, body_am,
                                 cover_media_id, pages, price, currency,
                                 published_on, tags, download_count, state, created_by)
select v.title_am, v.kind, v.issue_label, v.summary_am, v.body_am,
       dm.id, v.pages, v.price, 'ETB',
       case when v.state = 'published' then current_date - (v.age_weeks * 7) end,
       v.tags::text[], v.downloads, v.state::public.content_state,
       (select id from who where role = 'editor')
  from (values
    ('የዕገታ ማስታወሻ መጻሕፍት', 'book', 'መጻሕፍት ፩',
     'ለአምስቱ የመዝሙር ደረጃዎች የተዘጋጀ የዕገታና የመልካት ማስታወሻ መርሐ ግብርና ትርጓሜ።',
     E'መጽሐፉ በአምሳ ዘጠኝ መዝሙሮች የተከፋፈለ ሲሆን እያንዳንዱ በመጀመሪያ ማብራሪያና በአባቶች ትንሣኤ ተደግፎ ቀርቧል። በመጨረሻው ክፍል የኮረብ ቡድኖች የልምምድ መርሐ ግብር ተዘጋጅቷል።',
     'choir', 240, 350, '{ዕገታ,መዝሙር,ማስታወሻ}', 412, 'published', 6),
    ('የሰንበት ትምህርት ቤት ሪፖርት', 'annual_report', '፳፻፲፱ ዓ.ም',
     'የአዲሱ ዓመት የተማሪ ብዛት፣ የመምህራን አገልግሎት፣ የፊንሳሴና የማህበራዊ ሥራ ማጠቃለያ።',
     E'ሪፖርቱ በዐሥራ ደረጃዎች የተሰጠውን አገልግሎት፣ የተማሪ መከታተያና የመምህራን ዝግጅት በዝርዝር ያቀርባል፤ በሁለተኛው ክፍል የሒሳቅ ማጠቃለያና ለሚቀጥለው ዓመት እቅድ ቀርቧል።',
     null, 68, null, '{ሪፖርት,እቅድ,ሒሳብ}', 129, 'published', 12),
    ('የቅዱሳት ሕይወት ጥናት', 'study', 'ደረጃ ፪',
     'ለሕፃናት ደረጃ ፪ የተዘጋጀ የቅዱሳት ሕይወትና የሰዓተ ጸሎት ጥናት መጻሕፍት።',
     E'በአሥራ ሁለት ሰብዓት የተከፋፈለ ጥናት ሲሆን እያንዳንዱ ክፍል መጻሕፍት ቃል፣ የአባቶች ትንሣኤና የተማሪ ጥያቄ ይዟል፤ መምህራን በክፍለ ጊዜ የሚያዩው መርሐ ግብር ተያይዞ ቀርቧል።',
     'class', 96, 120, '{ትምህርት,ቅዱሳት,ጥናት}', 264, 'published', 18),
    ('የወርሃ ወረቀት', 'bulletin', 'ሂደት ፩',
     'በየወሩ የሚወጣ የክፍሎች መርሐ ግብር፣ የበዓል ማሳወቂያና የአገልግሎት ጠያቂ ዝርዝር።',
     E'ወረቀቱ በመጀመሪያ የሰንበት ትምህርት ዕርሳስና የክፍሎች ዜና ይይዛል፤ በሁለተኛ ክፍል ለቸገሪ ቤተ ሰቦች ዕርዳታና ለአገልግሎት የሚጠራ ተማሪዎች ዝርዝር ቀርቧል።',
     null, 8, null, '{ወረቀት,ማሳወቂያ}', 96, 'published', 2),
    ('የመዝሙር ትምህርት መመሪያ', 'study', 'ለመምህራን',
     'የመዝሙር ክፍል መምህራን የሚከተሉት የልምምድና የማስተማሪያ መመሪያ፤ የድምጽ ደረጃና የመሣል አሠራር።',
     E'መመሪያው በአራት ክፍል የተከፈለ ሲሆን የመጀመሪያው የድምጽ ዝግጅትና የክብ ድልድል፣ ሁለተኛው የመሣል አሠራር፣ ሦስተኛው የኮረብ አመራርና አራተኛው የአገልግሎት ዝግጅት ይዟል።',
     'kebero', 132, 200, '{መዝሙር,መምህራን,መመሪያ}', 158, 'published', 30),
    ('የቤተ ክርስቲያን ታሪክ ማጠቃለያ', 'book', 'ክፍል ፩',
     'ከመሠረት እስከ ዛሬ ያለውን የአካባቢው ቤተ ክርስቲያንና የት/ቤት አገልግሎት ታሪክ የሚገልጽ ማጠቃለያ።',
     E'መጽሐፉ በዘመን ተከታታይ በተከፋፈለ ሲሆን በእያንዳንዱ ዘመን የተከናወኑ አገልግሎቶችና የመምህራን ማሳያ ቀርቧል፤ በመጨረሻው የግንባታና የትምህርት ዕድገት ማሳያ አለ።',
     'church', 184, 300, '{ታሪክ,ቤተ ክርስቲያን}', 87, 'published', 44),
    ('ለወጣቶች የዕለት ተዕለት መመሪያ', 'leaflet', 'ማከራከሪያ',
     'ለወጣቶች ክፍል የተዘጋጀ ማዕከላዊ የጸሎትና የመጻሕፍት ጥናት አሠራር ማስታወሻ።',
     E'ማስታወሻው የወጣቶች ክፍልን የሳምንት መርሐ ግብር፣ የጸሎት ደረጃና የመጻሕፍት ማንበቢያ ዝርዝር በአጭሩ ያቀርባል፤ ለቤተ ሰብ ጉብኝት የሚደረግ ዝግጅት መንገድ ተገልጧል።',
     'youth', 4, null, '{ወጣቶች,መመሪያ}', 63, 'published', 50),
    ('የማህበራዊ ጉዳይ አገልግሎት ዕርዳታ', 'newsletter', '፩',
     'ለቸገሪ ቤተ ሰቦች የተሰጠ ዕርዳታና የቤተ ሰብ ጉብኝት ውጤት ወርሃዊ ማሳያ።',
     E'ማሳያው በወርሃ የተሰጠ ዕርዳታና የተጎብኙ ቤተ ሰቦች ቁጥር ይዟል፤ በሁለተኛ ክፍል የተለጋሾችና የተገባሪዎች አገልግሎት ሐሳብ ቀርቧል።',
     'outreach', 12, null, '{ዕርዳታ,ማህበራዊ}', 74, 'published', 36),
    ('የአባቶች ትንሣኤ ምርጫ', 'book', 'ክፍል ፪',
     'ለአባቶችና እመቤቶች ክፍል የተዘጋጀ የአባቶች ትንሣኤ ምርጫና ማብራሪያ።',
     E'መጽሐፉ በዐሥራ ስድስት ዙር የተከፋፈለ ሲሆን እያንዳንዱ ክፍል የቅዱሳት መጻሕፍት ምርጫና የአባቶች ማብራሪያ ይዟል፤ መደበሪያ ጥያቄ ተያይዞ ቀርቧል።',
     'library', 312, 500, '{አባቶች,ትንሣኤ}', 195, 'submitted', 1)
  ) as v(title_am, kind, issue_label, summary_am, body_am, media_key, pages, price, tags, downloads, state, age_weeks)
  left join demo_media dm on dm.key = v.media_key
 where not exists (select 1 from public.publications p where p.title_am = v.title_am);

-- ─── gallery ─────────────────────────────────────────────────────────────────
insert into public.gallery_albums (slug, title_am, description_am, event_id, department_id,
                                   taken_on, cover_media_id, state, is_public,
                                   published_at, created_by)
select v.slug, v.title_am, v.description_am,
       (select id from public.events where slug = v.event_slug),
       (select id from dept where slug = v.dept),
       current_date - (v.age_weeks * 7),
       dm.id, 'published'::public.content_state, true,
       now() - (v.age_weeks * interval '7 days'),
       (select id from who where role = 'media')
  from (values
    ('weekly-worship',      'በየሰንበቱ አምልኮ',           'የእሁድ ጸሎተ ሰዓትና የዕገታ አገልግሎት ከአማካይ ማዕከል የተዘጋጀ ማህደር።', 'nativity-vigil-service', 'mezmur', 10, 'worship'),
    ('sunday-school-days',  'የሰንበት ትምህርት ቤት ክፍሎች',   'ሕፃናትና ወጣቶች በክፍል ውስጥ ትምህርት የሚማሩበት ማሳያ።', 'sunday-school-registration-open', 'spiritual-education', 6, 'class'),
    ('feast-of-gabriel',    'የቅዱስ ገብርኤል በዓል',        'በበዓሉ ሦስት ቀን የተከናወኑ ሥርዐተ ልታኒና ማኅበረ ሐዋርያት ሥርዓት ፎቶ።', 'feast-of-gabriel-litany', 'mezmur', 13, 'feast'),
    ('social-support',      'የማህበራዊ ዕርዳታ ሥራ',        'ለቸገሪ ቤተ ሰቦች የተሰጠ ዕርዳታና የቤተ ሰብ ጉብኝት ማሳያ።', 'community-food-distribution', 'social-affairs', 9, 'outreach'),
    ('choir-rehearsal',     'የኮረብ ቡድን ልምምድ',         'ለበዓልና ለአገልግሎት የተዘጋጀ የዕገታና የመዝሙር ልምምድ።', null, 'mezmur', 4, 'choir')
  ) as v(slug, title_am, description_am, event_slug, dept, age_weeks, media_key)
  left join demo_media dm on dm.key = v.media_key
on conflict (slug) do nothing;

-- Every photograph belongs to at least one album so the gallery page has depth.
create temporary table album_photo (album text, key text, ord integer);
insert into album_photo (album, key, ord) values
  ('weekly-worship',     'worship',    1), ('weekly-worship', 'kebero',  2),
  ('weekly-worship',     'mural',      3), ('weekly-worship', 'church',  4),
  ('sunday-school-days', 'class',      1), ('sunday-school-days', 'library', 2),
  ('sunday-school-days', 'graduation', 3), ('sunday-school-days', 'choir',   4),
  ('feast-of-gabriel',   'feast',      1), ('feast-of-gabriel', 'worship',   2),
  ('feast-of-gabriel',   'mural',      3), ('feast-of-gabriel', 'church',    4),
  ('social-support',     'outreach',   1), ('social-support', 'youth',       2),
  ('social-support',     'baptism',    3), ('social-support', 'library',     4),
  ('choir-rehearsal',    'choir',      1), ('choir-rehearsal', 'kebero',     2),
  ('choir-rehearsal',    'worship',    3), ('choir-rehearsal', 'graduation', 4);

insert into public.album_media (album_id, media_id, sort_order, caption_am)
select a.id, m.id, p.ord, m.caption_am
  from album_photo p
  join public.gallery_albums a on a.slug = p.album
  join demo_media m on m.key = p.key
 where a.state = 'published'
on conflict (album_id, media_id) do nothing;

-- ─── spiritual leadership ────────────────────────────────────────────────────
insert into public.leadership (name_am, title_am, role_key, bio_am, media_id, sort_order, state)
select v.name_am, v.title_am, v.role_key, v.bio_am,
       dm.id, v.ord, v.state::public.content_state
  from (values
    ('ቀ. አባ ገብረ ሥላሴ ወልደ ማርያም', 'የቤተ ክርስቲያኑ አገልግሎተ ማዕከል ካህን', 'spiritual',
     E'ለሃያ ሦስት ዓመታት በአገልግሎት ላይ የሚገኝ ካህን ሲሆን የሥርዓተ ኣምልኮና የአባቶች ትምህርት ዋና አስተማሪ ነው። የሰንበት ት/ቤቱ የትምህርት ዕቅድና የመምህራን ዝግጅት በእርሱ ምክር ይቀርጻል።',
     'worship', 10, 'published'),
    ('ቀ. አባ ፌቃደ ገብረ ክርስቶስ', 'ሁለተኛው ካህንና የወጣቶች አገልግሎት ኃላፊ', 'spiritual',
     E'ለአሥራ አምስት ዓመት በአገልግሎት ላይ ሲሆን የወጣቶች ክፍልና የወንጌል ስርጭት ሥራቸውን ይመራል። የቤተ ሰብ ጉብኝትና የምክር አገልግሎት በዋናነት የሚከትሉት ናቸው።',
     'youth', 20, 'published'),
    ('ዲቂ ዮናስ ተሾመ', 'የዕገታና የመዝሙር ማዕከል አስተዳዳሪ ዲቅነ', 'pastoral',
     E'የዕገታ ማዕከል አስተዳዳሪና የከበሮ ትምህርት መምህር ሆኖ ለዐሥራ አንድ ዓመት አገልግሏል። አሥራ ሁለት ኮረብ ቡድኖች የልምምድ መርሐ ግብር በእርሱ ዕቅድ ይከተላል።',
     'kebero', 30, 'published'),
    ('አዳኔው ገብረ ሥላሴ', 'የሰንበት ትምህርት ቤት ዋና መምህር', 'administrative',
     E'ከመምህርነት ጀምሮ እስከ ዋና አስተዳዳሪነት ደረጃ የደረሰ ሲሆን የዘጠኙን ክፍሎችና የተማሪ ምዘና አሠራር ይመራል። የመምህራን ሥልጠና ዕቅድ አዘጋጅቶ ያካሄዳል።',
     'graduation', 40, 'published'),
    ('አዳኔው ኃይለ ማርያም', 'የመዝሙር ክፍል ኃላፊ', 'administrative',
     E'የኮረብ ቡድኖችን አገልግሎትና የመዝሙር ማህደር ይከታተላል፤ ለበዓላት የሚዘጋጁ ሥርዓቶችን በማስተባበር ይመራል። የሕፃናት የመዝሙር ትምህርት ውድድር አዘጋጅ ነው።',
     'choir', 50, 'published'),
    ('ገዢ ማርያም ወልደ ጊዮርጊስ', 'የእመቤቶች ማህበረ ሐዋርያት ኃላፊ', 'pastoral',
     E'የእመቤቶችን የጸሎትና የዕርዳታ አገልግሎት ትግበራ ስት መሪ ስትሆን ለቸገሪ ቤተ ሰቦች የሚሰጠውን ድጋፍ ትመራል። በት/ቤቱ የወላጅ ጉዳይ ክፍል ተሳታፊ ናቸው።',
     null, 60, 'published'),
    ('ገዢ ዓባይ ተስፋዬ', 'የማህበራዊ ጉዳይ ክፍል ኃላፊ', 'administrative',
     E'ለቸገሪ ቤተ ሰቦች ዕርዳታ፣ የቤተ ሰብ ጉብኝትና ለተማሪ ግብዣ ድጋፍ የሚያደረገውን ሥራ ይከታተላል። የወርሃ ዕርዳታ ዝርዝርና ሒሳቅ በእርሱ ኃላፊነት ይዘጋጃል።',
     'outreach', 70, 'published'),
    ('ሐቀኛ ጊርማ ተሾመ', 'የሚዲያና የተዘዋዋሪ ገጻት ኃላፊ', 'administrative',
     E'የቤተ ክርስቲያኗን ድረ ገጽ፣ የቃረን ማህደርና የፎቶ ማህደርን ይከታተላል፤ ለማኅበረ ሐዋርያት የሚወጡ መልእክቶችን ያዘጋጃል። ለተማሪዎች የሚዲያ ሥልጠና መምህር ነው።',
     'library', 80, 'published'),
    ('ሽማግሌ ተሾመ ወልደ ሚካኤል', 'የጉባኤ አማካሪና የሽማግሌዎች ተወካይ', 'advisory',
     E'ለአርባ ዓመታት በአገልግሎት የቆዩ ሲሆን ለት/ቤቱ የሕንፃና ማህበረሰብ ጉዳይ አማካሪ ናቸው። በጉባኤ የሚቀርቡ ውሳኔዎች በእነሱ ምክር ይታይላሉ።',
     'church', 90, 'published')
  ) as v(name_am, title_am, role_key, bio_am, media_key, ord, state)
  left join demo_media dm on dm.key = v.media_key
 where not exists (select 1 from public.leadership l where l.name_am = v.name_am);

-- ─── faqs ────────────────────────────────────────────────────────────────────
insert into public.faqs (category_am, question_am, answer_am, sort_order, state)
select v.category_am, v.question_am, v.answer_am, v.ord, 'published'::public.content_state
  from (values
    ('ምዝገባ', 'ልጅን ለመመዝገብ ምን ያህል ዕድሜ ያስፈልጋል?',
     'ከዕድሜ ፬ ጀምሮ በደረጃ ፩ (ሕፃናት ሀ/ለ) ይቀበላል፤ ከዚያ በኋላ ደረጃው በእድሜና በቀድሞ ትምህርት ይወሰናል። የመጀመሪያ ምዝገባ በድረ ገጹ ማመልከቻ ይደረጋል።', 10),
    ('ምዝገባ', 'የመመዝገቢያ ክፍያ አለ?',
     'የትምህርቱ አገልግሎት ክፍያ የለውም። ለመጻሕፍትና ለእቃ ድጋፍ የሚፈልግ ቤተ ሰብ በማህበራዊ ጉዳይ ክፍል በኩል ዕርዳታ ማግኘት ይችላል።', 20),
    ('ምዝገባ', 'ማመልከቻ ከተሰጠ በኋላ ምላሽ ምን ያህል ጊዜ ይወስዳል?',
     'በተለመደው በሦስት ሳምንት ውስጥ የምልከታ ክፍለ ጊዜ ተደርጎ ደረጃው ይወሰናል፤ ወላጁ በስልክና በኢሜይል ይገናኛል።', 30),
    ('ትምህርት', 'ክፍሎች በየትኛው ሰዓት ይካሄዳሉ?',
     'ሕፃናት እሁድ ጠዋት 8:30 እስከ 12:00፣ ወጣቶች ከሰዓት 2:00–3:30፣ አባቶችና እመቤቶች ከሰዓት 4:00–5:30 ይማራሉ፤ የመምህራን ዝግጅት ቅዳሜ 2:00–4:00 ነው።', 40),
    ('ትምህርት', 'የትምህርት ደረጃዎች ስንት ናቸው?',
     'ዘጠኝ ደረጃ አለ፦ ሕፃናት ፩–፪፣ ወጣቶች ፫፣ የወጣቶች ክፍል፣ አባቶችና እመቤቶች ሁለት ክፍል፣ የመምህራን ዝግጅት። እያንዳንዱ ደረጃ የራሱ ዕርሳስና መገምገሚያ አለው።', 50),
    ('ትምህርት', 'ልጅ ከክፍል ወደ ክፍል እንዴት ያልፋል?',
     'ማሻገር የሚወሰነው በመገኘት፣ በምዘና ውጤትና በመምህር ማስታወሻ ነው፤ ውጤቱ በወላጅ ገጽ ይታያል፤ ወላጅ ከመምህር ጋር በወርሃ ስብሰባ ይነጋገራል።', 60),
    ('ወላጆች', 'የልጅን መገኘትና ውጤት እንዴት ማየት እችላለሁ?',
     'በድረ ገጹ የወላጅ ገጽ በኩል። ስልክዎና የቤተ ሰብ መረጃ በተመዘገበ በኋላ የመግቢያ ዝርዝር ይላክልዎታል፤ የእያንዳንዱ ክፍለ ጊዜ መገኘትና ምዘና አልፎ አልፎ ይታያል።', 70),
    ('ወላጆች', 'ልጄ ከሆነው ደረጃ በታች ከሆነ ምን ይደረጋል?',
     'በመምህራን ቡድን የተጨማሪ ድጋፍ ክፍለ ጊዜ ይዘጋጃል፤ ወላጅ በወርሃ ስብሰባ ይከታተላል። አስፈላጊ ከሆነ ለአጭር ጊዜ ወደ ታችኛው ደረጃ ማዘዋወር ይደረጋል።', 80),
    ('አገልግሎት', 'በመምህርነት እንዴት ማገዝ እችላለሁ?',
     'በድረ ገጹ ተግባሪ/መምህር ማመልከቻ ይሙሉ፤ ከምልከታ በኋላ የመምህራን ዝግጅት ደረጃ ይገባሉ። የትምህርተ ሐሳብና የክፍል አስተዳደር ሥልጠና በሁለት ዓመት ይከተላል።', 90),
    ('አገልግሎት', 'የልገሳ ድጋፍ እንዴት ማድረስ ይቻላል?',
     'በድረ ገጹ በልገሳ ገጽ፣ በባንክ ዕዛ ማዘዋወር ወይም በቤተ ክርስቲያኑ ሒሳብ ክፍል በቀጥታ። የተሰጠው ሁሉ በደረሰኝ ተመዝግቦ በጉባኤ ይታይና ወደፊት።', 100),
    ('አገልግሎት', 'ልገሳዬ ለየትኛው አገልግሎት እንደሚደርስ ማወቅ እችላለሁ?',
     'ዕግር በሚያደርጉበት ጊዜ ለትምህርት፣ ለግንባታ ወይም ለዕርዳታ መምረጥ ይቻላል። ሒሳቁ በየሦስት ወሩ ለተለጋሾችና ለጉባኤ ማሳያ ይቀርባል።', 110),
    ('ሥርዓት', 'ሰንበት ት/ቤቱ የታሪክ ቤተ ክርስቲያን አማራጭ ይከተላል?',
     'አይከተልም፤ የትምህርተ ሐሳቦቹ ከቅዱሳት መጻሕፍት፣ ከአባቶች ትንሣኤና ከቤተ ክርስቲያኑ ሥርዓተ ኣምልኮ የተወሰዱ ናቸው።', 120),
    ('ሥርዓት', 'መዝሙርና ዕገታ የትምህርቱ አካል ነው?',
     'አዎ። በእያንዳንዱ ደረጃ መዝሙረ ዳዊትና የኮረብ አገልግሎት ክፍለ ጊዜ አለ፤ ለሚፈልጉ ልጆች የከበሮና የዋዜማ ትምህርት በነጻ ይሰጣል።', 130),
    ('አጠቃላይ', 'አድራሻውንና የመገናኛ ሰዓት እንዴት ማወቅ ይቻላል?',
     'በ"አግኙን" ገጽ አድራሻ፣ ስልክና የካርታ አገናኝ አለ፤ ከእሁድ ጸሎት በፊትና በኋላ በግቢው መዝገብ ማግኘት ይቻላል። በድረ ገጹ ማመልከቻ ጥያቄ ማቅረብ ይቻላል።', 140)
  ) as v(category_am, question_am, answer_am, ord)
 where not exists (select 1 from public.faqs f where f.question_am = v.question_am);

-- ─── organization structure ──────────────────────────────────────────────────
-- A three-level tree, inserted one level at a time because a row cannot point at
-- a parent that the same statement has only just created.
create temporary table org_seed (
  key    text,
  parent text,
  depth  integer,
  name_am text,
  head_label text,
  head_name text,
  summary_am text,
  ord integer
);
insert into org_seed (key, parent, depth, name_am, head_label, head_name, summary_am, ord) values
  ('root', null, 0, 'ቅድስት ልደታ ለማርያም እና አቡነ ገብርኤል መንፈስ ቅዱስ ቤ/ክ', 'አገልግሎተ ማዕከል ካህን', 'ቀ. አባ ገብረ ሥላሴ ወልደ ማርያም',
   'በቀርሳ ፈለገ ብርሐን የሚገኝ የማኅበረ ሐዋርያት ቤተ ክርስቲያን፤ የሰንበት ት/ቤትና የማህበራዊ አገልግሎቶች ማዕከል።', 10),
  ('council', 'root', 1, 'የካህናት ቆንስል', 'ኃላፊ', 'ቀ. አባ ገብረ ሥላሴ ወልደ ማርያም',
   'የሥርዓተ ኣምልኮ፣ የምስጢሮችና የመንፈሳዊ አመራር ጉዳይ የሚያዝ ቆንስል።', 20),
  ('assembly', 'root', 1, 'የማኅበረ ሐዋርያት ጉባኤ', 'ኃላፊ', 'ሽማግሌ ተሾመ ወልደ ሚካኤል',
   'በዓመቱ ሁለት ጊዜ የሚሰባሰብና አገልግሎቱን የሚያጸድቅ ጉባኤ፤ በክፍሎች ኃላፊዎችና በተወካዮች ይወከላል።', 30),
  ('school', 'root', 1, 'ተክለቴዎፍሎስ ሰንበት ት/ቤት', 'ዋና መምህር', 'አዳኔው ገብረ ሥላሴ',
   'ዘጠኝ የትምህርት ደረጃዎችና የመምህራን ዝግጅት ያካትት የእምነት ትምህርት አገልግሎት።', 40),
  ('departments', 'root', 1, 'የአገልግሎት ክፍሎች', 'አመራር', 'የክፍሎች ኃላፊዎች ስብሰባ',
   'ሰባት ዘርፎች፤ እያንዳንዱ የራሱ ኃላፊ፣ የዓመት እቅድና መዝገብ አለው።', 70),
  ('finance', 'root', 1, 'የሒሳብና ንብረት አስተዳደር', 'ሒሳብ ተጠባባቂ', 'ገዢ ተሾመ ወልደ ጊዮርጊስ',
   'በጀት፣ ልገሳ፣ ወጪና የቤተ ክርስቲያን ንብረት መዝገብ፤ ለጉባኤ የሚቀርብ ሒሳቅ።', 150),
  ('levels', 'school', 2, 'የትምህርት ደረጃዎች', 'ክፍል አስተዳዳሪ', 'አዳኔው ገብረ ሥላሴ',
   'ሕፃናት፣ ወጣቶች፣ አባቶችና እመቤቶች ክፍሎችና የተማሪ ምዘና አሠራር።', 50),
  ('teachers', 'school', 2, 'የመምህራን ቡድን', 'የዝግጅት ኃላፊ', 'አዳኔው ተሾመ',
   'በስልጣን ላይ ያሉ መምህራን፣ የሥልጠና መርሐ ግብርና የዕርሳስ ዝግጅት።', 60),
  ('mezmur', 'departments', 2, 'መዝሙርና ዕገታ ክፍል', 'ኃላፊ', 'አዳኔው ኃይለ ማርያም',
   'የዕገታ፣ የኮረብና የሥርዓት መዝሙር አገልግሎት፤ የከበሮና የዋዜማ ትምህርት።', 80),
  ('education', 'departments', 2, 'መንፈሳዊ ትምህርት ክፍል', 'ኃላፊ', 'አዳኔው ገብረ ሥላሴ',
   'የሰንበት ት/ቤት ዕርሳስ፣ የተማሪ ምዝገባና የመምህራን ጉዞ።', 90),
  ('media', 'departments', 2, 'ሚዲያ ክፍል', 'ኃላፊ', 'ሐቀኛ ጊርማ ተሾመ',
   'ፎቶ፣ ቪዲዮ፣ ድረ ገጽና ማህበራዊ ገጻት፤ የቃረን ማህደር።', 100),
  ('evangelism', 'departments', 2, 'ወንጌል ስርጭት ክፍል', 'ኃላፊ', 'ቀ. አባ ፌቃደ ገብረ ክርስቶስ',
   'የወንጌል ሥራ፣ አዲስ ተማሪ ማግኘትና የወጣቶች ቀጠሮዎች።', 110),
  ('social', 'departments', 2, 'ማህበራዊ ጉዳይ ክፍል', 'ኃላፊ', 'ገዢ ዓባይ ተስፋዬ',
   'ለቸገሪ ቤተ ሰቦች ዕርዳታና የቤተ ሰብ ጉብኝት።', 120),
  ('arts', 'departments', 2, 'ሥነ ጥበብና ዘገባ ክፍል', 'ኃላፊ', 'ዲቂ ዮናስ ተሾመ',
   'መሣል፣ ዘገባና የቤተ ክርስቲያን ሥዕል አገልግሎት።', 130),
  ('volunteer', 'departments', 2, 'የተገባሪዎች አገልግሎት', 'አስተባባሪ', 'ገዢ ማርያም ወልደ ጊዮርጊስ',
   'በሁሉም ክፍሎች የሚረዱ ተገባሪዎች ዝርዝርና መርሐ ግብር።', 140);

insert into public.org_units (parent_id, name_am, head_label, head_name, summary_am, sort_order, is_visible)
select null, s.name_am, s.head_label, s.head_name, s.summary_am, s.ord, true
  from org_seed s
 where s.depth = 0
   and not exists (select 1 from public.org_units o where o.name_am = s.name_am);

insert into public.org_units (parent_id, name_am, head_label, head_name, summary_am, sort_order, is_visible)
select p.id, s.name_am, s.head_label, s.head_name, s.summary_am, s.ord, true
  from org_seed s
  join org_seed pp on pp.key = s.parent
  join public.org_units p on p.name_am = pp.name_am
 where s.depth = 1
   and not exists (select 1 from public.org_units o where o.name_am = s.name_am);

insert into public.org_units (parent_id, name_am, head_label, head_name, summary_am, sort_order, is_visible)
select p.id, s.name_am, s.head_label, s.head_name, s.summary_am, s.ord, true
  from org_seed s
  join org_seed pp on pp.key = s.parent
  join public.org_units p on p.name_am = pp.name_am
 where s.depth = 2
   and not exists (select 1 from public.org_units o where o.name_am = s.name_am);

commit;

-- ─── what the public site now has to show ────────────────────────────────────
select 'news' as rel, count(*) filter (where state = 'published') as published,
       count(*) filter (where state = 'submitted') as pending,
       count(*)::int as total
  from public.news
union all select 'events', count(*) filter (where starts_at >= now()), 0, count(*)::int from public.events
union all select 'event registrations', count(*), 0, count(*)::int from public.event_registrations
union all select 'sermons', count(*) filter (where state = 'published'), 0, count(*)::int from public.sermons
union all select 'mezmur', count(*) filter (where state = 'published'), 0, count(*)::int from public.mezmur
union all select 'publications', count(*) filter (where state = 'published'), 0, count(*)::int from public.publications
union all select 'albums', count(*) filter (where state = 'published'), 0, count(*)::int from public.gallery_albums
union all select 'album photos', count(*), 0, count(*)::int from public.album_media
union all select 'media files', count(*) filter (where is_public), 0, count(*)::int from public.media_files
union all select 'leadership', count(*) filter (where state = 'published'), 0, count(*)::int from public.leadership
union all select 'faqs', count(*) filter (where state = 'published'), 0, count(*)::int from public.faqs
union all select 'org units', count(*), 0, count(*)::int from public.org_units
union all select 'media categories', count(*), 0, count(*)::int from public.media_categories;
