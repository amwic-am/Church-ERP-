// The ERP chrome: sidebar, top bar, dark canvas and the sign-out menu.
//
// The sidebar is generated from `navFor(permissions)` — the grants the database
// handed this person — so a module nobody can open is not merely disabled, it is
// absent. The dense data screens live inside a `.erp-dark` wrapper so the public
// site and the office can share one stylesheet without fighting over it.
import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  CalendarDays,
  ChevronDown,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  Moon,
  Settings,
  ShieldAlert,
  Sun,
  X,
} from 'lucide-react';

import { useAuth } from '@/components/auth/AuthProvider';
import { Avatar } from '@/components/ui/tabs';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '@/components/ui/overlay';
import { ErrorNote } from '@/components/ui/surface';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { env, isSupabaseConfigured, missingConfigHint } from '@/lib/env';
import { UI } from '@/lib/i18n';
import { dateBoth } from '@/lib/format';
import { navFor, type NavGroup } from '@/lib/routes';

const THEME_KEY = 'tekle-teoflos-erp-theme';

function useTheme(): [boolean, () => void] {
  const [dark, setDark] = useState(() => localStorage.getItem(THEME_KEY) === 'dark');
  useEffect(() => {
    localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
  }, [dark]);
  return [dark, () => setDark((v) => !v)];
}

/** Icons by group key — anything new falls back to the dashboard mark. */
const GROUP_ICON: Record<string, typeof LayoutDashboard> = {
  home: LayoutDashboard,
  website: ExternalLink,
  media: CalendarDays,
  students: ShieldAlert,
  academics: CalendarDays,
  attendance: CalendarDays,
  teachers: ShieldAlert,
  departments: LayoutDashboard,
  operations: CalendarDays,
  finance: CalendarDays,
  communication: CalendarDays,
  reports: CalendarDays,
  system: Settings,
  portals: LayoutDashboard,
};

function NavList({
  groups,
  counts,
  onNavigate,
}: {
  groups: NavGroup[];
  counts: Record<string, number>;
  onNavigate?: () => void;
}) {
  return (
    <nav className="space-y-5" aria-label="ዋና ዝርዝር">
      {groups.map((group) => {
        const Icon = GROUP_ICON[group.key] ?? LayoutDashboard;
        return (
          <div key={group.key}>
            <p className="mb-1.5 flex items-center gap-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {group.labelAm}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const badge = item.badge ? counts[item.badge] : 0;
                return (
                  <li key={item.path}>
                    <NavLink
                      to={item.path}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center justify-between gap-2 rounded-md px-3 py-1.5 text-sm transition-colors',
                          isActive ? 'bg-primary/15 font-medium text-primary dark:text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        )
                      }
                    >
                      <span className="min-w-0 truncate">{item.labelAm}</span>
                      {badge > 0 ? (
                        <span className="shrink-0 rounded-full bg-gold px-1.5 py-0.5 text-[11px] font-semibold text-ink">{badge > 99 ? '99+' : badge}</span>
                      ) : null}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

export function ErpShell() {
  const { identity, signOut, home } = useAuth();
  const location = useLocation();
  const [drawer, setDrawer] = useState(false);
  const [dark, toggleDark] = useTheme();
  const [counts, setCounts] = useState<Record<string, number>>({});

  const groups = useMemo(() => (identity ? navFor(identity.permissions) : []), [identity]);

  useEffect(() => setDrawer(false), [location.pathname]);

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
  }, [identity, location.pathname]);

  const title = useMemo(() => {
    for (const group of groups) {
      for (const item of group.items) {
        if (location.pathname.startsWith(item.path)) return `${group.labelAm} · ${item.labelAm}`;
      }
    }
    return env.appName;
  }, [groups, location.pathname]);

  return (
    <div className={cn('min-h-screen bg-background text-foreground', dark && 'erp-dark')}>
      {!isSupabaseConfigured ? (
        <div className="px-4 pt-4">
          <ErrorNote message={missingConfigHint} />
        </div>
      ) : null}

      <div className="flex min-h-screen">
        <aside className="hidden w-72 shrink-0 border-r border-border bg-card lg:block">
          <div className="flex h-16 items-center gap-2 border-b border-border px-4">
            <Link to="/erp" className="min-w-0 flex-1">
              <p className="truncate font-display text-sm font-semibold">{env.appName}</p>
              <p className="truncate text-[11px] text-muted-foreground">የቤተ ክርስቲያኑ መድረክ</p>
            </Link>
          </div>
          <div className="h-[calc(100vh-4rem)] overflow-y-auto px-2 py-4">
            <NavList groups={groups} counts={counts} />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 items-center gap-3 border-b border-border bg-card px-3 sm:px-5">
            <button
              type="button"
              onClick={() => setDrawer(true)}
              className="rounded-md p-2 text-muted-foreground hover:bg-muted lg:hidden"
              aria-label="ዝርዝር ክፈት"
            >
              <MenuIcon className="h-5 w-5" />
            </button>

            <h1 className="min-w-0 flex-1 truncate font-display text-base font-semibold">{title}</h1>

            <span className="hidden whitespace-nowrap text-xs text-muted-foreground md:inline">{dateBoth(new Date())}</span>

            <Button variant="ghost" size="icon" onClick={toggleDark} aria-label={dark ? 'ወደ ብላራ ለወጥ' : 'ወደ ጨለማ ለወጥ'}>
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>

            <Menu>
              <MenuTrigger label="የመገለጫ ዝርዝር" className="rounded-full">
                <span className="flex items-center gap-2">
                  <Avatar name={identity?.nameAm ?? ''} />
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

          <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <Outlet />
          </main>
        </div>
      </div>

      {drawer ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" className="absolute inset-0 bg-black/40" aria-label="ዝጋ" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 w-80 max-w-[85%] overflow-y-auto border-r border-border bg-card p-4">
            <div className="mb-4 flex items-center justify-between">
              <p className="font-display text-sm font-semibold">{env.appName}</p>
              <button type="button" className="rounded-md p-2 hover:bg-muted" onClick={() => setDrawer(false)} aria-label="ዝጋ">
                <X className="h-4 w-4" />
              </button>
            </div>
            <NavList groups={groups} counts={counts} onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
