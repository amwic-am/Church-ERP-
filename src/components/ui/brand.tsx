import { storagePublicUrl } from '@/lib/supabase';
import { cn } from '@/lib/utils';

/**
 * The church emblem, wherever a shell needs one. `site_settings.logo_path` is a
 * storage path, so the same mark works in the media library and in the browser:
 * when Supabase is not configured the copy bundled in `public/` is used instead.
 */
export function BrandMark({
  logoPath,
  size = 40,
  className,
}: {
  logoPath?: string | null;
  size?: number;
  className?: string;
}) {
  const src = (logoPath ? storagePublicUrl(null, logoPath) : null) ?? '/eotc_logo.png';
  return (
    <img
      src={src}
      width={size}
      height={size}
      alt="የቤተ ክርስቲያን ምልክት"
      loading="eager"
      decoding="async"
      style={{ width: size, height: size }}
      className={cn('shrink-0 object-contain', className)}
    />
  );
}
