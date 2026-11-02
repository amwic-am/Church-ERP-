// The site's own words, read from `site_settings`.
//
// The public pages ask the database for the church name, the tagline, the phone
// number and the address instead of hard-coding them, so an office user who edits
// a setting sees it on the site on the next load. Every visitor gets the same
// snapshot, so the first read is shared and later callers await it.
import { useEffect, useState } from 'react';

import { isSupabaseConfigured } from '@/lib/env';
import { listRows, supabase } from '@/lib/supabase';

export type SiteSettings = Record<string, string>;

/** A jsonb `value` column holds any JSON; the settings the site shows are text. */
function asText(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
  return '';
}

let shared: Promise<SiteSettings> | null = null;

export function fetchSiteSettings(force = false): Promise<SiteSettings> {
  if (!isSupabaseConfigured) return Promise.resolve({});
  if (!shared || force) {
    shared = listRows(
      supabase.from('site_settings').select('key, value').eq('is_public', true).order('sort_order')
    ).then((rows) => {
      const out: SiteSettings = {};
      for (const row of rows) out[row.key] = asText(row.value);
      return out;
    });
    shared.catch(() => {
      // A failed read must not be cached forever; the next caller retries.
      shared = null;
    });
  }
  return shared;
}

export function useSiteSettings(): { settings: SiteSettings; loading: boolean } {
  const [settings, setSettings] = useState<SiteSettings>({});
  const [loading, setLoading] = useState(isSupabaseConfigured);
  useEffect(() => {
    let cancelled = false;
    fetchSiteSettings()
      .then((rows) => {
        if (!cancelled) setSettings(rows);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return { settings, loading };
}
