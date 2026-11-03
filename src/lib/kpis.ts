// The numbers the chrome and the dashboard are drawn from.
//
// `dashboard_kpis()` is SECURITY DEFINER and returns the same object for every
// staff role — the counts of work waiting, not the rows themselves. Anything the
// caller may not see is filtered in Postgres, so the sidebar badges and the
// dashboard cards cannot disagree with the screens underneath them.

// Relative `.ts` specifiers so scripts can load this without a bundler.
import { callFn, DbFailure, supabase } from './supabase.ts';
import type { PermissionKey } from './permissions.ts';

export type Kpis = Record<string, unknown>;

export async function fetchKpis(): Promise<Kpis> {
  const raw = await callFn('dashboard_kpis', {});
  return (raw ?? {}) as Kpis;
}

export function kpiNumber(kpis: Kpis, key: string): number {
  const value = kpis[key];
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function kpiText(kpis: Kpis, key: string, fallback = '—'): string {
  const value = kpis[key];
  return value === null || value === undefined ? fallback : String(value);
}

/** Sidebar badges: how much is waiting on this person right now. */
export async function badgeCounts(permissions: readonly PermissionKey[]): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  try {
    const kpis = await fetchKpis();
    counts.approvals = kpiNumber(kpis, 'approvals_pending');
    counts.messages = kpiNumber(kpis, 'unread_messages');
  } catch {
    // A badge is decoration; the screens still read the truth when they open.
  }

  if (permissions.includes('communication.read')) {
    const { count } = await supabase
      .from('outbox_messages')
      .select('id', { count: 'exact', head: true })
      .in('status', ['queued', 'sending', 'failed']);
    counts.outbox = count ?? 0;
  }

  return counts;
}

// ─── time series ─────────────────────────────────────────────────────────────
//
// `dashboard_series(p_months)` (supabase/migrations/20261103002410_dashboard_series.sql)
// returns one row per Gregorian month: the same definitions the KPI cards use,
// bucketed, so a chart line and the card above it can never disagree. Amounts
// arrive as Postgres `numeric` and counts as `integer`, but PostgREST has been
// known to hand numbers over as strings, so every field is coerced here rather
// than at each call site.
//
// The RPC is not in the generated `Database` types yet — `npm run db:types` only
// runs after the migration is pushed — so it is called with the `as never`
// escape and typed by hand below.

/** Allowed chart windows; anything else would re-query a window the UI cannot show. */
export const SERIES_WINDOWS = [3, 6, 12] as const;

export type SeriesWindow = (typeof SERIES_WINDOWS)[number];

export function isSeriesWindow(value: number): value is SeriesWindow {
  return (SERIES_WINDOWS as readonly number[]).includes(value);
}

export type MonthlyPoint = {
  /** 'YYYY-MM' — the stable key of the Gregorian month bucket. */
  period: string;
  /** 'YYYY-MM-DD' — first of the bucket; the screen renders it in the Ethiopian calendar. */
  monthStart: string;
  studentsActive: number;
  income: number;
  expense: number;
  donations: number;
  attendanceRate: number;
  events: number;
  news: number;
};

export type SeriesResult =
  | { state: 'ready'; rows: MonthlyPoint[] }
  /** The RPC is not on the database yet (migration not pushed): not an error. */
  | { state: 'missing' }
  | { state: 'error'; message: string };

function asNumber(value: unknown): number {
  const parsed = typeof value === 'string' ? Number(value) : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asText(value: unknown, fallback = ''): string {
  return value === null || value === undefined ? fallback : String(value);
}

function toMonthlyPoint(row: Record<string, unknown>): MonthlyPoint {
  return {
    period: asText(row.period),
    monthStart: asText(row.month_start),
    studentsActive: asNumber(row.students_active),
    income: asNumber(row.income),
    expense: asNumber(row.expense),
    donations: asNumber(row.donations),
    attendanceRate: asNumber(row.attendance_rate),
    events: asNumber(row.events),
    news: asNumber(row.news),
  };
}

/** PostgREST reports an unknown function as PGRST202 / 404 — the chart's "not yet built" case. */
function isMissingFunction(error: unknown): boolean {
  if (!(error instanceof DbFailure)) return false;
  if (error.code === 'PGRST202' || error.code === 'PGRST301') return true;
  return /could not find the function|does not exist|not find the function/i.test(
    `${error.message} ${error.details ?? ''} ${error.hint ?? ''}`
  );
}

/** Never throws: a dashboard must still render its cards when the series fails. */
export async function fetchSeries(months: SeriesWindow | number = 12): Promise<SeriesResult> {
  const p_months = isSeriesWindow(months) ? months : 12;

  try {
    const raw: unknown = await callFn('dashboard_series' as never, { p_months } as never);
    const rows = Array.isArray(raw) ? raw : [];
    return {
      state: 'ready',
      rows: rows
        .filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null)
        .map(toMonthlyPoint),
    };
  } catch (error) {
    if (isMissingFunction(error)) return { state: 'missing' };
    return {
      state: 'error',
      message: error instanceof Error ? error.message : 'የግራፍ መረጃው መምጣት አልተቻለም።',
    };
  }
}
