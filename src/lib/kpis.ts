// The numbers the chrome and the dashboard are drawn from.
//
// `dashboard_kpis()` is SECURITY DEFINER and returns the same object for every
// staff role — the counts of work waiting, not the rows themselves. Anything the
// caller may not see is filtered in Postgres, so the sidebar badges and the
// dashboard cards cannot disagree with the screens underneath them.

// Relative `.ts` specifiers so scripts can load this without a bundler.
import { callFn, supabase } from './supabase.ts';
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
