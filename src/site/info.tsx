// The informational half of the public site.
//
// These pages answer what a parent or a visitor asks before walking through the
// door: what is this Sunday School, who leads it, which departments exist, what
// will my child study and when, and what does the church year look like. Nothing
// here is typed into the code: every word and number comes from a `v_public_*`
// view or from a table the migrations explicitly grant anon a SELECT policy on,
// so row level security stays the only authority. Where the homepage has been
// composed in the ERP its blocks are rendered; where it has not, the newest
// published news, programs, teachings and the live ልገሳ campaign take its place —
// a real page either way, never a template mock-up.
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, CalendarDays, Church, HandHeart, Info, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { BrandMark } from '@/components/ui/brand';
import { Avatar, ProgressBar } from '@/components/ui/tabs';
import { Card, CardBody, CardDescription, CardTitle, ErrorNote, Spinner, StatusBadge } from '@/components/ui/surface';
import { br, dateTimeAm, num, pct, truncate } from '@/lib/format';
import {
  addDays,
  daysBetween,
  ETH_MONTHS,
  ETH_WEEKDAYS,
  ethRange,
  ethToday,
  ethWeekdayName,
  ethYearLabel,
  ethYearOf,
  formatEthiopian,
  formatEthiopianShort,
  toEthiopian,
  toGeEz,
  weekdayIndex,
} from '@/lib/ethiopian';
import {
  devotionFor,
  devotionSummary,
  fastLength,
  fastSpan,
  fasika,
  FASTS,
  FEASTS,
  type FastKind,
  genna,
  MOVABLE_FEASTS,
  timket,
} from '@/lib/liturgical';
import { UI } from '@/lib/i18n';
import { SITE_ROUTES } from '@/lib/routes';
import { useSiteSettings } from '@/lib/siteSettings';
import { cn } from '@/lib/utils';
import type { Json } from '@/types/database';
import { type Row, type ViewRow } from '@/lib/supabase';

import { BlockList } from './blocks';
import { useCmsPage } from './CmsPage';
import { CardGrid, ContentCard, DateMeta, PageHeader, SeeAllLink, SiteSection, StateNote, TagList, Thumb } from './common';
import { Seo } from './Seo';
import { type AsyncState, useRows } from './data';
import { NewsletterForm } from './forms';

type Leadership = ViewRow<'v_public_leadership'>;
type Department = ViewRow<'v_public_departments'>;
type ClassRow = ViewRow<'v_public_classes'>;
type EventRow = ViewRow<'v_public_events'>;
type NewsRow = ViewRow<'v_public_news'>;
type SermonRow = ViewRow<'v_public_sermons'>;
type CampaignRow = ViewRow<'v_public_campaigns'>;
type LevelRow = ViewRow<'v_public_class_levels'>;
type SubjectRow = Row<'subjects'>;
type YearRow = Row<'academic_years'>;
type OrgUnitRow = Row<'org_units'>;
type PageRow = Row<'pages'>;

// ─── shared helpers ──────────────────────────────────────────────────────────

/** The Amharic label a route is known by, straight from `lib/routes.ts`. */
function siteLabel(path: string): string {
  return SITE_ROUTES.find((route) => route.path === path)?.labelAm ?? path;
}

/**
 * `useRows` always resolves to an array, but its `AsyncState` type keeps `data`
 * nullable — so every read here goes through this and the compiler stays honest.
 */
function rowsOf<T>(state: AsyncState<T[]>): T[] {
  return state.data ?? [];
}

/** The civil local date of an ISO timestamp, or null when there is nothing to read. */
function dayOf(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

/** `key` → rows, keeping the order of the first appearance. */
function groupBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = out.get(k);
    if (list) list.push(row);
    else out.set(k, [row]);
  }
  return out;
}

/** The chip row `lists.tsx` uses, for a page that filters without a detail view. */
function ChipFilter({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  if (options.length < 2) return null;
  return (
    <div className="mb-5 flex flex-wrap items-center gap-1.5" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
            value === option.value
              ? 'border-leaf bg-leaf text-primary-foreground'
              : 'border-border bg-card text-muted-foreground hover:border-leaf hover:text-leaf'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** A jsonb column read as a list of objects — the shape `classes.schedule` uses. */
function jsonRecords(value: Json | null | undefined): Record<string, Json | Json[]>[] {
  const out: Record<string, Json | Json[]>[] = [];
  if (!Array.isArray(value)) return out;
  for (const item of value) {
    if (item && typeof item === 'object' && !Array.isArray(item)) out.push(item);
  }
  return out;
}

function fieldNum(record: Record<string, Json | Json[]>, key: string): number | null {
  const raw = record[key];
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : null;
}

function fieldStr(record: Record<string, Json | Json[]>, key: string): string | null {
  const raw = record[key];
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

/** `እሁድ 09:00–10:00` for every slot in a class's `schedule` jsonb (0 = እሁድ). */
function scheduleLines(schedule: Json | null | undefined): string[] {
  const lines: string[] = [];
  for (const record of jsonRecords(schedule)) {
    const day = fieldNum(record, 'day');
    if (day === null || day < 0 || day > 6) continue;
    const start = fieldStr(record, 'start');
    const end = fieldStr(record, 'end');
    lines.push(`${ETH_WEEKDAYS[day]}${start ? ` ${start}` : ''}${end ? `–${end}` : ''}`);
  }
  return lines;
}

/** `ዕድሜ 4–7` / `ዕድሜ 16+` from a pair of nullable ages, or null when unbounded. */
function ageRange(min: number | null | undefined, max: number | null | undefined): string | null {
  if (typeof min !== 'number') return null;
  return `ዕድሜ ${min}${typeof max === 'number' ? `–${max}` : '+'}`;
}

/**
 * A leader's bio page is a published `pages` row whose title is the leader's own
 * name: `v_public_leadership` carries no slug or page id, so this is the only real
 * link the anon role can follow. No matching page, no link.
 */
function bioPageFor(leader: Leadership, pages: readonly PageRow[]): PageRow | null {
  const name = (leader.name_am ?? '').trim().toLocaleLowerCase();
  if (!name) return null;
  return pages.find((page) => page.slug !== 'home' && (page.title_am ?? '').trim().toLocaleLowerCase() === name) ?? null;
}

/** A department has its own page only when the office published one under the same slug. */
function linkedPageFor(slug: string | null | undefined, pages: readonly PageRow[]): PageRow | null {
  const key = (slug ?? '').trim();
  if (!key || key === 'home') return null;
  return pages.find((page) => page.slug === key) ?? null;
}

/** Published pages — the bio and department links are read out of these rows. */
function usePublishedPages() {
  const state = useRows<PageRow>('pages', { eq: ['state', 'published'], order: 'slug', ascending: true, limit: 400 }, 'site-pages');
  const pages = useMemo(() => rowsOf(state).filter((row) => row.state === 'published'), [state.data]);
  return { ...state, pages };
}

/** Where the site's own navigation says to go next; every label comes from `routes.ts`. */
function QuickNav({ paths }: { paths: readonly string[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {paths.map((path) => (
        <li key={path}>
          <Button asChild variant="outline" size="sm">
            <Link to={path}>
              {siteLabel(path)} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </Button>
        </li>
      ))}
    </ul>
  );
}

// ─── መነሻ ገጽ ─────────────────────────────────────────────────────────────────

/**
 * The published `home` page and its blocks when the office has composed them;
 * the newest real content from the public views when it has not.
 */
export function HomePage() {
  const { page, blocks, blocksLoading } = useCmsPage('home');
  const row = page.data;

  if (page.loading) {
    return (
      <div className="site-section py-20">
        <Spinner />
      </div>
    );
  }

  if (row && blocks.length > 0) {
    const seo = (row.seo ?? {}) as { title_am?: string; description_am?: string };
    return (
      <>
        <Seo title={seo.title_am ?? null} description={seo.description_am ?? row.excerpt_am ?? null} />
        <BlockList blocks={blocks} />
      </>
    );
  }

  if (blocksLoading) {
    return (
      <div className="site-section py-20">
        <Spinner />
      </div>
    );
  }

  return <HomeComposition cmsError={page.error} onRetry={page.reload} />;
}

/** The composition a homepage that has no blocks yet falls back to. */
function HomeComposition({ cmsError, onRetry }: { cmsError: string | null; onRetry: () => void }) {
  const { settings } = useSiteSettings();
  const now = Date.now();

  const news = useRows<NewsRow>('v_public_news', { order: 'published_at', limit: 3 }, 'home-news');
  const events = useRows<EventRow>('v_public_events', { order: 'starts_at', ascending: true, limit: 12 }, 'home-events');
  const sermons = useRows<SermonRow>('v_public_sermons', { order: 'delivered_on', limit: 4 }, 'home-sermons');
  const campaigns = useRows<CampaignRow>('v_public_campaigns', { order: 'starts_on', limit: 6 }, 'home-campaigns');
  const newsRows = rowsOf(news);
  const sermonRows = rowsOf(sermons);

  const upcoming = useMemo(
    () => rowsOf(events).filter((row) => (row.starts_at ? Date.parse(row.starts_at) : 0) >= now).slice(0, 3),
    [events.data, now]
  );
  const campaign = useMemo(() => rowsOf(campaigns).find((row) => row.is_featured) ?? rowsOf(campaigns)[0] ?? null, [campaigns.data]);

  const goal = Number(campaign?.goal_amount ?? 0);
  const raised = Number(campaign?.raised_amount ?? 0);
  const share = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0;

  const brand = settings.sunday_school_name_am || UI.appName;
  const intro = settings.about_am || settings.tagline_am || settings.site_description_am || '';
  const today = new Date();

  return (
    <>
      <Seo title={null} description={intro} />
      <section className="relative isolate overflow-hidden border-b border-border bg-leaf text-primary-foreground">
        <img src="/images/hero-procession.jpg" alt="" aria-hidden className="absolute inset-0 -z-10 h-full w-full object-cover" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-leaf-deep/95 via-leaf-deep/70 to-transparent" />
        <BrandMark
          logoPath={settings.logo_path}
          size={320}
          className="pointer-events-none absolute -bottom-12 -right-8 hidden opacity-[0.07] lg:block"
        />
        <div className="site-section relative flex flex-col justify-center py-14 sm:py-20 lg:min-h-[78vh]">
          <p className="inline-flex w-fit items-center rounded-full border border-gold/40 bg-leaf-deep/60 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-gold-soft">
            {settings.church_name_am || UI.churchName}
          </p>
          <h1 className="mt-4 max-w-3xl font-display text-3xl font-bold leading-tight sm:text-5xl">{brand}</h1>
          {intro ? <p className="mt-4 max-w-2xl text-sm leading-relaxed opacity-90 sm:text-base">{intro}</p> : null}
          <p className="mt-4 font-ethiopic text-sm opacity-90">
            {formatEthiopian(today)} — {devotionSummary(today)}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild variant="gold" size="lg">
              <Link to="/register">
                <Users className="h-4 w-4" aria-hidden /> {siteLabel('/register')}
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/donate">
                <HandHeart className="h-4 w-4" aria-hidden /> {siteLabel('/donate')}
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <SiteSection className="py-6">
        {cmsError ? (
          <div className="mb-5">
            <ErrorNote message={cmsError} onRetry={onRetry} />
          </div>
        ) : null}
        <QuickNav paths={['/sunday-school', '/classes', '/calendar', '/departments', '/leadership', '/about']} />
      </SiteSection>

      <SiteSection
        title="ዜናዎችና ማስታወሻዎች"
        description="በአስተዳደሩ የጸደቁና የተለጠፉ አዲስ መረጃዎች።"
        action={<SeeAllLink to="/news" label={`ሁሉም ${siteLabel('/news')}`} />}
      >
        <StateNote loading={news.loading} error={news.error} empty={newsRows.length === 0} onRetry={news.reload} emptyTitle="ገና ዜና የላም" />
        {newsRows.length > 0 ? (
          <CardGrid cols={3}>
            {newsRows.map((row, i) => (
              <ContentCard
                key={row.id ?? i}
                to={`/news/${row.slug ?? row.id}`}
                title={row.title_am}
                summary={row.summary_am}
                image={row.cover_url}
                kicker={row.category_am}
                meta={<DateMeta value={row.published_at} />}
              />
            ))}
          </CardGrid>
        ) : null}
      </SiteSection>

      <SiteSection
        title="የሚመጡ ፕሮግራሞች"
        description="በሥርዓተ ኣምልኮና በትምህርት መቁጠሪያ ላይ የተመሠረቱ የቤተ ክርስቲያኑ ክንውኖዎች።"
        action={<SeeAllLink to="/events" label={`ሁሉም ${siteLabel('/events')}`} />}
        className="bg-leaf/5"
      >
        <StateNote
          loading={events.loading}
          error={events.error}
          empty={upcoming.length === 0}
          onRetry={events.reload}
          emptyTitle="የሚመጡ ፕሮግራሞች ገና የላሉም"
        />
        {upcoming.length > 0 ? (
          <CardGrid cols={3}>
            {upcoming.map((row, i) => (
              <ContentCard
                key={row.id ?? i}
                to={`/events/${row.slug ?? row.id}`}
                title={row.title_am}
                summary={row.summary_am}
                image={row.cover_url}
                kicker={row.event_type ?? 'ፕሮግራም'}
                meta={
                  <span>
                    {dateTimeAm(row.starts_at ?? '')}
                    {row.venue_am ? ` · ${row.venue_am}` : ''}
                    {row.registration_required ? ' · ምዝገባ ይከፈታል' : ''}
                  </span>
                }
              />
            ))}
          </CardGrid>
        ) : null}
      </SiteSection>

      <SiteSection
        title="የቅርብ ጊዜ ንብዕቶች"
        description="በሰንበትና በመጐት ሥርዓት የተሰጡ ትምህርቶች።"
        action={<SeeAllLink to="/sermons" label={`ሁሉም ${siteLabel('/sermons')}`} />}
      >
        <StateNote
          loading={sermons.loading}
          error={sermons.error}
          empty={sermonRows.length === 0}
          onRetry={sermons.reload}
          emptyTitle="ንብዕት ገና የላም"
        />
        {sermonRows.length > 0 ? (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {sermonRows.map((row, i) => (
              <li key={row.id ?? i} className="p-5">
                <Link to="/sermons" className="group">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gold-deep dark:text-gold">{row.topic_am ?? 'ንብዕት'}</p>
                  <h3 className="mt-1 font-display text-base font-semibold group-hover:text-leaf">{row.title_am}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {row.preacher_am} · {row.delivered_on ? formatEthiopianShort(row.delivered_on) : ''}
                    {row.scripture_ref ? ` · ${row.scripture_ref}` : ''}
                  </p>
                </Link>
                <div className="mt-2">
                  <TagList tags={row.tags} />
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </SiteSection>

      <SiteSection title="ልገሳ" description="በጉባኤው ላይ የተከፈተ የአሁኑ ዕግር ዘመቻ።">
        <StateNote
          loading={campaigns.loading}
          error={campaigns.error}
          empty={campaign === null}
          onRetry={campaigns.reload}
          emptyTitle="በጉባኤው የተከፈተ ዘመቻ ገና የለም"
          emptyDescription="የቤተ ክህሎትና የትምህርት ዕጣ ለማዋጽ በልገሳ ገጽ በቀጥታ መደገፍ ይችላሉ።"
        />
        {campaign ? (
          <Card>
            <CardBody className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="text-lg">{campaign.name_am}</CardTitle>
                  {campaign.summary_am ? <CardDescription className="mt-1">{campaign.summary_am}</CardDescription> : null}
                </div>
                {campaign.is_featured ? <StatusBadge tone="gold">ተለይቶ የቀመደሰ</StatusBadge> : null}
              </div>
              {campaign.cover_url ? <Thumb src={campaign.cover_url} alt={campaign.name_am} ratio="aspect-[21/9]" className="rounded-lg" /> : null}
              <ProgressBar value={share} label={`${br(campaign.raised_amount)} / ${br(campaign.goal_amount)} (${pct(share, 0)})`} />
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                {campaign.starts_on ? <DateMeta value={campaign.starts_on} label="የተከፈተበት" /> : null}
                {campaign.ends_on ? <DateMeta value={campaign.ends_on} label="የሚዘጋበት" /> : null}
                <Button asChild variant="gold" size="sm" className="ms-auto">
                  <Link to="/donate">
                    <HandHeart className="h-4 w-4" aria-hidden /> አሁን ይልገሱ
                  </Link>
                </Button>
              </div>
            </CardBody>
          </Card>
        ) : null}
      </SiteSection>

      <section className="relative isolate overflow-hidden border-y border-border bg-leaf-deep text-primary-foreground">
        <img src="/images/worship-art.jpg" alt="" aria-hidden className="absolute inset-0 -z-10 h-full w-full object-cover" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-leaf-deep via-leaf-deep/90 to-leaf/70" />
        <div className="site-section relative grid gap-6 py-12 sm:py-14 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-center">
          <div>
            <h2 className="font-display text-2xl font-semibold leading-tight sm:text-3xl">የመረጃ ማሳወቂያ ተቀባይ ይሁኑ</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed opacity-90 sm:text-base">
              ዜናዎች፣ የፕሮግራም ጊዜያትና የምዝገባ መክፈቻ በኢሜይል ይድረሱልዎት።
            </p>
          </div>
          <div className="w-full max-w-md lg:ms-auto">
            <NewsletterForm compact />
          </div>
        </div>
      </section>
    </>
  );
}

// ─── መሪዎች ────────────────────────────────────────────────────────────────────

/** `leadership.role_key` — the four values the column is checked against. */
const ROLE_GROUP: Record<string, string> = {
  spiritual: 'መንፈሳዊ አመራር',
  pastoral: 'የጳጵስና አገልግሎት',
  administrative: 'አስተዳደራዊ አሠራር',
  advisory: 'የምክክር አካል',
};

export function LeadershipPage() {
  const leaders = useRows<Leadership>('v_public_leadership', { order: 'sort_order', ascending: true, limit: 200 }, 'site-leadership');
  const units = useRows<OrgUnitRow>('org_units', { order: 'sort_order', ascending: true, limit: 300 }, 'site-org-units');
  const pages = usePublishedPages();

  const rows = rowsOf(leaders);
  const visibleUnits = useMemo(() => rowsOf(units).filter((row) => row.is_visible), [units.data]);
  const byRole = useMemo(() => groupBy(rows, (row) => row.role_key ?? 'other'), [rows]);
  const roleOrder = useMemo(() => [...Object.keys(ROLE_GROUP), 'other'].filter((key) => byRole.has(key)), [byRole]);
  const unitChildren = useMemo(() => groupBy(visibleUnits, (row) => row.parent_id ?? 'root'), [visibleUnits]);
  const roots = useMemo(() => (unitChildren.get('root') ?? []).slice().sort((a, b) => a.sort_order - b.sort_order), [unitChildren]);

  const loadError = pages.error ?? leaders.error;

  return (
    <>
      <Seo title={siteLabel('/leadership')} description="የቤተ ክርስቲያኗ አባቶች፣ ኃላፊዎችና የሥራ አደረጃጀት" />
      <PageHeader
        title={siteLabel('/leadership')}
        description="በእምነት፣ በትምህርትና በአስተዳደር ኃላፊነት የሚወስዱ አባቶችና አገልግሎቶች — የጸደቁና ለማየት የተለጠፉ ብቻ።"
        eyebrow="ቤተ ክርስቲያን"
      >
        <QuickNav paths={['/departments', '/about', '/contact']} />
      </PageHeader>

      <SiteSection>
        {loadError ? <ErrorNote message={loadError} onRetry={leaders.reload} className="mb-5" /> : null}
        <StateNote loading={leaders.loading} error={null} empty={rows.length === 0} emptyTitle="መሪ ገና አልተለጠፈም" />
        <div className="space-y-10">
          {roleOrder.map((role) => {
            const group = byRole.get(role) ?? [];
            return (
              <section key={role}>
                <h2 className="mb-4 font-display text-xl font-semibold">{ROLE_GROUP[role] ?? 'ሌሎች አገልግሎቶች'}</h2>
                <CardGrid cols={3}>
                  {group.map((leader, i) => {
                    const bio = bioPageFor(leader, pages.pages);
                    const body = (
                      <div className="flex h-full flex-col gap-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={leader.name_am} src={leader.photo_url} size={56} />
                          <div className="min-w-0">
                            <CardTitle className="text-base">{leader.name_am}</CardTitle>
                            <p className="mt-0.5 text-sm text-leaf">{leader.title_am}</p>
                          </div>
                        </div>
                        {leader.bio_am ? <p className="text-sm text-muted-foreground">{truncate(leader.bio_am, 200)}</p> : null}
                        <p className="mt-auto text-xs text-muted-foreground">
                          {bio ? 'የሙሉ ነገራው በገጹ ላይ ይገኛል' : 'ለዚህ መሪ የተለየ የነገራ ገጽ ገና አልተከፈተም'}
                        </p>
                      </div>
                    );
                    return bio ? (
                      <Link key={leader.id ?? i} to={`/page/${bio.slug}`} className="h-full">
                        <Card className="h-full transition-shadow hover:shadow-md">
                          <CardBody>{body}</CardBody>
                        </Card>
                      </Link>
                    ) : (
                      <Card key={leader.id ?? i}>
                        <CardBody>{body}</CardBody>
                      </Card>
                    );
                  })}
                </CardGrid>
              </section>
            );
          })}
        </div>
      </SiteSection>

      <SiteSection
        title="የሥራ አደረጃጀት"
        description="ከመንፈሳዊ አመራር ጀምሮ እስከ ዘርፎቹ የሚወርድ የኃላፊነት ደረጃዎች፤ በአስተዳደሩ የተጻፈ ብቻ።"
        className="bg-leaf/5"
      >
        <StateNote
          loading={units.loading}
          error={units.error}
          empty={roots.length === 0}
          onRetry={units.reload}
          emptyTitle="የሥራ አደረጃጀት ገና አልተጻፈም"
          emptyDescription="ደረጃዎቹና ኃላፊዎቻቸው በአስተዳደሩ ክፍል ሲታደጉ ወዲያውኑ እዚህ ይታያሉ።"
        />
        {roots.length > 0 ? (
          <ul className="space-y-3">
            {roots.map((unit) => (
              <OrgUnitItem key={unit.id} unit={unit} childrenOf={unitChildren} depth={0} />
            ))}
          </ul>
        ) : null}
      </SiteSection>

      <SiteSection>
        <Card className="bg-gold-soft text-ink">
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-2xl text-sm">
              የመሪዎች ግሌ የግንኙነት መረጃ በድረ ገጹ አይለጠፍም፤ በአመራሩ ላይ ጥያቄ ወይም ቅሬታ ሲኖር በመገናኛ ገጽ በቀጥታ ያግኙን።
            </p>
            <Button asChild variant="primary" size="sm">
              <Link to="/contact">{siteLabel('/contact')}</Link>
            </Button>
          </CardBody>
        </Card>
      </SiteSection>
    </>
  );
}

/** One row of the org chart, with its children indented beneath it. */
function OrgUnitItem({ unit, childrenOf, depth }: { unit: OrgUnitRow; childrenOf: Map<string, OrgUnitRow[]>; depth: number }) {
  const kids = (childrenOf.get(unit.id) ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
  return (
    <li>
      <Card className={cn('bg-card', depth > 0 && 'ms-5')}>
        <CardBody className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            {depth === 0 ? <Church className="h-4 w-4 text-leaf" aria-hidden /> : <span className="text-muted-foreground" aria-hidden>└</span>}
            <CardTitle className={depth === 0 ? 'text-base' : 'text-sm font-medium'}>{unit.name_am}</CardTitle>
            {unit.head_name ? (
              <StatusBadge tone="neutral">
                {unit.head_label ?? 'ሃላፊ'}፦ {unit.head_name}
              </StatusBadge>
            ) : null}
          </div>
          {unit.summary_am ? <p className="text-sm text-muted-foreground">{unit.summary_am}</p> : null}
        </CardBody>
      </Card>
      {kids.length > 0 ? (
        <ul className="mt-2 space-y-2 border-s border-dashed border-border ps-3">
          {kids.map((kid) => (
            <OrgUnitItem key={kid.id} unit={kid} childrenOf={childrenOf} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

// ─── ዘርፎች ────────────────────────────────────────────────────────────────────

export function DepartmentsPage() {
  const departments = useRows<Department>('v_public_departments', { order: 'sort_order', ascending: true, limit: 200 }, 'site-departments');
  const pages = usePublishedPages();
  const rows = useMemo(() => rowsOf(departments).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)), [departments.data]);

  return (
    <>
      <Seo title={siteLabel('/departments')} description="የሰንበት ት/ቤቱ ዘርፎች፣ ኃላፊያቸው፣ አባላቶቻቸውና እንቅስቃሴአቸው" />
      <PageHeader
        title={siteLabel('/departments')}
        description="እያንዳንዱ ዘርፍ የራሱ ኃላፊ፣ አባላትና እንቅስቃሴ አለው — እዚህ የሚታዩት ለሕዝብ የጸደቁ ክፍሎች ብቻ ናቸው።"
        eyebrow="አገልግሎት"
      >
        <QuickNav paths={['/leadership', '/mezmur', '/events', '/register']} />
      </PageHeader>

      <SiteSection>
        <StateNote
          loading={departments.loading || pages.loading}
          error={departments.error ?? pages.error}
          empty={rows.length === 0}
          onRetry={departments.reload}
          emptyTitle="ለሕዝብ የተከፈተ ዘርፍ ገና የለም"
        />
        <CardGrid cols={3}>
          {rows.map((row, i) => {
            const linked = linkedPageFor(row.slug, pages.pages);
            return (
              <Card
                key={row.id ?? i}
                className="flex h-full flex-col"
                style={row.accent_color ? { borderInlineStart: `4px solid ${row.accent_color}` } : undefined}
              >
                <CardBody className="flex flex-1 flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{row.name_am}</CardTitle>
                    {row.member_count ? <StatusBadge tone="info">{num(row.member_count)} አባላት</StatusBadge> : null}
                  </div>
                  {row.summary_am ? <p className="text-sm text-muted-foreground">{row.summary_am}</p> : null}
                  {row.mission_am ? <p className="text-sm">{row.mission_am}</p> : null}
                  <dl className="mt-1 space-y-1 text-xs text-muted-foreground">
                    <div className="flex gap-1">
                      <dt>ኃላፊ፦</dt>
                      <dd className="font-medium text-foreground">{row.head_name ?? 'ገና አልተሾመም'}</dd>
                    </div>
                    <div className="flex gap-1">
                      <dt>ንቁ አባላት፦</dt>
                      <dd className="font-medium text-foreground">{num(row.member_count ?? 0)}</dd>
                    </div>
                    {typeof row.activity_count === 'number' ? (
                      <div className="flex gap-1">
                        <dt>የተጠናቀቁ እንቅስቃሴዎች፦</dt>
                        <dd className="font-medium text-foreground">{num(row.activity_count)}</dd>
                      </div>
                    ) : null}
                    {row.contact_email ? (
                      <div className="flex gap-1">
                        <dt>ኢሜይል፦</dt>
                        <dd>
                          <a href={`mailto:${row.contact_email}`} className="font-medium text-leaf hover:underline">
                            {row.contact_email}
                          </a>
                        </dd>
                      </div>
                    ) : null}
                    {row.contact_phone ? (
                      <div className="flex gap-1">
                        <dt>ስልክ፦</dt>
                        <dd>
                          <a href={`tel:${row.contact_phone}`} className="font-medium text-leaf hover:underline">
                            {row.contact_phone}
                          </a>
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                  <div className="mt-auto pt-2">
                    {linked ? (
                      <Button asChild size="sm" variant="outline">
                        <Link to={`/page/${linked.slug}`}>
                          {UI.details} ይክፈቱ <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                        </Link>
                      </Button>
                    ) : (
                      <Button asChild size="sm" variant="ghost">
                        <Link to="/contact">ስለ ዘርፉ ይጠይቁ</Link>
                      </Button>
                    )}
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </CardGrid>
      </SiteSection>
    </>
  );
}

// ─── ሰንበት ት/ቤት ────────────────────────────────────────────────────────────────

/** The four steps a family takes on the site itself — every link is a real route. */
const REGISTRATION_STEPS = [
  {
    title: 'ደረጃውን ይምረጡ',
    body: 'ለልጅዎ ወይም ለራስዎ ተስማሚውን ደረጃ ከላይ ባለው ዝርዝር ይመርጡ።',
    label: siteLabel('/classes'),
    to: '/classes',
  },
  {
    title: 'ማመልከቻውን ይሙሉ',
    body: 'የተማሪውንና የወላጁን መረጃ ያስገቡ; የማጣሪያ ቁጥር ይሰጥዎታል።',
    label: siteLabel('/register'),
    to: '/register',
  },
  {
    title: 'ሁኔታውን ይከታተሉ',
    body: 'በማጣሪያ ቁጥርዎ የማመልከቻውን ውጤት በማንኛውም ጊዜ ማየት ይችላሉ።',
    label: siteLabel('/status'),
    to: '/status',
  },
  {
    title: 'በክፍሉ ይጀምሩ',
    body: 'ጉዳዩ ሲጸድቅ የክፍሉ ቀንና ሰዓት ከመቁጠሪያ ገጹ ጋር አንድ ላይ ይታወቃል።',
    label: siteLabel('/calendar'),
    to: '/calendar',
  },
] as const;

export function SundaySchoolPage() {
  const { settings } = useSiteSettings();
  const levels = useRows<LevelRow>('v_public_class_levels', { order: 'order_no', ascending: true, limit: 100 }, 'site-class-levels');
  const subjects = useRows<SubjectRow>('subjects', { order: 'order_no', ascending: true, limit: 300 }, 'site-subjects');
  const classes = useRows<ClassRow>('v_public_classes', { order: 'level_order', ascending: true, limit: 300 }, 'site-classes-for-levels');
  const years = useRows<YearRow>('academic_years', { order: 'eth_year', ascending: false, limit: 40 }, 'site-academic-years');

  const activeLevels = useMemo(() => [...rowsOf(levels)].sort((a, b) => (a.order_no ?? 0) - (b.order_no ?? 0)), [levels.data]);
  const levelNameById = useMemo(() => new Map(activeLevels.map((row) => [row.id, row.name_am])), [activeLevels]);
  const activeSubjects = useMemo(() => rowsOf(subjects).filter((row) => row.is_active), [subjects.data]);
  const subjectsByLevel = useMemo(() => groupBy(activeSubjects.filter((row) => row.level_id), (row) => row.level_id ?? ''), [activeSubjects]);
  const classesByLevel = useMemo(() => groupBy(rowsOf(classes), (row) => row.level_key ?? ''), [classes.data]);
  const currentYear = useMemo(() => rowsOf(years).find((row) => row.is_current) ?? null, [years.data]);

  return (
    <>
      <Seo title={siteLabel('/sunday-school')} description={settings.about_am || 'የሕፃናት፣ የወጣቶችና የአባቶች መንፈሳዊ ትምህርት ዕርሳስ'} />
      <PageHeader
        title={siteLabel('/sunday-school')}
        description={settings.about_am || settings.tagline_am || null}
        eyebrow={settings.sunday_school_name_am || UI.appName}
      >
        <Button asChild variant="gold" size="lg">
          <Link to="/register">
            <Users className="h-4 w-4" aria-hidden /> {siteLabel('/register')}
          </Link>
        </Button>
        <QuickNav paths={['/classes', '/calendar', '/departments']} />
      </PageHeader>

      <SiteSection className="py-8">
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">የአሁኑ የትምህርት ዓመት</p>
            {years.loading ? (
              <Spinner className="mt-2" />
            ) : currentYear ? (
              <>
                <p className="mt-1 font-display text-2xl font-semibold text-leaf">{currentYear.label_am}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {currentYear.eth_year ? ethYearLabel(currentYear.eth_year) : ethYearLabel(ethToday().year)}
                  {currentYear.starts_on ? ` · ከ${formatEthiopianShort(currentYear.starts_on)}` : ''}
                  {currentYear.ends_on ? ` እስከ ${formatEthiopianShort(currentYear.ends_on)}` : ''}
                </p>
                {currentYear.notes ? <p className="mt-2 text-sm text-muted-foreground">{currentYear.notes}</p> : null}
              </>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                {years.error ? years.error : 'አሁን የሚሆነው የትምህርት ዓመት በአስተዳደሩ ገና አልተወሰነም።'}
              </p>
            )}
          </Card>
          <Card className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">የክፍል ደረጃዎች</p>
            <p className="mt-1 font-display text-3xl font-semibold">
              {levels.loading ? <Spinner /> : num(activeLevels.length)}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">ከሕፃናት እስከ አባቶችና እመቤቶች የተዘጋጀ ዕርሳስ።</p>
          </Card>
          <Card className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">የሚማሩ ትምህርተ ሐሳቦች</p>
            <p className="mt-1 font-display text-3xl font-semibold">
              {subjects.loading ? <Spinner /> : num(activeSubjects.length)}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">በእያንዳንዱ ደረጃ የተመደቡ የእምነትና የሥርዓት ጥናቶች።</p>
          </Card>
        </div>
      </SiteSection>

      <SiteSection title="የክፍል ደረጃዎች" description="እያንዳንዱ ደረጃ በዕድሜና በእምነት ጥልቀት የተለየ ዕርሳስ አለው።">
        <StateNote
          loading={levels.loading || subjects.loading || classes.loading}
          error={levels.error ?? subjects.error ?? classes.error}
          empty={activeLevels.length === 0}
          onRetry={levels.reload}
          emptyTitle="የክፍል ደረጃ ገና አልተገለጸም"
          emptyDescription="ደረጃዎቹ በአስተዳደሩ የትምህርት ክፍል ሲጻፉ ወዲያውኑ እዚህ ይታያሉ።"
        />
        <div className="space-y-4">
          {activeLevels.map((level) => {
            const levelSubjects = subjectsByLevel.get(level.id ?? '') ?? [];
            const levelClasses = classesByLevel.get(level.key ?? '') ?? [];
            const age = ageRange(level.age_min, level.age_max);
            return (
              <Card key={level.id ?? level.key}>
                <CardBody className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="text-lg">{level.name_am}</CardTitle>
                      <p className="mt-1 text-xs font-medium uppercase tracking-wide text-gold-deep dark:text-gold">
                        {age ?? 'ለሁሉም ዕድሜ'}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone="neutral">{num(levelClasses.length)} ክፍሎች</StatusBadge>
                      <StatusBadge tone="info">{num(levelSubjects.length)} ትምህርተ ሐሳቦች</StatusBadge>
                    </div>
                  </div>
                  {level.description_am ? <p className="text-sm text-muted-foreground">{level.description_am}</p> : null}
                  {levelSubjects.length > 0 ? (
                    <ul className="flex flex-wrap gap-1.5">
                      {levelSubjects.map((subject, i) => (
                        <li key={subject.id ?? i} className="rounded-full border border-border bg-muted px-2.5 py-1 text-xs">
                          {subject.name_am}
                          {subject.weekly_hours ? ` · ${num(subject.weekly_hours)} ሰዓት/ሳምንት` : ''}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-3 pt-1 text-sm">
                    {levelClasses.length > 0 ? (
                      <Button asChild size="sm" variant="outline">
                        <Link to={`/classes?level=${level.key}`}>
                          የዚህ ደረጃ ክፍሎች <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                        </Link>
                      </Button>
                    ) : null}
                    {level.next_level_id && levelNameById.get(level.next_level_id) ? (
                      <span className="text-muted-foreground">ተከታታይ ደረጃ፦ {levelNameById.get(level.next_level_id)}</span>
                    ) : null}
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      </SiteSection>

      <SiteSection
        title="እንዴት ይመዝገባሉ?"
        description="አራት ደረጃዎች ብቻ — ሁሉም ከዚህ ድረ ገጽ ውስጥ ይገኛሉ።"
        className="bg-leaf/5"
      >
        <ol className="grid gap-4 md:grid-cols-2">
          {REGISTRATION_STEPS.map((step, i) => (
            <li key={step.to}>
              <Card className="h-full">
                <CardBody className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-leaf text-xs font-semibold text-primary-foreground">
                    {toGeEz(i + 1)}
                  </span>
                  <span>
                    <strong className="font-display text-base">{step.title}</strong>
                    <span className="mt-1 block text-sm text-muted-foreground">{step.body}</span>
                    <Link to={step.to} className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-leaf hover:underline">
                      {step.label} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                  </span>
                </CardBody>
              </Card>
            </li>
          ))}
        </ol>
        <p className="mt-5 flex items-start gap-2 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-leaf" aria-hidden />
          {settings.service_times_am ? `የአገልግሎት ሰዓት፦ ${settings.service_times_am} · ` : ''}
          ሌላ ጥያቄ ካለዎት{' '}
          <Link to="/faq" className="text-leaf hover:underline">
            {siteLabel('/faq')}
          </Link>{' '}
          ይጎብኙ ወይም{' '}
          <Link to="/contact" className="text-leaf hover:underline">
            {siteLabel('/contact')}
          </Link>{' '}
          ይላኩ።
        </p>
      </SiteSection>
    </>
  );
}

// ─── ክፍሎች ────────────────────────────────────────────────────────────────────

export function ClassesPage() {
  const classes = useRows<ClassRow>('v_public_classes', { order: 'level_order', ascending: true, limit: 300 }, 'site-classes');
  const subjects = useRows<SubjectRow>('subjects', { order: 'order_no', ascending: true, limit: 300 }, 'site-class-subjects');
  const levels = useRows<LevelRow>('v_public_class_levels', { order: 'order_no', ascending: true, limit: 100 }, 'site-classes-levels');

  const [params, setParams] = useSearchParams();
  const levelFilter = params.get('level') ?? 'all';
  const setLevelFilter = (value: string) => {
    const copy = new URLSearchParams(params);
    if (value === 'all') copy.delete('level');
    else copy.set('level', value);
    setParams(copy, { replace: true });
  };
  const [dept, setDept] = useState('all');

  const rows = rowsOf(classes);
  const levelByKey = useMemo(() => new Map(rowsOf(levels).map((row) => [row.key, row])), [levels.data]);
  const subjectsByLevelId = useMemo(
    () => groupBy(rowsOf(subjects).filter((row) => row.is_active && row.level_id), (row) => row.level_id ?? ''),
    [subjects.data]
  );

  const grouped = useMemo(() => {
    const filtered = rows.filter(
      (row) => (levelFilter === 'all' || row.level_key === levelFilter) && (dept === 'all' || row.department_name === dept)
    );
    return [...groupBy(filtered, (row) => `${row.level_order ?? 9999}|${row.level_key ?? 'none'}`).entries()].sort(
      (a, b) => Number(a[0].split('|')[0]) - Number(b[0].split('|')[0])
    );
  }, [rows, levelFilter, dept]);

  const levelOptions = useMemo(
    () => [
      { value: 'all', label: UI.all },
      ...[...groupBy(rows, (row) => row.level_key ?? 'none').entries()].map(([key, list]) => ({
        value: key,
        label: list[0]?.level_name ?? levelByKey.get(key)?.name_am ?? key,
      })),
    ],
    [rows, levelByKey]
  );
  const deptOptions = useMemo(
    () => [
      { value: 'all', label: 'ሁሉም ዘርፎች' },
      ...[...new Set(rows.map((row) => row.department_name).filter((name): name is string => Boolean(name)))].map((name) => ({
        value: name,
        label: name,
      })),
    ],
    [rows]
  );

  return (
    <>
      <Seo title={siteLabel('/classes')} description="የሰንበት ት/ቤቱ ክፍሎች፣ ደረጃዎች፣ የመሰብሰቢያ ቀናትና ትምህርተ ሐሳቦች" />
      <PageHeader
        title={siteLabel('/classes')}
        description="በእያንዳንዱ ደረጃ የሚከፈቱ ክፍሎች፣ የመሰብሰቢያ ቀንና ሰዓት፣ ጉዳትና የቀረ ቦታ — ከት/ቤቱ መዝገብ የተወሰደ።"
        eyebrow="ትምህርት"
      >
        <Button asChild variant="gold">
          <Link to="/register">{siteLabel('/register')}</Link>
        </Button>
        <QuickNav paths={['/sunday-school', '/calendar']} />
      </PageHeader>

      <SiteSection>
        <ChipFilter label="ደረጃ" options={levelOptions} value={levelFilter} onChange={setLevelFilter} />
        <ChipFilter label="ዘርፍ" options={deptOptions} value={dept} onChange={setDept} />
        <StateNote
          loading={classes.loading || levels.loading}
          error={classes.error ?? subjects.error}
          empty={grouped.length === 0}
          onRetry={classes.reload}
          emptyTitle={rows.length === 0 ? 'ለሕዝብ የታወጀ ክፍል ገና የለም' : 'በዚህ ማጣሪያ ክፍል አልተገኘም'}
          emptyDescription={
            rows.length === 0
              ? 'ክፍሎች በት/ቤቱ አስተዳደር ሲታወጁ ወዲያውኑ እዚህ ይታያሉ፤ የደረጃ ዝርዝሩን ደግሞ በሰንበት ት/ቤት ገጽ ያገኛሉ።'
              : 'ሌላ ደረጃ ወይም ዘርፍ ምርጠው ይፈልጉ።'
          }
        />
        <div className="space-y-8">
          {grouped.map(([groupKey, list]) => {
            const key = groupKey.split('|')[1];
            const level = levelByKey.get(key);
            const levelSubjects = level ? subjectsByLevelId.get(level.id ?? '') ?? [] : [];
            return (
              <section key={groupKey}>
                <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                  <h2 className="font-display text-xl font-semibold">{list[0]?.level_name ?? level?.name_am ?? 'ደረጃ ያልተወሰነለት'}</h2>
                  <p className="text-xs text-muted-foreground">
                    {level ? `${ageRange(level.age_min, level.age_max) ?? 'ለሁሉም ዕድሜ'} · ` : ''}
                    {num(list.length)} ክፍሎች
                  </p>
                </div>
                {levelSubjects.length > 0 ? (
                  <div className="mb-4">
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">የደረጃው ትምህርተ ሐሳቦች</p>
                    <TagList tags={levelSubjects.map((subject) => subject.name_am)} />
                  </div>
                ) : null}
                <CardGrid cols={2}>
                  {list.map((row, i) => {
                    const lines = scheduleLines(row.schedule);
                    const capacity = row.capacity ?? null;
                    const enrolled = row.enrolled_count ?? 0;
                    const seats = capacity === null ? null : Math.max(0, capacity - enrolled);
                    const age = ageRange(row.age_min, row.age_max);
                    return (
                      <Card key={row.id ?? i} className="flex h-full flex-col">
                        <CardBody className="flex flex-1 flex-col gap-2">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <CardTitle className="text-base">{row.name_am}</CardTitle>
                              <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-gold-deep dark:text-gold">
                                {row.code}
                                {row.room_am ? ` · ${row.room_am}` : ''}
                              </p>
                            </div>
                            {seats !== null ? (
                              <StatusBadge tone={seats > 0 ? 'success' : 'warning'}>
                                {seats > 0 ? `${num(seats)} ቦታ ቀርቷል` : 'ጉዳቱ ሙሉ ነው'}
                              </StatusBadge>
                            ) : null}
                          </div>
                          {row.description_am ? <p className="text-sm text-muted-foreground">{row.description_am}</p> : null}
                          {row.teacher_names ? (
                            <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
                              <Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-leaf" aria-hidden />
                              <span>አስተማሪ፦ {row.teacher_names}</span>
                            </p>
                          ) : null}
                          {row.meets_summary_am ? <p className="text-sm">{row.meets_summary_am}</p> : null}
                          {lines.length > 0 ? (
                            <ul className="space-y-1 text-sm text-muted-foreground">
                              {lines.map((line) => (
                                <li key={line} className="flex items-center gap-2">
                                  <CalendarDays className="h-3.5 w-3.5 text-leaf" aria-hidden /> {line}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                          {age ? <p className="text-xs text-muted-foreground">{age}</p> : null}
                          <div className="mt-auto space-y-2 pt-2">
                            {capacity ? (
                              <ProgressBar
                                value={Math.min(100, Math.round((enrolled / capacity) * 100))}
                                label={`${num(enrolled)} / ${num(capacity)} ተማሪዎች ተመዝግበዋል`}
                              />
                            ) : (
                              <p className="text-xs text-muted-foreground">{num(enrolled)} ተማሪዎች ተመዝግበዋል</p>
                            )}
                            {row.department_name ? (
                              <Link to="/departments" className="inline-flex items-center gap-1 text-sm text-leaf hover:underline">
                                {row.department_name} · {siteLabel('/departments')} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                              </Link>
                            ) : null}
                          </div>
                        </CardBody>
                      </Card>
                    );
                  })}
                </CardGrid>
              </section>
            );
          })}
        </div>
      </SiteSection>
    </>
  );
}

// ─── የበዓላት መቁጠሪያ ────────────────────────────────────────────────────────────

type YearDay = {
  date: Date;
  day: number;
  month: number;
  weekday: number;
  feasts: { key: string; nameAm: string }[];
  fast: string | null;
  fastKind: FastKind | null;
  season: string;
};

type Milestone = { at: Date; kind: 'feast' | 'fast' | 'event'; title: string; detail?: string; to?: string };

/**
 * Every day of one Ethiopian year with its feasts, fast and season resolved by
 * `devotionFor` — the month grid, the feast list and the timeline all read this
 * one walk, so the year is computed once and no calendar math is repeated here.
 */
function ethiopianYearDays(ethYear: number): { start: Date; length: number; days: YearDay[] } {
  const [start] = ethRange(ethYear, 1, 1, 1);
  const [nextYear] = ethRange(ethYear + 1, 1, 1, 1);
  const length = daysBetween(start, nextYear) + 1;
  const days: YearDay[] = [];
  for (let i = 0; i < length; i += 1) {
    const date = addDays(start, i);
    const dev = devotionFor(date);
    days.push({
      date,
      day: dev.eth.day,
      month: dev.eth.month,
      weekday: weekdayIndex(date),
      feasts: dev.feasts,
      fast: dev.fast ? dev.fast.nameAm : null,
      fastKind: dev.fastKind,
      season: dev.seasonAm,
    });
  }
  return { start, length, days };
}

export function CalendarPage() {
  const [params, setParams] = useSearchParams();
  const today = ethToday();
  const yearParam = Number(params.get('year'));
  const ethYear = Number.isInteger(yearParam) && yearParam > 800 && yearParam < 2200 ? yearParam : today.year;
  const monthParam = Number(params.get('month'));
  const month = Number.isInteger(monthParam) && monthParam >= 0 && monthParam <= 13 ? monthParam : ethYear === today.year ? today.month : 1;

  const setParam = (key: string, value: string) => {
    const copy = new URLSearchParams(params);
    copy.set(key, value);
    setParams(copy, { replace: true });
  };

  const events = useRows<EventRow>('v_public_events', { order: 'starts_at', ascending: true, limit: 500 }, 'calendar-events');
  const eventRows = rowsOf(events);
  const year = useMemo(() => ethiopianYearDays(ethYear), [ethYear]);

  const monthDays = useMemo(() => (month === 0 ? year.days : year.days.filter((day) => day.month === month)), [year.days, month]);

  const eventsOfDay = useMemo(() => {
    const map = new Map<string, EventRow[]>();
    for (const row of eventRows) {
      const date = dayOf(row.starts_at);
      if (!date) continue;
      const eth = toEthiopian(date);
      if (eth.year !== ethYear) continue;
      const key = `${eth.month}:${eth.day}`;
      const list = map.get(key);
      if (list) list.push(row);
      else map.set(key, [row]);
    }
    return map;
  }, [eventRows, ethYear]);

  const fasts = useMemo(
    () =>
      FASTS.map((fast) => {
        const [from, to] = fastSpan(fast.kind, ethYear);
        return {
          ...fast,
          from,
          to,
          length: fastLength(fast.kind, ethYear),
          isNow: daysBetween(from, new Date()) >= 0 && daysBetween(new Date(), to) >= 0,
        };
      }).sort((a, b) => a.from.getTime() - b.from.getTime()),
    [ethYear]
  );

  /** The year's feasts — fixed and movable — from the day walk, each listed once. */
  const yearFeasts = useMemo(() => {
    const fixedKeys = new Set(FEASTS.map((feast) => feast.key));
    const byKey = new Map<string, { nameAm: string; at: Date; movable: boolean }>();
    for (const day of year.days) {
      for (const feast of day.feasts) {
        if (!byKey.has(feast.key)) byKey.set(feast.key, { nameAm: feast.nameAm, at: day.date, movable: !fixedKeys.has(feast.key) });
      }
    }
    return [...byKey.values()].sort((a, b) => a.at.getTime() - b.at.getTime());
  }, [year.days]);

  const movable = useMemo(
    () => MOVABLE_FEASTS.map((feast) => ({ ...feast, at: addDays(fasika(ethYear), feast.offset) })).sort((a, b) => a.at.getTime() - b.at.getTime()),
    [ethYear]
  );

  const milestones = useMemo<Milestone[]>(() => {
    const list: Milestone[] = [];
    for (const day of year.days) {
      for (const feast of day.feasts) {
        list.push({ at: day.date, kind: 'feast', title: feast.nameAm, detail: day.season });
      }
    }
    for (const fast of fasts) {
      list.push({
        at: fast.from,
        kind: 'fast',
        title: `${fast.nameAm} ይጀምራል`,
        detail: `${toGeEz(fast.length)} ቀናት — እስከ ${formatEthiopianShort(fast.to)}`,
      });
    }
    for (const row of eventRows) {
      const at = dayOf(row.starts_at);
      if (!at || ethYearOf(at) !== ethYear) continue;
      list.push({
        at,
        kind: 'event',
        title: row.title_am ?? 'ፕሮግራም',
        detail: `${row.event_type ?? 'ፕሮግራም'}${row.venue_am ? ` · ${row.venue_am}` : ''}${row.registration_required ? ' · ምዝገባ ይከፈታል' : ''}`,
        to: `/events/${row.slug ?? row.id}`,
      });
    }
    return list.sort((a, b) => a.at.getTime() - b.at.getTime());
  }, [year.days, fasts, eventRows, ethYear]);

  const now = new Date();
  const dev = devotionFor(now);
  const eventCount = useMemo(() => eventRows.filter((row) => {
    const at = dayOf(row.starts_at);
    return at !== null && ethYearOf(at) === ethYear;
  }).length, [eventRows, ethYear]);

  return (
    <>
      <Seo
        title={siteLabel('/calendar')}
        description={`${ethYearLabel(ethYear)} — እንቁጣጣሽ፣ የቋሚና እንቅስት በዓላት፣ የጾማም ዘመናትና የታወጡ ፕሮግራሞች በአንድ መቁጠሪያ።`}
      />
      <PageHeader
        title={siteLabel('/calendar')}
        description={`${ethYearLabel(ethYear)} — ከእንቁጣጣሽ እስከ ጳጉሜ፣ በዓላት፣ ጾማምና የተረጋገጡ ፕሮግራሞች በአንድ የኢትዮጵያ ዓመት ውስጥ።`}
        eyebrow={dev.seasonAm}
      >
        <Button asChild variant="outline">
          <Link to={`/calendar?year=${today.year}&month=${today.month}`}>
            <CalendarDays className="h-4 w-4" aria-hidden /> ወደ ዛሬ ({ethYearLabel(today.year)})
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/events">{`ሁሉም ${siteLabel('/events')}`}</Link>
        </Button>
      </PageHeader>

      <SiteSection className="py-8">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">ዓመተ ምሕረት</p>
            <p className="mt-1 font-display text-2xl font-semibold text-leaf">{ethYearLabel(ethYear)}</p>
            <p className="mt-1 text-sm text-muted-foreground">{formatEthiopian(year.start, { gregorian: true })}</p>
            <p className="mt-1 text-xs text-muted-foreground">{num(year.length)} ቀናት · 13 ወራት</p>
          </Card>
          <Card className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{UI.today}</p>
            <p className="mt-1 font-display text-lg font-semibold">{devotionSummary(now)}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {ethWeekdayName(now)} · {formatEthiopianShort(now)} · {dev.seasonAm}
            </p>
            {dev.isFastDay && dev.fast ? <p className="mt-1 text-xs text-leaf">ጾም፦ {dev.fast.nameAm}</p> : null}
          </Card>
          <Card className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">ልደትና ጥምቀት</p>
            <p className="mt-1 text-sm">ገና፦ {formatEthiopian(genna(ethYear))}</p>
            <p className="mt-1 text-sm">ጥምቀት፦ {formatEthiopian(timket(ethYear))}</p>
          </Card>
          <Card className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">ፋሲካ</p>
            <p className="mt-1 font-display text-lg font-semibold">{formatEthiopian(fasika(ethYear))}</p>
            <p className="mt-1 text-sm text-muted-foreground">ከዚህ ቀን ላይ የሚመሠረቱ {num(movable.length)} እንቅስት በዓላት አሉ።</p>
          </Card>
        </div>
      </SiteSection>

      <SiteSection
        title="የወሩ መቁጠሪያ"
        description="ወጮች በወረብ፣ ጾማም በአረንጓዴና የታወጡ ፕሮግራሞች በጉራጉራ ታምለዋል።"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setParam('year', String(ethYear - 1))}>
              {UI.previous} {toGeEz(ethYear - 1)}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setParam('year', String(ethYear + 1))}>
              {toGeEz(ethYear + 1)} {UI.next}
            </Button>
          </div>
        }
      >
        <ChipFilter
          label="ወር"
          options={[
            { value: '0', label: 'ሁሉም ወራት' },
            ...ETH_MONTHS.map((name, index) => ({ value: String(index + 1), label: name })),
          ]}
          value={String(month)}
          onChange={(value) => setParam('month', value)}
        />
        <p className="mb-4 text-sm text-muted-foreground">
          {ETH_MONTHS[month - 1] ?? 'ሁሉም ወራት'} {ethYearLabel(ethYear)} · {num(monthDays.length)} ቀናት
        </p>
        <MonthGrid days={monthDays} eventsOfDay={eventsOfDay} today={now} />
      </SiteSection>

      <SiteSection
        title="የዓመቱ በዓላት"
        description={`ቋሚና እንቅስት በዓላት ለ${ethYearLabel(ethYear)} በአንድ ዝርዝር ቀርተዋል።`}
        className="bg-leaf/5"
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {yearFeasts.map((feast) => (
              <li key={feast.nameAm} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span className="font-display text-sm font-medium">{feast.nameAm}</span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <StatusBadge tone={feast.movable ? 'info' : 'gold'}>{feast.movable ? 'እንቅስት' : 'ቋሚ'}</StatusBadge>
                  {formatEthiopian(feast.at, { gregorian: true })}
                </span>
              </li>
            ))}
          </ul>
          <div className="space-y-4">
            <Card>
              <CardBody className="space-y-2">
                <CardTitle className="text-base">ከፋሲካ የሚመሠረቱ በዓላት</CardTitle>
                <ul className="divide-y divide-border text-sm">
                  {movable.map((feast) => (
                    <li key={feast.key} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span className="font-medium">{feast.nameAm}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatEthiopian(feast.at, { gregorian: true })} · {feast.offset >= 0 ? 'ከፋሲካ በኋላ' : 'ከፋሲካ በፊት'}{' '}
                        {toGeEz(Math.abs(feast.offset))} ቀን
                      </span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="space-y-2">
                <CardTitle className="text-base">የጾማም ዘመናት</CardTitle>
                <ul className="space-y-2 text-sm">
                  {fasts.map((fast) => (
                    <li key={fast.key} className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">
                        {fast.nameAm}
                        {fast.isNow ? <StatusBadge tone="success" className="ms-2">አሁን ይጾማል</StatusBadge> : null}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatEthiopianShort(fast.from)} – {formatEthiopianShort(fast.to)} · {toGeEz(fast.length)} ቀናት
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                  ርዝመቱ በባሕረ ሐሳብ ለ {ethYearLabel(ethYear)} የተሰላ ነው፤ ልዩ ሥርዓት ያላቸው አብያተ ክርስቲያናት ጉዳዩን በፕሮግራሞች ክፍል ያስተካክላሉ።
                </p>
              </CardBody>
            </Card>
          </div>
        </div>
      </SiteSection>

      <SiteSection
        title="የዓመቱ ገጸ በዓል"
        description={`በዓላት፣ የጾማም መጀመሪያዎችና በ${ethYearLabel(ethYear)} ውስጥ የተለጠፉ ${num(eventCount)} ፕሮግራሞች በቀን ቅደም ተከተል።`}
        action={<SeeAllLink to="/events" label={`ሁሉም ${siteLabel('/events')}`} />}
      >
        {events.error ? <ErrorNote message={events.error} onRetry={events.reload} className="mb-4" /> : null}
        <StateNote
          loading={events.loading}
          error={null}
          empty={milestones.length === 0}
          onRetry={events.reload}
          emptyTitle="በዚህ ዓመት የሚታወቅ ክንውን የለም"
        />
        <ol className="space-y-2">
          {milestones.map((item, i) => (
            <li key={`${item.at.toISOString()}-${item.title}-${i}`}>
              <Card className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="w-28 shrink-0 text-xs font-medium text-muted-foreground">
                  <span className="block font-ethiopic text-sm text-foreground">{formatEthiopianShort(item.at)}</span>
                  {ethWeekdayName(item.at)}
                </span>
                <StatusBadge tone={item.kind === 'feast' ? 'gold' : item.kind === 'fast' ? 'success' : 'info'}>
                  {item.kind === 'feast' ? 'በዓል' : item.kind === 'fast' ? 'ጾም' : 'ፕሮግራም'}
                </StatusBadge>
                <span className="min-w-0 flex-1">
                  {item.to ? (
                    <Link to={item.to} className="font-display text-sm font-semibold hover:text-leaf">
                      {item.title}
                    </Link>
                  ) : (
                    <span className="font-display text-sm font-semibold">{item.title}</span>
                  )}
                  {item.detail ? <span className="mt-0.5 block text-xs text-muted-foreground">{item.detail}</span> : null}
                </span>
                <span className="text-xs text-muted-foreground">{formatEthiopian(item.at, { gregorian: true, weekday: false, year: false })}</span>
              </Card>
            </li>
          ))}
        </ol>
      </SiteSection>
    </>
  );
}

/** A seven-column Ethiopian month: Ge'ez day numbers, the day's feast, fast and programs. */
function MonthGrid({
  days,
  eventsOfDay,
  today,
}: {
  days: readonly YearDay[];
  eventsOfDay: Map<string, EventRow[]>;
  today: Date;
}) {
  const months = useMemo(() => [...new Set(days.map((day) => day.month))].sort((a, b) => a - b), [days]);
  if (days.length === 0) {
    return <StateNote loading={false} error={null} empty emptyTitle="በዚህ ወር ቀን አልተገኘም" />;
  }
  return (
    <div className="space-y-8">
      {months.map((monthNo) => {
        const cells = days.filter((day) => day.month === monthNo);
        const lead = cells[0].weekday;
        return (
          <section key={monthNo}>
            <h3 className="mb-2 font-display text-lg font-semibold">
              {ETH_MONTHS[monthNo - 1]}
              <span className="ms-2 text-xs font-normal text-muted-foreground">{num(cells.length)} ቀናት</span>
            </h3>
            <div className="grid grid-cols-7 gap-1.5">
              {ETH_WEEKDAYS.map((name) => (
                <div key={name} className="pb-1 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {name}
                </div>
              ))}
              {Array.from({ length: lead }, (_, i) => (
                <div key={`lead-${monthNo}-${i}`} aria-hidden />
              ))}
              {cells.map((cell) => {
                const dayEvents = eventsOfDay.get(`${cell.month}:${cell.day}`) ?? [];
                const isToday = cell.date.toDateString() === today.toDateString();
                const majorFast = cell.fast && cell.fastKind !== 'week';
                return (
                  <div
                    key={cell.date.getTime()}
                    className={cn(
                      'min-h-24 rounded-md border p-1.5 text-start',
                      cell.feasts.length > 0 ? 'border-gold bg-gold-soft/70' : majorFast ? 'border-leaf/40 bg-leaf/5' : 'border-border bg-card',
                      isToday && 'ring-2 ring-ring'
                    )}
                  >
                    <p className="font-ethiopic text-sm font-semibold">{toGeEz(cell.day)}</p>
                    {cell.feasts.length > 0 ? (
                      <p className="mt-0.5 text-[11px] font-medium leading-tight text-gold-deep dark:text-gold-soft">
                        {cell.feasts.map((feast) => feast.nameAm).join(' · ')}
                      </p>
                    ) : null}
                    {cell.fast && cell.feasts.length === 0 ? (
                      <p className={cn('mt-0.5 text-[11px] leading-tight', majorFast ? 'font-medium text-leaf' : 'text-muted-foreground')}>{cell.fast}</p>
                    ) : null}
                    {dayEvents.map((event, i) => (
                      <Link
                        key={event.id ?? i}
                        to={`/events/${event.slug ?? event.id}`}
                        title={event.title_am ?? undefined}
                        className="mt-0.5 block truncate rounded bg-sky-100 px-1 py-0.5 text-[11px] text-sky-900 hover:underline dark:bg-sky-950 dark:text-sky-200"
                      >
                        {truncate(event.title_am ?? 'ፕሮግራም', 26)}
                      </Link>
                    ))}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
