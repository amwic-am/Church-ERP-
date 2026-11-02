// Every "browse the published content" page on the site.
//
// Each one reads a public view, offers a filter over the columns the view already
// has, and links to the detail page. Nothing is paginated by fake data: the rows
// are the ones the office approved, and an empty list says so.
import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Download, Headphones, Music2, Play } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardBody, CardTitle, EmptyState, ErrorNote, Spinner, StatusBadge } from '@/components/ui/surface';
import { Accordion, Tabs } from '@/components/ui/tabs';
import { br, dateAm, dateTimeAm, num } from '@/lib/format';
import { callFn, type ViewRow } from '@/lib/supabase';
import { cn } from '@/lib/utils';

import { CmsPage } from './CmsPage';
import { CardGrid, ContentCard, PageHeader, SiteSection, StateNote, TagList, Thumb } from './common';
import { Seo } from './Seo';
import { useAsyncData, useRows } from './data';

type News = ViewRow<'v_public_news'>;
type EventRow = ViewRow<'v_public_events'>;
type Sermon = ViewRow<'v_public_sermons'>;
type Mezmur = ViewRow<'v_public_mezmur'>;
type Publication = ViewRow<'v_public_publications'>;
type Album = ViewRow<'v_public_albums'>;
type Media = ViewRow<'v_public_media'>;

function Filter({
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
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
            value === option.value ? 'border-leaf bg-leaf text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:border-leaf hover:text-leaf'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** The same filter chips, remembered in the URL so a link can be shared. */
function useFacet(key: string) {
  const [params, setParams] = useSearchParams();
  const value = params.get(key) ?? 'all';
  const setValue = (next: string) => {
    const copy = new URLSearchParams(params);
    if (next === 'all') copy.delete(key);
    else copy.set(key, next);
    setParams(copy, { replace: true });
  };
  return [value, setValue] as const;
}

function chips<T>(rows: readonly T[], pick: (row: T) => string | null | undefined): { value: string; label: string }[] {
  const seen: string[] = [];
  for (const row of rows) {
    const value = pick(row);
    if (value && !seen.includes(value)) seen.push(value);
  }
  return [{ value: 'all', label: 'ሁሉም' }, ...seen.map((value) => ({ value, label: value }))];
}

export function NewsPage() {
  const state = useRows<News>('v_public_news', { order: 'published_at', limit: 200 }, 'site-news');
  const rows = state.data ?? [];
  const [category, setCategory] = useFacet('category');
  const shown = useMemo(() => (category === 'all' ? rows : rows.filter((r) => r.category_am === category)), [rows, category]);

  return (
    <>
      <Seo title="ዜናዎች" description="የተክለቴዎፍሎስ ሰንበት ት/ቤት አዲስ መረጃዎች" />
      <PageHeader title="ዜናዎች" description="የት/ቤቱ ዜና፣ መሠለፈትና ማዕከላዊ መልእክት — የጸደቁና የተለጠፉ ብቻ።" />
      <SiteSection>
        <div className="mb-5">
          <Filter label="መድብ" options={chips(rows, (r) => r.category_am)} value={category} onChange={setCategory} />
        </div>
        <StateNote loading={state.loading} error={state.error} empty={shown.length === 0} onRetry={state.reload} emptyTitle="ገና ዜና የላም" />
        {shown.length > 0 ? (
          <CardGrid cols={3}>
            {shown.map((row, i) => (
              <ContentCard
                key={row.id ?? i}
                to={`/news/${row.slug ?? row.id}`}
                title={row.title_am}
                summary={row.summary_am}
                image={row.cover_url}
                kicker={row.category_am}
                meta={
                  <span className="flex flex-wrap items-center gap-2">
                    {dateAm(row.published_at)}
                    {row.is_featured ? <StatusBadge tone="gold">ተለይቶ የቀመደሰ</StatusBadge> : null}
                    {row.views ? <span>{num(row.views)} ጊዜ ተከታትሏል</span> : null}
                  </span>
                }
              />
            ))}
          </CardGrid>
        ) : null}
      </SiteSection>
    </>
  );
}

export function EventsPage() {
  const state = useRows<EventRow>('v_public_events', { order: 'starts_at', limit: 200 }, 'site-events');
  const rows = state.data ?? [];
  const now = Date.now();
  const [facet, setFacet] = useFacet('type');
  const [when, setWhen] = useState<'upcoming' | 'past'>('upcoming');
  const byTime = rows.filter((row) => {
    const starts = row.starts_at ? Date.parse(row.starts_at) : 0;
    return when === 'upcoming' ? starts >= now : starts < now;
  });
  const shown = facet === 'all' ? byTime : byTime.filter((row) => row.event_type === facet);

  return (
    <>
      <Seo title="ፕሮግራሞች" description="የሚመጡና የተካሄዱ የሰንበት ት/ቤት ፕሮግራሞች" />
      <PageHeader title="ፕሮግራሞች" description="በዓለታዊና በዕለታዊ ሥርዓት መሠረት የተዘጋጀ ፕሮግራሞች፤ ምዝገባ የሚፈልጉት በዝርዝር ገጹ ይመዝገቡ።" />
      <SiteSection>
        <Tabs
          value={when}
          onValueChange={(v) => setWhen(v as 'upcoming' | 'past')}
          items={[
            { value: 'upcoming', label: 'የሚመጡ', count: rows.filter((r) => (r.starts_at ? Date.parse(r.starts_at) : 0) >= now).length },
            { value: 'past', label: 'የተካሄዱ' },
          ]}
        >
          <div className="pt-5">
            <div className="mb-5">
              <Filter label="ዓይነት" options={chips(byTime, (r) => r.event_type)} value={facet} onChange={setFacet} />
            </div>
            <StateNote loading={state.loading} error={state.error} empty={shown.length === 0} onRetry={state.reload} emptyTitle="ፕሮግራም አልተለጠፈም" />
            {shown.length > 0 ? (
              <CardGrid cols={3}>
                {shown.map((row, i) => (
                  <ContentCard
                    key={row.id ?? i}
                    to={`/events/${row.slug ?? row.id}`}
                    title={row.title_am}
                    summary={row.summary_am}
                    image={row.cover_url}
                    kicker={`${row.event_type ?? 'ፕሮግራም'}${row.department_name ? ` · ${row.department_name}` : ''}`}
                    meta={
                      <span>
                        {dateTimeAm(row.starts_at ?? '')}
                        {row.venue_am ? ` · ${row.venue_am}` : ''}
                        {row.registration_required ? <StatusBadge tone="info" className="ms-2">ምዝገባ ይከፈታል</StatusBadge> : null}
                      </span>
                    }
                  />
                ))}
              </CardGrid>
            ) : null}
          </div>
        </Tabs>
      </SiteSection>
    </>
  );
}

export function SermonsPage() {
  const state = useRows<Sermon>('v_public_sermons', { order: 'delivered_on', limit: 200 }, 'site-sermons');
  const rows = state.data ?? [];
  const [topic, setTopic] = useFacet('topic');
  const shown = topic === 'all' ? rows : rows.filter((r) => r.topic_am === topic);

  return (
    <>
      <Seo title="ንብዕቶች" description="የተሰጡ ትምህርቶችና ማስተርሶች" />
      <PageHeader title="ንብዕቶች" description="በሰንበትና በመጐት ሥርዓት የተሰጡ ትምህርቶች — በቃል፣ በኦዲዮና በቪዲዮ።" />
      <SiteSection>
        <div className="mb-5">
          <Filter label="ርዕስ" options={chips(rows, (r) => r.topic_am)} value={topic} onChange={setTopic} />
        </div>
        <StateNote loading={state.loading} error={state.error} empty={shown.length === 0} onRetry={state.reload} emptyTitle="ንብዕት ገና የላም" />
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {shown.map((row, i) => (
            <li key={row.id ?? i} className="flex flex-wrap items-start justify-between gap-4 p-5">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-gold-deep dark:text-gold">{row.topic_am ?? 'ንብዕት'}</p>
                <h3 className="mt-1 font-display text-base font-semibold">{row.title_am}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {row.preacher_am} · {dateAm(row.delivered_on)}
                  {row.scripture_ref ? ` · ${row.scripture_ref}` : ''}
                </p>
                {row.summary_am ? <p className="mt-2 text-sm text-muted-foreground">{row.summary_am}</p> : null}
                <div className="mt-2">
                  <TagList tags={row.tags} />
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {row.audio_url ? (
                  <audio src={row.audio_url} controls preload="none" className="h-9 w-52" aria-label={`የ${row.title_am} ኦዲዮ`} />
                ) : null}
                {row.video_url || row.external_video_url ? (
                  <Button asChild variant="outline" size="sm">
                    <a href={row.video_url || row.external_video_url || '#'} target="_blank" rel="noreferrer noopener">
                      <Play className="h-4 w-4" /> ቪዲዮ
                    </a>
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </SiteSection>
    </>
  );
}

export function MezmurPage() {
  const state = useRows<Mezmur>('v_public_mezmur', { order: 'title_am', ascending: true, limit: 300 }, 'site-mezmur');
  const rows = state.data ?? [];
  const [theme, setTheme] = useFacet('theme');
  const [open, setOpen] = useState<string | null>(null);
  const shown = theme === 'all' ? rows : rows.filter((r) => r.theme_am === theme);

  return (
    <>
      <Seo title="መዝሙሮች" description="የመዝሙር መንፈስ ማስታወሻና የድምጽ መዝገብ" />
      <PageHeader
        title="መዝሙሮች"
        description="ለሥርዓተ ጸሎትና ለማህበረሰብ የተዘጋጀ መዝሙሮች፤ ነጋሪቱ፣ አፃፃፉና ድምጹ አንድ ላይ።"
        eyebrow="መዝሙር ዕጣ"
      />
      <SiteSection>
        <div className="mb-5">
          <Filter label="ርዕስ" options={chips(rows, (r) => r.theme_am)} value={theme} onChange={setTheme} />
        </div>
        <StateNote loading={state.loading} error={state.error} empty={shown.length === 0} onRetry={state.reload} emptyTitle="መዝሙር ገና የላም" />
        <CardGrid cols={2}>
          {shown.map((row, i) => {
            const key = row.id ?? row.title_am ?? `mezmur-${i}`;
            return (
            <Card key={key}>
              <CardBody className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{row.title_am}</CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {row.composer_am ? `ገጣሚ፦ ${row.composer_am}` : ''}
                      {row.choir_am ? ` · ${row.choir_am}` : ''}
                      {row.theme_am ? ` · ${row.theme_am}` : ''}
                    </p>
                  </div>
                  {row.is_scripture ? <StatusBadge tone="success">የመጻሕፍት</StatusBadge> : null}
                </div>
                {row.audio_url ? (
                  <audio src={row.audio_url} controls preload="none" className="w-full" aria-label={`የ${row.title_am} ድምጽ`} />
                ) : null}
                {row.lyrics_am ? (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => setOpen(open === key ? null : key)}>
                      <Music2 className="h-4 w-4" /> {open === key ? 'ነጋሪት ዝጋ' : 'ነጋሪት አንብብ'}
                    </Button>
                    {open === key ? (
                      <p className="whitespace-pre-line rounded-lg bg-muted p-4 font-ethiopic text-sm leading-loose">{row.lyrics_am}</p>
                    ) : null}
                  </>
                ) : null}
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {row.sheet_url ? (
                    <a href={row.sheet_url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 hover:text-leaf">
                      <Download className="h-3.5 w-3.5" /> የዜማ ወረቀት
                    </a>
                  ) : null}
                  {row.video_url ? (
                    <a href={row.video_url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 hover:text-leaf">
                      <Play className="h-3.5 w-3.5" /> ቪዲዮ
                    </a>
                  ) : null}
                  {row.play_count ? <span>{num(row.play_count)} ጊዜ ተመዝሙሯል</span> : null}
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

export function PublicationsPage() {
  const state = useRows<Publication>('v_public_publications', { order: 'published_on', limit: 200 }, 'site-publications');
  const rows = state.data ?? [];
  const [kind, setKind] = useFacet('kind');
  const shown = kind === 'all' ? rows : rows.filter((r) => r.kind === kind);

  return (
    <>
      <Seo title="ሐሳብ ማስተዋወቂያዎች" description="መጻሕፍት፣ መጽሄቶችና የትምህርት ማስታወሻዎች" />
      <PageHeader title="ሐሳብ ማስተዋወቂያዎች" description="በሰንበት ት/ቤቱ የተዘጋጁ መጻሕፍት፣ መጽሄቶችና የቤተ ክርስቲያን ማስታወሻዎች።" />
      <SiteSection>
        <div className="mb-5">
          <Filter label="ዓይነት" options={chips(rows, (r) => r.kind)} value={kind} onChange={setKind} />
        </div>
        <StateNote loading={state.loading} error={state.error} empty={shown.length === 0} onRetry={state.reload} emptyTitle="ሐሳብ ማስተዋወቂያ የላም" />
        <CardGrid cols={3}>
          {shown.map((row, i) => (
            <Card key={row.id ?? i} className="flex h-full flex-col overflow-hidden">
              <Thumb src={row.cover_url} alt={row.title_am} />
              <CardBody className="flex flex-1 flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-gold-deep dark:text-gold">{row.kind}</span>
                <CardTitle className="text-base">{row.title_am}</CardTitle>
                {row.summary_am ? <p className="text-sm text-muted-foreground">{row.summary_am}</p> : null}
                <p className="text-xs text-muted-foreground">
                  {row.issue_label ? `${row.issue_label} · ` : ''}
                  {row.pages ? `${num(row.pages)} ገጽ · ` : ''}
                  {row.price ? br(row.price, { cents: false }) : 'ነጻ'}
                </p>
                <div className="mt-auto pt-2">
                  {row.file_url ? (
                    <Button asChild variant="outline" size="sm">
                      <a href={row.file_url} target="_blank" rel="noreferrer noopener" download>
                        <Download className="h-4 w-4" /> አውርድ
                      </a>
                    </Button>
                  ) : (
                    <Link to="/contact" className="text-sm text-leaf hover:underline">
                      ለማግኘት ይጠይቁ
                    </Link>
                  )}
                </div>
              </CardBody>
            </Card>
          ))}
        </CardGrid>
      </SiteSection>
    </>
  );
}

export function GalleryPage() {
  const state = useRows<Album>('v_public_albums', { order: 'published_at', limit: 120 }, 'site-albums');
  const albums = state.data ?? [];
  return (
    <>
      <Seo title="ማዕከለ ምስሎች" description="በፕሮግራሞች የተቀረጹ ምስሎች ማዕከል" />
      <PageHeader title="የፎቶ ማዕከል" description="እያንዳንዱ ማከማቻ በፕሮግራም፣ በክፍለ ጉዳይ ወይም በቀን የተደራጀ የተረጋገጠ ምስሎች ስብስብ ነው።" />
      <SiteSection>
        <StateNote loading={state.loading} error={state.error} empty={albums.length === 0} onRetry={state.reload} emptyTitle="ማከማቻ ገና የላም" />
        <CardGrid cols={3}>
          {albums.map((album, i) => (
            <ContentCard
              key={album.id ?? i}
              to={`/gallery/${album.slug ?? album.id}`}
              title={album.title_am}
              summary={album.description_am}
              image={album.cover_url}
              kicker={album.photo_count ? `${num(album.photo_count)} ምስሎች` : 'ማከማቻ'}
              meta={album.taken_on ? dateAm(album.taken_on) : dateAm(album.published_at)}
            />
          ))}
        </CardGrid>
      </SiteSection>
    </>
  );
}

export function MediaPage() {
  const state = useRows<Media>('v_public_media', { order: 'created_at', limit: 120 }, 'site-media');
  const rows = state.data ?? [];
  const [kind, setKind] = useFacet('kind');
  const shown = kind === 'all' ? rows : rows.filter((r) => r.kind === kind);
  return (
    <>
      <Seo title="ሚዲያ" description="የድረ ገጹ የፎቶ፣ ኦዲዮና ቪዲዮ ማዕከል" />
      <PageHeader title="ሚዲያ ማዕከል" description="ለሁሉም ክፍት የሆኑ ፎቶዎች፣ ኦዲዮዎችና ቪዲዮዎች።" />
      <SiteSection>
        <div className="mb-5">
          <Filter label="ዓይነት" options={chips(rows, (r) => r.kind)} value={kind} onChange={setKind} />
        </div>
        <StateNote loading={state.loading} error={state.error} empty={shown.length === 0} onRetry={state.reload} emptyTitle="ሚዲያ የላም" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((row, i) => (
            <Card key={row.id ?? i} className="flex h-full flex-col overflow-hidden">
              {row.kind === 'image' ? (
                <Thumb src={row.public_url} alt={row.alt_am ?? row.title_am} ratio="aspect-square" />
              ) : (
                <div className="flex aspect-square items-center justify-center bg-muted text-muted-foreground">
                  {row.kind === 'audio' ? <Headphones className="h-8 w-8" aria-hidden /> : <Play className="h-8 w-8" aria-hidden />}
                </div>
              )}
              <div className="flex flex-1 flex-col gap-1 p-3">
                <p className="text-sm font-medium leading-snug">{row.title_am ?? row.kind}</p>
                <p className="mt-auto text-xs text-muted-foreground">{dateAm(row.created_at)}</p>
                {row.kind === 'audio' && row.public_url ? <audio src={row.public_url} controls preload="none" className="mt-1 w-full" /> : null}
              </div>
            </Card>
          ))}
        </div>
      </SiteSection>
    </>
  );
}

export function FaqPage() {
  const state = useRows<ViewRow<'v_public_faqs'>>('v_public_faqs', { order: 'sort_order', ascending: true, limit: 200 }, 'site-faqs');
  const rows = state.data ?? [];
  const groups = useMemo(() => {
    const map = new Map<string, typeof rows>();
    for (const row of rows) {
      const key = row.category_am || 'አጠቃላይ';
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [rows]);

  return (
    <>
      <Seo title="ጥያቄዎችና መልሶች" description="ስለ ምዝገባ፣ ስለ ትምህርትና ስለ አገልግሎት የሚጠየቁ ጥያቄዎች" />
      <PageHeader title="ጥያቄዎችና መልሶች" description="በደጋሚ የሚጠየቁ ጥያቄዎች መልሶች — ያልተመለሱትን በመገናኛ ገጽ ይጠይቁ።" />
      <SiteSection>
        <StateNote loading={state.loading} error={state.error} empty={rows.length === 0} onRetry={state.reload} emptyTitle="ጥያቄ ገና የለም" />
        <div className="space-y-8">
          {groups.map(([category, items]) => (
            <section key={category}>
              <h2 className="mb-3 font-display text-lg font-semibold">{category}</h2>
              <Accordion
                items={items.map((item, i) => ({
                  value: item.id ?? `${category}-${i}`,
                  title: item.question_am,
                  content: <p className="leading-relaxed">{item.answer_am}</p>,
                }))}
              />
            </section>
          ))}
        </div>
      </SiteSection>
    </>
  );
}

/** The block for `/news/:slug` and friends when a detail row is missing. */
export function NotFoundPage() {
  return (
    <>
      <Seo title="ገጽ አልተገኘም" />
      <SiteSection>
        <EmptyState
          title="ይህ ገጽ አልተገኘም"
          description="አድራሻው ሊቀየር ወይም ይዘቱ ሊወገድ ይችላል። ከዋናው ገጽ ይጀምሩ።"
          action={
            <Button asChild>
              <Link to="/">ወደ ዋናው ገጽ</Link>
            </Button>
          }
        />
      </SiteSection>
    </>
  );
}

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const term = params.get('q') ?? '';
  const [input, setInput] = useState(term);
  const results = useAsyncData(
    () => (term ? callFn('search_site', { p_query: term, p_limit: 40 }) : Promise.resolve([])),
    [term]
  );

  return (
    <>
      <Seo title="ፍለጋ" />
      <PageHeader title="ፍለጋ" description="በዜና፣ በንብዕት፣ በመዝሙርና በገጾች ውስጥ ይፈልጉ።" />
      <SiteSection>
        <form
          className="mb-6 flex max-w-xl gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setInput((value) => {
              const next = value.trim();
              setParams(next ? { q: next } : {});
              return next;
            });
          }}
        >
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="ቃል ወይም አርዕስት ይጻፉ…"
            className="h-10 flex-1 rounded-md border border-input bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            aria-label="የፍለጋ ቃል"
          />
          <Button type="submit">ፈልግ</Button>
        </form>
        {results.loading && term ? <Spinner /> : null}
        {results.error ? <ErrorNote message={results.error} onRetry={results.reload} /> : null}
        {!results.loading && term.length > 0 && (results.data ?? []).length === 0 ? (
          <EmptyState title="ውጤት አልተገኘም" description={`“${term}” በዚህ ቃል የተለጠፈ ይዘት አልተገኘም።`} />
        ) : null}
        {!term ? <EmptyState title="ቃል ይጻፉ" description="የሚፈልጉትን ቃል በላይኛው ሳጥን ይጻፉና ውጤቱ ይታያል።" /> : null}
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {(results.data ?? []).map((hit, i) => (
            <li key={`${hit.kind}-${hit.slug}-${i}`} className="p-4">
              <Link to={searchHitPath(hit)} className="group">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{SEARCH_KIND_LABEL[hit.kind] ?? hit.kind}</p>
                <p className="font-display text-base font-semibold group-hover:text-leaf">{hit.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{hit.summary}</p>
              </Link>
            </li>
          ))}
        </ul>
      </SiteSection>
    </>
  );
}

const SEARCH_KIND_LABEL: Record<string, string> = {
  news: 'ዜና',
  event: 'ፕሮግራም',
  sermon: 'ንብዕት',
  mezmur: 'መዝሙር',
  album: 'ማከማቻ ምስል',
  page: 'ገጽ',
};

/**
 * `search_site` gives a kind and, for the slugged kinds, a slug. Sermons and
 * mezmurs have no slug of their own, so they link to their list page.
 */
function searchHitPath(hit: { kind: string; slug: string }): string {
  switch (hit.kind) {
    case 'news':
      return `/news/${hit.slug}`;
    case 'event':
      return `/events/${hit.slug}`;
    case 'album':
      return `/gallery/${hit.slug}`;
    case 'page':
      return `/page/${hit.slug}`;
    case 'sermon':
      return '/sermons';
    case 'mezmur':
      return '/mezmur';
    default:
      return '/';
  }
}

/** `/page/:slug` — any published page the editor added by hand. */
export function AnyCmsPage() {
  const { slug } = useParams();
  return <CmsPage slug={slug ?? ''} />;
}
