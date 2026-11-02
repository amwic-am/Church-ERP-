// Cards, headings, badges and the three states every data screen needs:
// loading, empty, and failed.
import type { HTMLAttributes, ReactNode } from 'react';
import { AlertTriangle, Inbox, Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-lg border border-border bg-card text-card-foreground shadow-sm', className)} {...props} />;
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4', className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('font-display text-lg font-semibold leading-tight', className)} {...props} />;
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 py-4', className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-wrap items-center gap-3 border-t border-border px-5 py-3', className)} {...props} />;
}

/** A page heading with its actions on the right, used by every ERP screen. */
export function PageHeading({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        <h2 className="font-display text-2xl font-semibold leading-tight">{title}</h2>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'gold';

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-muted text-muted-foreground border-border',
  info: 'bg-sky-100 text-sky-900 border-sky-200 dark:bg-sky-950 dark:text-sky-200 dark:border-sky-800',
  success: 'bg-emerald-100 text-emerald-900 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800',
  warning: 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800',
  danger: 'bg-red-100 text-red-900 border-red-200 dark:bg-red-950 dark:text-red-200 dark:border-red-800',
  gold: 'bg-gold-soft text-ink border-gold',
};

/** Status pill; the caller passes the Amharic label so translations stay in i18n. */
export function StatusBadge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium', TONE_CLASS[tone], className)}>
      {children}
    </span>
  );
}

export function Spinner({ label, className }: { label?: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-sm text-muted-foreground', className)} role="status">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      {label ?? 'በመጫን ላይ…'}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-6 py-12 text-center', className)}>
      <span className="text-muted-foreground">{icon ?? <Inbox className="h-7 w-7" aria-hidden />}</span>
      <p className="font-display text-base font-semibold">{title}</p>
      {description ? <p className="max-w-md text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/** A failed read or write shown inline instead of only as a toast. */
export function ErrorNote({ message, onRetry, className }: { message: string; onRetry?: () => void; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100', className)} role="alert">
      <span className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        {message}
      </span>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="rounded-md border border-current px-2.5 py-1 text-xs font-medium hover:bg-red-100 dark:hover:bg-red-900">
          እንደገና ይሞክሩ
        </button>
      ) : null}
    </div>
  );
}

/** Dashboard number: value plus the sentence that explains it. */
export function Metric({ label, value, hint, tone = 'neutral', className }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone; className?: string }) {
  return (
    <Card className={cn('p-4', className)}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn('mt-1 font-display text-2xl font-semibold', tone === 'danger' && 'text-destructive', tone === 'warning' && 'text-gold-deep dark:text-gold-soft')}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </Card>
  );
}
