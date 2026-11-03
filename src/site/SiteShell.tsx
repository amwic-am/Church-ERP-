// The public site chrome: header, navigation, footer.
//
// The eight links the parish asked for lead the bar; `v_site_menu` overwrites their
// labels and appends any published page the office added that is not already there,
// so the menu stays editable without a code change. The contact block is the
// database's (`public_phone`/`public_email`/`public_text`) and the Ethiopian date
// plus the day's feast or fast come from the calendar module — what the site says
// about itself is what the office entered, not what a template shipped with.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  ArrowLeft, BookOpen, Building2, CalendarDays, CalendarRange, ChevronDown, Church, ClipboardList, Clock,
  Eye, Facebook, FileText, GraduationCap, HandHeart, Heart, HeartHandshake, HelpCircle, Images, Info,
  Landmark, LogIn as LoginIcon, Mail, MapPin, Menu as MenuIcon, Music, Newspaper, Phone, School,
  Search, Send, ShieldCheck, Sparkles, UserPlus, Users, Video, X, Youtube,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Spinner } from '@/components/ui/surface';
import { Button } from '@/components/ui/button';
import { BrandMark } from '@/components/ui/brand';
import { env, isSupabaseConfigured } from '@/lib/env';
import { listRows, supabase, type ViewRow } from '@/lib/supabase';
import { UI } from '@/lib/i18n';
import { formatEthiopian } from '@/lib/ethiopian';
import { devotionSummary } from '@/lib/liturgical';
import { useSiteSettings } from '@/lib/siteSettings';
import { LOGIN_PATH, SITE_ROUTES } from '@/lib/routes';
import { cn } from '@/lib/utils';
import { NewsletterForm } from '@/site/forms';

type MenuItem = ViewRow<'v_site_menu'>;
type NavItem = { href: string; label: string };
type Social = { key: string; href: string; label: string; Icon: LucideIcon };

/** The eight primary links, in the order the client listed them. */
const PRIMARY_LINKS: readonly NavItem[] = [
  { href: '/about', label: 'ስለ እኛ' },
  { href: '/news', label: 'ዜና' },
  { href: '/gallery', label: 'የፎቶ ማህደር' },
  { href: '/media', label: 'ቪዲዮ ማህደር' },
  { href: '/leadership', label: 'መንፈሳዊ አመራር' },
  { href: '/classes', label: 'ክፍሎችና ፕሮግራሞች' },
  { href: '/register', label: 'አባል መሆን' },
  { href: '/page/volunteer', label: 'አቅም ሰጪ' },
];

/** The pages that sit in the "ተማሪ" panel rather than on the bar. */
const STUDENT_PATHS: readonly string[] = [
  '/news',
  '/events',
  '/sermons',
  '/mezmur',
  '/publications',
  '/departments',
  '/sunday-school',
  '/calendar',
  '/register',
  '/faq',
  '/contact',
];

/** Footer column 'አገልግሎች' — the reading and listening services of the parish. */
const SERVICE_PATHS: readonly string[] = ['/events', '/sermons', '/mezmur', '/publications', '/gallery', '/departments'];

/** Rows the drawer offers below the navigation: giving, prayer and the application tracker. */
const JOIN_PATHS: readonly string[] = ['/donate', '/prayer', '/status'];

/** Already carried by the chrome itself — never a second time in the bar. */
const CHROME_PATHS: readonly string[] = ['/', '/donate', '/erp', '/erp/login', LOGIN_PATH];

/** Long Amharic labels wrap the bar, so only this many database extras join the eight. */
const MAX_BAR_EXTRA = 2;

const PATH_ICONS: Record<string, LucideIcon> = {
  '/': Church,
  '/about': Info,
  '/vision': Eye,
  '/history': Landmark,
  '/leadership': Users,
  '/departments': Building2,
  '/sunday-school': School,
  '/classes': GraduationCap,
  '/calendar': CalendarRange,
  '/news': Newspaper,
  '/events': CalendarDays,
  '/gallery': Images,
  '/sermons': BookOpen,
  '/mezmur': Music,
  '/publications': FileText,
  '/media': Video,
  '/register': UserPlus,
  '/status': ClipboardList,
  '/donate': HandHeart,
  '/prayer': Heart,
  '/contact': Phone,
  '/faq': HelpCircle,
  '/search': Search,
  '/page/privacy': ShieldCheck,
  '/page/volunteer': HeartHandshake,
};

function iconFor(href: string): LucideIcon {
  return PATH_ICONS[href] ?? BookOpen;
}

/** `/news/ቅዱስ-ገብርኤል` keeps ዜና highlighted; a detail route is still its section. */
function isCurrent(href: string, pathname: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

/** A menu item points at a page or at a raw href; whichever it has wins. */
function itemHref(item: MenuItem): string | null {
  if (item.href) return item.href;
  const slug = item.page_slug;
  if (!slug) return null;
  // `v_site_menu` already prefixes the slug with '/', so a bare segment is a legacy row.
  return slug.startsWith('/') ? slug : `/${slug}`;
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

function dedupe(items: readonly NavItem[]): NavItem[] {
  return items.filter((item, index) => items.findIndex((i) => i.href === item.href) === index);
}

/**
 * The eight as the primary set, then the database's own label for each of them,
 * then every database item whose href appears nowhere else.
 */
function buildNav(db: readonly NavItem[]) {
  const dbLabel = new Map(db.map((item) => [item.href, item.label] as const));
  const at = (href: string, fallback: string) =>
    dbLabel.get(href) ?? SITE_ROUTES.find((route) => route.path === href)?.labelAm ?? fallback;

  const primary = PRIMARY_LINKS.map((item) => ({ href: item.href, label: at(item.href, item.label) }));
  const student = STUDENT_PATHS.filter((href) => !primary.some((item) => item.href === href)).map((href) => ({
    href,
    label: at(href, href),
  }));

  const seen = new Set([...primary, ...student].map((item) => item.href));
  const extras = db.filter((item) => !seen.has(item.href) && !CHROME_PATHS.includes(item.href));
  const bar = [...primary, ...extras.slice(0, MAX_BAR_EXTRA)];
  const panel = [...student, ...extras.slice(MAX_BAR_EXTRA)];
  const joins = JOIN_PATHS.filter((href) => !seen.has(href)).map((href) => ({ href, label: at(href, href) }));

  return {
    bar,
    panel,
    quick: primary,
    services: SERVICE_PATHS.map((href) => ({ href, label: at(href, href) })),
    all: dedupe([...bar, ...panel, ...joins]),
  };
}

const DRAWER_GROUPS: readonly { labelAm: string; hrefs: readonly string[] }[] = [
  { labelAm: 'ቤተ ክርስቲያን', hrefs: ['/about', '/leadership', '/sunday-school', '/departments', '/calendar'] },
  { labelAm: 'መሐምል', hrefs: ['/classes', '/gallery', '/media', '/sermons', '/mezmur', '/publications', '/news'] },
  { labelAm: 'ተሳትፎ', hrefs: ['/register', '/page/volunteer', '/donate', '/prayer', '/contact', '/faq', '/status'] },
];

/** The same links as the bar, grouped for the phone; anything new lands in ተጨማሪ. */
function drawerGroups(items: readonly NavItem[]): { labelAm: string; items: NavItem[] }[] {
  const byHref = new Map(items.map((item) => [item.href, item] as const));
  const used = new Set<string>();
  const groups = DRAWER_GROUPS.map((group) => ({
    labelAm: group.labelAm,
    items: group.hrefs
      .filter((href) => byHref.has(href) && !used.has(href))
      .map((href) => {
        used.add(href);
        return byHref.get(href)!;
      }),
  })).filter((group) => group.items.length > 0);
  const rest = items.filter((item) => !used.has(item.href));
  return rest.length > 0 ? [...groups, { labelAm: 'ተጨማሪ', items: rest }] : groups;
}

function useScrolled(threshold = 8): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);
  return scrolled;
}

function SocialLinks({ socials, tone }: { socials: readonly Social[]; tone: 'top' | 'footer' }) {
  if (socials.length === 0) return null;
  const ring =
    tone === 'top'
      ? 'text-primary-foreground/80 hover:bg-white/15 hover:text-white'
      : 'border-white/20 text-white/75 hover:border-gold hover:bg-white/10 hover:text-gold-soft';
  return (
    <ul className={cn('flex items-center gap-1.5', tone === 'footer' && 'gap-2')}>
      {socials.map(({ key, href, label, Icon }) => (
        <li key={key}>
          <a
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            aria-label={label}
            className={cn('inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors', ring, tone === 'footer' && 'h-9 w-9 border')}
          >
            <Icon className="h-4 w-4" aria-hidden />
          </a>
        </li>
      ))}
    </ul>
  );
}

/** The ተማሪ panel: opens on click, closes on Escape, on an outside click and on navigation. */
function OverflowMenu({ items }: { items: readonly NavItem[] }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  const active = items.some((item) => isCurrent(item.href, pathname));

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onPointerDown = (event: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div className="relative shrink-0" ref={wrap}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="site-student-menu"
        aria-haspopup="true"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'inline-flex items-center gap-1 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors',
          open || active ? 'bg-leaf/10 text-leaf' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
        )}
      >
        ተማሪ
        <ChevronDown className={cn('h-4 w-4 transition-transform duration-200', open && 'rotate-180')} aria-hidden />
      </button>
      {open ? (
        <div
          id="site-student-menu"
          className="absolute end-0 top-[calc(100%+0.6rem)] w-[34rem] max-w-[86vw] rounded-xl border border-border bg-card p-4 shadow-xl"
        >
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gold-deep dark:text-gold">ተማሪ</p>
          <ul className="grid gap-1 sm:grid-cols-2">
            {items.map(({ href, label }) => (
              <li key={href}>
                <NavLink
                  to={href}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2 rounded-md px-2.5 py-2 text-[13px] transition-colors',
                      isActive ? 'bg-leaf/10 font-medium text-leaf' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    )
                  }
                >
                  {(() => {
                    const Icon = iconFor(href);
                    return <Icon className="h-4 w-4 shrink-0 text-leaf" aria-hidden />;
                  })()}
                  <span className="truncate">{label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
          <Link to="/search" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-leaf hover:text-leaf-deep">
            <Search className="h-3.5 w-3.5" aria-hidden /> የድረ ገጹን ሁሉም ክፍሎች ይፈልጉ
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function MobileDrawer({
  open,
  onClose,
  groups,
  socials,
  brand,
  church,
  logoPath,
  phone,
}: {
  open: boolean;
  onClose: () => void;
  groups: readonly { labelAm: string; items: readonly NavItem[] }[];
  socials: readonly Social[];
  brand: string;
  church: string;
  logoPath?: string;
  phone: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="የዝርዝር መስኮት">
      <button type="button" onClick={onClose} aria-label="ዝርዝር ዝጋ" className="absolute inset-0 h-full w-full bg-ink/60 backdrop-blur-sm" />
      <div className="absolute inset-y-0 right-0 flex h-full w-full max-w-sm animate-in slide-in-from-right flex-col bg-card shadow-2xl duration-300">
        <div className="flex items-center gap-3 bg-gradient-to-r from-leaf-deep via-leaf to-leaf-deep px-4 py-4 text-primary-foreground">
          <BrandMark logoPath={logoPath} size={38} className="rounded-full bg-white/90 p-1" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display text-sm font-semibold">{brand}</span>
            <span className="block truncate text-[11px] opacity-85">{church}</span>
          </span>
          <button type="button" onClick={onClose} aria-label="ዝርዝር ዝጋ" className="rounded-md p-2 transition-colors hover:bg-white/15">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="የስልክ ዝርዝር">
          {groups.map((group) => (
            <div key={group.labelAm} className="mb-5 last:mb-0">
              <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gold-deep dark:text-gold">{group.labelAm}</p>
              <ul className="space-y-0.5">
                {group.items.map(({ href, label }) => (
                  <li key={href}>
                    <NavLink
                      to={href}
                      onClick={onClose}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
                          isActive ? 'bg-leaf/10 font-medium text-leaf' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                        )
                      }
                    >
                      {(() => {
                        const Icon = iconFor(href);
                        return <Icon className="h-4 w-4 shrink-0 text-leaf" aria-hidden />;
                      })()}
                      <span className="flex-1 truncate">{label}</span>
                      <ArrowLeft className="h-3.5 w-3.5 rotate-180 opacity-40" aria-hidden />
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="space-y-3 border-t border-border px-4 py-4">
          {phone ? (
            <a href={`tel:${phone}`} className="flex items-center gap-2 text-sm font-medium text-leaf hover:text-leaf-deep">
              <Phone className="h-4 w-4" aria-hidden /> {phone}
            </a>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <Link to={LOGIN_PATH} onClick={onClose} className="inline-flex items-center gap-2 rounded-full border border-leaf/40 px-3 py-1.5 text-xs font-medium text-leaf hover:bg-leaf/10">
              <LoginIcon className="h-4 w-4" aria-hidden /> ግቢ
            </Link>
            <SocialLinks socials={socials} tone="top" />
          </div>
          <Button asChild size="sm" variant="gold" className="w-full">
            <Link to="/donate" onClick={onClose}>
              <HandHeart className="h-4 w-4" aria-hidden /> ልገሳ
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

export function SiteShell() {
  const menu = useSiteMenu();
  const { settings } = useSiteSettings();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const scrolled = useScrolled();

  const items = useMemo(() => {
    const headerOnly = (menu ?? []).filter((row) => row.location === 'header');
    return itemsToNav(headerOnly.length > 0 ? headerOnly : (menu ?? []));
  }, [menu]);
  const nav = useMemo(() => buildNav(items), [items]);
  const groups = useMemo(() => drawerGroups(nav.all), [nav.all]);

  // The drawer is full-screen, so the page behind it must not scroll.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const brand = settings.sunday_school_name_am || env.appName;
  const church = settings.church_name_am || UI.churchName;
  const phone = settings.phone ?? '';
  const email = settings.email ?? '';
  const address = settings.address_am ?? '';
  const serviceTimes = settings.service_times_am ?? '';
  const socials: Social[] = [
    { key: 'facebook', href: settings.facebook_url ?? '', label: 'ፌስቡክ', Icon: Facebook },
    { key: 'youtube', href: settings.youtube_url ?? '', label: 'ዩቲዩብ', Icon: Youtube },
    { key: 'telegram', href: settings.telegram_channel ?? '', label: 'ቴሌግራም', Icon: Send },
  ].filter((s) => /^https?:\/\//.test(s.href));
  const today = new Date();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="relative z-40 overflow-hidden bg-gradient-to-r from-leaf-deep via-leaf to-leaf-deep text-primary-foreground">
        <div className="site-section flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 text-xs">
          <span className="inline-flex items-center gap-1.5 font-ethiopic">
            <CalendarDays className="h-3.5 w-3.5 text-gold-soft" aria-hidden />
            {formatEthiopian(today)}
          </span>
          <span className="hidden min-w-0 items-center gap-1.5 opacity-90 sm:inline-flex">
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-gold-soft" aria-hidden />
            <span className="truncate">{devotionSummary(today)}</span>
          </span>
          <span className="ms-auto flex items-center gap-2 sm:ms-0">
            <SocialLinks socials={socials} tone="top" />
            {socials.length > 0 ? <span aria-hidden className="h-4 w-px bg-white/25" /> : null}
            <Link to={LOGIN_PATH} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium text-gold-soft transition-colors hover:bg-white/15 hover:text-white">
              <LoginIcon className="h-3.5 w-3.5" aria-hidden /> ግቢ
            </Link>
          </span>
        </div>
      </div>

      <header
        className={cn(
          'sticky top-0 z-30 border-b bg-card/85 backdrop-blur-md transition-shadow duration-300',
          scrolled ? 'border-border shadow-lg shadow-ink/10' : 'border-border/60 shadow-none'
        )}
      >
        <div className={cn('site-section flex items-center gap-3 transition-all duration-300', scrolled ? 'h-16' : 'h-20')}>
          <Link to="/" className="flex min-w-0 items-center gap-3">
            <BrandMark logoPath={settings.logo_path} size={scrolled ? 38 : 44} />
            {/* Below xl the eight labels need the width, so the wordmark joins at xl. */}
            <span className="hidden min-w-0 xl:block">
              <span className="block max-w-48 truncate font-display text-base font-semibold leading-tight text-leaf">{brand}</span>
              <span className="block max-w-56 truncate text-[11px] text-muted-foreground">{church}</span>
            </span>
          </Link>

          <nav className="hidden flex-1 items-center justify-end gap-0.5 lg:flex" aria-label="የድረ ገጽ ዝርዝር">
            {nav.bar.map(({ href, label }) => (
              <NavLink
                key={href}
                to={href}
                className={({ isActive }) =>
                  cn(
                    'group relative whitespace-nowrap rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors',
                    isActive ? 'text-leaf dark:text-gold' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {label}
                    <span
                      aria-hidden
                      className={cn(
                        'absolute inset-x-2 -bottom-0.5 h-0.5 origin-center rounded-full bg-gold transition-transform duration-300 ease-out',
                        isActive ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-50'
                      )}
                    />
                  </>
                )}
              </NavLink>
            ))}
            <OverflowMenu items={nav.panel} />
            <Button asChild size="sm" variant="gold" className="ms-2 shrink-0">
              <Link to="/donate">
                <HandHeart className="h-4 w-4" /> ልገሳ
              </Link>
            </Button>
          </nav>

          <button
            type="button"
            className="ms-auto rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent lg:hidden"
            aria-label={open ? 'ዝርዝር ዝጋ' : 'ዝርዝር ክፈት'}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
          </button>
        </div>
      </header>

      <MobileDrawer
        open={open}
        onClose={() => setOpen(false)}
        groups={groups}
        socials={socials}
        brand={brand}
        church={church}
        logoPath={settings.logo_path}
        phone={phone}
      />

      {menu === null && isSupabaseConfigured ? (
        <div className="site-section py-2">
          <Spinner />
        </div>
      ) : null}

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="relative mt-16 overflow-hidden text-white">
        {/* The church photograph is decoration; the scrim keeps every line readable. */}
        <img src="/images/church-exterior.jpg" alt="" aria-hidden loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
        <div aria-hidden className="absolute inset-0 bg-leaf-deep/95" />
        <img src="/eotc_logo.png" alt="" aria-hidden className="pointer-events-none absolute -bottom-14 -left-14 h-72 w-72 opacity-10" />

        <div className="site-section relative">
          <div className="rounded-2xl border border-gold/30 bg-gradient-to-r from-leaf-deep via-leaf/90 to-leaf-deep p-6 shadow-xl sm:p-8">
            <div className="grid items-center gap-5 lg:grid-cols-2">
              <div>
                <p className="mb-1.5 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-gold-soft">
                  <Mail className="h-4 w-4" aria-hidden /> የመረጃ ማሳወቂያ
                </p>
                <h2 className="font-display text-xl font-semibold leading-tight sm:text-2xl">የቤተ ክርስቲያኑን ዜናና ፕሮግራሞች በመልእክት ይቀበሉ</h2>
                <p className="mt-2 text-sm text-white/80">ኢሜይልዎን ይተዉ፤ ዜና፣ ጾምና በዓልና የሰንበት ት/ቤት ማስታወቂያ በወሰን ጊዜ ይላክልዎታል።</p>
              </div>
              <NewsletterForm compact />
            </div>
          </div>

          <div className="grid gap-8 py-12 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="flex items-center gap-3">
                <BrandMark logoPath={settings.logo_path} size={44} className="rounded-full bg-white/95 p-1" />
                <p className="min-w-0 font-display text-base font-semibold leading-tight">{brand}</p>
              </div>
              <p className="mt-2 text-sm text-white/75">{church}</p>
              {settings.tagline_am ? <p className="mt-3 text-sm text-gold-soft">{settings.tagline_am}</p> : null}
              {serviceTimes ? (
                <p className="mt-3 flex items-start gap-2 text-sm text-white/80">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden />
                  <span>{serviceTimes}</span>
                </p>
              ) : null}
              <p className="mt-2 flex items-start gap-2 text-xs text-white/60">
                <Church className="mt-0.5 h-4 w-4 shrink-0 text-gold/80" aria-hidden />
                {devotionSummary(today)}
              </p>
              <div className="mt-4">
                <SocialLinks socials={socials} tone="footer" />
              </div>
            </div>

            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gold-soft">ፈጣን አገናኞች</p>
              <ul className="space-y-1.5 text-sm">
                {nav.quick.map(({ href, label }) => (
                  <li key={href}>
                    <Link to={href} className="inline-flex items-center gap-2 text-white/80 transition-colors hover:text-gold-soft">
                      <span aria-hidden className="h-1 w-1 rounded-full bg-gold/70" />
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gold-soft">አገልግሎች</p>
              <ul className="space-y-1.5 text-sm">
                {nav.services.map(({ href, label }) => {
                  const Icon = iconFor(href);
                  return (
                    <li key={href}>
                      <Link to={href} className="inline-flex items-center gap-2 text-white/80 transition-colors hover:text-gold-soft">
                        <Icon className="h-4 w-4 shrink-0 text-gold/80" aria-hidden />
                        {label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gold-soft">አድራሻ</p>
              <ul className="space-y-2 text-sm">
                {address && address !== '—' ? (
                  <li className="flex items-start gap-2 text-white/80">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden />
                    {address}
                  </li>
                ) : null}
                {phone ? (
                  <li className="flex items-center gap-2">
                    <Phone className="h-4 w-4 shrink-0 text-gold" aria-hidden />
                    <a href={`tel:${phone}`} className="text-white/80 transition-colors hover:text-gold-soft">
                      {phone}
                    </a>
                  </li>
                ) : null}
                {email ? (
                  <li className="flex items-center gap-2">
                    <Mail className="h-4 w-4 shrink-0 text-gold" aria-hidden />
                    <a href={`mailto:${email}`} className="break-all text-white/80 transition-colors hover:text-gold-soft">
                      {email}
                    </a>
                  </li>
                ) : null}
                {serviceTimes ? (
                  <li className="flex items-start gap-2 text-white/80">
                    <Clock className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden />
                    {serviceTimes}
                  </li>
                ) : null}
                <li>
                  <Link to={LOGIN_PATH} className="inline-flex items-center gap-1.5 font-medium text-gold-soft transition-colors hover:text-white">
                    <LoginIcon className="h-4 w-4" aria-hidden /> ግቢ
                  </Link>
                </li>
                <li>
                  <Link to="/erp" className="inline-flex items-center gap-1.5 font-medium text-white/85 transition-colors hover:text-gold-soft">
                    የአሠራር ገጽ <ArrowLeft className="h-3.5 w-3.5 rotate-180" aria-hidden />
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-white/10 py-5 text-xs text-white/65 md:flex-row md:items-center md:justify-between">
            <p>© {today.getFullYear()} {brand} — መብቱ በሕግ የተጠበቀ ነው።</p>
            <nav className="flex flex-wrap items-center gap-x-5 gap-y-1" aria-label="የግድፍ ማስታወሻ">
              <Link to="/about" className="transition-colors hover:text-gold-soft">
                ስለ ቤተ ክርስቲያናችን
              </Link>
              <Link to="/page/privacy" className="transition-colors hover:text-gold-soft">
                የግል መረጃ
              </Link>
            </nav>
            <p className="md:max-w-md">
              የፎቶ ስዕሎች፦ ከ{' '}
              <a href="https://commons.wikimedia.org" target="_blank" rel="noreferrer noopener" className="underline underline-offset-2 hover:text-gold-soft">
                ዊኪሚድያ ኮመንስ
              </a>{' '}
              የተወሰዱ ሲሆን በCC BY / CC BY-SA ፈቃድ ይገኛሉ፤ ሙሉ የአዘጋጅና የፈቃድ ማሳወቂያ በኮመንስ ላይ ይታያል።
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
