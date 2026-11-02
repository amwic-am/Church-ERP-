// The page composer: one `page_blocks` row, one piece of the site.
//
// An editor adds a block in the ERP, picks its type, writes the Amharic text and
// the site renders it — nothing here is a picture of a feature. Data blocks
// (news, events, sermons…) read the published views, so a homepage section is
// always the newest real content the office approved.
import { Link } from 'react-router-dom';
import { ArrowRight, MapPin, Phone, Video } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/surface';
import { br, dateAm, dateTimeAm, num } from '@/lib/format';
import { fetchRows, type ViewRow } from '@/lib/supabase';
import type { PageBlocksRow } from '@/types/database';
import { cn } from '@/lib/utils';

import { CardGrid, ContentCard, SiteSection, StateNote, Thumb } from './common';
import { useAsyncData, useMediaUrl } from './data';

type Item = Record<string, unknown>;

function str(value: unknown): string {
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
}

function blockItems(block: PageBlocksRow): Item[] {
  return Array.isArray(block.items) ? (block.items as Item[]) : [];
}

function blockSettings(block: PageBlocksRow): Item {
  return block.settings && typeof block.settings === 'object' && !Array.isArray(block.settings) ? (block.settings as Item) : {};
}

/** The URL a block's `media_id` points at is read in `useMediaUrl`; nothing is bundled. */

function HeroBlock({ block }: { block: PageBlocksRow }) {
  const image = useMediaUrl(block.media_id);
  const settings = blockSettings(block);
  const buttons = [
    { label: str(settings.primary_label), href: str(settings.primary_href) },
    { label: str(settings.secondary_label), href: str(settings.secondary_href) },
  ].filter((b) => b.label && b.href);

  return (
    <section className="relative border-b border-border bg-leaf text-primary-foreground">
      {image ? (
        <img src={image} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover opacity-25" />
      ) : null}
      <div className="site-section relative py-16 sm:py-24">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gold-soft">{str(settings.eyebrow) || str(block.section_key)}</p>
        <h1 className="max-w-3xl font-display text-3xl font-bold leading-tight sm:text-5xl">{block.title_am}</h1>
        {block.body_am ? <p className="mt-4 max-w-2xl text-sm leading-relaxed opacity-90 sm:text-base">{block.body_am}</p> : null}
        {buttons.length > 0 ? (
          <div className="mt-8 flex flex-wrap gap-3">
            {buttons.map((b) => (
              <Button key={b.href} asChild variant={b.href === '/donate' ? 'gold' : 'outline'} size="lg">
                <Link to={b.href}>
                  {b.label} <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function TextBlock({ block }: { block: PageBlocksRow }) {
  const paragraphs = (block.body_am ?? '').split(/\n{2,}/).filter((p) => p.trim().length > 0);
  return (
    <SiteSection>
      {block.title_am ? <h2 className="font-display text-2xl font-semibold sm:text-3xl">{block.title_am}</h2> : null}
      <div className="mt-4 max-w-3xl space-y-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </SiteSection>
  );
}

function CardsBlock({ block }: { block: PageBlocksRow }) {
  const items = blockItems(block);
  return (
    <SiteSection title={block.title_am} description={block.body_am}>
      <CardGrid cols={3}>
        {items.map((item, i) => {
          const title = str(item.title) || str(item.label);
          const body = str(item.body) || str(item.description);
          const href = str(item.href);
          const card = (
            <div className="flex h-full flex-col gap-2 p-5">
              {str(item.badge) ? <StatusBadge tone="gold">{str(item.badge)}</StatusBadge> : null}
              <h3 className="font-display text-base font-semibold">{title}</h3>
              {body ? <p className="text-sm text-muted-foreground">{body}</p> : null}
              {href ? <span className="mt-auto inline-flex items-center gap-1 text-sm text-leaf">ተጨማሪ ያንብቡ <ArrowRight className="h-3.5 w-3.5" /></span> : null}
            </div>
          );
          return href && href.startsWith('/') ? (
            <Link key={i} to={href} className="h-full">
              <div className="h-full overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-shadow hover:shadow-md">{card}</div>
            </Link>
          ) : (
            <div key={i} className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
              {card}
            </div>
          );
        })}
      </CardGrid>
    </SiteSection>
  );
}

function ListBlock({ block }: { block: PageBlocksRow }) {
  const items = blockItems(block);
  return (
    <SiteSection title={block.title_am} description={block.body_am}>
      <ol className="max-w-3xl space-y-3">
        {items.map((item, i) => (
          <li key={i} className="flex gap-3 rounded-lg border border-border bg-card p-4">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-leaf/10 text-xs font-semibold text-leaf">{i + 1}</span>
            <span className="text-sm">
              <strong className="font-display">{str(item.title)}</strong>
              {str(item.body) ? <span className="mt-1 block text-muted-foreground">{str(item.body)}</span> : null}
            </span>
          </li>
        ))}
      </ol>
    </SiteSection>
  );
}

function StatsBlock({ block }: { block: PageBlocksRow }) {
  const items = blockItems(block);
  return (
    <section className="border-y border-border bg-leaf/5">
      <div className="site-section grid grid-cols-2 gap-6 py-10 md:grid-cols-4">
        {items.map((item, i) => {
          const raw = item.value;
          const value = typeof raw === 'number' ? num(raw) : str(raw);
          return (
            <div key={i} className="text-center">
              <p className="font-display text-3xl font-semibold text-leaf">{value}</p>
              <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">{str(item.label)}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function VersesBlock({ block }: { block: PageBlocksRow }) {
  const items = blockItems(block);
  return (
    <SiteSection title={block.title_am} description={block.body_am}>
      <ul className="grid gap-4 md:grid-cols-2">
        {items.map((item, i) => (
          <li key={i} className="rounded-lg border-l-4 border-gold bg-card p-5 shadow-sm">
            <p className="font-ethiopic text-base leading-relaxed">«{str(item.text)}»</p>
            <p className="mt-2 text-xs font-semibold text-muted-foreground">{str(item.ref)}</p>
          </li>
        ))}
      </ul>
    </SiteSection>
  );
}

function QuoteBlock({ block }: { block: PageBlocksRow }) {
  const settings = blockSettings(block);
  return (
    <SiteSection>
      <figure className="mx-auto max-w-3xl text-center">
        <blockquote className="font-ethiopic text-xl leading-relaxed sm:text-2xl">{block.body_am}</blockquote>
        {str(settings.author) ? <figcaption className="mt-4 text-sm text-muted-foreground">— {str(settings.author)}</figcaption> : null}
      </figure>
    </SiteSection>
  );
}

function CtaBlock({ block }: { block: PageBlocksRow }) {
  const settings = blockSettings(block);
  const href = str(settings.href) || '/donate';
  return (
    <SiteSection>
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gold bg-gold-soft p-6 text-ink">
        <div className="max-w-2xl">
          <h2 className="font-display text-xl font-semibold">{block.title_am}</h2>
          {block.body_am ? <p className="mt-1 text-sm">{block.body_am}</p> : null}
        </div>
        <Button asChild variant="primary" size="lg">
          <Link to={href.startsWith('/') ? href : '/'}>{str(settings.label) || 'ቀጥል'}</Link>
        </Button>
      </div>
    </SiteSection>
  );
}

function MapBlock({ block }: { block: PageBlocksRow }) {
  const settings = blockSettings(block);
  const embed = str(settings.embed_url);
  const address = str(settings.address) || block.body_am;
  const phone = str(settings.phone);
  return (
    <SiteSection title={block.title_am}>
      <div className="grid gap-5 md:grid-cols-2">
        {/^https:\/\//.test(embed) ? (
          <iframe title={block.title_am ?? 'ካርታ'} src={embed} className="h-72 w-full rounded-lg border border-border" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
        ) : (
          <div className="flex h-72 items-center justify-center rounded-lg border border-dashed border-border bg-muted text-sm text-muted-foreground">
            የቦታ ካርታ ሲኖር በአስተዳደሩ ገጽ ይገናኛል
          </div>
        )}
        <ul className="space-y-2 text-sm">
          {address ? (
            <li className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 text-leaf" aria-hidden /> {address}
            </li>
          ) : null}
          {phone ? (
            <li className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-leaf" aria-hidden /> <a href={`tel:${phone}`} className="hover:text-leaf">{phone}</a>
            </li>
          ) : null}
        </ul>
      </div>
    </SiteSection>
  );
}

function VideoBlock({ block }: { block: PageBlocksRow }) {
  const settings = blockSettings(block);
  const embed = str(settings.embed_url);
  const media = useMediaUrl(block.media_id);
  const src = /^https:\/\//.test(embed) ? embed : media;
  return (
    <SiteSection title={block.title_am} description={block.body_am}>
      {src ? (
        /^https:\/\/(www\.)?(youtube|vimeo)\./.test(src) ? (
          <iframe title={block.title_am ?? 'ቪዲዮ'} src={src} className="aspect-video w-full rounded-lg border border-border" allow="autoplay; fullscreen; encrypted-media" allowFullScreen />
        ) : (
          <video src={src} controls className="aspect-video w-full rounded-lg border border-border bg-black" />
        )
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Video className="h-4 w-4" aria-hidden /> ቪዲዮ ገና አልተጫነም።
        </p>
      )}
    </SiteSection>
  );
}

function GalleryBlock({ block }: { block: PageBlocksRow }) {
  const media = useAsyncData<ViewRow<'v_public_media'>[]>(
    () => fetchRows<ViewRow<'v_public_media'>>('v_public_media', { order: 'created_at', limit: 8 }),
    ['gallery-block', block.id]
  );
  const rows = (media.data ?? []).filter((row) => row.kind === 'image' && row.public_url);
  return (
    <SiteSection title={block.title_am} description={block.body_am} action={<Button asChild variant="outline" size="sm"><Link to="/gallery">ሁሉም ምስሎች</Link></Button>}>
      <StateNote loading={media.loading} error={media.error} empty={rows.length === 0} emptyTitle="ምስል ገና የላም" />
      {rows.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {rows.map((row, i) => (
            <Link key={row.id ?? i} to="/gallery">
              <Thumb src={row.public_url} alt={row.alt_am ?? row.title_am} ratio="aspect-square" className="rounded-lg" />
            </Link>
          ))}
        </div>
      ) : null}
    </SiteSection>
  );
}

type Feed = { seeAll: string; view: string; to: (row: Item) => string; image: (row: Item) => string | null; kicker: (row: Item) => string; meta: (row: Item) => string; defaultCount: number };

const FEEDS = {
  news: {
    seeAll: '/news',
    view: 'v_public_news',
    to: (r) => `/news/${str(r.slug)}`,
    image: (r) => str(r.cover_url) || null,
    kicker: (r) => str(r.category_am),
    meta: (r) => dateAm(str(r.published_at)),
    defaultCount: 3,
  },
  events: {
    seeAll: '/events',
    view: 'v_public_events',
    to: (r) => `/events/${str(r.slug)}`,
    image: (r) => str(r.cover_url) || null,
    kicker: (r) => str(r.department_name) || 'ፕሮግራም',
    meta: (r) => dateTimeAm(str(r.starts_at)),
    defaultCount: 3,
  },
  sermons: {
    seeAll: '/sermons',
    view: 'v_public_sermons',
    to: () => '/sermons',
    image: () => null,
    kicker: (r) => str(r.topic_am) || 'ንብዕት',
    meta: (r) => `${str(r.preacher_am)} · ${dateAm(str(r.delivered_on))}`,
    defaultCount: 4,
  },
  mezmur: {
    seeAll: '/mezmur',
    view: 'v_public_mezmur',
    to: () => '/mezmur',
    image: () => null,
    kicker: (r) => str(r.theme_am) || 'መዝሙር',
    meta: (r) => str(r.choir_am),
    defaultCount: 4,
  },
  publications: {
    seeAll: '/publications',
    view: 'v_public_publications',
    to: () => '/publications',
    image: (r) => str(r.cover_url) || null,
    kicker: (r) => str(r.kind),
    meta: (r) => dateAm(str(r.published_on)),
    defaultCount: 3,
  },
} satisfies Record<string, Feed>;

function FeedBlock({ block, kind }: { block: PageBlocksRow; kind: keyof typeof FEEDS }) {
  const feed = FEEDS[kind];
  const settings = blockSettings(block);
  const count = Math.min(12, Math.max(1, Number(settings.count) || feed.defaultCount));
  const state = useAsyncData<Item[]>(() => fetchRows<Item>(feed.view, { order: settings.order_by ? str(settings.order_by) : 'published_at', limit: count }), [block.id, kind, count, str(settings.order_by)]);
  const rows = state.data ?? [];
  const link = feed.seeAll;

  return (
    <SiteSection
      title={block.title_am}
      description={block.body_am}
      action={
        <Button asChild variant="outline" size="sm">
          <Link to={link}>ሁሉም</Link>
        </Button>
      }
      className={cn(kind === 'sermons' || kind === 'mezmur' ? 'bg-leaf/5' : undefined)}
    >
      <StateNote loading={state.loading} error={state.error} empty={rows.length === 0} emptyTitle="ገና ይህ ዓይነት ይዘት የላም" />
      {rows.length > 0 ? (
        <CardGrid cols={kind === 'news' || kind === 'events' ? 3 : 4}>
          {rows.map((row, i) => (
            <ContentCard
              key={str(row.id) || i}
              to={feed.to(row)}
              title={str(row.title_am)}
              summary={str(row.summary_am)}
              image={feed.image(row)}
              kicker={feed.kicker(row)}
              meta={feed.meta(row)}
            />
          ))}
        </CardGrid>
      ) : null}
    </SiteSection>
  );
}

function DonateBlock({ block }: { block: PageBlocksRow }) {
  const campaign = useAsyncData<Item[]>(() => fetchRows<Item>('v_public_campaigns', { order: 'starts_on', limit: 1 }), ['donate-block', block.id]);
  const active = (campaign.data ?? [])[0];
  const goal = Number(active?.goal_amount ?? 0);
  const raised = Number(active?.raised_amount ?? 0);
  const share = goal > 0 ? Math.round((raised / goal) * 100) : 0;
  return (
    <SiteSection>
      <div className="flex flex-wrap items-center justify-between gap-6 rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="max-w-xl">
          <h2 className="font-display text-xl font-semibold">{block.title_am || 'ዕግር አስተዋጽኦ'}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {active ? `${str(active.name_am)} — ${br(raised)} / ${br(goal)} (${share}%)` : block.body_am || 'የቤተ ክህሎት ዕግር ወይም የትምህርት ዕጣ ለማዋጽ እጅዎን ይስጡ።'}
          </p>
        </div>
        <Button asChild variant="gold" size="lg">
          <Link to="/donate">አሁን ይልገሱ</Link>
        </Button>
      </div>
    </SiteSection>
  );
}

/** One block, whichever type the editor chose. */
export function Block({ block }: { block: PageBlocksRow }) {
  switch (block.block_type) {
    case 'hero':
      return <HeroBlock block={block} />;
    case 'heading':
    case 'text':
      return <TextBlock block={block} />;
    case 'cards':
      return <CardsBlock block={block} />;
    case 'list':
      return <ListBlock block={block} />;
    case 'stats':
      return <StatsBlock block={block} />;
    case 'verses':
      return <VersesBlock block={block} />;
    case 'quote':
      return <QuoteBlock block={block} />;
    case 'cta':
      return <CtaBlock block={block} />;
    case 'map':
      return <MapBlock block={block} />;
    case 'video':
      return <VideoBlock block={block} />;
    case 'gallery':
      return <GalleryBlock block={block} />;
    case 'donate':
      return <DonateBlock block={block} />;
    case 'news':
    case 'events':
    case 'sermons':
    case 'mezmur':
    case 'publications':
      return <FeedBlock block={block} kind={block.block_type} />;
    default:
      return block.title_am || block.body_am ? <TextBlock block={block} /> : null;
  }
}

export function BlockList({ blocks }: { blocks: readonly PageBlocksRow[] }) {
  const ordered = [...blocks].sort((a, b) => a.sort_order - b.sort_order);
  return (
    <>
      {ordered.map((block) => (
        <Block key={block.id} block={block} />
      ))}
    </>
  );
}
