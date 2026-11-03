-- ─── one vocabulary for blocks, one address space for pages ─────────────────
-- Two seeded things could not work with the site as written:
--
-- 1. `src/site/blocks.tsx` renders a block by switching on `block_type`, and that
--    switch grew a richer vocabulary (cards, list, stats, verses, map, gallery,
--    donate, feed blocks) after migration 0200 froze the CHECK list. The CMS could
--    not save the blocks the site can render, and the seeded homepage's
--    `card_grid`/`media_list` rows fell through to the plain-text arm.
-- 2. The seeded page slugs (`about-us`, `photo-gallery`, `mezmur-choir`, …) are not
--    the paths the router owns (`/about`, `/gallery`, `/mezmur`, … in
--    `src/lib/routes.ts`). Because `v_site_menu` builds `/<slug>`, every header
--    link led either to a page the router does not have or to a `CmsPage` lookup
--    that found no row.

-- 1 ────────────────────────────────────────────────────────────────────────────
-- Both vocabularies are accepted so rows written under the old list stay valid.
alter table public.page_blocks
  drop constraint if exists page_blocks_block_type_check;

alter table public.page_blocks
  add constraint page_blocks_block_type_check check (block_type in (
    'hero', 'heading', 'text', 'cards', 'list', 'stats', 'verses', 'quote', 'cta',
    'map', 'video', 'gallery', 'donate', 'news', 'events', 'sermons', 'mezmur', 'publications',
    'richtext', 'stat_row', 'card_grid', 'media_list', 'contact', 'faq', 'embed', 'timeline'
  ));

-- 2 ────────────────────────────────────────────────────────────────────────────
-- A page whose slug equals a router path is reachable from the menu as it is;
-- the five pages with no dedicated component keep their slug and are addressed
-- through `/page/<slug>`, which the menu carries in `href`.
update public.pages set slug = 'about'          where slug = 'about-us';
update public.pages set slug = 'vision'         where slug = 'vision-mission';
update public.pages set slug = 'leadership'     where slug = 'spiritual-leadership';
update public.pages set slug = 'gallery'        where slug = 'photo-gallery';
update public.pages set slug = 'mezmur'         where slug = 'mezmur-choir';
update public.pages set slug = 'register'       where slug = 'registration';
update public.pages set slug = 'sunday-school'  where slug = 'spiritual-education';

update public.menu_items i
   set href = '/page/' || p.slug
  from public.pages p
 where i.page_id = p.id
   and p.slug in ('teachers', 'video-gallery', 'organization-structure', 'privacy', 'volunteer')
   and nullif(i.href, '') is null;

-- 3 ────────────────────────────────────────────────────────────────────────────
-- The starter copy these four pages are composed from. Deleting first makes the
-- migration repeatable and keeps this file the single source of truth for them;
-- blocks on any other page, and blocks an editor adds later through the CMS, are
-- not touched.
delete from public.page_blocks pb
  using public.pages p
 where p.id = pb.page_id
   and p.slug in ('home', 'about', 'vision', 'history');

with seed (page_slug, section_key, block_type, title_am, body_am, items, settings, sort_order) as (
  values
  -- መነሻ ────────────────────────────────────────────────────────────────────────
  ('home', 'hero', 'hero',
   'እምነትን በቤት፣ ተስፋን በልብ',
   'ተክለቴዎፍሎስ ሰንበት ትምህርት ቤት ሕፃናትን፣ ወጣቶችንና አባቶችን በቅዱሳት መጻሕፍት፣ በሥርዓተ ኣምልኮና በመዝሙረ ዳዊት የሚያድግ እምነት ይሰጣል። ልጅዎን ያስመዝግቡ፣ በመምህርነት ይሳተፉ፣ ወይም አገልግሎቱን በልገሳ ይደግፉ።',
   '[]'::jsonb,
   '{"eyebrow":"የእምነት ትምህርት ማዕከል","primary_label":"ተማሪ ይመዝገቡ","primary_href":"/register","secondary_label":"ለጋሽ","secondary_href":"/donate"}'::jsonb, 10),
  ('home', 'stats', 'stats', null, null,
   '[{"value":412,"label":"ንቁ ተማሪዎች"},{"value":38,"label":"በስልጣን ላይ ያሉ መምህራን"},{"value":24,"label":"የሚሰሩ ክፍሎች"},{"value":7,"label":"የአገልግሎት ዘርፎች"}]'::jsonb,
   '{}'::jsonb, 20),
  ('home', 'welcome', 'text', 'እንኳን ደህና መጡ',
   'በቀርሳ ፈለገ ብርሐን ቅድስት ልደታ ለማርያም እና አቡነ ገብርኤል መንፈስ ቅዱስ ቤተ ክርስቲያን ውስጥ የሚሰጥ የሰንበት ትምህርት ቤት ነን። ትምህርታችን ከዕርሳስ ማዕከል ጀምሮ እስከ የመምህራን ዝግጅት በደረጃ ይከተላል፤ እያንዳንዱ ደረጃ የራሱ የሆነ የትምህርተ ሐሳብ፣ የመጻሕፍት ዝርዝርና የመገምገሚያ መንገድ አለው።\nአገልግሎታችን በትምህርት አይወሰንም። በየወሩ የሚሰጥ የአባቶችና የእመቤቶች ጥናት፣ ለቸገሪዎች የሚደረግ ዕርዳታ፣ የመዝሙር ቡድኖች አገልግሎትና የወንጌል ስርጭት ሥራችን አካል ናቸው።',
   '[]'::jsonb, '{}'::jsonb, 30),
  ('home', 'about', 'cards', 'ምን እናምናለን፣ ምን እናደርጋለን',
   'ሦስቱ የአገልግሎት መሠረቶቻችን በአጭሩ።',
   '[{"title":"የመጻሕፍት ትምህርት","body":"ቅዱሳት መጻሕፍትን፣ የአባቶች ትርጓሜና የሥርዓተ ኣምልኮ ጥናት በዕድሜ ተስማሚ ደረጃ እናስተምራለን።","href":"/sunday-school","badge":"መሠረት"},{"title":"ሥርዓተ ኣምልኮና መዝሙር","body":"ዕገታ፣ መዝሙረ ዳዊትና የኮረብ አገልግሎት የትምህርቱ ሕይወት ክፍል ናቸው።","href":"/mezmur","badge":"አምልኮ"},{"title":"ማህበራዊ ሥራ","body":"ለቸገሪ ቤተ ሰቦች ዕርዳታ፣ ጎረቤት ጉብኝትና የወጣቶች ሥልጠና በአቅም ሰጪዎች በኩል ይከናወናል።","href":"/departments","badge":"ማህበር"}]'::jsonb,
   '{}'::jsonb, 40),
  ('home', 'departments', 'cards', 'ክፍሎቻችን',
   'እያንዳንዱ ዘርፍ የራሱ ኃላፊ፣ የራሱ እቅድና የራሱ መዝገብ አለው።',
   '[{"title":"የመዝሙር ክፍል","body":"የዕገታ፣ የኮረብና የሥርዓት መዝሙር አገልግሎት።","href":"/departments"},{"title":"መንፈሳዊ ትምህርት","body":"ሰንበት ት/ቤት ዕርሳስ፣ የመምህራን ጉዞና የተማሪ ምዝገባ።","href":"/sunday-school"},{"title":"ሚዲያ ክፍል","body":"ፎቶ፣ ቪዲዮ፣ ድረ ገጽና ማህበራዊ ገጻቶች።","href":"/media"},{"title":"ወንጌል ስርጭት","body":"የወንጌል ሥራና አዲስ ተማሪ ማግኘት።","href":"/departments"},{"title":"ማህበራዊ ጉዳይ","body":"ለቸገሪዎች ዕርዳታና የቤተ ሰብ ጉብኝት።","href":"/departments"},{"title":"ሥነ ጥበብና ዘገባ","body":"መሣል፣ ዘገባና የቤተ ክርስቲያን ጥበብ።","href":"/departments"}]'::jsonb,
   '{}'::jsonb, 50),
  ('home', 'education', 'list', 'የትምህርት ደረጃዎች',
   'ልጅዎ የሚገባበት ደረጃ በእድሜና በቀድሞ ትምህርት ይወሰናል።',
   '[{"title":"ደረጃ ፩ — ሕፃናት (ዕድሜ 4–7)","body":"መሠረታዊ የእምነት ትምህርት በመሣልና በመዝሙር።"},{"title":"ደረጃ ፪ — ሕፃናት (ዕድሜ 8–11)","body":"የቅዱሳት ሕይወትና የጸሎት ልምድ።"},{"title":"ደረጃ ፫ — ወጣቶች (ዕድሜ 12–15)","body":"የእምነት ትንተናና የመንፈስ ጽሑፍ ሥርዓተ ትርጓሜ።"},{"title":"የወጣቶች ክፍል (ዕድሜ 16–25)","body":"ትርጉመ ቅዱሳት መጻሕፍትና የሕይወት ጥያቄዎች።"},{"title":"አባቶችና እመቤቶች (26 በላይ)","body":"ጥልቅ የአባቶች ትምህርትና የሥርዓተ ኣምልኮ ጥናት።"},{"title":"የመምህራን ትምህርት","body":"ለመምህርነት የሚዘጋጁ ተማሪዎች፤ ከዚህ ደረጃ በመውጣት በክፍል ይቀርጻሉ።"}]'::jsonb,
   '{}'::jsonb, 60),
  ('home', 'news', 'news', 'የቅርብ ጊዜ ዜና', 'በድረ ገጹ የታወጁ ዜናዎች።', '[]'::jsonb, '{"count":3,"order_by":"published_at"}'::jsonb, 70),
  ('home', 'events', 'events', 'የሚመጡ ልዩ ክንውኖች', 'ማረጋገጫ ለመያዝ በገጹ ይመዝገቡ።', '[]'::jsonb, '{"count":4,"order_by":"starts_at"}'::jsonb, 80),
  ('home', 'sermons', 'sermons', 'ቃረንና ክስተት', 'የቀርቡ ንግዶች በድምጽና በጽሑፍ።', '[]'::jsonb, '{"count":4,"order_by":"delivered_on"}'::jsonb, 90),
  ('home', 'mezmur', 'mezmur', 'መዝሙርና ዕገታ', 'ከማህደሩ የተመረጡ መዝሙሮች።', '[]'::jsonb, '{"count":4,"order_by":"created_at"}'::jsonb, 100),
  ('home', 'gallery', 'gallery', 'የፎቶ ማህደር', 'ከአገልግሎቶቻችን ኃሳብ።', '[]'::jsonb, '{}'::jsonb, 110),
  ('home', 'verses', 'verses', null, null,
   '[{"text":"መንግስቱ እግዚአብሔር አይዳም፣ በጽሑፍ ሰፊሮ ወለድ።","ref":"መዝሙር 145:13"},{"text":"ልጅን በሚገባው መንገድ አስተድፍ፤ ሽምጥ አይዘውድም።","ref":"መሳሌ 22:6"}]'::jsonb,
   '{}'::jsonb, 120),
  ('home', 'join', 'cta', 'ዛሬ ይቀላቀሉ',
   'ልጅዎን ለሰንበት ትምህርት ቤት ማመዘገብም፣ በመምህርነት ማገዝም በድረ ገጹ ይቻላል።',
   '[]'::jsonb, '{"label":"ማመልከቻ ስጥ","href":"/register"}'::jsonb, 130),
  ('home', 'donate', 'donate', 'በልገሳ ይደግፉ',
   'የትምህርት ግብዣ፣ የመምህራን ዕገታና የግንባታ ሥራ በልገሳ ይከናወናል።', '[]'::jsonb, '{}'::jsonb, 140),
  ('home', 'contact', 'map', 'አግኙን', null, '[]'::jsonb,
   '{"address":"ቀርሳ ፈለገ ብርሐን፣ አዲስ አበባ","phone":"+251 11 466 0000"}'::jsonb, 150),

  -- ስለ ት/ቤቱ ────────────────────────────────────────────────────────────────────
  ('about', 'intro', 'text', 'ስለ ት/ቤቱ',
   'ተክለቴዎፍሎስ ሰንበት ትምህርት ቤት በቀርሳ ፈለገ ብርሐን ቅድስት ልደታ ለማርያም እና አቡነ ገብርኤል መንፈስ ቅዱስ ቤ/ክ ውስጥ የሚሠራ የእምነት ትምህርት አገልግሎት ነው። ዓላማው የተሠለፈውን እምነት በቅዱሳት መጻሕፍትና በአባቶች ትንሣኤ መሠረት ለዕድሜ ቡድኖች በደረጃ ማስተማር ነው።\nት/ቤቱ በካህናት ቆንስል፣ በመንፈሳዊ አመራርና በመምህራን ቡድን ይመራል፤ እያንዳንዱ ዘርፍ የራሱ ኃላፊና የዓመት እቅድ አለው።',
   '[]'::jsonb, '{}'::jsonb, 10),
  ('about', 'values', 'cards', 'የሥራ መርሆዎቻችን', null,
   '[{"title":"ስርዓት","body":"ትምህርቱ በደረጃ፣ በእቅድና በመገምገሚያ ይከተላል፤ የተማሪ ማሻገር በውጤትና በመገኘት ይወሰናል።","badge":"አሠራር"},{"title":"አባቶች ትምህርት","body":"የቤተ ክርስቲያኑ አባቶች ትንሣኤ፣ ጸሎተ ሰዓትና ሥርዓተ ኣምልኮ የትምህርተ ሐሳቦች መሠረት ናቸው።","badge":"እምነት"},{"title":"ማህበራዊ ኃላፊነት","body":"ትምህርቱ ወደ ሕይወት ይተረጎማል፤ ቸልተኝነትና ለቸገሪ ማህበር ኃላፊነት እናስተምራለን።","badge":"ሕይወት"},{"title":"ለሁሉም ክፍት","body":"ልጆች፣ ወጣቶችና አባቶች ያለ ክፍያ በዕድሜ ደረጃቸው ይማራሉ፤ ለፍሁድ ቤተ ሰቦች ድጋፍ አለ።","badge":"ክፍት"},{"title":"ተማሪ መከታተያ","body":"የእያንዳንዱ ተማሪ መገኘት፣ ውጤትና ማስታወሻ ተጠብቆ ይገኛል፤ ወላጅ የልጁን አገልግሎት በግል ገጹ ይከታተናል።","badge":"ግልጽ"},{"title":"ሐተታና መዝሙር","body":"መዝሙረ ዳዊት፣ መሣልና ዘገባ የትምህርቱ አካል ሆነው በኮረብ ቡድኖች ይሠጣሉ።","badge":"ዝማሬ"}]'::jsonb,
   '{}'::jsonb, 20),
  ('about', 'quote', 'quote', 'ትምህርቱ የሕይወት መንገድ ነው፤ የተማረው ለሌላው ተሻጋሪ ሕይወት ይሆናል።', null, '[]'::jsonb,
   '{"author":"የቤተ ክርስቲያኑ መንፈሳዊ አመራር"}'::jsonb, 30),
  ('about', 'cta', 'cta', 'ጥያቄ አለዎት?', 'የምዝገባ፣ የክፍል ደረጃ ወይም የመምህርነት አገልግሎት ማንኛውንም ጥያቄ ይላኩልን።',
   '[]'::jsonb, '{"label":"ጥያቄ ላክ","href":"/contact"}'::jsonb, 40),

  -- ዕይታና ተልእኮ ─────────────────────────────────────────────────────────────────
  ('vision', 'intro', 'text', 'ዕይታችን',
   'በአባቶች ትምህርት የተሠራጀ፣ በጸሎትና በአምልኮ የሚኖር፣ ለማህበሩ ተጠያቂ የሆነ ትውልድ ማብቃት።',
   '[]'::jsonb, '{}'::jsonb, 10),
  ('vision', 'mission', 'text', 'ተልእኳችን',
   'የቅዱሳት መጻሕፍት ትርጉምን፣ የሥርዓተ ኣምልኮንና የቤተ ክርስቲያን ታሪክን ለእያንዳንዱ ዕድሜ ደረጃ በሚመጥን መንገድ ማስተማር።\nመምህራንን በማስተማር ጥበብና በአባቶች ትንሣኤ ማዘጋጀት።\nየተማሪ ሕይወትን በጉባኤ፣ በመገምገሚያና በወላጅ ግንኙነት መከታተል።\nለቸገሪ ቤተ ሰቦች፣ ለጎረቤትና ለአገር በዕርዳታና በጸሎት መቅረብ።',
   '[]'::jsonb, '{}'::jsonb, 20),
  ('vision', 'principles', 'list', 'የምንከተላቸው መርሆዎች', null,
   '[{"title":"ቅዱሳት መጻሕፍት መሠረት","body":"እያንዳንዱ ትምህርተ ሐሳብ ከጽሑፍ፣ ከአባቶች ትንሣኤና ከሥርዓት የተወሰደ መረጃ አለው።"},{"title":"በዕድሜ የተመዘነ ትምህርት","body":"ልጆች በመሣልና በመዝሙር፣ ወጣቶች በትንተና፣ አባቶች በጥልቅ ጥናት ይማራሉ።"},{"title":"የቤተ ሰብ ተሳትፎ","body":"ወላጅ የልጁን እድገት ይከታተናል፤ የጉባኤ መከታተያ ውጤቱ በግል ገጹ ይታዋል።"},{"title":"ግልጽና ተጠያቂ አሠራር","body":"ልገሳ፣ በጀትና ወጪ በሁሉት ዘርፎች ተመዝግቦ በጉባኤ ይጸድቃል።"},{"title":"አገልግሎት ውጤት ነው","body":"ትምህርቱ የሚለካው በተማሪው ላይ በተካሄደው አገልግሎት ነው።"}]'::jsonb,
   '{}'::jsonb, 30),
  ('vision', 'verses', 'verses', null, null,
   '[{"text":"የእግዚአብሔር ቃል ቀጭን ስፍራ ነው፤ ለነፍስም ለመንፈስም ይለያል።","ref":"ዕብራውስ 4:12"},{"text":"መንግስቱ እግዚአብሔር አይዳም፣ በጽሑፍ ሰፊሮ ወለድ።","ref":"መዝሙር 145:13"}]'::jsonb,
   '{}'::jsonb, 40),

  -- ታሪካችን ──────────────────────────────────────────────────────────────────────
  ('history', 'intro', 'text', 'ከመሠረት እስከ ዛሬ',
   'ት/ቤቱ የተጀመረው በጥቂት ልጆችና በሐዳሪ መምህራን በቤተ ክርስቲያኑ ደጃፍ ላይ ሲሆን ዛሬ በዘጠኝ የትምህርት ደረጃዎችና በመቶዎች ባሉ ተማሪዎች ያገለግላል።',
   '[]'::jsonb, '{}'::jsonb, 10),
  ('history', 'milestones', 'list', 'ዋና ዋና ዓመታት', null,
   '[{"title":"የመሠረት ዓመት — ዕርሳስ ማዕከል መክፈት","body":"አምስት ክፍሎችና አሥራ ሐምስ ተማሪዎች፤ የመጀመሪያው የዕገታ መዝሙር ቡድን ተቋቋመ።"},{"title":"የመምህራን ትምህርት መጀመር","body":"ለመምህርነት የሚዘጋጁ ተማሪዎች ደረጃ ተፈጠረ፤ የመጀመሪያዎቹ ዘጠኝ መምህራን ተመረጡ።"},{"title":"የወጣቶች ክፍል መነሣት","body":"ትርጉመ ቅዱሳት መጻሕፍትና የሕይወት ጥያቄዎች ጥናት ጀመረ።"},{"title":"የሚዲያ ክፍልና የድረ ገጽ መክፈት","body":"ቃረን በድምጽ፣ ሥዕልና ቪዲዮ በማህደር ለሕዝብ ቀረበ።"},{"title":"የማህበራዊ ዕርዳታ ሥራ መስፋፋት","body":"ለመቶ ቤተ ሰቦች የወርሃ ዕርዳታና የተማሪ ግብዣ ድጋፍ ተጀመረ።"},{"title":"የግንባታ ሥራና አዲስ ክፍሎች","body":"ሰባት የትምህርት ክፍሎች ተሠሩ፤ መጻሕፍት ማዕከል ተከፈተ።"}]'::jsonb,
   '{}'::jsonb, 20),
  ('history', 'quote', 'quote', 'የአባቶች እምነት ዛሬም ይኖራል፤ እኛ የተቀበልነውን እንሰጣለን።', null, '[]'::jsonb,
   '{"author":"በት/ቤቱ የመምህርነት አገልግሎት የጀመሩ ታላቅ መምህር"}'::jsonb, 30)
)
insert into public.page_blocks (page_id, section_key, block_type, title_am, body_am, items, settings, is_visible, sort_order)
select p.id, s.section_key, s.block_type, s.title_am, s.body_am, s.items, s.settings, true, s.sort_order
  from seed s
  join public.pages p on p.slug = s.page_slug
 order by s.page_slug, s.sort_order;

-- The header shows `excerpt_am` and the search results fall back to it, so a page
-- that was created without one is given a line instead of a blank subtitle.
update public.pages
   set excerpt_am = title_am || ' — በተክለቴዎፍሎስ ሰንበት ት/ቤት የታዘጀገ'
 where excerpt_am is null
   and state = 'published';

-- The `ግቢ` row is the only way a visitor reaches the staff half of the site. Its
-- children describe portals rather than pages, so they stay unlinked and the
-- parent carries the login path — an item with neither a page nor an href is
-- dropped by the header, which is why the row needed one.
update public.menu_items
   set href = '/erp/login', sort_order = 200
 where label_am = 'ግቢ' and parent_id is null;
