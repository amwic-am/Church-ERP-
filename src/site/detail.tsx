// The six public detail pages: /news/:slug, /events/:slug, /gallery/:slug,
// /sermons/:slug, /mezmur/:slug, /publications/:slug.
//
// Each page reads one published row from its `v_public_*` view and, when the
// view does not carry the body (news and events keep `body_am` on the base
// table, sermons keep `transcript_am`, publications keep `body_am`), reads that
// extra column from the table itself — RLS lets `anon` see published rows only,
// so there is no second copy of the truth. Loading, failed-with-retry, missing
// and empty are four distinct Amharic states; an action that does not exist in
// the data (a closed registration, a missing file) is described, never faked.
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Calendar, Download, FileText, Headphones, MapPin, Music2, Play, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardBody, CardTitle, EmptyState, ErrorNote, Spinner, StatusBadge } from '@/components/ui/surface';
import { Modal } from '@/components/ui/overlay';
import { br, dateAm, dateTimeAm, num, timeAm } from '@/lib/format';
import { toGeEz } from '@/lib/ethiopian';
import { fetchOne, type ViewRow } from '@/lib/supabase';
import type { EventsRow, Json, NewsRow, PublicationsRow, SermonsRow } from '@/types/database';

import { CardGrid, ContentCard, PageHeader, SeeAllLink, SiteSection, StateNote, TagList, Thumb } from './common';
import { useAsyncData, useRow, useRows } from './data';
import { EventRegistrationForm } from './forms';
import { NotFoundPage } from './lists';
import { Seo } from './Seo';

type News = ViewRow<'v_public_news'>;
type EventRow = ViewRow<'v_public_events'>;
type Album = ViewRow<'v_public_albums'>;
type Media = ViewRow<'v_public_media'>;
type Sermon = ViewRow<'v_public_sermons'>;
type Mezmur = ViewRow<'v_public_mezmur'>;
type Publication = ViewRow<'v_public_publications'>;

// Sermons, mezmurs and publications have no slug column on their public view —
// only news, events and albums do — so their :slug route parameter carries the
// row id. Anything that is not a uuid is a miss before it reaches Postgres.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EVENT_TYPE_LABEL: Record<string, string> = {
  worship: 'የጸሎት ሥርዓት',
  fasting: 'ጾም',
  feast: 'በዓል',
  program: 'ፕሮግራም',
  class: 'ትምህርት',
  meeting: 'ሌጋ ጉባኤ',
  conference: 'ስብሰባ',
  outreach: 'የውጭ አገልግሎት',
  other: 'ሌላ',
};

const PUBLICATION_KIND_LABEL: Record<string, string> = {
  book: 'መጽሐፍ',
  bulletin: 'ማሰባሰቢያ',
  magazine: 'መጽሄት',
  newsletter: 'የዜና መልእክት',
  study: 'የጥናት ሐሳብ',
  leaflet: 'ጭረት',
  annual_report: 'ዓመታዊ ሪፖርት',
};

const LANGUAGE_LABEL: Record<string, string> = {
  am: 'አማርኛ',
  en: 'እንግሊዝኛ',
  ge: 'ግዕዝ',
  ti: 'ትግርኛ',
};

function languageAm(code: string | null | undefined): string | null {
  if (!code) return null;
  return LANGUAGE_LABEL[code] ?? code;
}

function durationAm(secs: number | null | undefined): string | null {
  if (!secs || secs <= 0) return null;
  const mins = Math.floor(secs / 60);
  const rest = secs % 60;
  return `${mins}:${String(rest).padStart(2, '0')}`;
}

/** The plain-branch equivalent of `TextBlock`: bodies here are text, not page blocks. */
function BodyText({ text }: { text: string }) {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim().length > 0);
  return (
    <div className="max-w-3xl space-y-4 text-sm leading-relaxed text-foreground/90 sm:text-base">
      {paragraphs.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </div>
  );
}

/** A labelled fact row inside the sidebar cards of the detail pages. */
function Fact({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-sm">
      <span className="mt-0.5 text-leaf" aria-hidden>
        {icon}
      </span>
      <span className="text-muted-foreground">{label}</span>
      <span className="ms-auto text-end font-medium">{value}</span>
    </li>
  );
}

function Loading() {
  return (
    <div className="site-section py-20">
      <Spinner />
    </div>
  );
}

// ─── ዜና · news ───────────────────────────────────────────────────────────────

export function NewsDetailPage() {
  const { slug = '' } = useParams();
  const head = useRow<News>('v_public_news', { eq: ['slug', slug] }, `news-detail:${slug}`);
  const body = useRow<NewsRow>('news', { eq: ['slug', slug], select: 'id, body_am' }, `news-body:${slug}`);
  const category = head.data?.category_am ?? '';
  const relatedState = useRows<News>('v_public_news', { eq: ['category_am', category], order: 'published_at', limit: 6 }, `news-related:${category}`);
  const related = (relatedState.data ?? []).filter((r) => r.id !== head.data?.id).slice(0, 3);
  const row = head.data;

  if (head.loading) return <Loading />;
  if (head.error) {
    return (
      <SiteSection>
        <ErrorNote message={head.error} onRetry={head.reload} />
      </SiteSection>
    );
  }
  if (!row || !row.title_am) return <NotFoundPage />;

  return (
    <>
      <Seo title={row.title_am} description={row.summary_am} image={row.cover_url} />
      <PageHeader
        title={row.title_am}
        description={row.summary_am}
        eyebrow={`${row.category_am ?? 'ዜና'} · ${dateAm(row.published_at)}`}
      >
        <SeeAllLink to="/news" label="ወደ ዜና ይመለሱ" />
        {row.is_featured ? <StatusBadge tone="gold">ተለይቶ የቀመደሰ</StatusBadge> : null}
        {row.views ? <span className="text-xs text-muted-foreground">{num(row.views)} ጊዜ ተከታትሏል</span> : null}
      </PageHeader>
      <SiteSection>
        <article className="space-y-6">
          <Thumb src={row.cover_url} alt={row.alt_am ?? row.title_am} ratio="aspect-[16/9]" className="rounded-xl" />
          {body.loading && !body.error ? <Spinner /> : null}
          {body.error ? <ErrorNote message={body.error} onRetry={body.reload} /> : null}
          {body.data?.body_am ? (
            <BodyText text={body.data.body_am} />
          ) : row.summary_am ? (
            <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">{row.summary_am}</p>
          ) : (
            <EmptyState title="የዜናው ዝርዝር ገና አልተጻፈም" description="አርዕስትና ማጠቃለያ ብቻ ታትመዋል፤ ሙሉ ሐበሩ በአስተዳደሩ ክፍል ይሞላል።" />
          )}
          <TagList tags={row.tags} />
        </article>
      </SiteSection>
      {related.length > 0 ? (
        <SiteSection title="ተያያዥ ዜናዎች" description={`በ “${row.category_am ?? 'ዜና'}” ምድብ የታተሉ ሌሎች መረጃዎች።`} className="border-t border-border bg-leaf/5">
          <CardGrid cols={3}>
            {related.map((r, i) => (
              <ContentCard
                key={r.id ?? i}
                to={`/news/${r.slug ?? r.id}`}
                title={r.title_am}
                summary={r.summary_am}
                image={r.cover_url}
                kicker={r.category_am}
                meta={dateAm(r.published_at)}
              />
            ))}
          </CardGrid>
        </SiteSection>
      ) : null}
    </>
  );
}

// ─── ፕሮግራም · event ──────────────────────────────────────────────────────────

export function EventDetailPage() {
  const { slug = '' } = useParams();
  const head = useRow<EventRow>('v_public_events', { eq: ['slug', slug] }, `event-detail:${slug}`);
  const body = useRow<EventsRow>('events', { eq: ['slug', slug], select: 'id, body_am' }, `event-body:${slug}`);
  const row = head.data;

  const now = Date.now();
  const started = row?.starts_at ? Date.parse(row.starts_at) < now : false;
  const deadlinePassed = row?.registration_deadline ? Date.parse(row.registration_deadline) < now : false;
  const seatsTaken = row?.registrations ?? 0;
  const seatsFull = row?.capacity != null && seatsTaken >= row.capacity;

  if (head.loading) return <Loading />;
  if (head.error) {
    return (
      <SiteSection>
        <ErrorNote message={head.error} onRetry={head.reload} />
      </SiteSection>
    );
  }
  if (!row || !row.id) return <NotFoundPage />;

  const closedReason = !row.registration_required
    ? null
    : deadlinePassed && row.registration_deadline
      ? `የምዝገባ ጊዜው በ ${dateTimeAm(row.registration_deadline)} ማብቂያው ሐልፏል።`
      : started
        ? 'ፕሮግራሙ ጀምሯል፤ ምዝገባውም ተዘግቷል።'
        : seatsFull
          ? `የታቀደው ${num(row.capacity)} ቦታ ሙሉ በሙሉ ተይዟል።`
          : null;

  const timeRange = row.all_day
    ? `${dateAm(row.starts_at ?? '')} — የቀን ሁሉ`
    : row.ends_at
      ? `${dateTimeAm(row.starts_at ?? '')} እስከ ${timeAm(row.ends_at)}`
      : dateTimeAm(row.starts_at ?? '');

  return (
    <>
      <Seo title={row.title_am} description={row.summary_am} image={row.cover_url} />
      <PageHeader
        title={row.title_am}
        description={row.summary_am}
        eyebrow={`${EVENT_TYPE_LABEL[row.event_type ?? ''] ?? row.event_type ?? 'ፕሮግራም'}${row.department_name ? ` · ${row.department_name}` : ''}`}
      >
        <SeeAllLink to="/events" label="ወደ ፕሮግራሞች ይመለሱ" />
        {row.is_featured ? <StatusBadge tone="gold">ተለይቶ የቀመደሰ</StatusBadge> : null}
      </PageHeader>
      <SiteSection>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <article className="space-y-6">
            <Thumb src={row.cover_url} alt={row.title_am} ratio="aspect-[16/9]" className="rounded-xl" />
            {body.loading && !body.error ? <Spinner /> : null}
            {body.error ? <ErrorNote message={body.error} onRetry={body.reload} /> : null}
            {body.data?.body_am ? (
              <BodyText text={body.data.body_am} />
            ) : row.summary_am ? null : (
              <EmptyState title="የፕሮግራሙ ዝርዝር ገና አልተጻፈም" description="ዝግጅቱ በአጭር መግለጫ ብቻ ታትሟል።" />
            )}

            <div className="max-w-lg" id="event-registration">
              {!row.registration_required ? (
                <div className="rounded-lg border border-border bg-muted/40 p-5">
                  <StatusBadge tone="neutral">ምዝገባ አያስፈልግም</StatusBadge>
                  <p className="mt-2 text-sm text-muted-foreground">
                    ለዚህ ፕሮግራም ቅድመ ምዝገባ አልተወሰነም፤ በቀጥታ በቦታው ላይ መገኘት ይቻላል።
                  </p>
                </div>
              ) : closedReason ? (
                <div className="rounded-lg border border-gold/60 bg-gold-soft/40 p-5">
                  <StatusBadge tone="warning">ምዝገባ ተዘግቷል</StatusBadge>
                  <p className="mt-2 text-sm text-muted-foreground">{closedReason}</p>
                </div>
              ) : (
                <EventRegistrationForm eventId={row.id} />
              )}
            </div>
          </article>

          <aside>
            <Card className="lg:sticky lg:top-24">
              <CardBody className="space-y-3">
                <CardTitle className="text-base">የፕሮግራሙ ዝርዝር</CardTitle>
                <ul className="space-y-3">
                  <Fact icon={<Calendar className="h-4 w-4" />} label="ቀንና ሰዓት" value={timeRange} />
                  {row.eth_date ? <Fact icon={<Calendar className="h-4 w-4" />} label="የኢትዮጵያ ቀን" value={row.eth_date} /> : null}
                  {row.venue_am ? <Fact icon={<MapPin className="h-4 w-4" />} label="ቦታ" value={row.venue_am} /> : null}
                  {row.department_name ? <Fact icon={<Users className="h-4 w-4" />} label="ክፍለ ጉዳይ" value={row.department_name} /> : null}
                  {row.capacity != null ? (
                    <Fact
                      icon={<Users className="h-4 w-4" />}
                      label="አቅም"
                      value={
                        <span>
                          {num(row.capacity)} — {num(seatsTaken)} ተመዝግበዋል
                        </span>
                      }
                    />
                  ) : null}
                  <Fact icon={<FileText className="h-4 w-4" />} label="ተሳትፎ" value={row.fee && Number(row.fee) > 0 ? br(row.fee) : 'ነጻ'} />
                  <Fact
                    icon={<Calendar className="h-4 w-4" />}
                    label="ምዝገባ"
                    value={
                      row.registration_required ? (
                        closedReason ? <StatusBadge tone="warning">ተዘግቷል</StatusBadge> : <StatusBadge tone="success">ክፍት ነው</StatusBadge>
                      ) : (
                        <StatusBadge tone="neutral">አያስፈልግም</StatusBadge>
                      )
                    }
                  />
                </ul>
                {row.registration_required && !closedReason ? (
                  <Button asChild variant="outline" size="sm" className="w-full">
                    <a href="#event-registration">ወደ ምዝገባ ቅጹ</a>
                  </Button>
                ) : null}
              </CardBody>
            </Card>
          </aside>
        </div>
      </SiteSection>
    </>
  );
}

// ─── ማከማቻ ምስል · album ──────────────────────────────────────────────────────

type AlbumRef = { album_id?: string; order?: number };

// `v_public_media` carries the album links as jsonb `[{album_id, order}]`;
// the view cannot be filtered by a jsonb membership in a `eq`, so the public
// media rows are read once and matched client-side against the album id.
function albumRefs(value: Json | null | undefined): AlbumRef[] {
  return Array.isArray(value) ? (value as unknown as AlbumRef[]) : [];
}

export function AlbumDetailPage() {
  const { slug = '' } = useParams();
  const albumState = useRow<Album>('v_public_albums', { eq: ['slug', slug] }, `album-detail:${slug}`);
  const mediaState = useRows<Media>('v_public_media', { order: 'created_at', limit: 500 }, 'site-album-media');
  const albumId = albumState.data?.id;

  const images = useMemo(() => {
    if (!albumId) return [];
    return (mediaState.data ?? [])
      .map((m) => {
        const ref = albumRefs(m.albums).find((r) => r.album_id === albumId);
        return ref && m.public_url ? { row: m, order: ref.order ?? 0 } : null;
      })
      .filter((x): x is { row: Media; order: number } => x !== null)
      .sort((a, b) => a.order - b.order)
      .map((x) => x.row);
  }, [albumId, mediaState.data]);

  const [lightbox, setLightbox] = useState<number | null>(null);
  const album = albumState.data;
  const active = lightbox != null ? images[lightbox] : undefined;

  if (albumState.loading) return <Loading />;
  if (albumState.error) {
    return (
      <SiteSection>
        <ErrorNote message={albumState.error} onRetry={albumState.reload} />
      </SiteSection>
    );
  }
  if (!album) return <NotFoundPage />;

  return (
    <>
      <Seo title={album.title_am} description={album.description_am} image={album.cover_url} />
      <PageHeader
        title={album.title_am}
        description={album.description_am}
        eyebrow={`ማከማቻ ምስል${album.taken_on ? ` · ${dateAm(album.taken_on)}` : album.published_at ? ` · ${dateAm(album.published_at)}` : ''}`}
      >
        <SeeAllLink to="/gallery" label="ወደ የፎቶ ማዕከል ይመለሱ" />
        {album.photo_count != null ? <StatusBadge tone="info">{num(album.photo_count)} ምስሎች</StatusBadge> : null}
      </PageHeader>
      <SiteSection>
        <StateNote
          loading={mediaState.loading}
          error={mediaState.error}
          empty={!mediaState.loading && images.length === 0}
          emptyTitle="ይህ ማከማቻ ገና ባዶ ነው"
          emptyDescription="በማከማቻው ውስጥ ለሁሉም ክፍት የሆነ ምስል ገና አልተጨመረም፤ ፎቶ ጋቢዎቹ ሲያወጡ እዚህ ይታያል።"
          onRetry={mediaState.reload}
        />
        {images.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {images.map((m, i) => (
              <figure key={m.id ?? i} className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => setLightbox(i)}
                  aria-label={`ምስሉን ማሳደግ፦ ${m.alt_am ?? m.title_am ?? ''}`}
                  className="block w-full rounded-lg transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Thumb src={m.public_url} alt={m.alt_am ?? m.title_am ?? ''} ratio="aspect-square" className="rounded-lg" />
                </button>
                {m.caption_am ? <figcaption className="text-xs leading-snug text-muted-foreground">{m.caption_am}</figcaption> : null}
              </figure>
            ))}
          </div>
        ) : null}
      </SiteSection>
      <Modal
        open={active !== undefined}
        onOpenChange={(open) => {
          if (!open) setLightbox(null);
        }}
        title={active?.caption_am ?? active?.title_am ?? 'ምስል'}
        description={active?.alt_am ?? undefined}
        size="xl"
      >
        {active?.public_url ? (
          <div className="space-y-3">
            <img src={active.public_url} alt={active.alt_am ?? active.title_am ?? ''} className="mx-auto max-h-[70vh] w-auto rounded-lg" />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {lightbox != null ? `${num(lightbox + 1)} / ${num(images.length)}` : ''}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLightbox((cur) => (cur == null || images.length === 0 ? null : (cur + 1) % images.length))}
              >
                ቀጣዩ ምስል
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}

// ─── ንብዕት · sermon ───────────────────────────────────────────────────────────

export function SermonDetailPage() {
  const { slug = '' } = useParams();
  const sermonId = UUID_RE.test(slug) ? slug : '';
  const state = useAsyncData<Sermon | null>(
    () => (sermonId ? fetchOne<Sermon>('v_public_sermons', { eq: ['id', sermonId] }) : Promise.resolve(null)),
    [sermonId]
  );
  // The sermon notes (`transcript_am`) live on the base table, not the view.
  const notes = useAsyncData<SermonsRow | null>(
    () => (sermonId ? fetchOne<SermonsRow>('sermons', { eq: ['id', sermonId], select: 'id, transcript_am' }) : Promise.resolve(null)),
    [sermonId]
  );

  if (state.loading) return <Loading />;
  if (state.error) {
    return (
      <SiteSection>
        <ErrorNote message={state.error} onRetry={state.reload} />
      </SiteSection>
    );
  }
  const row = state.data;
  if (!row || !row.id) return <NotFoundPage />;

  const videoSrc = row.video_url ?? row.external_video_url ?? '';
  const embeddable = /^https:\/\/(www\.)?(youtube|vimeo)\./.test(videoSrc);

  return (
    <>
      <Seo title={row.title_am} description={row.summary_am} />
      <PageHeader
        title={row.title_am}
        description={row.summary_am}
        eyebrow={`${row.topic_am ?? 'ንብዕት'} · ${dateAm(row.delivered_on)}`}
      >
        <SeeAllLink to="/sermons" label="ወደ ንብዕቶች ይመለሱ" />
        {row.listen_count ? <span className="text-xs text-muted-foreground">{num(row.listen_count)} ጊዜ ተስምቷል</span> : null}
      </PageHeader>
      <SiteSection>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-6">
            {row.audio_url ? (
              <Card>
                <CardBody className="space-y-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Headphones className="h-4 w-4 text-leaf" aria-hidden /> የንብዕቱ ድምጽ
                  </CardTitle>
                  <audio src={row.audio_url} controls preload="metadata" className="w-full" aria-label={`የ${row.title_am} ድምጽ መአዘን`} />
                </CardBody>
              </Card>
            ) : null}

            {embeddable ? (
              <Card>
                <CardBody className="space-y-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Play className="h-4 w-4 text-leaf" aria-hidden /> የቪዲዮ ቅሳነት
                  </CardTitle>
                  <iframe title={row.title_am ?? 'ቪዲዮ'} src={videoSrc} className="aspect-video w-full rounded-lg border border-border" allow="autoplay; fullscreen; encrypted-media" allowFullScreen />
                </CardBody>
              </Card>
            ) : videoSrc ? (
              <Card>
                <CardBody className="space-y-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Play className="h-4 w-4 text-leaf" aria-hidden /> ቪዲዮ
                  </CardTitle>
                  <video src={videoSrc} controls className="aspect-video w-full rounded-lg border border-border bg-black" />
                </CardBody>
              </Card>
            ) : null}

            {!row.audio_url && !videoSrc ? (
              <EmptyState title="ድምጽም ቪዲዮም ገና የለም" description="የንብዕቱ ቀረጻ በሚዲያ ክፍሉ ሲዘጋጀ እዚህ ይታያል።" />
            ) : null}

            {notes.loading && !notes.error ? <Spinner /> : null}
            {notes.error ? <ErrorNote message={notes.error} onRetry={notes.reload} /> : null}
            {notes.data?.transcript_am ? (
              <Card>
                <CardBody className="space-y-3">
                  <CardTitle className="text-base">የንብዕት ማስታወሻ</CardTitle>
                  <BodyText text={notes.data.transcript_am} />
                </CardBody>
              </Card>
            ) : null}
          </div>

          <aside>
            <Card className="lg:sticky lg:top-24">
              <CardBody className="space-y-3">
                <CardTitle className="text-base">የንብዕቱ መረጃ</CardTitle>
                <ul className="space-y-3">
                  <Fact icon={<Users className="h-4 w-4" />} label="አባ" value={row.preacher_am} />
                  <Fact icon={<Calendar className="h-4 w-4" />} label="የተሰጠበት ቀን" value={dateAm(row.delivered_on)} />
                  {row.scripture_ref ? <Fact icon={<FileText className="h-4 w-4" />} label="ቁምሪ" value={row.scripture_ref} /> : null}
                  {row.topic_am ? <Fact icon={<Play className="h-4 w-4" />} label="ርዕስ" value={row.topic_am} /> : null}
                  {row.language ? <Fact icon={<FileText className="h-4 w-4" />} label="ቋንቋ" value={languageAm(row.language) ?? row.language} /> : null}
                </ul>
                <TagList tags={row.tags} />
              </CardBody>
            </Card>
          </aside>
        </div>
      </SiteSection>
    </>
  );
}

// ─── መዝሙር · mezmur ───────────────────────────────────────────────────────────

function Lyrics({ lyrics }: { lyrics: string }) {  // Verses are separated by a blank line; each remaining line renders on its own.
  const verses = lyrics
    .split(/\n\s*\n/)
    .map((v) => v.split('\n').map((l) => l.trim()).filter((l) => l.length > 0))
    .filter((v) => v.length > 0);
  return (
    <div className="space-y-5">
      {verses.map((lines, i) => (
        <Card key={i}>
          <CardBody className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gold-deep dark:text-gold">ክፍል {toGeEz(i + 1)}</p>
            <div className="space-y-1 font-ethiopic text-base leading-loose">
              {lines.map((l, j) => (
                <p key={j}>{l}</p>
              ))}
            </div>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

export function MezmurDetailPage() {
  const { slug = '' } = useParams();
  const mezmurId = UUID_RE.test(slug) ? slug : '';
  const state = useAsyncData<Mezmur | null>(
    () => (mezmurId ? fetchOne<Mezmur>('v_public_mezmur', { eq: ['id', mezmurId] }) : Promise.resolve(null)),
    [mezmurId]
  );

  if (state.loading) return <Loading />;
  if (state.error) {
    return (
      <SiteSection>
        <ErrorNote message={state.error} onRetry={state.reload} />
      </SiteSection>
    );
  }
  const row = state.data;
  if (!row || !row.id) return <NotFoundPage />;

  const dur = durationAm(row.duration_secs);

  return (
    <>
      <Seo title={row.title_am} description={row.theme_am} />
      <PageHeader
        title={row.title_am}
        eyebrow={`መዝሙር ዕጣ${row.theme_am ? ` · ${row.theme_am}` : ''}`}
      >
        <SeeAllLink to="/mezmur" label="ወደ መዝሙሮች ይመለሱ" />
        {row.is_scripture ? <StatusBadge tone="success">የመጻሕፍት መዝሙር</StatusBadge> : null}
      </PageHeader>
      <SiteSection>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-6">
            {row.audio_url ? (
              <Card>
                <CardBody className="space-y-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Music2 className="h-4 w-4 text-leaf" aria-hidden /> የመዝሙሩ ድምጽ
                  </CardTitle>
                  <audio src={row.audio_url} controls preload="metadata" className="w-full" aria-label={`የ${row.title_am} ድምጽ መአዘን`} />
                </CardBody>
              </Card>
            ) : null}

            {row.lyrics_am ? (
              <Lyrics lyrics={row.lyrics_am} />
            ) : (
              <EmptyState title="የመዝሙሩ ነጋሪት ገና አልተጻፈም" description="ነጋሪቱ በአስተዳደሩ ክፍል ሲገባ እዚህ ይታያል።" />
            )}

            <div className="flex flex-wrap items-center gap-3 text-sm">
              {row.sheet_url ? (
                <Button asChild variant="outline" size="sm">
                  <a href={row.sheet_url} target="_blank" rel="noreferrer noopener" download>
                    <Download className="h-4 w-4" /> የዜማ ወረቀት
                  </a>
                </Button>
              ) : null}
              {row.video_url ? (
                <Button asChild variant="outline" size="sm">
                  <a href={row.video_url} target="_blank" rel="noreferrer noopener">
                    <Play className="h-4 w-4" /> ቪዲዮ
                  </a>
                </Button>
              ) : null}
            </div>
          </div>

          <aside>
            <Card className="lg:sticky lg:top-24">
              <CardBody className="space-y-3">
                <CardTitle className="text-base">የመዝሙሩ መረጃ</CardTitle>
                <ul className="space-y-3">
                  {/* v_public_mezmur has no feast column; theme_am is the liturgical category the office assigns. */}
                  {row.theme_am ? <Fact icon={<Music2 className="h-4 w-4" />} label="ዓይነት/ርዕስ" value={row.theme_am} /> : null}
                  {row.composer_am ? <Fact icon={<Users className="h-4 w-4" />} label="ገጣሚ" value={row.composer_am} /> : null}
                  {row.choir_am ? <Fact icon={<Headphones className="h-4 w-4" />} label="መዝሙር ቡድን" value={row.choir_am} /> : null}
                  {row.language ? <Fact icon={<Music2 className="h-4 w-4" />} label="ቋንቋ" value={languageAm(row.language) ?? row.language} /> : null}
                  {dur ? <Fact icon={<Play className="h-4 w-4" />} label="ቆይታ" value={dur} /> : null}
                  {row.play_count ? <Fact icon={<Headphones className="h-4 w-4" />} label="የማዳመጥ ብዛት" value={num(row.play_count)} /> : null}
                </ul>
                <TagList tags={row.tags} />
              </CardBody>
            </Card>
          </aside>
        </div>
      </SiteSection>
    </>
  );
}

// ─── ሐሳብ ማስተዋወቂያ · publication ────────────────────────────────────────────

export function PublicationDetailPage() {
  const { slug = '' } = useParams();
  const pubId = UUID_RE.test(slug) ? slug : '';
  const state = useAsyncData<Publication | null>(
    () => (pubId ? fetchOne<Publication>('v_public_publications', { eq: ['id', pubId] }) : Promise.resolve(null)),
    [pubId]
  );
  // The long description (`body_am`) lives on the base table, not the view.
  const body = useAsyncData<PublicationsRow | null>(
    () => (pubId ? fetchOne<PublicationsRow>('publications', { eq: ['id', pubId], select: 'id, body_am' }) : Promise.resolve(null)),
    [pubId]
  );

  if (state.loading) return <Loading />;
  if (state.error) {
    return (
      <SiteSection>
        <ErrorNote message={state.error} onRetry={state.reload} />
      </SiteSection>
    );
  }
  const row = state.data;
  if (!row || !row.id) return <NotFoundPage />;

  const kindLabel = PUBLICATION_KIND_LABEL[row.kind ?? ''] ?? row.kind ?? 'ህትመት';

  return (
    <>
      <Seo title={row.title_am} description={row.summary_am} image={row.cover_url} />
      <PageHeader
        title={row.title_am}
        description={row.summary_am}
        eyebrow={`${kindLabel}${row.issue_label ? ` · ${row.issue_label}` : ''}`}
      >
        <SeeAllLink to="/publications" label="ወደ ህትመቶች ይመለሱ" />
        {row.published_on ? <span className="text-xs text-muted-foreground">የታተመበት፦ {dateAm(row.published_on)}</span> : null}
      </PageHeader>
      <SiteSection>
        <div className="grid gap-8 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <div className="space-y-4">
            <Thumb src={row.cover_url} alt={row.title_am} ratio="aspect-[3/4]" className="rounded-xl" />
            {row.file_url ? (
              <Button asChild variant="gold" className="w-full">
                <a href={row.file_url} target="_blank" rel="noreferrer noopener" download>
                  <Download className="h-4 w-4" /> ፋይሉን አውርድ
                </a>
              </Button>
            ) : (
              <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                ዲጂታል ፋይል ገና አልተያያዘም፤ ለማግኘት በተገናኛ ገጽ መጠየቅ ይችላሉ።{' '}
                <Link to="/contact" className="font-medium text-leaf hover:underline">
                  አግኙን
                </Link>
              </div>
            )}
            <Card>
              <CardBody>
                <ul className="space-y-3">
                  {row.pages ? <Fact icon={<Calendar className="h-4 w-4" />} label="ገጾች" value={num(row.pages)} /> : null}
                  <Fact icon={<FileText className="h-4 w-4" />} label="ዋጋ" value={row.price && Number(row.price) > 0 ? br(row.price) : 'ነጻ'} />
                  {row.download_count ? <Fact icon={<Download className="h-4 w-4" />} label="የማውረድ ብዛት" value={num(row.download_count)} /> : null}
                </ul>
              </CardBody>
            </Card>
          </div>

          <article className="space-y-6">
            {body.loading && !body.error ? <Spinner /> : null}
            {body.error ? <ErrorNote message={body.error} onRetry={body.reload} /> : null}
            {body.data?.body_am ? (
              <BodyText text={body.data.body_am} />
            ) : row.summary_am ? (
              <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">{row.summary_am}</p>
            ) : (
              <EmptyState title="መግለጫው ገና አልተጻፈም" description="የህትመቱ ዝርዝር ሐበር በአስተዳደሩ ክፍል ሲሞላ እዚህ ይታያል።" />
            )}
            <TagList tags={row.tags} />
          </article>
        </div>
      </SiteSection>
    </>
  );
}
