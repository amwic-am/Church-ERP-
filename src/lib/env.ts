// Environment read in one place, so a missing key shows a clear message on the
// screen instead of a white page. Nothing here is secret: only the anon key and
// public URLs reach the browser.

const raw = import.meta.env;

export const env = {
  supabaseUrl: (raw.VITE_SUPABASE_URL ?? '').trim(),
  supabaseAnonKey: (raw.VITE_SUPABASE_ANON_KEY ?? '').trim(),
  siteUrl: (raw.VITE_SITE_URL ?? '').trim(),
  mediaBucket: (raw.VITE_MEDIA_BUCKET ?? 'media').trim(),
  appName: (raw.VITE_APP_NAME ?? 'ተክለቴዎፍሎስ ሰንበት ት/ቤት').trim(),
};

/** True only when a real Supabase project is wired up. */
export const isSupabaseConfigured =
  /^https?:\/\//.test(env.supabaseUrl) && env.supabaseAnonKey.length > 20;

export const missingConfigHint =
  'የመረጃ አገልግሎቱ ገና አልተገናኘም። `.env` ውስጅ VITE_SUPABASE_URL እና VITE_SUPABASE_ANON_KEY ያስገቡ።';

export function publicUrl(path: string): string {
  const base = (env.siteUrl || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
