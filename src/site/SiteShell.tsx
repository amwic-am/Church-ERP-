// The public site chrome: header, navigation, footer.
//
// The menu is the database's (`v_site_menu`), the contact block is the database's
// (`public_phone`/`public_email`/`public_text`), and the Ethiopian date plus the
// day's feast or fast come from the calendar module — so what the site says about
// itself is what the office entered, not what a template shipped with.
import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { ChevronDown, Facebook, HandHeart, Mail, MapPin, Menu as MenuIcon, Phone, Send, X, Youtube } from 'lucide-react';

import { Spinner } from '@/components/ui/surface';
import { Button } from '@/components/ui/button';
import { env, isSupabaseConfigured } from '@/lib/env';
import { listRows, supabase, type ViewRow } from '@/lib/supabase';
import { UI } from '@/lib/i18n';
import { formatEthiopian } from '@/lib/ethiopian';
import { devotionSummary } from '@/lib/liturgical';
import { useSiteSettings } from '@/lib/siteSettings';
import { SITE_ROUTES } from '@/lib/routes';
import { cn } from '@/lib/utils';

type MenuItem = ViewRow<'v_site_menu'>;
type NavItem = { href: string; label: string };

/** A menu item points at a page or at a raw href; whichever it has wins. */
function itemHref(item: MenuItem): string | null {
  if (item.href) return item.href;
  const slug = item.page_slug;
  return slug ? `/${slug}` : null;
}

function itemsToNav(rows: readonly MenuItem[]): NavItem[] {
  const out: NavItem[] = [];
  for (const row of rows) {
    const href = itemHref(row);
    if (!href || !row.label_am) continue;
    if (!href.startsWith('/')) continue; // keep the menu on this site
    if (out.some((i) => i.href === href)) continue;
    out.push({ href, label: row.label_am });
  }
  return out;
}

function useSiteMenu() {
  const [rows, setRows] = useState<MenuItem[] | null>(null);
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setRows([]);
      return;
    }
    let cancelled = false;
    void listRows(supabase.from('v_site_menu').select('*').order('sort_order'))
      .then((result) => {
        if (!cancelled) setRows(result as MenuItem[]);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return rows;
}

/** Database menu when there is one, the specification's page list otherwise. */
function fallbackNav(): NavItem[] {
  return SITE_ROUTES.filter((r) => r.path !== '/' && r.path !== '/status').map((r) => ({ href: r.path, label: r.labelAm }));
}

export function SiteShell() {
  const menu = useSiteMenu();
  const { settings } = useSiteSettings();
  const [open, setOpen] = useState(false);

  const items = useMemo(() => {
    const headerOnly = (menu ?? []).filter((row) => row.location === 'header');
    const fromDb = itemsToNav(headerOnly.length > 0 ? headerOnly : menu ?? []);
    return fromDb.length > 0 ? fromDb : fallbackNav();
  }, [menu]);

  const brand = settings.sunday_school_name_am || env.appName;
  const church = settings.church_name_am || UI.churchName;
  const phone = settings.phone ?? '';
  const email = settings.email ?? '';
  const address = settings.address_am ?? '';
  const socials = [
    { key: 'facebook', href: settings.facebook_url ?? '', label: 'ፌስቡክ', Icon: Facebook },
    { key: 'youtube', href: settings.youtube_url ?? '', label: 'ዩቲዩብ', Icon: Youtube },
    { key: 'telegram', href: settings.telegram_channel ?? '', label: 'ቴሌግራም', Icon: Send },
  ].filter((s) => /^https?:\/\//.test(s.href));
  const today = new Date();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="bg-leaf text-primary-foreground">
        <div className="site-section flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
          <span className="font-ethiopic">{formatEthiopian(today)}</span>
          <span className="opacity-90">{devotionSummary(today)}</span>
        </div>
      </div>

      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
        <div className="site-section flex h-20 items-center gap-4">
          <Link to="/" className="min-w-0 flex-1">
            <p className="truncate font-display text-lg font-semibold leading-tight text-leaf">{brand}</p>
            <p className="truncate text-[11px] text-muted-foreground">{church}</p>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="የድረ ገጽ ዝርዝር">
            {items.filter((i) => i.href !== '/donate').slice(0, 8).map((item) => (
              <NavLink
                key={item.href}
                to={item.href}
                className={({ isActive }) =>
                  cn(
                    'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive ? 'bg-leaf/10 text-leaf' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
            <Button asChild size="sm" variant="gold" className="ms-2">
              <Link to="/donate">
                <HandHeart className="h-4 w-4" /> ልገሳ
              </Link>
            </Button>
          </nav>

          <button type="button" className="rounded-md p-2 text-muted-foreground hover:bg-accent lg:hidden" aria-label="ዝርዝር ክፈት" onClick={() => setOpen((v) => !v)}>
            {open ? <X className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
          </button>
        </div>

        {open ? (
          <nav className="border-t border-border bg-card px-4 py-3 lg:hidden" aria-label="የስልክ ዝርዝር">
            <ul className="grid grid-cols-2 gap-1">
              {items.map((item) => (
                <li key={item.href}>
                  <NavLink to={item.href} onClick={() => setOpen(false)} className={({ isActive }) => cn('block rounded-md px-3 py-2 text-sm', isActive ? 'bg-leaf/10 font-medium text-leaf' : 'text-muted-foreground')}>
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </header>

      {menu === null && isSupabaseConfigured ? (
        <div className="site-section py-2">
          <Spinner />
        </div>
      ) : null}

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="mt-16 border-t border-border bg-parchment/60 dark:bg-card">
        <div className="site-section grid gap-8 py-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <p className="font-display text-base font-semibold">{brand}</p>
            <p className="mt-1 text-sm text-muted-foreground">{church}</p>
            {settings.tagline_am ? <p className="mt-3 text-sm">{settings.tagline_am}</p> : null}
            <p className="mt-2 text-sm text-muted-foreground">{devotionSummary(today)}</p>
            {socials.length > 0 ? (
              <ul className="mt-4 flex items-center gap-2">
                {socials.map(({ key, href, label, Icon }) => (
                  <li key={key}>
                    <a href={href} target="_blank" rel="noreferrer noopener" aria-label={label} className="inline-flex rounded-full border border-border p-2 text-muted-foreground hover:border-leaf hover:text-leaf">
                      <Icon className="h-4 w-4" aria-hidden />
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">ፈጣን አገናኞች</p>
            <ul className="space-y-1 text-sm">
              {items.slice(0, 6).map((item) => (
                <li key={item.href}>
                  <Link to={item.href} className="hover:text-leaf">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">አድራሻ</p>
            <ul className="space-y-1.5 text-sm">
              {address && address !== '—' ? (
                <li className="flex items-start gap-2 text-muted-foreground">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-leaf" aria-hidden />
                  {address}
                </li>
              ) : null}
              {phone ? (
                <li className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-leaf" aria-hidden />
                  <a href={`tel:${phone}`} className="hover:text-leaf">
                    {phone}
                  </a>
                </li>
              ) : null}
              {email ? (
                <li className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-leaf" aria-hidden />
                  <a href={`mailto:${email}`} className="hover:text-leaf">
                    {email}
                  </a>
                </li>
              ) : null}
              {settings.service_times_am ? <li className="text-muted-foreground">{settings.service_times_am}</li> : null}
              <li>
                <Link to="/erp" className="inline-flex items-center gap-1 font-medium text-leaf">
                  የአሠራር ገጽ <ChevronDown className="h-3.5 w-3.5 -rotate-90" aria-hidden />
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-border py-4 text-center text-xs text-muted-foreground">© {today.getFullYear()} {brand} — መብቱ በሕግ የተጠበቀ ነው።</div>
      </footer>
    </div>
  );
}
