-- 2400 · Photographic blocks — the eleven photographs shipped in `public/images`
-- registered in the media library, the two block types the office asked for
-- (`newsletter` and `about`) and the rows that place them on መነሻ and ስለ ት/ቤቱ.
--
-- Nothing here removes a row and nothing overwrites what an editor already chose:
-- every statement is an `on conflict do nothing` insert, or an update that only
-- fills in a missing value, so re-running it against the live project is a no-op.

-- 1 ────────────────────────────────────────────────────────────────────────────
-- The vocabulary `src/site/blocks.tsx` switches on, plus the two new types.
alter table public.page_blocks
  drop constraint if exists page_blocks_block_type_check;

alter table public.page_blocks
  add constraint page_blocks_block_type_check check (block_type in (
    'hero', 'heading', 'text', 'cards', 'list', 'stats', 'verses', 'quote', 'cta',
    'map', 'video', 'gallery', 'donate', 'news', 'events', 'sermons', 'mezmur', 'publications',
    'newsletter', 'about',
    'richtext', 'stat_row', 'card_grid', 'media_list', 'contact', 'faq', 'embed', 'timeline'
  ));

-- 2 ────────────────────────────────────────────────────────────────────────────
-- የተጣሱ ፎቶዎች · the bundled photographs.
--
-- `public_url` is the site-relative path the browser already has, so the file it
-- loads is the one in `public/images` and no storage object is required; the row
-- exists so the media library, `useMediaUrl` and the public views can address the
-- picture like any uploaded one.
insert into public.media_files (id, bucket, storage_path, name, title_am, alt_am,
                               kind, mime_type, state, is_public, tags, public_url)
values
  ('a8000000-0000-4000-8000-000000000001', 'media', 'bundled/hero-procession.jpg', 'hero-procession.jpg',
   'የበዓል ሥርዐተ ልታኒ ሰላጤ',
   'ንጉሠ ነገሥትና ታቦት የያዙ ሽማግሌዎች በግቢው ውስጥ ተሰልፈው ሲነኩ ታይተዋል፤ ሕዝቡ በዕገታ ይከተላል።',
   'image', 'image/jpeg', 'published', true, '{"site","bundled"}', '/images/hero-procession.jpg'),

  ('a8000000-0000-4000-8000-000000000002', 'media', 'bundled/feast-timket.jpg', 'feast-timket.jpg',
   'የጥምቀት በዓልና ዐምባ ማቅደስ',
   'በጥምቀት ጠዋት ውሃ የቀደሰበት ሥርዓት፤ ነጭ ልብስ የለበሰ ሕዝብ በዙሪያው ተሰልፏል።',
   'image', 'image/jpeg', 'published', true, '{"site","bundled"}', '/images/feast-timket.jpg'),

  ('a8000000-0000-4000-8000-000000000003', 'media', 'bundled/church-exterior.jpg', 'church-exterior.jpg',
   'የቅድስት ልደታ ለማርያም ቤተ ክርስቲያን',
   'ከፀሐይ ግራ ተኩል የቆመ የዕምራ ጣሪያና የቤተ ክርስቲያኑ ግቢ፤ ፊቱ ላይ የሐዋርያት ሥዕል ታይቷል።',
   'image', 'image/jpeg', 'published', true, '{"site","bundled"}', '/images/church-exterior.jpg'),

  ('a8000000-0000-4000-8000-000000000004', 'media', 'bundled/worship-art.jpg', 'worship-art.jpg',
   'የዕገታና የሥርዓተ ኣምልኮ አገልግሎት',
   'በቤተ ክርስቲያን ውስጥ ነጭ ልብስ ለብሰው ዕገታ የሚዘፍኑና የሚጸልዩ ማኅበረ ሐዋርያት።',
   'image', 'image/jpeg', 'published', true, '{"site","bundled"}', '/images/worship-art.jpg'),

  ('a8000000-0000-4000-8000-000000000005', 'media', 'bundled/icon-george.jpg', 'icon-george.jpg',
   'የቅዱስ ገብርኤል ሥዕል',
   'በቀለም የተሳለ የቅዱስ ገብርኤል ሥዕል፤ በእጁ መስቀልና የዕገታ ቅጠል ይታያል።',
   'image', 'image/jpeg', 'published', true, '{"site","bundled"}', '/images/icon-george.jpg'),

  ('a8000000-0000-4000-8000-000000000006', 'media', 'bundled/geez-manuscript.jpg', 'geez-manuscript.jpg',
   'የግዕዝ ብራና ጽሑፍ',
   'በግዕዝ ፊደል ላይ በብራና የተጻፈ ዓለባና ምልክት ያለው የቤተ ክርስቲያን ጽሑፍ።',
   'image', 'image/jpeg', 'published', true, '{"site","bundled"}', '/images/geez-manuscript.jpg'),

  ('a8000000-0000-4000-8000-000000000007', 'media', 'bundled/gospels.jpg', 'gospels.jpg',
   'አርባዕተ ወንጌላት',
   'የወንጌል መጻሕፍት በተጋበዘ ሐረግ ታርፍና ባለቀለም ሥዕል ተከልከሎ በመሥዋዕት ላይ ቀርቷል።',
   'image', 'image/jpeg', 'published', true, '{"site","bundled"}', '/images/gospels.jpg'),

  ('a8000000-0000-4000-8000-000000000008', 'media', 'bundled/community-outreach.jpg', 'community-outreach.jpg',
   'የማህበራዊ ዕርዳታ ሥራ',
   'ጥሬ እቃ የሞሉ ከረጢቶች በግቢው ወለል ላይ ተደርድረው ለቸገሪ ቤተ ሰቦች ሲሰጡ ታይተዋል።',
   'image', 'image/jpeg', 'published', true, '{"site","bundled"}', '/images/community-outreach.jpg'),

  ('a8000000-0000-4000-8000-000000000009', 'media', 'bundled/lalibela-interior.jpg', 'lalibela-interior.jpg',
   'የላሊበላ ውስጥ ቤተ ክርስቲያን',
   'ከዓለት የተፈለፈለ ውስጥ ቤተ ክርስቲያን፤ በጨረቃ ብራና የታጠፉ ተጎብኚዎች ውስጥ ታይተዋል።',
   'image', 'image/jpeg', 'published', true, '{"site","bundled"}', '/images/lalibela-interior.jpg'),

  ('a8000000-0000-4000-8000-000000000010', 'media', 'bundled/aksum-bible.jpg', 'aksum-bible.jpg',
   'የአክሱም ቅዱስ መጽሐፍ',
   'ብራና ላይ የተጻፈና በቆዳ ታሸጎ የቅዱስ መጽሐፍ ቅጂ ከቤተ ክርስቲያን መሣያት ጋር ቀርቷል።',
   'image', 'image/jpeg', 'published', true, '{"site","bundled"}', '/images/aksum-bible.jpg'),

  ('a8000000-0000-4000-8000-000000000011', 'media', 'bundled/deacons.jpg', 'deacons.jpg',
   'የዲቆኖች አገልግሎት',
   'ነጭ ልብስና ክብር የያዙ ዲቆኖች በቤተ ክርስቲያኑ ወጋ ላይ አገልግሎት ሲሰጡ ታይተዋል።',
   'image', 'image/jpeg', 'published', true, '{"site","bundled"}', '/images/deacons.jpg')
on conflict (bucket, storage_path) do nothing;

-- 3 ────────────────────────────────────────────────────────────────────────────
-- መነሻ · the hero picture and the three facts under it. A value the office has
-- already typed is kept: only the missing keys are filled.
update public.page_blocks pb
   set media_id = coalesce(pb.media_id, m.id),
       settings = pb.settings || jsonb_build_object(
         'background',      coalesce(nullif(pb.settings ->> 'background', ''),      '/images/hero-procession.jpg'),
         'eyebrow',         coalesce(nullif(pb.settings ->> 'eyebrow', ''),         'የእምነት ትምህርት ማዕከል'),
         'primary_label',   coalesce(nullif(pb.settings ->> 'primary_label', ''),   'ተማሪ ይመዝገቡ'),
         'primary_href',    coalesce(nullif(pb.settings ->> 'primary_href', ''),    '/register'),
         'secondary_label', coalesce(nullif(pb.settings ->> 'secondary_label', ''), 'ለጋሽ'),
         'secondary_href',  coalesce(nullif(pb.settings ->> 'secondary_href', ''),  '/donate'),
         'facts',           case
                              when jsonb_typeof(pb.settings -> 'facts') = 'array' then pb.settings -> 'facts'
                              else '[{"value":"412","label":"ንቁ ተማሪዎች"},
                                    {"value":"38","label":"በስልጣን ላይ ያሉ መምህራን"},
                                    {"value":"24","label":"የሚሰሩ ክፍሎች"}]'::jsonb
                            end
       )
  from public.pages p
  join public.media_files m on m.id = 'a8000000-0000-4000-8000-000000000001'
 where pb.page_id = p.id
   and p.slug = 'home'
   and pb.section_key = 'hero';

-- 4 ────────────────────────────────────────────────────────────────────────────
-- አዲስ ክፍሎች · the newsletter band on መነሻ, and on ስለ ት/ቤቱ the section that pairs
-- the page's own words with the three next programs plus the same band.
insert into public.page_blocks (page_id, section_key, block_type, title_am, body_am, items, settings, is_visible, sort_order)
select p.id, 'newsletter', 'newsletter',
       'የመረጃ ማሳወቂያ ተቀባይ ይሁኑ',
       'ዜናዎች፣ የፕሮግራም ጊዜያትና የምዝገባ መክፈቻ በኢሜይል ይድረሱልዎት።',
       '[]'::jsonb, '{"background":"/images/worship-art.jpg"}'::jsonb, true, 145
  from public.pages p
 where p.slug = 'home'
   and not exists (select 1 from public.page_blocks x where x.page_id = p.id and x.section_key = 'newsletter');

insert into public.page_blocks (page_id, section_key, block_type, title_am, body_am, items, settings, is_visible, sort_order)
select p.id, 'community', 'about',
       'እኛና የምንሠራው አገልግሎት',
       E'ተክለቴዎፍሎስ ሰንበት ትምህርት ቤት በቅድስት ልደታ ለማርያምና በአቡነ ገብርኤል መንፈስ ቅዱስ ቤተ ክርስቲያን የሚሠራ የእምነት ትምህርት አገልግሎት ነው። ሕፃናት፣ ወጣቶችና አባቶች በዕድሜ ደረጃቸው የቅዱሳት መጻሕፍት፣ የአባቶች ትንሣኤና የሥርዓተ ኣምልኮ ትምህርት ይሰጣቸዋል።\n'
     ||'በካህናት ቆንስልና በመምህራን ቡድን የሚመራው አገልግሎት የተማሪ ምዝገባ፣ የክፍል ደረጃና የመገምገሚያ ሥርዓት አለው፤ ወላጅ የልጁን መገኘትና ውጤት በግል ገጹ ይከታተናል።',
       '[]'::jsonb, '{"image":"/images/community-outreach.jpg"}'::jsonb, true, 15
  from public.pages p
 where p.slug = 'about'
   and not exists (select 1 from public.page_blocks x where x.page_id = p.id and x.section_key = 'community');

insert into public.page_blocks (page_id, section_key, block_type, title_am, body_am, items, settings, is_visible, sort_order)
select p.id, 'newsletter', 'newsletter',
       'ከቤተ ክርስቲያኑ ጋር ይገናኙ',
       'የምዝገባ ጊዜያት፣ የበዓል መርሐ ግብርና የዕርዳታ ሥራዎች በኢሜይል ይድረሱልዎት።',
       '[]'::jsonb, '{"background":"/images/church-exterior.jpg"}'::jsonb, true, 50
  from public.pages p
 where p.slug = 'about'
   and not exists (select 1 from public.page_blocks x where x.page_id = p.id and x.section_key = 'newsletter');

-- ስለ ት/ቤቱ · መሠረቱ ገና ምስል ከሌለው የቤተ ክርስቲያኑን ግቢ ይወስዳል።
update public.page_blocks pb
   set media_id = m.id
  from public.pages p
  join public.media_files m on m.id = 'a8000000-0000-4000-8000-000000000003'
 where pb.page_id = p.id
   and p.slug = 'about'
   and pb.section_key = 'intro'
   and pb.media_id is null
   and coalesce(pb.settings ->> 'image', '') = '';

-- 5 ────────────────────────────────────────────────────────────────────────────
-- ቁጥሮች · the home stat band gets a photograph behind it, again only when the
-- office has not chosen one, so the light text has something to sit on.
update public.page_blocks pb
   set settings = pb.settings || jsonb_build_object(
         'background', coalesce(nullif(pb.settings ->> 'background', ''), '/images/lalibela-interior.jpg')
       )
  from public.pages p
 where pb.page_id = p.id
   and p.slug = 'home'
   and pb.section_key = 'stats';
