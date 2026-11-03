-- 2300 · Branding — the church emblem, registered in the media library and
--        pointed at by the site settings the shells read.

insert into public.media_files (id, bucket, storage_path, name, title_am, alt_am, kind,
                               mime_type, byte_size, width, height, state, is_public, tags)
values (
  'a7000000-0000-4000-8000-000000000001',
  'media',
  'branding/eotc_logo.png',
  'eotc_logo.png',
  'የቤተ ክርስቲያን ምልክት',
  'ሁለት መሐምል ክንደ ንጉሠ ነገሥት ማዕከል ያዙበት የቅዱስ ገብርኤል ምልክት፤ በዙሪያው የተሠዋ ወይንና ስንዴ ፍራፍሬ።',
  'image',
  'image/png',
  185952,
  274,
  309,
  'published',
  true,
  '{"branding","logo"}'
)
on conflict (id) do nothing;

insert into public.site_settings (key, group_name, label_am, hint_am, value, value_type, is_public, sort_order)
values (
  'logo_path',
  'general',
  'የቤተ ክርስቲያን ምልክት',
  'በሚዲያ ታብሌት ውስጥ ያለ ፋይል path (ለምሳሌ branding/eotc_logo.png)። ባዶ ሆነ መተግበሪያው የተያዘው ምልክት ይታያል።',
  '"branding/eotc_logo.png"'::jsonb,
  'string',
  true,
  15
)
on conflict (key) do nothing;

-- The printed certificates carry the same emblem as their heading and seal.
update public.certificate_templates t
   set logo_media_id = m.id,
       seal_media_id = coalesce(t.seal_media_id, m.id)
  from public.media_files m
 where m.id = 'a7000000-0000-4000-8000-000000000001'
   and t.logo_media_id is null;
