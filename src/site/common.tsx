// The public site's building blocks.
//
// Every page is a heading, a state (loading, empty, failed) and a grid of cards,
// so those three are written once here. The cards link to detail pages and take
// their pictures from the media table, never from a bundled placeholder.
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ImageOff } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, EmptyState, ErrorNote, Spinner } from '@/components/ui/surface';
import { dateAm, truncate } from '@/lib/format';
import { cn } from '@/lib/utils';

export function SiteSection({
  title,
  description,
  action,
  className,
  children,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn('site-section py-10', className)}>
      {title ? (
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div className="max-w-2xl">
            <h2 className="font-display text-2xl font-semibold leading-tight sm:text-3xl">{title}</h2>
            {description ? <p className="mt-2 text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** The banner above every interior page. */
export function PageHeader({
  title,
  description,
  eyebrow,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="border-b border-border bg-leaf/5">
      <div className="site-section py-10 sm:py-14">
        {eyebrow ? <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gold-deep dark:text-gold">{eyebrow}</p> : null}
        <h1 className="font-display text-3xl font-semibold leading-tight sm:text-4xl">{title}</h1>
        {description ? <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">{description}</p> : null}
        {children ? <div className="mt-5 flex flex-wrap gap-2">{children}</div> : null}
      </div>
    </div>
  );
}

export function Thumb({
  src,
  alt,
  className,
  ratio = 'aspect-[4/3]',
}: {
  src?: string | null;
  alt?: string;
  className?: string;
  ratio?: string;
}) {
  if (!src) {
    return (
      <div className={cn('flex items-center justify-center bg-muted text-muted-foreground', ratio, className)}>
        <ImageOff className="h-7 w-7" aria-hidden />
      </div>
    );
  }
  return (
    <div className={cn('overflow-hidden bg-muted', ratio, className)}>
      {/* The media table owns the URL; the browser only renders it. */}
      <img src={src} alt={alt ?? ''} loading="lazy" className="h-full w-full object-cover" />
    </div>
  );
}

export function ContentCard({
  to,
  title,
  summary,
  image,
  kicker,
  meta,
  className,
}: {
  to: string;
  title: ReactNode;
  summary?: ReactNode;
  image?: string | null;
  kicker?: ReactNode;
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('flex h-full flex-col overflow-hidden transition-shadow hover:shadow-md', className)}>
      <Link to={to} className="flex h-full flex-col">
        <Thumb src={image} />
        <div className="flex flex-1 flex-col gap-2 p-4">
          {kicker ? <span className="text-xs font-semibold uppercase tracking-wide text-gold-deep dark:text-gold">{kicker}</span> : null}
          <h3 className="font-display text-base font-semibold leading-snug">{title}</h3>
          {summary ? <p className="text-sm text-muted-foreground">{truncate(String(summary), 160)}</p> : null}
          {meta ? <p className="mt-auto pt-1 text-xs text-muted-foreground">{meta}</p> : null}
        </div>
      </Link>
    </Card>
  );
}

export function CardGrid({ children, cols = 3 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  const width = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' }[cols];
  return <div className={cn('grid grid-cols-1 gap-5', width)}>{children}</div>;
}

export function DateMeta({ value, label }: { value?: string | null; label?: string }) {
  if (!value) return null;
  return (
    <span>
      {label ? `${label}: ` : ''}
      {dateAm(value)}
    </span>
  );
}

export function TagList({ tags }: { tags?: readonly string[] | null }) {
  if (!tags || tags.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {tags.slice(0, 8).map((tag) => (
        <li key={tag} className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {tag}
        </li>
      ))}
    </ul>
  );
}

/** Loading, failed or empty — the three states a data-driven page can be in. */
export function StateNote({
  loading,
  error,
  empty,
  emptyTitle = 'ምንም መረጃ የለም',
  emptyDescription,
  onRetry,
}: {
  loading: boolean;
  error: string | null;
  empty: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  onRetry?: () => void;
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner label="በመጫን ላይ…" />
      </div>
    );
  }
  if (error) return <ErrorNote message={error} onRetry={onRetry} />;
  if (empty) return <EmptyState title={emptyTitle} description={emptyDescription} />;
  return null;
}

export function SeeAllLink({ to, label }: { to: string; label: string }) {
  return (
    <Button asChild variant="outline" size="sm">
      <Link to={to}>{label}</Link>
    </Button>
  );
}
