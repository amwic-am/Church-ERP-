// The ERP chrome: a fixed two-pane office shell.
//
// The sidebar is generated from `navFor(permissions)` — the grants the database
// handed this person — so a module nobody can open is not merely disabled, it is
// absent. Entries sit in collapsible families, each with its own lucide icon and
// accent colour. The chrome never scrolls: the brand block, the header and the
// sidebar footer are pinned, the navigation list and the page body have their own
// scroll areas, and only the content region moves with the wheel.
//
// Two canvases, chosen by the person using it: `.erp-light` is a white office with
// neutral hairlines, `.erp-dark` a near-black one with saturated accents. Both are
// token sets in `index.css`, so screens keep using `bg-card`, `text-muted-foreground`
// and friends instead of learning about the theme.
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { version as APP_VERSION } from '../../../package.json';
import {
  Activity, ArrowBigUp, ArrowLeftRight, AudioLines, Award, BadgeCheck, BellRing, Blocks,
  BookMarked, BookOpenText, Boxes, Briefcase, Building2, Calculator, CalendarCheck,
  CalendarClock, CalendarDays, CalendarRange, ChartColumn, ChartLine, ChartNoAxesCombined,
  ChartPie, CheckCheck, ChevronDown, ChevronRight, CircleAlert, CircleHelp, ClipboardCheck,
  ClipboardList, Coins, Crown, DatabaseBackup, ExternalLink, FileArchive, FilePlus2, FileText,
  Files, FolderOpen, Gauge, Globe, GraduationCap, Grid2x2, HandCoins, HandHeart,
  HeartHandshake, History, Home, IdCard, Images, KeyRound, Landmark, Layers, Layers3,
  LayoutDashboard, LayoutTemplate, Library, LifeBuoy, ListTree, Lock, LogIn, LogOut, Mail,
  Mails, Megaphone, Menu as MenuIcon, Mic, MonitorSmartphone, Moon, Music2, Network,
  Newspaper, Notebook, Package, PackageOpen, PanelLeftClose, PanelLeftOpen, Percent, Phone,
  PiggyBank, Presentation, Ruler, School, ScrollText, Search, Send, Settings, ShieldCheck,
  SlidersHorizontal, SquareCheck, Stamp, Sun, Tags, Target, TicketCheck, TrendingUp, UserCheck,
  UserCog, UserPlus, UserRound, Users, UsersRound, Video, Wallet, Wrench, X, Church,
} from 'lucide-react';

import { useAuth } from '@/components/auth/AuthProvider';
import { Avatar } from '@/components/ui/tabs';
import { BrandMark } from '@/components/ui/brand';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '@/components/ui/overlay';
import { ErrorNote } from '@/components/ui/surface';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { env, isSupabaseConfigured, missingConfigHint } from '@/lib/env';
import { UI } from '@/lib/i18n';
import { useSiteSettings } from '@/lib/siteSettings';
import { dateAmShort, dateBoth } from '@/lib/format';
import { navFor, type NavGroup, type NavItem } from '@/lib/routes';

const THEME_KEY = 'tekle-teoflos-erp-theme';
const RAIL_KEY = 'tekle-teoflos-erp-rail';
const GROUPS_KEY = 'tekle-teoflos-erp-nav-groups';

type IconCtor = typeof LayoutDashboard;
type Acc = 'blue' | 'violet' | 'emerald' | 'amber' | 'rose' | 'cyan' | 'gold';

/** Literal class strings per accent — Tailwind only generates what it can see. */
const TONE: Record<Acc, { chip: string; icon: string; bar: string; text: string; pill: string }> = {
  blue: { chip: 'bg-acc-blue/12', icon: 'text-acc-blue', bar: 'bg-acc-blue', text: 'text-acc-blue', pill: 'bg-acc-blue/15 text-acc-blue' },
  violet: { chip: 'bg-acc-violet/12', icon: 'text-acc-violet', bar: 'bg-acc-violet', text: 'text-acc-violet', pill: 'bg-acc-violet/15 text-acc-violet' },
  emerald: { chip: 'bg-acc-emerald/12', icon: 'text-acc-emerald', bar: 'bg-acc-emerald', text: 'text-acc-emerald', pill: 'bg-acc-emerald/15 text-acc-emerald' },
  amber: { chip: 'bg-acc-amber/15', icon: 'text-acc-amber', bar: 'bg-acc-amber', text: 'text-acc-amber', pill: 'bg-acc-amber/18 text-acc-amber' },
  rose: { chip: 'bg-acc-rose/12', icon: 'text-acc-rose', bar: 'bg-acc-rose', text: 'text-acc-rose', pill: 'bg-acc-rose/15 text-acc-rose' },
  cyan: { chip: 'bg-acc-cyan/12', icon: 'text-acc-cyan', bar: 'bg-acc-cyan', text: 'text-acc-cyan', pill: 'bg-acc-cyan/15 text-acc-cyan' },
  gold: { chip: 'bg-acc-gold/15', icon: 'text-acc-gold', bar: 'bg-acc-gold', text: 'text-acc-gold', pill: 'bg-acc-gold/18 text-acc-gold' },
};

/** One accent per family, so a section of the sidebar is recognisable at a glance. */
const GROUP_ACCENT: Record<string, Acc> = {
  home: 'blue',
  website: 'violet',
  media: 'cyan',
  students: 'emerald',
  academics: 'blue',
  attendance: 'amber',
  teachers: 'violet',
  departments: 'cyan',
  operations: 'emerald',
  finance: 'amber',
  communication: 'rose',
  reports: 'violet',
  system: 'rose',
  portals: 'blue',
};

/** A waiting queue is coloured by what waits there. */
const BADGE_ACCENT: Record<string, Acc> = { approvals: 'rose', messages: 'blue', outbox: 'emerald' };

const GROUP_ICON: Record<string, IconCtor> = {
  home: LayoutDashboard,
  website: Globe,
  media: Mic,
  students: Users,
  academics: GraduationCap,
  attendance: CalendarCheck,
  teachers: Presentation,
  departments: Building2,
  operations: Wrench,
  finance: Coins,
  communication: Megaphone,
  reports: ChartPie,
  system: ShieldCheck,
  portals: LogIn,
};

/** Every entry keeps its own icon, keyed by the route it opens. */
const NAV_ICON: Record<string, IconCtor> = {
  '/erp/dashboard': Gauge,

  '/erp/website/homepage': Home,
  '/erp/website/pages': FileText,
  '/erp/website/blocks': Blocks,
  '/erp/website/news': Newspaper,
  '/erp/website/events': CalendarDays,
  '/erp/website/sermons': Video,
  '/erp/website/mezmur': Music2,
  '/erp/website/publications': BookMarked,
  '/erp/website/gallery': Images,
  '/erp/website/leadership': Crown,
  '/erp/website/faqs': CircleHelp,
  '/erp/website/menus': ListTree,
  '/erp/website/seo': TrendingUp,
  '/erp/workflow/pending': ClipboardCheck,

  '/erp/media/files': Files,
  '/erp/media/categories': Tags,

  '/erp/students/roster': UserRound,
  '/erp/students/applications': FilePlus2,
  '/erp/students/guardians': HeartHandshake,
  '/erp/students/members': BadgeCheck,
  '/erp/students/enrollments': UserPlus,
  '/erp/students/event-registrations': TicketCheck,
  '/erp/students/id-cards': IdCard,
  '/erp/students/documents': FolderOpen,
  '/erp/students/discipline': CircleAlert,

  '/erp/academics/years': CalendarRange,
  '/erp/academics/class-levels': Layers,
  '/erp/academics/classes': School,
  '/erp/academics/subjects': BookOpenText,
  '/erp/academics/curriculum': Notebook,
  '/erp/academics/class-subjects': Grid2x2,
  '/erp/academics/materials': PackageOpen,
  '/erp/academics/exams': ClipboardList,
  '/erp/academics/results': Award,
  '/erp/academics/grade-scales': Ruler,
  '/erp/academics/promotion': ArrowBigUp,

  '/erp/attendance/sessions': CalendarClock,
  '/erp/attendance/mark': SquareCheck,
  '/erp/attendance/reports': ChartNoAxesCombined,

  '/erp/teachers/roster': UsersRound,
  '/erp/teachers/assignments': UserCheck,
  '/erp/teachers/lesson-plans': ScrollText,

  '/erp/departments/list': Landmark,
  '/erp/departments/org-units': Network,
  '/erp/departments/members': Users,
  '/erp/departments/activities': Activity,
  '/erp/departments/choirs': AudioLines,

  '/erp/operations/library': Library,
  '/erp/operations/inventory': Boxes,
  '/erp/operations/assets': Package,
  '/erp/operations/documents': FileArchive,
  '/erp/operations/certificates': Stamp,
  '/erp/operations/volunteers': HandHeart,

  '/erp/finance/overview': Wallet,
  '/erp/finance/transactions': ArrowLeftRight,
  '/erp/finance/donations': HandCoins,
  '/erp/finance/campaigns': Target,
  '/erp/finance/budgets': PiggyBank,
  '/erp/finance/accounts': Calculator,
  '/erp/finance/categories': Percent,
  '/erp/finance/settings': SlidersHorizontal,

  '/erp/communication/announcements': BellRing,
  '/erp/communication/messages': Mail,
  '/erp/communication/prayers': Church,
  '/erp/communication/newsletter': Mails,
  '/erp/communication/templates': LayoutTemplate,
  '/erp/communication/outbox': Send,

  '/erp/reports/academic': ChartColumn,
  '/erp/reports/finance': ChartLine,
  '/erp/reports/attendance': CalendarCheck,
  '/erp/reports/website': MonitorSmartphone,

  '/erp/system/users': UserCog,
  '/erp/system/roles': KeyRound,
  '/erp/system/approvals': CheckCheck,
  '/erp/system/audit': History,
  '/erp/system/content-types': Layers3,
  '/erp/system/rls': Lock,
  '/erp/system/settings': Settings,
  '/erp/system/backup': DatabaseBackup,

  '/erp/portal/student': GraduationCap,
  '/erp/portal/parent': HeartHandshake,
  '/erp/portal/teacher': Presentation,
  '/erp/portal/department': Briefcase,
};

const accentOf = (groupKey: string): Acc => GROUP_ACCENT[groupKey] ?? 'blue';
const iconFor = (path: string, groupKey: string): IconCtor => NAV_ICON[path] ?? GROUP_ICON[groupKey] ?? LayoutDashboard;

/** `/erp/academics/classes` must not light up for `/erp/academics/class-levels`. */
function atOrUnder(pathname: string, path: string): boolean {
  return pathname === path || pathname.startsWith(`${path}/`);
}

/** The deepest sidebar entry that owns the current address — the breadcrumb pair. */
function locate(groups: readonly NavGroup[], pathname: string): { group: NavGroup; item: NavItem } | null {
  let best: { group: NavGroup; item: NavItem } | null = null;
  for (const group of groups) {
    for (const item of group.items) {
      if (!atOrUnder(pathname, item.path)) continue;
      if (!best || best.item.path.length < item.path.length) best = { group, item };
    }
  }
  return best;
}

function useTheme(): [boolean, () => void] {
  const [dark, setDark] = useState(() => localStorage.getItem(THEME_KEY) === 'dark');
  useEffect(() => {
    localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
    // Menus and dialogs portal onto <body>, outside the shell root, so the canvas
    // tokens are mirrored onto <html> while the office is open — and taken back off
    // when it closes, leaving the public site on its parchment palette.
    const root = document.documentElement;
    root.classList.toggle('erp-dark', dark);
    root.classList.toggle('erp-light', !dark);
    root.classList.toggle('dark', dark);
  }, [dark]);
  useEffect(
    () => () => document.documentElement.classList.remove('erp-dark', 'erp-light', 'dark'),
    []
  );
  return [dark, () => setDark((value) => !value)];
}

/** Persisted flag with a readable value, so the key survives by hand too. */
function useStoredFlag(key: string, onValue: string, initial: boolean): [boolean, (next: boolean) => void] {
  const [value, setValue] = useState(() => {
    try {
      return localStorage.getItem(key) === onValue;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    localStorage.setItem(key, value ? onValue : 'off');
  }, [key, onValue, value]);
  return [value, setValue];
}

/** Which collapsible families are shut; an unseen family defaults to open. */
function useClosedGroups(): [Record<string, boolean>, (key: string) => void, (key: string) => void] {
  const [closed, setClosed] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(GROUPS_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  });
  useEffect(() => {
    localStorage.setItem(GROUPS_KEY, JSON.stringify(closed));
  }, [closed]);
  return [
    closed,
    useCallback(
      (key: string) => setClosed((map) => ({ ...map, [key]: !map[key] })),
      []
    ),
    useCallback((key: string) => setClosed((map) => (map[key] ? { ...map, [key]: false } : map)), []),
  ];
}

function CountPill({ count, accent }: { count: number; accent: Acc }) {
  if (count <= 0) return null;
  return (
    <span className={cn('shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none tabular-nums', TONE[accent].pill)}>
      {count > 99 ? '99+' : count}
    </span>
  );
}

function NavRow({
  item,
  groupKey,
  rail,
  active,
  count,
  onNavigate,
}: {
  item: NavItem;
  groupKey: string;
  rail: boolean;
  active: boolean;
  count: number;
  onNavigate?: () => void;
}) {
  const Icon = iconFor(item.path, groupKey);
  const tone = TONE[accentOf(groupKey)];
  return (
    <li>
      <NavLink
        to={item.path}
        onClick={onNavigate}
        title={item.labelAm}
        className={cn(
          'group relative flex items-center gap-2.5 rounded-lg text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          rail ? 'h-10 justify-center px-0' : 'py-2 pe-2 ps-3',
          active ? 'bg-sidebar-hover font-medium text-foreground' : 'text-sidebar-muted hover:bg-sidebar-hover hover:text-foreground'
        )}
      >
        <span
          aria-hidden
          className={cn('absolute inset-y-1.5 start-0 w-[3px] rounded-e-full transition-opacity', tone.bar, active ? 'opacity-100' : 'opacity-0')}
        />
        <Icon className={cn('h-[18px] w-[18px] shrink-0 transition-colors', active ? tone.icon : 'group-hover:text-foreground')} aria-hidden />
        {rail ? (
          count > 0 ? <span aria-hidden className={cn('absolute end-1.5 top-1.5 h-2 w-2 rounded-full', TONE[BADGE_ACCENT[item.badge ?? ''] ?? 'gold'].bar)} /> : null
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate">{item.labelAm}</span>
            {item.badge ? <CountPill count={count} accent={BADGE_ACCENT[item.badge] ?? 'gold'} /> : null}
          </>
        )}
      </NavLink>
    </li>
  );
}

function NavSection({
  group,
  scope,
  pathname,
  counts,
  rail,
  open,
  onToggleGroup,
  onExpandRail,
  onNavigate,
}: {
  group: NavGroup;
  scope: string;
  pathname: string;
  counts: Record<string, number>;
  rail: boolean;
  open: boolean;
  onToggleGroup: (key: string) => void;
  onExpandRail: () => void;
  onNavigate?: () => void;
}) {
  const tone = TONE[accentOf(group.key)];
  const GroupIcon = GROUP_ICON[group.key] ?? LayoutDashboard;
  const contentId = `erp-nav-${scope}-${group.key}`;
  const waiting = group.items.reduce((sum, item) => (item.badge ? sum + (counts[item.badge] ?? 0) : sum), 0);
  const inside = group.items.some((item) => atOrUnder(pathname, item.path));
  const rows = group.items.map((item) => (
    <NavRow
      key={item.path}
      item={item}
      groupKey={group.key}
      rail={rail}
      active={atOrUnder(pathname, item.path)}
      count={item.badge ? counts[item.badge] ?? 0 : 0}
      onNavigate={onNavigate}
    />
  ));

  if (rail) {
    // The rail keeps the families as an accent mark; its icon widens the sidebar.
    return (
      <div className="flex flex-col items-center gap-1">
        <button
          type="button"
          onClick={onExpandRail}
          title={group.labelAm}
          aria-label={`${group.labelAm} — ዝርዝሩን አሳድፍ`}
          className={cn('grid h-8 w-8 place-items-center rounded-lg transition-colors', inside ? tone.chip : 'hover:bg-sidebar-hover')}
        >
          <GroupIcon className={cn('h-4 w-4', inside ? tone.icon : 'text-sidebar-muted')} aria-hidden />
        </button>
        <ul className="w-full space-y-0.5">{rows}</ul>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => onToggleGroup(group.key)}
        aria-expanded={open}
        aria-controls={contentId}
        className="group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start transition-colors hover:bg-sidebar-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-md', tone.chip)}>
          <GroupIcon className={cn('h-3.5 w-3.5', tone.icon)} aria-hidden />
        </span>
        <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold tracking-wide text-sidebar-muted transition-colors group-hover:text-foreground">
          {group.labelAm}
        </span>
        {waiting > 0 ? <CountPill count={waiting} accent={BADGE_ACCENT[group.items.find((item) => item.badge)?.badge ?? ''] ?? 'gold'} /> : null}
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-sidebar-muted transition-transform duration-200', open && 'rotate-180')} aria-hidden />
      </button>
      <ul id={contentId} className="mt-0.5 space-y-0.5" hidden={!open}>
        {rows}
      </ul>
    </div>
  );
}

const FOOTER_ACTION =
  'grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sidebar-muted transition-colors hover:bg-sidebar-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function SidebarFooter({
  rail,
  dark,
  email,
  phone,
  today,
  railToggle,
  onToggleTheme,
  onToggleRail,
}: {
  rail: boolean;
  dark: boolean;
  email: string;
  phone: string;
  today: string;
  railToggle: boolean;
  onToggleTheme: () => void;
  onToggleRail: () => void;
}) {
  const themeLabel = dark ? 'ወደ ብላራ ለወጥ' : 'ወደ ጨለማ ለወጥ';
  return (
    <div className={cn('shrink-0 border-t border-sidebar-border py-3', rail ? 'px-2' : 'px-3')}>
      {rail ? (
        <div className="flex flex-col items-center gap-1">
          <button type="button" onClick={onToggleTheme} aria-label={themeLabel} title={themeLabel} className={FOOTER_ACTION}>
            {dark ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
          </button>
          <Link to="/contact" aria-label="ድጋፍና ግንኙነት" title="ድጋፍና ግንኙነት" className={FOOTER_ACTION}>
            <LifeBuoy className="h-4 w-4" aria-hidden />
          </Link>
          {railToggle ? (
            <button type="button" onClick={onToggleRail} aria-label="ዝርዝሩን አሳድፍ" title="አሳድፍ" className={FOOTER_ACTION}>
              <PanelLeftOpen className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <div className="min-w-0">
            <p className="truncate font-display text-[12.5px] font-semibold text-sidebar-foreground">{env.appName}</p>
            <p className="mt-0.5 truncate text-[11px] text-sidebar-muted">
              ERP እት{APP_VERSION} · {today}
            </p>
          </div>
          <div className="mt-2 flex items-center gap-1">
            <button type="button" onClick={onToggleTheme} aria-label={themeLabel} title={themeLabel} className={FOOTER_ACTION}>
              {dark ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
            </button>
            {email ? (
              <a href={`mailto:${email}`} aria-label="የድጋፍ ኢሜይል ላክ" title={`ኢሜይል: ${email}`} className={FOOTER_ACTION}>
                <Mail className="h-4 w-4" aria-hidden />
              </a>
            ) : null}
            {phone ? (
              <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} aria-label="ደውሉ" title={`ስልክ: ${phone}`} className={FOOTER_ACTION}>
                <Phone className="h-4 w-4" aria-hidden />
              </a>
            ) : null}
            <Link to="/contact" aria-label="ድጋፍና ግንኙነት" title="ድጋፍና ግንኙነት" className={FOOTER_ACTION}>
              <LifeBuoy className="h-4 w-4" aria-hidden />
            </Link>
            {railToggle ? (
              <button type="button" onClick={onToggleRail} aria-label="ዝርዝሩን ወደ ጎን ምልክቶች አጠርትር" title="አጠርትር" className={cn(FOOTER_ACTION, 'ms-auto')}>
                <PanelLeftClose className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

type Hit = { group: NavGroup; item: NavItem };

type SidebarProps = {
  scope: 'desk' | 'drawer';
  groups: readonly NavGroup[];
  counts: Record<string, number>;
  pathname: string;
  today: string;
  rail: boolean;
  query: string;
  hits: Hit[] | null;
  closed: Record<string, boolean>;
  searchRef: RefObject<HTMLInputElement>;
  logoPath: string | null | undefined;
  email: string;
  phone: string;
  dark: boolean;
  onQueryChange: (value: string) => void;
  onSubmitQuery: () => void;
  onToggleGroup: (key: string) => void;
  onToggleTheme: () => void;
  onToggleRail: () => void;
  onNavigate: () => void;
};

function ShellSidebar({
  scope,
  groups,
  counts,
  pathname,
  today,
  rail,
  query,
  hits,
  closed,
  searchRef,
  logoPath,
  email,
  phone,
  dark,
  onQueryChange,
  onSubmitQuery,
  onToggleGroup,
  onToggleTheme,
  onToggleRail,
  onNavigate,
}: SidebarProps) {
  const searching = hits !== null;
  return (
    <>
      <div className={cn('shrink-0 border-b border-sidebar-border py-3', rail ? 'px-2' : 'px-3')}>
        <Link to="/erp" title={env.appName} className={cn('flex min-w-0 items-center gap-2 rounded-lg transition-opacity hover:opacity-90', rail && 'justify-center')}>
          <BrandMark logoPath={logoPath} size={rail ? 28 : 32} className="rounded-md" />
          {rail ? null : (
            <span className="min-w-0">
              <span className="block truncate font-display text-[13px] font-semibold text-sidebar-foreground">{env.appName}</span>
              <span className="block truncate text-[11px] text-sidebar-muted">የቤተ ክርስቲያኑ መድረክ</span>
            </span>
          )}
        </Link>
      </div>

      <div className={cn('shrink-0 pt-3', rail ? 'px-2' : 'px-3')}>
        {rail ? (
          <button
            type="button"
            onClick={onToggleRail}
            aria-label="አሳድፍና ይፈልጉ"
            title="ክፍሎችን ይፈልጉ"
            className="grid h-9 w-full place-items-center rounded-lg border border-sidebar-border text-sidebar-muted transition-colors hover:bg-sidebar-hover hover:text-foreground"
          >
            <Search className="h-4 w-4" aria-hidden />
          </button>
        ) : (
          <div className="relative">
            <Search className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-sidebar-muted" aria-hidden />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') onSubmitQuery();
                if (event.key === 'Escape') onQueryChange('');
              }}
              placeholder="ክፍሎችን ይፈልጉ…"
              aria-label="ክፍሎችን ይፈልጉ"
              className="h-9 w-full rounded-lg border border-sidebar-border bg-background pe-8 ps-8 text-sm text-foreground placeholder:text-sidebar-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
            />
            {query ? (
              <button
                type="button"
                onClick={() => onQueryChange('')}
                aria-label="ፍለጋ አጽዳ"
                className="absolute end-1.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-sidebar-muted hover:bg-sidebar-hover hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            ) : null}
          </div>
        )}
      </div>

      <nav aria-label="ዋና ዝርዝር" className="erp-scroll min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {searching ? (
          hits && hits.length > 0 ? (
            <ul className="space-y-0.5">
              {hits.map(({ group, item }) => {
                const Icon = iconFor(item.path, group.key);
                return (
                  <li key={`${group.key}-${item.path}`}>
                    <NavLink
                      to={item.path}
                      onClick={onNavigate}
                      className={cn(
                        'flex items-center gap-2.5 rounded-lg py-2 pe-2 ps-3 text-sm transition-colors',
                        atOrUnder(pathname, item.path)
                          ? 'bg-sidebar-hover font-medium text-foreground'
                          : 'text-sidebar-muted hover:bg-sidebar-hover hover:text-foreground'
                      )}
                    >
                      <Icon className={cn('h-[18px] w-[18px] shrink-0', TONE[accentOf(group.key)].icon)} aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{item.labelAm}</span>
                      <span className="shrink-0 text-[11px] text-sidebar-muted">{group.labelAm}</span>
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-2 py-6 text-center text-sm text-sidebar-muted">በችሎታዎ ዝርዝር ውስጥ አልተገኘም።</p>
          )
        ) : (
          <div className="space-y-4">
            {groups.map((group) => (
              <NavSection
                key={group.key}
                scope={scope}
                group={group}
                pathname={pathname}
                counts={counts}
                rail={rail}
                open={closed[group.key] !== true}
                onToggleGroup={onToggleGroup}
                onExpandRail={onToggleRail}
                onNavigate={onNavigate}
              />
            ))}
            {groups.length === 0 ? <p className="px-2 py-6 text-center text-sm text-sidebar-muted">ለዚህ መገለጫ የተከፈተ ክፍል የለም።</p> : null}
          </div>
        )}
      </nav>

      <SidebarFooter
        rail={rail}
        dark={dark}
        email={email}
        phone={phone}
        today={today}
        railToggle={scope === 'desk'}
        onToggleTheme={onToggleTheme}
        onToggleRail={onToggleRail}
      />
    </>
  );
}

export function ErpShell() {
  const { identity, signOut, home } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [drawer, setDrawer] = useState(false);
  const [dark, toggleDark] = useTheme();
  const [rail, setRail] = useStoredFlag(RAIL_KEY, 'collapsed', false);
  const [closed, toggleGroup, revealGroup] = useClosedGroups();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const { settings } = useSiteSettings();

  const groups = useMemo(() => (identity ? navFor(identity.permissions) : []), [identity]);
  const pathname = location.pathname;
  // The Ethiopian date is re-read whenever the office moves, so a night shift that
  // crosses midnight sees the new day on the next screen without a timer.
  const today = useMemo(() => new Date(), [pathname]);

  useEffect(() => setDrawer(false), [pathname]);
  useEffect(() => setQuery(''), [pathname]);

  useEffect(() => {
    if (!drawer) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawer(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer]);

  // The badges are counts of work waiting; a failed read simply shows no badge.
  useEffect(() => {
    if (!identity || !isSupabaseConfigured) return;
    let cancelled = false;
    import('@/lib/kpis')
      .then(({ badgeCounts }) => badgeCounts(identity.permissions))
      .then((next) => {
        if (!cancelled) setCounts(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [identity, pathname]);

  const current = useMemo(() => locate(groups, pathname), [groups, pathname]);

  // A family that is shut cannot hide the screen the person is standing in.
  useEffect(() => {
    if (current) revealGroup(current.group.key);
  }, [current, revealGroup]);

  const hits = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return null;
    const found: Hit[] = [];
    for (const group of groups) {
      for (const item of group.items) {
        if (item.labelAm.toLowerCase().includes(needle) || group.labelAm.toLowerCase().includes(needle) || item.path.toLowerCase().includes(needle)) {
          found.push({ group, item });
        }
        if (found.length >= 60) return found;
      }
    }
    return found;
  }, [groups, query]);


  const inbox = groups.flatMap((group) => group.items).find((item) => item.path === '/erp/communication/messages');
  const unread = counts.messages ?? 0;

  const sidebar = {
    groups,
    counts,
    pathname,
    today: dateAmShort(today),
    query,
    hits,
    closed,
    searchRef,
    logoPath: settings.logo_path,
    email: settings.email ?? '',
    phone: settings.phone ?? '',
    dark,
    onQueryChange: setQuery,
    onSubmitQuery: () => {
      const first = hits?.[0];
      if (first) navigate(first.item.path);
    },
    onToggleGroup: toggleGroup,
    onToggleTheme: toggleDark,
    onNavigate: () => setDrawer(false),
  };

  return (
    <div className={cn('erp-shell erp-canvas relative flex h-[100dvh] overflow-hidden', dark ? 'erp-dark dark' : 'erp-light')}>
      <a
        href="#erp-main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-lg focus:border focus:border-border focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:shadow-panel"
      >
        ወደ ዋናው ክፍል ዘልል
      </a>

      <aside
        className={cn(
          'erp-chrome hidden h-full shrink-0 flex-col border-e border-sidebar-border bg-sidebar transition-[width] duration-200 ease-out lg:flex',
          rail ? 'w-[76px]' : 'w-72'
        )}
      >
        <ShellSidebar scope="desk" rail={rail} onToggleRail={() => setRail(!rail)} {...sidebar} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="erp-chrome z-30 flex h-16 shrink-0 items-center gap-2 border-b border-sidebar-border bg-card/85 px-3 backdrop-blur sm:px-5">
          <button
            type="button"
            onClick={() => setDrawer(true)}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-sidebar-muted transition-colors hover:bg-sidebar-hover hover:text-foreground lg:hidden"
            aria-label="ዝርዝር ክፈት"
          >
            <MenuIcon className="h-5 w-5" aria-hidden />
          </button>

          <div className="min-w-0 flex-1">
            {current ? (
              <h1 className="flex min-w-0 items-center gap-1.5">
                <span className="hidden shrink-0 truncate text-[11px] uppercase tracking-wide text-sidebar-muted sm:inline">{current.group.labelAm}</span>
                <ChevronRight className="hidden h-3.5 w-3.5 shrink-0 text-sidebar-muted sm:inline" aria-hidden />
                <span className="truncate font-display text-[15px] font-semibold text-foreground">{current.item.labelAm}</span>
              </h1>
            ) : (
              <h1 className="truncate font-display text-[15px] font-semibold text-foreground">{env.appName}</h1>
            )}
          </div>

          {inbox ? (
            <Link
              to={inbox.path}
              aria-label="መልእክቶች"
              title="መልእክቶች"
              className="relative grid h-9 w-9 shrink-0 place-items-center rounded-lg text-sidebar-muted transition-colors hover:bg-sidebar-hover hover:text-foreground"
            >
              <BellRing className="h-[18px] w-[18px]" aria-hidden />
              {unread > 0 ? <span aria-hidden className={cn('absolute end-1 top-1 h-2 w-2 rounded-full', TONE.rose.bar)} /> : null}
            </Link>
          ) : null}

          <span className="hidden shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-sidebar-border bg-background px-2.5 py-1.5 text-xs text-sidebar-muted md:inline-flex">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden />
            {dateBoth(today)}
          </span>

          <Button variant="ghost" size="icon" onClick={toggleDark} aria-label={dark ? 'ወደ ብላራ ለወጥ' : 'ወደ ጨለማ ለወጥ'} className="shrink-0">
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>

          <Menu>
            <MenuTrigger label="የመገለጫ ዝርዝር" className="shrink-0 rounded-full">
              <span className="flex items-center gap-2">
                <Avatar name={identity?.nameAm ?? ''} size={34} />
                <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden />
              </span>
            </MenuTrigger>
            <MenuContent className="w-64">
              <MenuLabel>{identity?.nameAm ?? ''}</MenuLabel>
              <div className="px-2 pb-2 text-xs text-muted-foreground">{identity?.email ?? '—'}</div>
              <MenuSeparator />
              <MenuItem icon={<LayoutDashboard className="h-4 w-4" />} onSelect={() => window.location.assign(home)}>
                ወደ የራሴ ገጽ
              </MenuItem>
              <MenuItem icon={<ExternalLink className="h-4 w-4" />}>
                <Link to="/" className="flex w-full items-center gap-2">
                  ድረ ገጹን ክፈት
                </Link>
              </MenuItem>
              <MenuSeparator />
              <MenuItem destructive icon={<LogOut className="h-4 w-4" />} onSelect={() => void signOut()}>
                {UI.signOut}
              </MenuItem>
            </MenuContent>
          </Menu>
        </header>

        {!isSupabaseConfigured ? (
          <div className="erp-chrome shrink-0 px-4 pt-4">
            <ErrorNote message={missingConfigHint} />
          </div>
        ) : null}

        <main id="erp-main" tabIndex={-1} className="erp-main erp-scroll min-w-0 flex-1 overflow-y-auto px-4 py-6 outline-none sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>

      {drawer ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="ዋና ዝርዝር">
          <button type="button" className="absolute inset-0 animate-veil-in bg-ink/60 backdrop-blur-[2px]" aria-label="ዝጋ" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 start-0 flex w-[19rem] max-w-[86%] animate-drawer-in flex-col border-e border-sidebar-border bg-sidebar shadow-panel">
            <button
              type="button"
              onClick={() => setDrawer(false)}
              aria-label="ዝርዝር ዝጋ"
              className="absolute end-2 top-4 z-10 grid h-8 w-8 place-items-center rounded-lg text-sidebar-muted hover:bg-sidebar-hover hover:text-foreground"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
            <ShellSidebar scope="drawer" rail={false} onToggleRail={() => setRail(false)} {...sidebar} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
