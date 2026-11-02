// Per-page document head.
//
// The site is one SPA, so "SEO" means writing the title and description of the
// page the visitor is actually looking at — from the page's own seo columns when
// it has them, from `site_settings` otherwise.
import { useEffect } from 'react';

import { env } from '@/lib/env';
import { useSiteSettings } from '@/lib/siteSettings';

function upsert(attr: 'name' | 'property', key: string, content: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
}

export function Seo({
  title,
  description,
  image,
}: {
  title?: string | null;
  description?: string | null;
  image?: string | null;
}) {
  const { settings } = useSiteSettings();
  const brand = settings.site_title_am || settings.sunday_school_name_am || env.appName;
  const full = title ? `${title} · ${brand}` : brand;
  const summary = description || settings.site_description_am || '';

  useEffect(() => {
    document.title = full;
    if (summary) upsert('name', 'description', summary);
    upsert('property', 'og:title', full);
    upsert('property', 'og:type', 'website');
    upsert('property', 'og:site_name', brand);
    upsert('name', 'twitter:card', 'summary_large_image');
    if (summary) {
      upsert('property', 'og:description', summary);
      upsert('name', 'twitter:description', summary);
    }
    if (image) {
      upsert('property', 'og:image', image);
      upsert('name', 'twitter:image', image);
    }
  }, [full, summary, image, brand]);

  return null;
}
