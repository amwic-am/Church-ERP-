// Money, and the decisions money waits for.
//
// `FinanceOverviewScreen` is the treasurer's page: every figure comes from
// `finance_summary(p_from, p_to)` or from the approved ledger rows the same RPC
// counts, so the monthly series, the category split, the campaign progress and the
// budget-versus-actual columns are all the same numbers the database reports — never
// a rounded illustration. The two export buttons hand out exactly those rows.
//
// `ApprovalsScreen` is the queue in the other direction: the ledger rows whose next
// state only `decide_transaction` may write, the budget lines waiting on
// `budget.approve`, and whatever `pending_approvals(p_domain)` says is still open.
// Nothing is updated in local state first — after every decision the screen reads
// the database again, so what is on the screen is what Postgres kept.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Banknote,
  Download,
  HandCoins,
  Receipt,
  RefreshCw,
  Scale,
  ShieldCheck,
  Table2,
  TrendingUp,
  Wallet,
} from 'lucide-react';

import { useAuth } from '@/components/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { DateInput, Field, Select, Textarea } from '@/components/ui/form';
import { ConfirmDialog } from '@/components/ui/overlay';
import { Tabs, TabPanel, type TabItem } from '@/components/ui/tabs';
import {
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorNote,
  Metric,
  PageHeading,
  Spinner,
  StatusBadge,
  type Tone,
} from '@/components/ui/surface';
import { ETH_MONTHS, toEthiopian, toGeEz } from '@/lib/ethiopian';
import { br, dateAm, dateTimeAm, num, pct, truncate } from '@/lib/format';
import { exportCsv, exportExcel, type ExportColumn, type ExportSheet } from '@/lib/export';
import { isSupabaseConfigured } from '@/lib/env';
import { PAYMENT_METHOD, TRANSACTION_TYPE, UI, enumLabel } from '@/lib/i18n';
import { friendlyError } from '@/lib/errors';
import { callFn, listRows, supabase, type DbSchema, type Row } from '@/lib/supabase';

// ─── shared helpers ──────────────────────────────────────────────────────────

/** numeric(14,2) arrives as a string from PostgREST; everything downstream is a number. */
function toNum(value: string | number | null | undefined): number {
  const n = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Local `YYYY-MM-DD` — the exact `date` column format, never a UTC-shifted ISO stamp. */
function isoDate(value: Date): string {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isoToday(): string {
  return isoDate(new Date());
}

/** First day of the month `back` months ago, so a "12 ወር" window is whole months. */
function isoMonthStartBack(back: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - back);
  return isoDate(d);
}

const TX_STATE: Record<string, string> = {
  draft: 'ቅድመ ሐሳብ',
  pending_approval: 'የሚጠብቅ',
  approved: 'ጸድቋል',
  rejected: 'ተክዷል',
  void: 'ተሰርዟል',
};

const TX_TONE: Record<string, Tone> = {
  draft: 'neutral',
  pending_approval: 'warning',
  approved: 'success',
  rejected: 'danger',
  void: 'neutral',
};

const BUDGET_STATE: Record<string, string> = {
  draft: 'ቅድመ ሐሳብ',
  submitted: 'የቀረበ',
  approved: 'ጸድቋል',
  rejected: 'ተክዷል',
  closed: 'ተዘግቷል',
};

const APPROVAL_DOMAIN: Record<string, string> = {
  finance: 'ሒሳብና ገንዘብ',
  content: 'ይዘት',
  academic: 'ትምህርት',
  operations: 'አሠራር',
};

const APPROVAL_ACTION: Record<string, string> = {
  publish: 'ማሳወቅ',
  unpublish: 'ከማውቂያ አውጣ',
  expense: 'ወጪ',
  budget: 'በጀት',
  promotion: 'ማሻገር',
  discount: 'ቅናሽ',
  archive: 'ማህደር',
  other: 'ሌላ',
};

/** `transactions.status` — the ladder `decide_transaction` walks. */
function TransactionState({ status }: { status: string }) {
  return <StatusBadge tone={TX_TONE[status] ?? 'neutral'}>{TX_STATE[status] ?? status}</StatusBadge>;
}

// ─── the dependency-free charts ──────────────────────────────────────────────

type BarRow = { key: string; label: string; value: number; tone: 'income' | 'expense'; sub?: string };

const SVG_FILL: Record<BarRow['tone'], string> = { income: 'fill-leaf', expense: 'fill-destructive' };

/**
 * Horizontal bars drawn as one SVG per row — two rects, the second scaled to the
 * largest value in the set. No chart library, and the printed number beside the
 * bar is the same figure the row was measured from.
 */
function BarList({ rows, emptyTitle }: { rows: readonly BarRow[]; emptyTitle: string }) {
  const max = Math.max(0, ...rows.map((r) => r.value));
  if (rows.length === 0 || max <= 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyTitle}</p>;
  }
  return (
    <ul className="space-y-3">
      {rows.map((row) => {
        const width = (row.value / max) * 100;
        return (
          <li key={row.key}>
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="min-w-0 font-medium">{row.label}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {br(row.value)}
                {row.sub ? ` · ${row.sub}` : ''}
              </span>
            </div>
            <svg
              viewBox="0 0 100 7"
              preserveAspectRatio="none"
              className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-muted"
              role="img"
              aria-label={`${row.label}: ${br(row.value)}`}
            >
              <rect x="0" y="0" width={Math.max(width, 0.8)} height="7" rx="3.5" className={SVG_FILL[row.tone]} />
            </svg>
          </li>
        );
      })}
    </ul>
  );
}

type MonthBucket = { key: string; labelAm: string; income: number; expense: number };

/** Paired CSS columns, one month per cell; the height is value ÷ largest value. */
function MonthlyBars({ months }: { months: readonly MonthBucket[] }) {
  const max = Math.max(0, ...months.flatMap((m) => [m.income, m.expense]));
  if (months.length === 0 || max <= 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">በተመረጠው ጊዜ የጸደቀ ንቅናቄ የለም።</p>;
  }
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {months.map((month) => (
        <figure key={month.key} className="min-w-[74px] flex-1">
          <div className="flex h-40 items-end justify-center gap-1.5 rounded-md bg-muted/50 p-2">
            <span
              className="w-1/3 rounded-t bg-leaf"
              style={{ height: `${Math.max(1.5, (month.income / max) * 100)}%` }}
              title={`ገቢ ${br(month.income)}`}
              aria-hidden
            />
            <span
              className="w-1/3 rounded-t bg-destructive"
              style={{ height: `${Math.max(1.5, (month.expense / max) * 100)}%` }}
              title={`ወጪ ${br(month.expense)}`}
              aria-hidden
            />
          </div>
          <figcaption className="mt-1.5 text-center">
            <span className="block text-[11px] leading-tight text-muted-foreground">{month.labelAm}</span>
            <span className="block text-[11px] leading-tight tabular-nums">
              <span className="text-leaf-deep dark:text-leaf">{num(month.income)}</span>
              {' / '}
              <span className="text-destructive">{num(month.expense)}</span>
            </span>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

/** Planned versus spent on one rail, with the planned ceiling marked, so over-spend is visible. */
function BudgetBar({ planned, actual }: { planned: number; actual: number }) {
  const ceiling = Math.max(planned, actual, 1);
  const over = planned > 0 && actual > planned;
  return (
    <div className="relative h-3 w-40 rounded-full bg-muted" role="img" aria-label={`የታቀደ ${br(planned)}፣ የተጨመ ${br(actual)}`}>
      <div className={`h-3 rounded-full ${over ? 'bg-destructive' : 'bg-leaf'}`} style={{ width: `${Math.max(1.5, (actual / ceiling) * 100)}%` }} />
      {planned > 0 ? <div className="absolute top-0 h-3 w-0.5 bg-ink dark:bg-parchment" style={{ left: `${(planned / ceiling) * 100}%` }} /> : null}
    </div>
  );
}

// ─── 1 · finance overview ────────────────────────────────────────────────────

type Summary = {
  income: number;
  expense: number;
  net: number;
  donations: number;
  pendingCount: number;
  byCategory: { name: string; total: number }[];
};

/** `finance_summary` returns one jsonb object; this reads it without inventing defaults. */
function parseSummary(raw: unknown): Summary {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const categories = (obj.by_category ?? {}) as Record<string, unknown>;
  return {
    income: toNum(obj.income as string | number),
    expense: toNum(obj.expense as string | number),
    net: toNum(obj.net as string | number),
    donations: toNum(obj.donations as string | number),
    pendingCount: toNum(obj.pending_count as string | number),
    byCategory: Object.entries(categories)
      .map(([name, total]) => ({ name, total: toNum(total as string | number) }))
      .sort((a, b) => b.total - a.total),
  };
}

const LEDGER_CAP = 3000;

export function FinanceOverviewScreen() {
  const { identity, can } = useAuth();
  const mayRead = can('finance.read');

  const [from, setFrom] = useState(() => isoMonthStartBack(11));
  const [to, setTo] = useState(isoToday);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [ledger, setLedger] = useState<Row<'transactions'>[]>([]);
  const [categories, setCategories] = useState<Row<'finance_categories'>[]>([]);
  const [campaigns, setCampaigns] = useState<Row<'donation_campaigns'>[]>([]);
  const [donations, setDonations] = useState<Row<'donations'>[]>([]);
  const [budgets, setBudgets] = useState<Row<'budgets'>[]>([]);
  const [accounts, setAccounts] = useState<Row<'finance_accounts'>[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name_am: string }[]>([]);
  const [recent, setRecent] = useState<Row<'transactions'>[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!identity || !isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    if (!can('finance.read')) {
      setLoading(false);
      setError(UI.permissionDenied);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const args: { p_from?: string; p_to?: string } = {};
      if (from) args.p_from = from;
      if (to) args.p_to = to;

      let txQuery = supabase
        .from('transactions')
        .select('*')
        .eq('status', 'approved')
        .order('occurred_on', { ascending: false })
        .limit(LEDGER_CAP);
      if (from) txQuery = txQuery.gte('occurred_on', from);
      if (to) txQuery = txQuery.lte('occurred_on', to);

      const [rawSummary, approved, categoryRows, accountRows, recentRows, settingRows] = await Promise.all([
        callFn('finance_summary', args),
        listRows(txQuery),
        listRows(supabase.from('finance_categories').select('*').order('sort_order')),
        listRows(supabase.from('finance_accounts').select('*').order('sort_order')),
        listRows(supabase.from('transactions').select('*').order('created_at', { ascending: false }).limit(12)),
        listRows(supabase.from('finance_settings').select('*')),
      ]);

      setSummary(parseSummary(rawSummary));
      setLedger(approved);
      setCategories(categoryRows);
      setAccounts(accountRows);
      setRecent(recentRows);
      setSettings(Object.fromEntries(settingRows.map((s) => [s.key, String(s.value ?? '')])));

      // Each of these three is its own module's grant; RLS answers empty rather than
      // an error when it is missing, so the screen shows the honest "no permission" line.
      if (can('donations.read')) {
        const [campaignList, donationList] = await Promise.all([
          listRows(supabase.from('donation_campaigns').select('*').order('created_at', { ascending: false }).limit(120)),
          listRows(supabase.from('donations').select('*').in('status', ['paid', 'partially_paid']).limit(2000)),
        ]);
        setCampaigns(campaignList);
        setDonations(donationList);
      } else {
        setCampaigns([]);
        setDonations([]);
      }

      if (can('budget.read')) {
        setBudgets(await listRows(supabase.from('budgets').select('*').order('created_at', { ascending: false }).limit(600)));
      } else {
        setBudgets([]);
      }

      if (can('departments.read')) {
        const rows = await listRows(supabase.from('departments').select('id, name_am').limit(200));
        setDepartments(rows as unknown as { id: string; name_am: string }[]);
      } else {
        setDepartments([]);
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [identity, can, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const categoryName = useMemo(() => new Map(categories.map((c) => [c.id, c.name_am])), [categories]);
  const categoryKind = useMemo(() => new Map(categories.map((c) => [c.name_am, c.kind])), [categories]);
  const accountName = useMemo(() => new Map(accounts.map((a) => [a.id, a.name_am])), [accounts]);
  const departmentName = useMemo(() => new Map(departments.map((d) => [d.id, d.name_am])), [departments]);

  /** Ethiopian-calendar month buckets of the approved ledger — the RPC has no series. */
  const months = useMemo<MonthBucket[]>(() => {
    const buckets = new Map<string, MonthBucket>();
    for (const row of ledger) {
      const eth = toEthiopian(row.occurred_on);
      const key = `${eth.year}-${String(eth.month).padStart(2, '0')}`;
      const bucket = buckets.get(key) ?? { key, labelAm: `${ETH_MONTHS[eth.month - 1]} ${toGeEz(eth.year)}`, income: 0, expense: 0 };
      if (row.type === 'income') bucket.income += toNum(row.amount);
      else if (row.type === 'expense') bucket.expense += toNum(row.amount);
      buckets.set(key, bucket);
    }
    return [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key)).slice(-13);
  }, [ledger]);

  /** Per-category income and expense, measured from the rows `finance_summary` counts. */
  const categoryBars = useMemo<BarRow[]>(() => {
    const agg = new Map<string, { income: number; expense: number }>();
    for (const row of ledger) {
      if (!row.category_id) continue;
      const name = categoryName.get(row.category_id) ?? 'ያልተመደበ';
      const cell = agg.get(name) ?? { income: 0, expense: 0 };
      if (row.type === 'income') cell.income += toNum(row.amount);
      else if (row.type === 'expense') cell.expense += toNum(row.amount);
      agg.set(name, cell);
    }
    const incomeRows: BarRow[] = [];
    const expenseRows: BarRow[] = [];
    for (const [name, cell] of agg) {
      if (cell.income > 0) incomeRows.push({ key: `i-${name}`, label: name, value: cell.income, tone: 'income' });
      if (cell.expense > 0) expenseRows.push({ key: `e-${name}`, label: name, value: cell.expense, tone: 'expense' });
    }
    return [...incomeRows.sort((a, b) => b.value - a.value), ...expenseRows.sort((a, b) => b.value - a.value)];
  }, [ledger, categoryName]);

  const rpcCategoryBars = useMemo<BarRow[]>(
    () =>
      (summary?.byCategory ?? []).map((c) => ({
        key: `rpc-${c.name}`,
        label: c.name,
        value: c.total,
        tone: categoryKind.get(c.name) === 'expense' ? 'expense' : 'income',
        sub: categoryKind.get(c.name) === 'expense' ? 'ወጪ ምድብ' : 'ገቢ ምድብ',
      })),
    [summary, categoryKind]
  );

  const incomeByCategory = categoryBars.filter((b) => b.tone === 'income');
  const expenseByCategory = categoryBars.filter((b) => b.tone === 'expense');

  /** Does the local aggregation still add up to what the RPC reported? */
  const reconciles = useMemo(() => {
    if (!summary) return null;
    const localIncome = ledger.filter((t) => t.type === 'income').reduce((s, t) => s + toNum(t.amount), 0);
    const localExpense = ledger.filter((t) => t.type === 'expense').reduce((s, t) => s + toNum(t.amount), 0);
    return Math.abs(localIncome - summary.income) < 0.01 && Math.abs(localExpense - summary.expense) < 0.01;
  }, [summary, ledger]);

  const campaignProgress = useMemo(() => {
    const raised = new Map<string, { amount: number; donors: number }>();
    for (const d of donations) {
      if (!d.campaign_id) continue;
      const cell = raised.get(d.campaign_id) ?? { amount: 0, donors: 0 };
      cell.amount += toNum(d.amount);
      cell.donors += 1;
      raised.set(d.campaign_id, cell);
    }
    return campaigns
      .map((c) => ({
        row: c,
        goal: toNum(c.goal_amount),
        raised: raised.get(c.id)?.amount ?? 0,
        donors: raised.get(c.id)?.donors ?? 0,
      }))
      .sort((a, b) => b.raised - a.raised)
      .slice(0, 8);
  }, [campaigns, donations]);

  /** Budget line → its own key (ምድብ → ሂሳብ → ዘርፍ) matched against the approved ledger. */
  const budgetLines = useMemo(() => {
    const spend = (line: Row<'budgets'>) =>
      ledger.reduce((sum, t) => {
        if (t.type !== 'expense') return sum;
        if (line.category_id) return t.category_id === line.category_id ? sum + toNum(t.amount) : sum;
        if (line.account_id) return t.account_id === line.account_id ? sum + toNum(t.amount) : sum;
        if (line.department_id) return t.department_id === line.department_id ? sum + toNum(t.amount) : sum;
        return sum;
      }, 0);

    return budgets
      .filter((b) => b.status === 'approved' || b.status === 'submitted' || b.status === 'closed')
      .map((b) => {
        const planned = toNum(b.approved_amount) || toNum(b.planned_amount);
        const labelAm = b.category_id
          ? (categoryName.get(b.category_id) ?? 'ምድብ')
          : b.account_id
            ? (accountName.get(b.account_id) ?? 'ሂሳብ')
            : b.department_id
              ? (departmentName.get(b.department_id) ?? 'ዘርፍ')
              : 'አጠቃላይ';
        return { row: b, labelAm, planned, actual: spend(b), keyless: !b.category_id && !b.account_id && !b.department_id };
      })
      .sort((a, b) => b.planned - a.planned)
      .slice(0, 40);
  }, [budgets, ledger, categoryName, accountName, departmentName]);

  const moneySheets = useMemo<ExportSheet[]>(() => {
    const summaryRows: Record<string, unknown>[] = [
      { label: 'ገቢ (የጸደቀ)', value: summary?.income ?? 0 },
      { label: 'ወጪ (የጸደቀ)', value: summary?.expense ?? 0 },
      { label: 'ንጹህ', value: summary?.net ?? 0 },
      { label: 'ልገሳ (ተከፍሏል/ከፊል)', value: summary?.donations ?? 0 },
      { label: 'ማረጋገጫ የጠባቀ', value: summary?.pendingCount ?? 0 },
    ];
    const monthRows: Record<string, unknown>[] = months.map((m) => ({ label: m.labelAm, income: m.income, expense: m.expense, net: m.income - m.expense }));
    const categoryRows: Record<string, unknown>[] = (summary?.byCategory ?? []).map((c) => ({ label: c.name, total: c.total, kind: categoryKind.get(c.name) ?? '' }));
    const budgetRows: Record<string, unknown>[] = budgetLines.map((l) => ({
      label: `${l.row.period_label_am} · ${l.labelAm}`,
      planned: l.planned,
      approved: toNum(l.row.approved_amount),
      actual: l.actual,
      remaining: l.planned - l.actual,
      status: BUDGET_STATE[l.row.status] ?? l.row.status,
    }));
    const campaignRows: Record<string, unknown>[] = campaignProgress.map((c) => ({ label: c.row.name_am, goal: c.goal, raised: c.raised, donors: c.donors }));
    const ledgerRows: Record<string, unknown>[] = ledger.map((t) => ({
      ref_no: t.ref_no,
      occurred_on: t.occurred_on,
      type: enumLabel(TRANSACTION_TYPE, t.type),
      category: t.category_id ? (categoryName.get(t.category_id) ?? '') : '',
      account: t.account_id ? (accountName.get(t.account_id) ?? '') : '',
      description_am: t.description_am,
      method: enumLabel(PAYMENT_METHOD, t.method),
      amount: toNum(t.amount),
      currency: t.currency,
    }));

    const amountCols: ExportColumn[] = [
      { header: 'መጠነ-ሐሳብ', key: 'label' },
      { header: 'ብር', key: 'value' },
    ];
    const monthCols: ExportColumn[] = [
      { header: 'ወር (ዐ.ዐ.ዓ)', key: 'label' },
      { header: 'ገቢ', key: 'income' },
      { header: 'ወጪ', key: 'expense' },
      { header: 'ንጹህ', key: 'net' },
    ];

    return [
      { name: 'ማጠቃለያ', columns: amountCols, rows: summaryRows },
      { name: 'ወር በወር', columns: monthCols, rows: monthRows },
      { name: 'በምድብ', columns: [{ header: 'ምድብ', key: 'label' }, { header: 'ጠቅላላ', key: 'total' }, { header: 'ዓይነት', key: 'kind' }], rows: categoryRows },
      {
        name: 'በጀትና ተጨባጭ',
        columns: [
          { header: 'መስመር', key: 'label' },
          { header: 'የታቀደ', key: 'planned' },
          { header: 'የጸደቀ', key: 'approved' },
          { header: 'የተጨመ', key: 'actual' },
          { header: 'የቀረ', key: 'remaining' },
          { header: 'ሁኔታ', key: 'status' },
        ],
        rows: budgetRows,
      },
      {
        name: 'የልገሳ ዘመቻ',
        columns: [
          { header: 'ዘመቻ', key: 'label' },
          { header: 'ግብ', key: 'goal' },
          { header: 'የተሰበሰበ', key: 'raised' },
          { header: 'የገልጹ', key: 'donors' },
        ],
        rows: campaignRows,
      },
      {
        name: 'የጸደቁ ንቅናቄዎች',
        columns: [
          { header: 'ማጣቀሻ', key: 'ref_no' },
          { header: 'ቀን (ዓ.ም)', key: 'occurred_on' },
          { header: 'ዓይነት', key: 'type' },
          { header: 'ምድብ', key: 'category' },
          { header: 'ሂሳብ', key: 'account' },
          { header: 'ማብራሪያ', key: 'description_am' },
          { header: 'የክፍያ መንገድ', key: 'method' },
          { header: 'መጠን', key: 'amount' },
          { header: 'ብር ዓይነት', key: 'currency' },
        ],
        rows: ledgerRows,
      },
    ];
  }, [summary, months, budgetLines, campaignProgress, ledger, categoryKind, categoryName, accountName]);

  function exportWorkbook() {
    exportExcel(moneySheets, `finance-overview-${from}-${to}`);
    toast.success('ወደ ኤክሴል ተላክቷል');
  }

  function exportMonthsCsv() {
    exportCsv(
      [
        { header: 'ወር (ዐ.ዐ.ዓ)', key: 'labelAm' },
        { header: 'ገቢ', key: 'income' },
        { header: 'ወጪ', key: 'expense' },
        { header: 'ንጹህ', key: 'net' },
      ],
      months.map((m) => ({ labelAm: m.labelAm, income: m.income, expense: m.expense, net: m.income - m.expense })),
      `finance-monthly-${from}-${to}`
    );
    toast.success('CSV ተዘጋጅቷል');
  }

  const recentColumns = useMemo<Column<Row<'transactions'>>[]>(
    () => [
      { key: 'ref_no', header: 'ማጣቀሻ', cell: (r) => <span className="whitespace-nowrap text-xs">{r.ref_no}</span> },
      { key: 'occurred_on', header: 'ቀን', cell: (r) => dateAm(r.occurred_on), value: (r) => r.occurred_on, sortable: true },
      { key: 'type', header: 'ዓይነት', cell: (r) => enumLabel(TRANSACTION_TYPE, r.type) },
      {
        key: 'description_am',
        header: 'ማብራሪያ',
        cell: (r) => (
          <span className="block max-w-[22rem] truncate" title={r.description_am}>
            {truncate(r.description_am, 90)}
          </span>
        ),
      },
      { key: 'category_id', header: 'ምድብ', hideBelow: 'md', cell: (r) => (r.category_id ? (categoryName.get(r.category_id) ?? '—') : '—') },
      { key: 'amount', header: 'መጠን', align: 'end', sortable: true, value: (r) => toNum(r.amount), cell: (r) => <span className="tabular-nums">{br(r.amount)}</span> },
      { key: 'status', header: 'ሁኔታ', cell: (r) => <TransactionState status={r.status} /> },
    ],
    [categoryName]
  );

  if (!isSupabaseConfigured) return <ErrorNote message="የፋይናንስ መረጃ ለማቅረጥ መረጃዎቹ ገና አልተገናኙም።" />;

  const autoLimit = settings.auto_approve_limit ? toNum(settings.auto_approve_limit) : 0;
  const currency = settings.currency || 'ETB';

  return (
    <div className="space-y-5">
      <PageHeading
        title="ሒሳብና ገንዘብ — አጠቃላይ እይታ"
        description="`finance_summary` የሚመዝግባቸው የጸደቁ ንቅናቄዎች ብቻ ናቸው፤ ያልጸደቁት በማጽደቅ ገጹ ላይ ይታያሉ።"
        actions={
          <>
            {can('reports.export', 'finance.export') ? (
              <>
                <Button variant="outline" size="sm" onClick={exportWorkbook} disabled={loading || ledger.length === 0} icon={<Download className="h-4 w-4" aria-hidden />}>
                  {UI.exportExcel}
                </Button>
                <Button variant="outline" size="sm" onClick={exportMonthsCsv} disabled={months.length === 0} icon={<Table2 className="h-4 w-4" aria-hidden />}>
                  CSV (ወር በወር)
                </Button>
              </>
            ) : null}
            <Button variant="ghost" size="sm" onClick={() => void load()} icon={<RefreshCw className="h-4 w-4" aria-hidden />}>
              እንደገና
            </Button>
            {can('finance.approve') ? (
              <Button asChild size="sm" variant="gold">
                <Link to="/erp/system/approvals">ማረጋገጫ የጠባቀ</Link>
              </Button>
            ) : null}
          </>
        }
      />

      <Card>
        <CardBody className="flex flex-wrap items-end gap-4">
          <Field label="ከቀን" htmlFor="fin-from" className="w-44">
            <DateInput id="fin-from" value={from} onValueChange={setFrom} />
          </Field>
          <Field label="እስከቀን" htmlFor="fin-to" className="w-44">
            <DateInput id="fin-to" value={to} onValueChange={setTo} />
          </Field>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFrom(isoMonthStartBack(11));
              setTo(isoToday());
            }}
          >
            ባሉ 12 ወራት
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { setFrom(isoToday()); setTo(isoToday()); }}>
            {UI.today}
          </Button>
          <div className="ms-auto flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <StatusBadge tone="neutral">ብር ዓይነት፦ {currency}</StatusBadge>
            {autoLimit > 0 ? <StatusBadge tone="warning">ራስ-ሰር የሚጸደቅ ወጪ ከፍተኛ {br(autoLimit)}</StatusBadge> : null}
            {ledger.length >= LEDGER_CAP ? <StatusBadge tone="danger">ዝርዝሩ በ{num(LEDGER_CAP)} ረድፍ ተገድቧል</StatusBadge> : null}
          </div>
        </CardBody>
      </Card>

      {!mayRead ? <ErrorNote message={UI.permissionDenied} /> : null}
      {error ? <ErrorNote message={error} onRetry={() => void load()} /> : null}
      {loading ? <Spinner label="ሒሳብ በመሠራት ላይ…" /> : null}

      {summary && !loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Metric label="ጠቅላላ ገቢ" value={br(summary.income)} hint="የጸደቁ የገቢ ንቅናቄዎች" tone="success" />
          <Metric label="ጠቅላላ ወጪ" value={br(summary.expense)} hint="የጸደቁ የወጪ ንቅናቄዎች" tone="danger" />
          <Metric label="ንጹህ ቀሪ" value={br(summary.net)} hint={summary.net >= 0 ? 'ከገቢ በላይ አልተወጣም' : 'ወጪ ከገቢ በላይ ሆኗል'} tone={summary.net >= 0 ? 'gold' : 'danger'} />
          <Metric label="ልገሳ" value={br(summary.donations)} hint="ተከፍሏል / ከፊል ተከፍሏል" />
          <Metric label={UI.pendingApprovals} value={num(summary.pendingCount)} hint="ንቅናቄ ማረጋገጫ ይጠብቃል" tone={summary.pendingCount > 0 ? 'warning' : 'neutral'} />
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-leaf" aria-hidden />
              በወር ሠላሴ ገቢና ወጪ
            </CardTitle>
            <CardDescription>
              ከተመረጠው ጊዜ ውስጥ ካሉ የጸደቁ ንቅናቄዎች ተሰብስቦ፤ {reconciles === null ? 'ከሰርቪሱ ጋር ለማወዳደር በመጠባበቅ ላይ።' : reconciles ? 'ድምሩ ከ `finance_summary` ውጤት ጋር ተመሳሳይ ነው።' : 'ልዩነት ካለ ንቅናቄው በ3000 ረድፍ ስለተገደበ ነው።'}
            </CardDescription>
          </CardHeader>
          <CardBody>
            <MonthlyBars months={months} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scale className="h-4 w-4 text-gold-deep" aria-hidden />
              ገቢ ከወጪ — በምድብ
            </CardTitle>
            <CardDescription>ለየምድቡ የተሰበሰበ፤ ከላይ ገቢዎች፣ ከታች ወጪዎች።</CardDescription>
          </CardHeader>
          <CardBody className="space-y-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">ገቢ</p>
              <BarList rows={incomeByCategory} emptyTitle="የጸደቀ የገቢ ምድብ የለም።" />
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">ወጪ</p>
              <BarList rows={expenseByCategory} emptyTitle="የጸደቀ የወጪ ምድብ የለም።" />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-leaf" aria-hidden />
              በምድብ መሠረት (ከ `finance_summary`)
            </CardTitle>
            <CardDescription>ሰርቪሱ በራሱ ያወጣው `by_category` — ገቢና ወጪ ያልተለዩ።</CardDescription>
          </CardHeader>
          <CardBody>
            <BarList rows={rpcCategoryBars} emptyTitle="በተመረጠው ጊዜ ምድብ ያለው የጸደቀ ንቅናቄ የለም።" />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HandCoins className="h-4 w-4 text-gold-deep" aria-hidden />
              የልገሳ ዘመቻ ግስጋሴ
            </CardTitle>
            <CardDescription>“ተከፍሏል”ና “ከፊል ተከፍሏል” የተባሉ ልገሳዎች ብቻ ተመዝግበዋል።</CardDescription>
          </CardHeader>
          <CardBody>
            {!can('donations.read') ? (
              <p className="text-sm text-muted-foreground">የልገሳ መረጃ ለማየት መብት የላይኝም።</p>
            ) : campaignProgress.length === 0 ? (
              <EmptyState title="የልገሳ ዘመቻ የለም" description="በድረ ገጹ ለሚታዩ ዘመቻዎች በ “የለጋሽ ዘመቻዎች” ገጽ ይዘጋጁ።" />
            ) : (
              <ul className="space-y-4">
                {campaignProgress.map((c) => {
                  const ratio = c.goal > 0 ? Math.min(100, (c.raised / c.goal) * 100) : 0;
                  return (
                    <li key={c.row.id} className="space-y-1.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                        <span className="font-medium">
                          {c.row.name_am}
                          {c.row.is_active ? <span className="ms-2 text-xs text-muted-foreground">(ክፍት)</span> : null}
                        </span>
                        <span className="tabular-nums text-muted-foreground">
                          {br(c.raised)} {c.goal > 0 ? `/ ${br(c.goal)}` : '(ግብ የለም)'}
                        </span>
                      </div>
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={`${c.row.name_am}: ${pct(ratio)}`}>
                        <div className="h-full bg-gold" style={{ width: `${c.goal > 0 ? Math.max(1, ratio) : c.raised > 0 ? 100 : 0}%` }} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {c.goal > 0 ? `${pct(ratio)} ደርሷል · ` : ''}
                        {num(c.donors)} ገልጹ · እስከ {c.row.ends_on ? dateAm(c.row.ends_on) : 'ያለ ቀን ገደብ'}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-leaf" aria-hidden />
            የበጀት መስመር ከተጨባጭ ጋር
          </CardTitle>
          <CardDescription>
            ተጨባጭ = የጸደቁ የወጪ ንቅናቄዎች በበጀቱ መስመር ምድብ (በሌለው ሂሳብ፣ በሌለውም ዘርፍ) ውስጥ ያለፉት። {budgetLines.some((l) => l.keyless) ? 'መለያ የሌላቸው መስመሮች ዜሮ ያሳያሉ።' : ''}
          </CardDescription>
        </CardHeader>
        <CardBody>
          {!can('budget.read') ? (
            <p className="text-sm text-muted-foreground">በጀት ለማየት መብት የላይኝም።</p>
          ) : (
            <DataTable
              rows={budgetLines}
              columns={[
                { key: 'period', header: 'የበጀት ዓመት', cell: (l) => l.row.period_label_am },
                { key: 'label', header: 'መስመር', cell: (l) => l.labelAm },
                { key: 'planned', header: 'የታቀደ', align: 'end', sortable: true, value: (l) => l.planned, cell: (l) => <span className="tabular-nums">{br(l.planned)}</span> },
                { key: 'approved', header: 'የጸደቀ', align: 'end', hideBelow: 'md', cell: (l) => <span className="tabular-nums">{l.row.approved_amount == null ? '—' : br(l.row.approved_amount)}</span> },
                { key: 'actual', header: 'የተጨመ', align: 'end', sortable: true, value: (l) => l.actual, cell: (l) => <span className="tabular-nums">{br(l.actual)}</span> },
                { key: 'remaining', header: 'የቀረ', align: 'end', hideBelow: 'sm', cell: (l) => <span className={`tabular-nums ${l.planned - l.actual < 0 ? 'text-destructive' : ''}`}>{br(l.planned - l.actual)}</span> },
                { key: 'used', header: 'የተጠቀመ', cell: (l) => <BudgetBar planned={l.planned} actual={l.actual} /> },
                { key: 'status', header: 'ሁኔታ', cell: (l) => <StatusBadge tone={l.row.status === 'approved' ? 'success' : l.row.status === 'submitted' ? 'warning' : 'neutral'}>{BUDGET_STATE[l.row.status] ?? l.row.status}</StatusBadge> },
              ]}
              rowKey={(l) => l.row.id}
              loading={loading}
              pageSize={10}
              emptyTitle="የበጀት መስመር የለም"
              emptyDescription="በ “በጀት” ገጽ ይዘጋጀሉ።"
              caption="የበጀት መስመር ከተጨባጭ ጋር"
            />
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Banknote className="h-4 w-4 text-gold-deep" aria-hidden />
            በቅርቡ የተመዘገቡ ንቅናቄዎች
          </CardTitle>
          <CardDescription>ሁሉም ሁኔታዎች (ያልጸደቁም ጨምሮ) — በመዝገብ መሠረት 12 የመጨረሻዎች።</CardDescription>
          <Button asChild variant="outline" size="sm">
            <Link to="/erp/finance/transactions">ሙሉ መዝገብ</Link>
          </Button>
        </CardHeader>
        <CardBody>
          <DataTable
            rows={recent}
            columns={recentColumns}
            rowKey={(r) => r.id}
            loading={loading}
            pageSize={12}
            emptyTitle="እስካሁን የተመዘገበ ንቅናቄ የለም"
            emptyDescription={can('finance.write') ? '“ጨምር ልገሳ/ንቅናቄ” ከሙሉ መዝገቡ ይከፈታል።' : undefined}
            caption="በቅርቡ የተመዘገቡ ንቅናቄዎች"
          />
        </CardBody>
      </Card>
    </div>
  );
}

// ─── 2 · the approval queue ──────────────────────────────────────────────────

type ApprovalRow = DbSchema['Functions']['pending_approvals']['Returns'][number];

type Pending = {
  kind: 'ledger' | 'budget' | 'queue';
  id: string;
  label: string;
  action: 'approve' | 'reject' | 'void';
  question: string;
};

export function ApprovalsScreen() {
  const { identity, can } = useAuth();
  const mayOpen = can('finance.approve', 'budget.approve', 'results.release');
  const mayLedger = can('finance.approve');
  const mayBudget = can('budget.approve');

  const [ledger, setLedger] = useState<Row<'transactions'>[]>([]);
  const [budgetsOpen, setBudgetsOpen] = useState<Row<'budgets'>[]>([]);
  const [queue, setQueue] = useState<ApprovalRow[]>([]);
  const [domain, setDomain] = useState('');
  const [tab, setTab] = useState('ledger');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    if (!identity || !isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    if (!can('finance.approve', 'budget.approve', 'results.release')) {
      setLoading(false);
      setError(UI.permissionDenied);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // `pending_approvals(p_domain)` — an empty selector asks for every domain.
      const args: { p_domain?: string } = {};
      if (domain) args.p_domain = domain;

      const [queueRows, pendingTx, submittedBudgets] = await Promise.all([
        callFn('pending_approvals', args),
        can('finance.read')
          ? listRows(supabase.from('transactions').select('*').eq('status', 'pending_approval').order('created_at', { ascending: false }).limit(200))
          : Promise.resolve([] as Row<'transactions'>[]),
        can('budget.read')
          ? listRows(supabase.from('budgets').select('*').eq('status', 'submitted').order('created_at', { ascending: false }).limit(200))
          : Promise.resolve([] as Row<'budgets'>[]),
      ]);

      setQueue(queueRows);
      setLedger(pendingTx);
      setBudgetsOpen(submittedBudgets);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [identity, can, domain]);

  useEffect(() => {
    void load();
  }, [load]);

  /** A ledger row is only still waiting if the transaction itself is pending. */
  const stillPending = useMemo(() => new Set(ledger.map((t) => t.id)), [ledger]);

  const mine = useMemo(
    () =>
      queue.filter((row) => {
        const roles = identity?.roles ?? [];
        return !row.assigned_role || roles.includes(row.assigned_role as never);
      }),
    [queue, identity]
  );

  const ledgerDecidable = mine.filter((r) => r.domain === 'finance' && r.entity_table === 'transactions');

  const tabs = useMemo<TabItem[]>(
    () => [
      { value: 'ledger', label: 'የመዝገብ ማረጋገጫ', count: ledger.length },
      { value: 'budget', label: 'የበጀት ማረጋገጫ', count: budgetsOpen.length },
      { value: 'queue', label: UI.pendingApprovals, count: mine.length },
    ],
    [ledger.length, budgetsOpen.length, mine.length]
  );

  function ask(item: Pending) {
    setNote('');
    setPending(item);
  }

  async function decide() {
    if (!pending) return;
    const trimmed = note.trim();
    if (pending.action !== 'approve' && trimmed.length < 3) {
      toast.error('የውድቅ ምክንያት መጻፍ ያስፈልጋል (ቢያንስ 3 ፊደል)።');
      return;
    }

    setBusy(true);
    try {
      if (pending.kind === 'ledger' || pending.kind === 'queue') {
        // The only way `approved`/`rejected`/`void` may be written.
        const result = (await callFn('decide_transaction', {
          p_id: pending.id,
          p_decision: pending.action,
          p_note: trimmed || undefined,
        })) as unknown as Record<string, unknown>;

        const status = String(result.status ?? '');
        if (status === 'requires_approval') {
          toast.warning(String(result.message_am ?? 'በማረጋገጫ ሰሌዳ ላይ ተቀምጧል።'));
        } else {
          toast.success(`ንቅናቄው ${TX_STATE[status] ?? status} ሆኗል።`);
        }
      } else {
        const row = budgetsOpen.find((b) => b.id === pending.id);
        if (!row) throw new Error('የበጀት መስመሩ አልተገኘም።እንደገና ይጫኑ።');
        const approve = pending.action === 'approve';
        // The decision is a function, not an update: an approver has no write on
        // the budget line itself, only on its approval columns.
        const result = (await callFn('decide_budget', {
          p_id: row.id,
          p_decision: approve ? 'approve' : 'reject',
          p_note: trimmed || undefined,
        })) as unknown as Record<string, unknown>;
        if (result.status !== 'approved' && result.status !== 'rejected') {
          throw new Error('የበጀት ውሳኔው አልተመዘገበም።እንደገና ይሞክሩ።');
        }
        toast.success(approve ? 'በጀቱ ጸድቋል።' : 'በጀቱ ውድቅ ሆኗል።');
      }

      setPending(null);
      setNote('');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : UI.serverError);
    } finally {
      setBusy(false);
    }
  }

  const ledgerColumns = useMemo<Column<Row<'transactions'>>[]>(
    () => [
      { key: 'ref_no', header: 'ማጣቀሻ', cell: (r) => <span className="whitespace-nowrap text-xs">{r.ref_no}</span> },
      { key: 'occurred_on', header: 'ቀን', cell: (r) => dateAm(r.occurred_on), value: (r) => r.occurred_on, sortable: true },
      { key: 'type', header: 'ዓይነት', cell: (r) => enumLabel(TRANSACTION_TYPE, r.type) },
      {
        key: 'description_am',
        header: 'ማብራሪያ',
        cell: (r) => (
          <span className="block max-w-[20rem] truncate" title={r.description_am}>
            {truncate(r.description_am, 80)}
          </span>
        ),
      },
      { key: 'method', header: 'መንገድ', hideBelow: 'lg', cell: (r) => enumLabel(PAYMENT_METHOD, r.method) },
      { key: 'amount', header: 'መጠን', align: 'end', sortable: true, value: (r) => toNum(r.amount), cell: (r) => <span className="tabular-nums font-medium">{br(r.amount)}</span> },
      { key: 'created_at', header: 'የቀረበበት', hideBelow: 'md', cell: (r) => dateTimeAm(r.created_at), value: (r) => r.created_at, sortable: true },
      {
        key: '__decision',
        header: UI.actions,
        sortable: false,
        cell: (r) =>
          mayLedger ? (
            <div className="flex flex-wrap gap-1">
              <Button size="sm" onClick={() => ask({ kind: 'ledger', id: r.id, label: r.ref_no, action: 'approve', question: `“${truncate(r.description_am, 60)}” በ${br(r.amount)} ይጸድቃል? ከፈቀደው ከፍተኛ ከሆነ በሰሌዳው ላይ ይቀመጣል።` })}>
                {UI.approve}
              </Button>
              <Button size="sm" variant="destructive" onClick={() => ask({ kind: 'ledger', id: r.id, label: r.ref_no, action: 'reject', question: 'ለምን እንዳልጸደቀ ይጻፉ፤ ምክንያቱ በንቅናቄው ላይ ይመዘገባል።' })}>
                {UI.reject}
              </Button>
              <Button size="sm" variant="outline" onClick={() => ask({ kind: 'ledger', id: r.id, label: r.ref_no, action: 'void', question: 'የተሰረዘ ምልክት ይቀመጥበታል? ዝርዝሩ አይጠፋም።' })}>
                ተሰርዟል አድርግ
              </Button>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">{UI.permissionDenied}</span>
          ),
      },
    ],
    [mayLedger]
  );

  const budgetColumns = useMemo<Column<Row<'budgets'>>[]>(
    () => [
      { key: 'period_label_am', header: 'የበጀት ዓመት', cell: (r) => r.period_label_am },
      {
        key: 'line',
        header: 'መስመር',
        cell: (r) => (r.category_id ?? r.account_id ?? r.department_id ?? 'አጠቃላይ'),
        hideBelow: 'md',
      },
      { key: 'planned_amount', header: 'የታቀደ', align: 'end', sortable: true, value: (r) => toNum(r.planned_amount), cell: (r) => <span className="tabular-nums">{br(r.planned_amount)}</span> },
      { key: 'notes', header: 'ማስታወሻ', hideBelow: 'lg', cell: (r) => (r.notes ? truncate(r.notes, 60) : '—') },
      { key: 'created_at', header: 'የቀረበበት', hideBelow: 'md', cell: (r) => dateTimeAm(r.created_at), value: (r) => r.created_at, sortable: true },
      {
        key: '__decision',
        header: UI.actions,
        sortable: false,
        cell: (r) =>
          mayBudget ? (
            <div className="flex flex-wrap gap-1">
              <Button size="sm" onClick={() => ask({ kind: 'budget', id: r.id, label: `${r.period_label_am} · ${br(r.planned_amount)}`, action: 'approve', question: 'የተቀመጠው መጠን እንደ የጸደቀ መጠን ይመዘገባል።እርግጠኛ ነዎት?' })}>
                {UI.approve}
              </Button>
              <Button size="sm" variant="destructive" onClick={() => ask({ kind: 'budget', id: r.id, label: `${r.period_label_am} · ${br(r.planned_amount)}`, action: 'reject', question: 'ለምን እንደተከደነ ይጻፉ፤ በማስታወሻው ላይ ይታከላል።' })}>
                {UI.reject}
              </Button>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">“በጀት ማጽደቅ” መብት ያስፈልጋል።</span>
          ),
      },
    ],
    [mayBudget]
  );

  const queueColumns = useMemo<Column<ApprovalRow>[]>(
    () => [
      { key: 'domain', header: 'ዘርፍ', cell: (r) => <StatusBadge tone={r.domain === 'finance' ? 'gold' : 'info'}>{APPROVAL_DOMAIN[r.domain] ?? r.domain}</StatusBadge> },
      { key: 'entity_label', header: 'ሐደሽ', cell: (r) => (r.entity_label ? truncate(r.entity_label, 70) : r.entity_id) },
      { key: 'action', header: 'ተግባር', cell: (r) => APPROVAL_ACTION[r.action] ?? r.action, hideBelow: 'sm' },
      { key: 'amount', header: 'መጠን', align: 'end', sortable: true, value: (r) => toNum(r.amount), cell: (r) => (r.amount == null ? '—' : <span className="tabular-nums">{br(r.amount)}</span>) },
      { key: 'reason', header: 'ምክንያት', hideBelow: 'md', cell: (r) => (r.reason ? truncate(r.reason, 60) : '—') },
      { key: 'submitter_name', header: 'የቀረበው', hideBelow: 'lg', cell: (r) => r.submitter_name ?? '—' },
      { key: 'submitted_at', header: 'የቀረበበት', hideBelow: 'md', value: (r) => r.submitted_at, sortable: true, cell: (r) => dateTimeAm(r.submitted_at) },
      {
        key: '__decision',
        header: UI.actions,
        sortable: false,
        cell: (r) => {
          const closable = r.domain === 'finance' && r.entity_table === 'transactions';
          if (!closable) {
            return <span className="text-xs text-muted-foreground">በዚህ ገጽ አይዘጋም — በባለቤት ገጹ ይወሰናል።</span>;
          }
          if (!stillPending.has(r.entity_id)) {
            return <StatusBadge tone="neutral">ንቅናቄው ተወስኗል · ሰሌዳው ገና ክፍት</StatusBadge>;
          }
          return mayLedger ? (
            <div className="flex flex-wrap gap-1">
              <Button size="sm" onClick={() => ask({ kind: 'queue', id: r.entity_id, label: r.entity_label ?? r.entity_id, action: 'approve', question: 'ይህንን ንቅናቄ ማረጋገጫ ይፈቅዱ? በመዝገቡ ላይ “ጸድቋል” ይባላል።' })}>
                {UI.approve}
              </Button>
              <Button size="sm" variant="destructive" onClick={() => ask({ kind: 'queue', id: r.entity_id, label: r.entity_label ?? r.entity_id, action: 'reject', question: 'ምክንያቱን ይጻፉ፤ ንቅናቄው “ተክዷል” ይሆናል።' })}>
                {UI.reject}
              </Button>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">{UI.permissionDenied}</span>
          );
        },
      },
    ],
    [mayLedger, stillPending]
  );

  if (!isSupabaseConfigured) return <ErrorNote message="የማጽደቅ ሰሌዳ ለማቅረጥ መረጃዎቹ ገና አልተገናኙም።" />;

  return (
    <div className="space-y-5">
      <PageHeading
        title={UI.pendingApprovals}
        description="የመዝገብና የበጀት ሐደሾች እዚህ ይዘገያሉ።ውሳኔዎች በ `decide_transaction` በሚባል ደህንነት-ተጠባቂ አገልግሎት ብቻ ይሰጣሉ።"
        actions={
          <>
            <div className="w-40">
              <Select
                id="approval-domain"
                aria-label="ዘርፍ አጣራ"
                value={domain}
                placeholder={UI.all}
                options={[
                  { value: 'finance', label: APPROVAL_DOMAIN.finance },
                  { value: 'content', label: APPROVAL_DOMAIN.content },
                  { value: 'academic', label: APPROVAL_DOMAIN.academic },
                  { value: 'operations', label: APPROVAL_DOMAIN.operations },
                ]}
                onChange={(e) => setDomain(e.target.value)}
              />
            </div>
            <Button variant="outline" size="sm" onClick={exportQueue} disabled={queue.length === 0} icon={<Download className="h-4 w-4" aria-hidden />}>
              {UI.exportExcel}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void load()} loading={loading} icon={<RefreshCw className="h-4 w-4" aria-hidden />}>
              እንደገና
            </Button>
          </>
        }
      />

      {!mayOpen ? <ErrorNote message={UI.permissionDenied} /> : null}
      {error ? <ErrorNote message={error} onRetry={() => void load()} /> : null}

      <Card>
        <CardBody className="flex flex-wrap items-center gap-3 text-sm">
          <ShieldCheck className="h-5 w-5 text-leaf" aria-hidden />
          <span className="text-muted-foreground">
            የራስዎ ሚና፦ {identity?.roles.length ? identity.roles.join(' · ') : 'የለም'} · ከሰሌዳው {num(queue.length)} ውስጥ {num(mine.length)} ለዚህ ሚና የተሐዩ
          </span>
          {ledgerDecidable.length > 0 ? <StatusBadge tone="warning">{num(ledgerDecidable.length)} ንቅናቄ በሰሌዳ ብቻ ይጠብቃል</StatusBadge> : null}
        </CardBody>
      </Card>

      <Tabs items={tabs} value={tab} onValueChange={setTab}>
        <TabPanel value="ledger">
          <DataTable
            rows={ledger}
            columns={ledgerColumns}
            rowKey={(r) => r.id}
            loading={loading}
            pageSize={15}
            emptyTitle="የሚጠብቅ ንቅናቄ የለም"
            emptyDescription="ሁሉም የገቢና ወጪ ሐደሾች ተዘጋጅተዋል።"
            caption="ማረጋገጫ የጠባቁ ንቅናቄዎች"
          />
        </TabPanel>

        <TabPanel value="budget">
          {!mayBudget ? (
            <EmptyState title="የበጀት ማጽደቅ መብት የላይኝም" description="“በጀት ማጽደቅ” ያለው ተጠቃሚ ብቻ እዚህ ይወስናል።" />
          ) : (
            <>
              <p className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                ማሳወቂያ፦ በደህንነት ሕጉ መሠረት የበጀት መስመር የሚቀየረው “በጀት ማስተዳደር” ፍቃድ ላይ ነው፤ “በጀት ማጽደቅ” ብቻ ካለዎት መዝገቡ ይከለክልዎታል።
              </p>
              <DataTable
                rows={budgetsOpen}
                columns={budgetColumns}
                rowKey={(r) => r.id}
                loading={loading}
                pageSize={15}
                emptyTitle="የቀረበ በጀት የለም"
                emptyDescription="በ “በጀት” ገጽ መስመሮች ሲዘጋጁ “ላጽደቅ አቅርብ” ይባላል።"
                caption="ማጽደቅ የጠበቁ በጀቶች"
              />
            </>
          )}
        </TabPanel>

        <TabPanel value="queue">
          {can('results.release') && queue.some((r) => r.domain === 'academic') ? (
            <p className="mb-3 text-xs text-muted-foreground">
              የትምህርት ውሳኔዎች (ማሻገር/ውጤት) እዚህ ይታያሉ፤ መፈጸሚያቸው ግን በተማሪዎችና በውጤቶች ገጾች ላይ ብቻ ነው።
            </p>
          ) : null}
          <DataTable
            rows={mine}
            columns={queueColumns}
            rowKey={(r) => r.id}
            loading={loading}
            pageSize={15}
            emptyTitle="በዚህ ዘርፍ የሚጠብቅ የለም"
            emptyDescription={domain ? `“${APPROVAL_DOMAIN[domain] ?? domain}” ዘርፍ ማረጋገጫ አልጠበቀም።` : 'ሁሉም ሥራዎች ተወስነዋል።'}
            caption="ከ pending_approvals የመጡ ማረጋገጫ ጠባቂዎች"
          />
        </TabPanel>
      </Tabs>

      <ConfirmDialog
        open={pending !== null}
        busy={busy}
        destructive={pending ? pending.action !== 'approve' : false}
        title={pending ? `${pending.action === 'approve' ? UI.approve : pending.action === 'reject' ? UI.reject : 'ተሰርዟል አድርግ'} — ${pending.label}` : ''}
        description={
          <>
            <p>{pending?.question ?? ''}</p>
            <Field label={`${UI.reason} / ${UI.note}`} htmlFor="decision-note" className="mt-3" hint={pending?.action === 'approve' ? 'ከፈለጉ ይጻፉ (አስፈላጊ አይደለም)' : 'አስፈላጊ — የተሰረዘበት ምክንያት ተመዝግቧል።'}>
              <Textarea id="decision-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="ለምሳሌ የደረሰኝ ሐቀፍ አልታከለም" />
            </Field>
          </>
        }
        confirmLabel={pending?.action === 'approve' ? UI.approve : UI.confirm}
        onConfirm={() => void decide()}
        onOpenChange={(next) => {
          if (!next) {
            setPending(null);
            setNote('');
          }
        }}
      />
    </div>
  );

  function exportQueue() {
    exportExcel(
      [
        {
          name: 'ማጽደቅ የጠባቁ',
          columns: [
            { header: 'ዘርፍ', key: 'domain' },
            { header: 'ሰንጠረዥ', key: 'entity_table' },
            { header: 'ሐደሽ', key: 'entity_label' },
            { header: 'ተግባር', key: 'action' },
            { header: 'መጠን', key: 'amount' },
            { header: 'ብር ዓይነት', key: 'currency' },
            { header: 'ምክንያት', key: 'reason' },
            { header: 'የቀረበው', key: 'submitter_name' },
            { header: 'የተሐየው ሚና', key: 'assigned_role' },
            { header: 'የቀረበበት', key: 'submitted_at' },
          ],
          rows: queue as unknown as Record<string, unknown>[],
        },
        {
          name: 'የመዝገብ ማረጋገጫ',
          columns: [
            { header: 'ማጣቀሻ', key: 'ref_no' },
            { header: 'ቀን', key: 'occurred_on' },
            { header: 'ዓይነት', key: 'type' },
            { header: 'ማብራሪያ', key: 'description_am' },
            { header: 'መጠን', key: 'amount' },
            { header: 'ብር ዓይነት', key: 'currency' },
            { header: 'የቀረበበት', key: 'created_at' },
          ],
          rows: ledger as unknown as Record<string, unknown>[],
        },
      ],
      `approvals-${isoToday()}`
    );
    toast.success('ሰሌዳው ወደ ኤክሴል ተላክቷል');
  }
}
