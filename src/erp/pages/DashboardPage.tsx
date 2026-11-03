
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  DollarSign,
  FileSearch,
  Globe,
  GraduationCap,
  HandCoins,
  LayoutGrid,
  Newspaper,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
  Wallet,
  Activity,
  Clock3,
  TrendingUp,
} from 'lucide-react';

import { useAuth } from '@/components/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardBody,
  EmptyState,
  ErrorNote,
  Metric,
  Spinner,
  StatusBadge,
} from '@/components/ui/surface';

import { br, dateBoth, dateTimeAm, ethMonthName, num, pct } from '@/lib/format';
import { UI } from '@/lib/i18n';
import { isSupabaseConfigured } from '@/lib/env';
import {
  fetchKpis,
  fetchSeries,
  kpiNumber,
  kpiText,
  SERIES_WINDOWS,
  type Kpis,
  type MonthlyPoint,
  type SeriesWindow,
} from '@/lib/kpis';
import { callFn, type DbSchema } from '@/lib/supabase';
import { devotionFor, devotionSummary } from '@/lib/liturgical';
import { addDays, ethYearLabel, ethYearOf, formatEthiopian } from '@/lib/ethiopian';
import { ROLE_LABELS } from '@/types/permissions';

type Approval =
  DbSchema['Functions']['pending_approvals']['Returns'][number];

const ROUTES = {
  students: '/erp/students',
  teachers: '/erp/teachers',
  classes: '/erp/classes',
  finance: '/erp/finance',
  attendance: '/erp/attendance',
  approvals: '/erp/system/approvals',
  applications: '/erp/students/applications',
  markAttendance: '/erp/attendance/mark',
  news: '/erp/website/news',
};

const ACCENTS = {
  blue: {
    icon: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    value: 'text-blue-700 dark:text-blue-400',
    border: 'border-blue-100 dark:border-blue-900/40',
    glow: 'hover:shadow-blue-500/10',
  },
  green: {
    icon: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    value: 'text-emerald-700 dark:text-emerald-400',
    border: 'border-emerald-100 dark:border-emerald-900/40',
    glow: 'hover:shadow-emerald-500/10',
  },
  amber: {
    icon: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    value: 'text-amber-700 dark:text-amber-400',
    border: 'border-amber-100 dark:border-amber-900/40',
    glow: 'hover:shadow-amber-500/10',
  },
  violet: {
    icon: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
    value: 'text-violet-700 dark:text-violet-400',
    border: 'border-violet-100 dark:border-violet-900/40',
    glow: 'hover:shadow-violet-500/10',
  },
};

function greeting(date: Date) {
  const hour = date.getHours();

  if (hour < 12) return 'እንደምን አደሩ';
  if (hour < 18) return 'እንደምን ዋሉ';

  return 'እንደምን አመሹ';
}

// -----------------------------------------------------------------------------
// Premium KPI card
// -----------------------------------------------------------------------------

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
  to,
  note,
}: {
  label: string;
  value: ReactNode;
  icon: React.ElementType;
  accent: keyof typeof ACCENTS;
  to: string;
  note?: ReactNode;
}) {
  const a = ACCENTS[accent];

  return (
    <Card className={`group relative overflow-hidden border ${a.border} transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${a.glow}`}>
      <CardBody className="p-5">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">
              {label}
            </p>

            <div className={`mt-3 text-3xl font-bold tracking-tight tabular-nums ${a.value}`}>
              {value}
            </div>
          </div>

          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${a.icon} transition-transform duration-300 group-hover:scale-110`}>
            <Icon className="h-6 w-6" />
          </div>
        </div>

        <div className="mt-4 min-h-6 text-xs text-muted-foreground">
          {note}
        </div>

        <Link
          to={to}
          className="mt-4 flex items-center justify-between border-t border-border pt-3 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
        >
          ዝርዝር ይመልከቱ
          <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </Link>
      </CardBody>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Section heading
// -----------------------------------------------------------------------------

function SectionHeading({
  title,
  subtitle,
  icon: Icon,
}: {
  title: string;
  subtitle?: string;
  icon: React.ElementType;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>

      <div>
        <h2 className="font-display text-lg font-bold">{title}</h2>
        {subtitle && (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Panel
// -----------------------------------------------------------------------------

function Panel({
  title,
  subtitle,
  icon: Icon,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  icon: React.ElementType;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card className="h-full overflow-hidden border-border/70 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>

          <div>
            <h3 className="font-display font-semibold">{title}</h3>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
        </div>

        {action}
      </div>

      <CardBody className="p-5">{children}</CardBody>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Finance comparison bars
// -----------------------------------------------------------------------------

function FinanceBars({
  rows,
  currency,
}: {
  rows: { label: string; value: number; bar: string; dot: string }[];
  currency: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));

  return (
    <div className="space-y-6">
      {rows.map((row) => (
        <div key={row.label}>
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <span className={`h-2.5 w-2.5 rounded-full ${row.dot}`} />
              {row.label}
            </div>

            <span className="text-sm font-semibold tabular-nums">
              {currency} {br(row.value, { cents: false })}
            </span>
          </div>

          <div className="h-3 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all duration-700 ${row.bar}`}
              style={{
                width: `${row.value > 0 ? Math.max(2, (row.value / max) * 100) : 0}%`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// -----------------------------------------------------------------------------
// SVG donut chart
// -----------------------------------------------------------------------------

function Donut({
  parts,
}: {
  parts: {
    label: string;
    value: number;
    color: string;
    dot: string;
  }[];
}) {
  const total = parts.reduce((sum, p) => sum + p.value, 0);

  const radius = 53;
  const circumference = 2 * Math.PI * radius;

  if (total <= 0) {
    return (
      <EmptyState
        icon={<BarChart3 className="h-7 w-7" />}
        title="ገና ገቢ አልተመዘገበም"
        description="ገቢ ሲመዘገብ የገቢ ክፍፍሉ እዚህ ይታያል።"
      />
    );
  }

  let offset = 0;

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:justify-around">
      <div className="relative shrink-0">
        <svg
          viewBox="0 0 140 140"
          className="h-40 w-40 -rotate-90"
          role="img"
          aria-label="የገቢ ክፍፍል"
        >
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            strokeWidth="17"
            className="stroke-muted"
          />

          {parts.map((part) => {
            const length = (part.value / total) * circumference;
            const currentOffset = offset;
            offset += length;

            return (
              <circle
                key={part.label}
                cx="70"
                cy="70"
                r={radius}
                fill="none"
                stroke={part.color}
                strokeWidth="17"
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={-currentOffset}
                strokeLinecap="butt"
              />
            );
          })}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold tabular-nums">
            100%
          </span>
          <span className="text-xs text-muted-foreground">
            ጠቅላላ ገቢ
          </span>
        </div>
      </div>

      <div className="w-full space-y-4 sm:w-auto sm:min-w-28">
        {parts.map((part) => (
          <div key={part.label} className="flex items-center justify-between gap-5">
            <span className="flex items-center gap-2 text-sm">
              <span className={`h-3 w-3 rounded-full ${part.dot}`} />
              {part.label}
            </span>

            <span className="font-bold tabular-nums">
              {Math.round((part.value / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Monthly time series — `dashboard_series(p_months)`
//
// Both charts below are hand-rolled SVG in the same visual language as the donut
// and the finance bars: a fixed viewBox, the border/muted tokens for the
// gridlines, and the emerald/amber/rose/blue/violet series colours the rest of
// the dashboard already uses. Nothing is drawn unless the RPC returned it.
// -----------------------------------------------------------------------------

/** One month, with the Amharic labels the axes and tooltips need. */
type MonthPoint = MonthlyPoint & {
  key: string;
  /** Ethiopian month covering the middle of the Gregorian bucket, e.g. 'ሐምሌ'. */
  label: string;
  /** Tooltip heading: month plus Ge'ez year. */
  caption: string;
};

// Buckets are Gregorian months because that is how the ledger, `finance_summary`
// and the KPI cards are cut; the axis names the Ethiopian month that dominates
// the bucket, so the chart reads the way the calendar on the wall does.
function toMonthPoint(row: MonthlyPoint): MonthPoint {
  const middle = addDays(row.monthStart, 14);
  const month = ethMonthName(middle);

  return {
    ...row,
    key: row.period || row.monthStart,
    label: month,
    caption: `${month} ${ethYearLabel(ethYearOf(middle))}`,
  };
}

const FRAME = { w: 780, h: 296, left: 62, right: 18, top: 22, bottom: 46 };
const PLOT_W = FRAME.w - FRAME.left - FRAME.right;
const PLOT_H = FRAME.h - FRAME.top - FRAME.bottom;
const BASE_Y = FRAME.top + PLOT_H;

const PALETTE = {
  income: '#10b981', //     emerald-500
  expense: '#f43f5e', //    rose-500
  donations: '#f59e0b', //  amber-500
  attendance: '#3b82f6', // blue-500
  events: '#8b5cf6', //     violet-500
  news: '#f59e0b', //       amber-500
};

const colWidth = (count: number) => PLOT_W / Math.max(count, 1);
const colCenter = (index: number, count: number) => FRAME.left + colWidth(count) * (index + 0.5);
const yFor = (value: number, max: number) => BASE_Y - (max > 0 ? value / max : 0) * PLOT_H;

/** A round axis ceiling (1/1.5/2/2.5/3/4/5/7.5/10 × a power of ten). */
function niceMax(values: number[]): number {
  const raw = Math.max(1, ...values);
  const magnitude = 10 ** Math.floor(Math.log10(raw));

  for (const step of [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10]) {
    if (raw <= step * magnitude) return step * magnitude;
  }

  return 10 * magnitude;
}

const tickSet = (max: number) => [0, 0.25, 0.5, 0.75, 1].map((factor) => max * factor);

/** Axis money labels stay short: 1.2 ሚ, 45 ሺ. */
function compactMoney(value: number): string {
  const abs = Math.abs(value);

  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)} ሚ`;
  if (abs >= 1_000) return `${Math.round(value / 1_000)} ሺ`;

  return String(Math.round(value));
}

function Gridlines({ max, format }: { max: number; format: (value: number) => string }) {
  return (
    <g aria-hidden="true">
      {tickSet(max).map((tick) => {
        const y = yFor(tick, max);

        return (
          <g key={tick}>
            <line
              x1={FRAME.left}
              x2={FRAME.w - FRAME.right}
              y1={y}
              y2={y}
              strokeWidth={tick === 0 ? 1.5 : 1}
              strokeDasharray={tick === 0 ? undefined : '3 6'}
              className={tick === 0 ? 'stroke-border' : 'stroke-muted'}
            />

            <text
              x={FRAME.left - 10}
              y={y + 4}
              textAnchor="end"
              className="fill-muted-foreground text-[11px] tabular-nums"
            >
              {format(tick)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function MonthLabels({ points }: { points: MonthPoint[] }) {
  // Past eight months the columns are too narrow for every name; the hovered
  // tooltip always carries the exact month.
  const every = points.length > 8 ? 2 : 1;

  return (
    <g aria-hidden="true">
      {points.map((point, index) =>
        index % every === 0 ? (
          <text
            key={point.key}
            x={colCenter(index, points.length)}
            y={BASE_Y + 22}
            textAnchor="middle"
            className="fill-muted-foreground text-[11px]"
          >
            {point.label}
          </text>
        ) : null
      )}
    </g>
  );
}

/** Transparent column that owns the hover and keyboard focus of one month. */
function HoverColumns({
  points,
  active,
  onHover,
  describe,
}: {
  points: MonthPoint[];
  active: number | null;
  onHover: (index: number | null) => void;
  describe: (point: MonthPoint) => string;
}) {
  const width = colWidth(points.length);

  return (
    <g>
      {points.map((point, index) => (
        <rect
          key={point.key}
          x={FRAME.left + width * index}
          y={FRAME.top}
          width={width}
          height={PLOT_H}
          fill="transparent"
          tabIndex={0}
          role="img"
          aria-label={describe(point)}
          className={active === index ? 'fill-foreground/5 outline-none' : 'outline-none'}
          onMouseEnter={() => onHover(index)}
          onMouseLeave={() => onHover(null)}
          onFocus={() => onHover(index)}
          onBlur={() => onHover(null)}
        />
      ))}
    </g>
  );
}

function ChartTip({
  points,
  active,
  rows,
}: {
  points: MonthPoint[];
  active: number | null;
  rows: { label: string; value: string; color: string }[];
}) {
  const point = active === null ? null : points[active];
  if (!point) return null;

  return (
    <div
      className="pointer-events-none absolute top-0 z-10 w-44 -translate-x-1/2 rounded-xl border border-border bg-card/95 p-3 text-xs shadow-xl backdrop-blur"
      style={{
        left: `${Math.min(86, Math.max(14, (colCenter(active ?? 0, points.length) / FRAME.w) * 100))}%`,
      }}
      role="status"
    >
      <p className="mb-2 font-display font-semibold">
        {point.caption}
        <span className="ml-1 text-[10px] font-normal tabular-nums text-muted-foreground">
          {point.period}
        </span>
      </p>

      <ul className="space-y-1.5">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: row.color }} />
              {row.label}
            </span>

            <span className="font-semibold tabular-nums">{row.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SeriesLegend({ items }: { items: { label: string; dot: string }[] }) {
  return (
    <ul className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.dot }} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

const seriesLine = (
  points: MonthPoint[],
  pick: (point: MonthPoint) => number,
  max: number
): string =>
  points
    .map(
      (point, index) =>
        `${index === 0 ? 'M' : 'L'}${colCenter(index, points.length).toFixed(1)} ${yFor(
          pick(point),
          max
        ).toFixed(1)}`
    )
    .join(' ');

/** Income as a gradient area, expense as a line, donations dashed — one window. */
function TrendChart({ points, currency }: { points: MonthPoint[]; currency: string }) {
  const [active, setActive] = useState<number | null>(null);

  const max = niceMax(points.flatMap((point) => [point.income, point.expense, point.donations]));
  const income = seriesLine(points, (point) => point.income, max);
  const last = points.length - 1;
  const area =
    `${income} L${colCenter(last, points.length).toFixed(1)} ${BASE_Y}` +
    ` L${colCenter(0, points.length).toFixed(1)} ${BASE_Y} Z`;

  return (
    <div className="relative">
      <SeriesLegend
        items={[
          { label: 'ገቢ', dot: PALETTE.income },
          { label: 'ወጪ', dot: PALETTE.expense },
          { label: 'ልገሳ', dot: PALETTE.donations },
        ]}
      />

      <svg
        viewBox={`0 0 ${FRAME.w} ${FRAME.h}`}
        className="h-auto w-full"
        role="img"
        aria-label={`ወርሃዊ የገቢና ወጪ አዝማሚያ በ${currency}`}
      >
        <defs>
          <linearGradient id="tt-income-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={PALETTE.income} stopOpacity="0.32" />
            <stop offset="100%" stopColor={PALETTE.income} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        <Gridlines max={max} format={compactMoney} />
        <MonthLabels points={points} />

        {active !== null && (
          <line
            x1={colCenter(active, points.length)}
            x2={colCenter(active, points.length)}
            y1={FRAME.top}
            y2={BASE_Y}
            className="stroke-border"
            strokeDasharray="4 4"
          />
        )}

        <path d={area} fill="url(#tt-income-area)" />

        <path
          d={income}
          fill="none"
          stroke={PALETTE.income}
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        <path
          d={seriesLine(points, (point) => point.expense, max)}
          fill="none"
          stroke={PALETTE.expense}
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        <path
          d={seriesLine(points, (point) => point.donations, max)}
          fill="none"
          stroke={PALETTE.donations}
          strokeWidth="2"
          strokeDasharray="7 5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {points.map((point, index) =>
          point.income > 0 && (index === active || points.length <= 7) ? (
            <circle
              key={`income-${point.key}`}
              cx={colCenter(index, points.length)}
              cy={yFor(point.income, max)}
              r="4"
              fill={PALETTE.income}
              strokeWidth="2"
              className="stroke-card"
            />
          ) : null
        )}

        {points.map((point, index) =>
          point.expense > 0 && (index === active || points.length <= 7) ? (
            <circle
              key={`expense-${point.key}`}
              cx={colCenter(index, points.length)}
              cy={yFor(point.expense, max)}
              r="4"
              fill={PALETTE.expense}
              strokeWidth="2"
              className="stroke-card"
            />
          ) : null
        )}

        <HoverColumns
          points={points}
          active={active}
          onHover={setActive}
          describe={(point) =>
            `${point.caption}: ገቢ ${br(point.income, { cents: false })}፣ ወጪ ${br(
              point.expense,
              { cents: false }
            )}፣ ልገሳ ${br(point.donations, { cents: false })}፣ ንቁ ተማሪዎች ${num(
              point.studentsActive
            )}`
          }
        />
      </svg>

      <ChartTip
        points={points}
        active={active}
        rows={
          active === null
            ? []
            : [
                {
                  label: 'ገቢ',
                  value: br(points[active].income, { cents: false }),
                  color: PALETTE.income,
                },
                {
                  label: 'ወጪ',
                  value: br(points[active].expense, { cents: false }),
                  color: PALETTE.expense,
                },
                {
                  label: 'ልገሳ',
                  value: br(points[active].donations, { cents: false }),
                  color: PALETTE.donations,
                },
                {
                  label: 'ንቁ ተማሪዎች',
                  value: num(points[active].studentsActive),
                  color: PALETTE.attendance,
                },
              ]
        }
      />
    </div>
  );
}

type BarsMetric = 'attendance' | 'activity';

/** Attendance rate, or programmes and news, as monthly bars with value labels. */
function BarsChart({ points, metric }: { points: MonthPoint[]; metric: BarsMetric }) {
  const [active, setActive] = useState<number | null>(null);

  const max = metric === 'attendance' ? 100 : niceMax(points.map((point) => point.events + point.news));
  const barWidth = Math.min(40, colWidth(points.length) * 0.58);

  return (
    <div className="relative">
      <SeriesLegend
        items={
          metric === 'attendance'
            ? [{ label: 'የመገኘት መጠን (%)', dot: PALETTE.attendance }]
            : [
                { label: 'ፕሮግራሞች', dot: PALETTE.events },
                { label: 'ዜናዎች', dot: PALETTE.news },
              ]
        }
      />

      <svg
        viewBox={`0 0 ${FRAME.w} ${FRAME.h}`}
        className="h-auto w-full"
        role="img"
        aria-label={metric === 'attendance' ? 'ወርሃዊ የመገኘት መጠን' : 'ወርሃዊ የእንቅስቃሴ ብዛት'}
      >
        <defs>
          <linearGradient id="tt-rate-bar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#60a5fa" />
            <stop offset="100%" stopColor={PALETTE.attendance} />
          </linearGradient>
        </defs>

        <Gridlines
          max={max}
          format={(value) =>
            metric === 'attendance' ? `${Math.round(value)}%` : String(Math.round(value))
          }
        />
        <MonthLabels points={points} />

        {points.map((point, index) => {
          const x = colCenter(index, points.length) - barWidth / 2;
          const first = metric === 'attendance' ? point.attendanceRate : point.events;
          const second = metric === 'attendance' ? 0 : point.news;
          const firstY = yFor(first, max);
          const stackedY = yFor(first + second, max);
          const total = metric === 'attendance' ? point.attendanceRate : point.events + point.news;

          return (
            <g key={point.key}>
              {first > 0 && (
                <rect
                  x={x}
                  y={firstY}
                  width={barWidth}
                  height={BASE_Y - firstY}
                  rx="4"
                  fill={metric === 'attendance' ? 'url(#tt-rate-bar)' : PALETTE.events}
                />
              )}

              {second > 0 && (
                <rect
                  x={x}
                  y={stackedY}
                  width={barWidth}
                  height={Math.max(0, firstY - stackedY)}
                  rx="4"
                  fill={PALETTE.news}
                />
              )}

              <text
                x={colCenter(index, points.length)}
                y={(second > 0 ? stackedY : firstY) - 7}
                textAnchor="middle"
                className={
                  total > 0
                    ? 'fill-foreground text-[11px] font-semibold tabular-nums'
                    : 'fill-muted-foreground text-[11px] tabular-nums'
                }
              >
                {metric === 'attendance' ? pct(point.attendanceRate, 0) : String(total)}
              </text>
            </g>
          );
        })}

        <HoverColumns
          points={points}
          active={active}
          onHover={setActive}
          describe={(point) =>
            metric === 'attendance'
              ? `${point.caption}: የመገኘት መጠን ${pct(point.attendanceRate, 0)}፣ ንቁ ተማሪዎች ${num(
                  point.studentsActive
                )}`
              : `${point.caption}: ${point.events} ፕሮግራም፣ ${point.news} የታተመ ዜና`
          }
        />
      </svg>

      <ChartTip
        points={points}
        active={active}
        rows={
          active === null
            ? []
            : metric === 'attendance'
              ? [
                  {
                    label: 'የመገኘት መጠን',
                    value: pct(points[active].attendanceRate, 0),
                    color: PALETTE.attendance,
                  },
                  {
                    label: 'ንቁ ተማሪዎች',
                    value: num(points[active].studentsActive),
                    color: PALETTE.income,
                  },
                ]
              : [
                  { label: 'ፕሮግራሞች', value: String(points[active].events), color: PALETTE.events },
                  { label: 'ዜናዎች', value: String(points[active].news), color: PALETTE.news },
                ]
        }
      />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Series panel states
// -----------------------------------------------------------------------------

type SeriesState =
  | { status: 'loading' }
  | { status: 'ready'; rows: MonthlyPoint[] }
  | { status: 'missing' }
  | { status: 'error'; message: string };

/** Skeleton while the RPC is in flight — same footprint as the chart it replaces. */
function ChartSkeleton() {
  const heights = [38, 62, 48, 78, 56, 88, 66, 44, 72, 52, 60, 40];

  return (
    <div className="animate-pulse" role="status" aria-label="ግራፍ በመጫን ላይ…">
      <div className="flex gap-4">
        {[0, 1, 2].map((key) => (
          <span key={key} className="h-3 w-16 rounded-full bg-muted" />
        ))}
      </div>

      <div className="mt-5 flex h-52 items-end gap-2 border-b border-border">
        {heights.map((height, index) => (
          <span key={index} className="flex-1 rounded-t-lg bg-muted" style={{ height: `${height}%` }} />
        ))}
      </div>

      <p className="mt-4 text-xs text-muted-foreground">ግራፍ በመጫን ላይ…</p>
    </div>
  );
}

/** The retry affordance every series state shares. */
function SeriesRetry({ onRetry, label = 'እንደገና ይሞክሩ' }: { onRetry: () => void; label?: string }) {
  return (
    <Button variant="outline" size="sm" onClick={onRetry}>
      <RefreshCw className="mr-2 h-4 w-4" />
      {label}
    </Button>
  );
}

/** `dashboard_series` answers 404 until the migration is pushed — said plainly. */
function SeriesUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <EmptyState
      icon={<BarChart3 className="h-7 w-7" />}
      title="ግራፉ ገና አልተዘጋጀም"
      description="የወራት ተከታታይ መረጃ (dashboard_series) በመረጃ ማጠራቀሚያው ላይ ገና አልተገነባም። ማሟያው ሲተገበር ይህ ግራፍ ዳታቤዙን ይከተላል።"
      action={<SeriesRetry onRetry={onRetry} />}
    />
  );
}

/** One panel, one RPC: skeleton → failed → not built → empty → chart. */
function SeriesPanel({
  title,
  subtitle,
  icon: Icon,
  action,
  state,
  hasData,
  emptyTitle,
  emptyBody,
  onRetry,
  render,
}: {
  title: string;
  subtitle?: string;
  icon: React.ElementType;
  action?: ReactNode;
  state: SeriesState;
  hasData: (points: MonthPoint[]) => boolean;
  emptyTitle: string;
  emptyBody: string;
  onRetry: () => void;
  render: (points: MonthPoint[]) => ReactNode;
}) {
  const empty = (
    <EmptyState
      icon={<BarChart3 className="h-7 w-7" />}
      title={emptyTitle}
      description={emptyBody}
      action={<SeriesRetry onRetry={onRetry} />}
    />
  );

  const body = () => {
    if (state.status === 'loading') return <ChartSkeleton />;
    if (state.status === 'error') return <ErrorNote message={state.message} onRetry={onRetry} />;
    if (state.status === 'missing') return <SeriesUnavailable onRetry={onRetry} />;

    const points = state.rows.map(toMonthPoint);

    return points.length && hasData(points) ? render(points) : empty;
  };

  return (
    <Panel title={title} subtitle={subtitle} icon={Icon} action={action}>
      {body()}
    </Panel>
  );
}

/** 3 / 6 / 12 month window — each change re-queries the RPC. */
function WindowToggle({
  value,
  busy,
  onChange,
}: {
  value: number;
  busy: boolean;
  onChange: (months: SeriesWindow) => void;
}) {
  return (
    <div
      className="flex items-center gap-1 rounded-xl border border-border bg-muted/40 p-1"
      role="group"
      aria-label="የግራፉ የጊዜ መረጃ"
    >
      {SERIES_WINDOWS.map((months) => (
        <button
          key={months}
          type="button"
          disabled={busy}
          aria-pressed={value === months}
          onClick={() => onChange(months)}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
            value === months
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          }`}
        >
          {months} ወራት
        </button>
      ))}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Quick navigation
// -----------------------------------------------------------------------------

function QuickLink({
  to,
  icon: Icon,
  children,
}: {
  to: string;
  icon: React.ElementType;
  children: ReactNode;
}) {
  return (
    <li>
      <Link
        to={to}
        className="group flex min-h-[52px] items-center gap-3 rounded-xl border border-border/60 bg-background p-3 text-sm transition-all hover:border-primary/30 hover:bg-primary/5 hover:shadow-sm"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-transform group-hover:scale-110">
          <Icon className="h-4 w-4" />
        </span>

        <span className="flex-1 font-medium">{children}</span>

        <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
      </Link>
    </li>
  );
}

// -----------------------------------------------------------------------------
// Main Dashboard
// -----------------------------------------------------------------------------

export function DashboardPage() {
  const { identity, can } = useAuth();

  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [approvals, setApprovals] = useState<Approval[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The charts read their own RPC, so a slow or missing series never takes the
  // KPI cards down with it — and a window change re-queries without a reload.
  const [months, setMonths] = useState<number>(12);
  const [barsMetric, setBarsMetric] = useState<BarsMetric>('attendance');
  const [series, setSeries] = useState<SeriesState>({ status: 'loading' });
  const seriesSeq = useRef(0);

  const canDecide = can(
    'finance.approve',
    'budget.approve',
    'results.release'
  );

  const canSeeMoney = can('finance.read');

  const load = useCallback(async () => {
    if (!identity || !isSupabaseConfigured) return;

    setBusy(true);
    setError(null);

    try {
      const data = await fetchKpis();
      setKpis(data);

      if (canDecide) {
        const queue = await callFn('pending_approvals', {});
        setApprovals(queue);
      } else {
        setApprovals(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : UI.serverError);
    } finally {
      setBusy(false);
    }
  }, [identity, canDecide]);

  const loadSeries = useCallback(
    async (window: number) => {
      if (!identity || !isSupabaseConfigured) return;

      // Only the newest request may write: switching 12 → 3 mid-flight must not
      // let the older, slower response win.
      const seq = ++seriesSeq.current;
      setSeries({ status: 'loading' });

      const result = await fetchSeries(window);
      if (seq !== seriesSeq.current) return;

      setSeries(
        result.state === 'ready'
          ? { status: 'ready', rows: result.rows }
          : result.state === 'missing'
            ? { status: 'missing' }
            : { status: 'error', message: result.message }
      );
    },
    [identity]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadSeries(months);
  }, [months, loadSeries]);

  const refreshAll = useCallback(() => {
    void load();
    void loadSeries(months);
  }, [load, loadSeries, months]);

  const windowLabel = `ባለፉት ${months} ወራት`;

  const today = new Date();
  const devotion = devotionFor(today);

  const currency = kpis
    ? kpiText(kpis, 'currency', 'ETB')
    : 'ETB';

  const n = (key: string) =>
    kpis ? kpiNumber(kpis, key) : 0;

  if (!isSupabaseConfigured) {
    return (
      <ErrorNote message="ዳታቤዙ ገና አልተገናኘም።" />
    );
  }

  const income = n('income_month');
  const expense = n('expense_month');
  const donations = n('donations_month');
  const net = income + donations - expense;
  const pending = n('approvals_pending');

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-7 pb-8">

      {/* ================================================================
          1. HERO
      ================================================================= */}

      <section className="relative isolate overflow-hidden rounded-3xl border border-primary/10 bg-gradient-to-br from-blue-50 via-background to-emerald-50 p-6 shadow-sm dark:from-blue-950/40 dark:via-background dark:to-emerald-950/30 sm:p-8">

        {/* Decorative background */}
        <div className="pointer-events-none absolute -right-16 -top-24 -z-10 h-72 w-72 rounded-full bg-blue-400/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 -z-10 h-64 w-64 rounded-full bg-emerald-400/10 blur-3xl" />

        <div className="flex flex-col justify-between gap-7 xl:flex-row xl:items-end">

          <div className="min-w-0 space-y-5">

            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/80 px-4 py-2 text-sm shadow-sm">
              <Sparkles className="h-4 w-4 text-amber-500" />
              <span className="font-medium">
                {greeting(today)}፣ {identity?.nameAm || 'ተረጋጋጽ'}
              </span>
            </div>

            <div>
              <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
                {UI.appName}
              </h1>

              <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
                እንኳን ወደ ዋናው የአስተዳደር ዳሽቦርድ በደህና መጡ።
                የድርጅቱን የዛሬ እንቅስቃሴ እና የሥራ ሁኔታ ከዚህ ይከታተሉ።
              </p>
            </div>

            <div className="space-y-2 text-sm">
              <p className="flex flex-wrap items-center gap-2 text-muted-foreground">
                <CalendarDays className="h-4 w-4 text-primary" />
                <span className="font-medium text-foreground">
                  {formatEthiopian(today)}
                </span>
                <span>·</span>
                {dateBoth(today)}
              </p>

              <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
                <CalendarCheck className="h-4 w-4" />
                {devotionSummary(today)}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {devotion.fast && (
                <StatusBadge tone="warning">
                  {devotion.fast.nameAm}
                </StatusBadge>
              )}

              {devotion.feasts[0] && (
                <StatusBadge tone="gold">
                  {devotion.feasts[0].nameAm}
                </StatusBadge>
              )}

              {identity?.roles.length ? (
                identity.roles.map((role) => (
                  <StatusBadge key={role} tone="neutral">
                    {ROLE_LABELS[role]}
                  </StatusBadge>
                ))
              ) : (
                <StatusBadge tone="danger">
                  ሚና አልተሰጠም
                </StatusBadge>
              )}
            </div>
          </div>

          {/* Header actions */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={refreshAll}
              disabled={busy}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
              አድስ
            </Button>

            {canSeeMoney && (
              <Button asChild variant="outline">
                <Link to={ROUTES.finance}>
                  <Wallet className="mr-2 h-4 w-4" />
                  ፋይናንስ
                </Link>
              </Button>
            )}

            {canDecide && (
              <Button asChild>
                <Link to={ROUTES.approvals}>
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  ማጽደቆች
                  {pending > 0 && (
                    <span className="ml-2 rounded-full bg-background/20 px-2 py-0.5 text-xs">
                      {pending}
                    </span>
                  )}
                </Link>
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* Error and loading */}
      {error && (
        <ErrorNote
          message={error}
          onRetry={() => void load()}
        />
      )}

      {!kpis && !error && (
        <Spinner label="የዳሽቦርድ መረጃ በመጫን ላይ…" />
      )}

      {kpis && (
        <>
          {/* ============================================================
              2. KPI CARDS
          ============================================================ */}

          <section className="space-y-4">
            <SectionHeading
              title="ዋና ዋና መለኪያዎች"
              subtitle="የድርጅቱ አጠቃላይ የአሁኑ ሁኔታ"
              icon={LayoutGrid}
            />

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

              <StatCard
                label="ጠቅላላ ተማሪዎች"
                value={num(n('students_active'))}
                icon={UserPlus}
                accent="blue"
                to={ROUTES.students}
                note="ንቁ ተማሪዎች"
              />

              <StatCard
                label="ጠቅላላ መምህራን"
                value={num(n('teachers_active'))}
                icon={Users}
                accent="green"
                to={ROUTES.teachers}
                note="ንቁ መምህራን"
              />

              <StatCard
                label="ጠቅላላ ክፍሎች"
                value={num(n('classes_active'))}
                icon={GraduationCap}
                accent="amber"
                to={ROUTES.classes}
                note="ንቁ ክፍሎች"
              />

              {canSeeMoney ? (
                <StatCard
                  label="የዚህ ወር ገቢ"
                  value={
                    <span className="text-2xl">
                      {currency}{' '}
                      {br(income, { cents: false })}
                    </span>
                  }
                  icon={DollarSign}
                  accent="violet"
                  to={ROUTES.finance}
                  note={
                    <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold ${net >= 0 ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600'}`}>
                      {net >= 0 ? (
                        <ArrowUpRight className="h-3 w-3" />
                      ) : (
                        <ArrowDownRight className="h-3 w-3" />
                      )}
                      ቀሪ {br(net, { cents: false })} {currency}
                    </span>
                  }
                />
              ) : (
                <StatCard
                  label="የመገኘት መጠን"
                  value={pct(n('attendance_rate'))}
                  icon={ClipboardCheck}
                  accent="violet"
                  to={ROUTES.attendance}
                  note="ባለፉት 60 ቀናት"
                />
              )}
            </div>
          </section>

          {/* ============================================================
              3. ANALYTICS
          ============================================================ */}

          {canSeeMoney && (
            <section className="space-y-4">

              <div className="flex items-center gap-4">
                <div className="h-px flex-1 bg-border" />
                <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  ትንታኔ
                </div>
                <div className="h-px flex-1 bg-border" />
              </div>

              <div className="grid gap-5 lg:grid-cols-5">

                <div className="lg:col-span-3">
                  <Panel
                    title="የፋይናንስ አጠቃላይ"
                    subtitle="የዚህ ወር የገቢና ወጪ ንጽጽር"
                    icon={TrendingUp}
                    action={
                      <Button asChild variant="ghost" size="sm">
                        <Link to={ROUTES.finance}>
                          ሁሉንም
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                      </Button>
                    }
                  >
                    <FinanceBars
                      currency={currency}
                      rows={[
                        {
                          label: 'ገቢ',
                          value: income,
                          bar: 'bg-emerald-500',
                          dot: 'bg-emerald-500',
                        },
                        {
                          label: 'ልገሳ',
                          value: donations,
                          bar: 'bg-amber-500',
                          dot: 'bg-amber-500',
                        },
                        {
                          label: 'ወጪ',
                          value: expense,
                          bar: 'bg-rose-500',
                          dot: 'bg-rose-500',
                        },
                      ]}
                    />

                    <div className="mt-7 rounded-2xl bg-gradient-to-r from-emerald-500/10 to-blue-500/10 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-xs text-muted-foreground">
                            የወሩ ቀሪ ሂሳብ
                          </p>
                          <p className="mt-1 text-2xl font-bold tabular-nums">
                            {currency} {br(net, { cents: false })}
                          </p>
                        </div>

                        <div className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${net >= 0 ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600'}`}>
                          {net >= 0 ? 'አዎንታዊ ቀሪ' : 'አሉታዊ ቀሪ'}
                        </div>
                      </div>
                    </div>
                  </Panel>
                </div>

                <div className="lg:col-span-2">
                  <Panel
                    title="የገቢ ክፍፍል"
                    subtitle="ገቢ እና ልገሳ"
                    icon={BarChart3}
                  >
                    <Donut
                      parts={[
                        {
                          label: 'ገቢ',
                          value: income,
                          color: '#10b981',
                          dot: 'bg-emerald-500',
                        },
                        {
                          label: 'ልገሳ',
                          value: donations,
                          color: '#f59e0b',
                          dot: 'bg-amber-500',
                        },
                      ]}
                    />
                  </Panel>
                </div>
              </div>
            </section>
          )}
        </>
      )}

      {/* ================================================================
          3b. MONTHLY SERIES CHARTS — fed by dashboard_series(p_months)
      ================================================================= */}

      {identity && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionHeading
              title="ወርሃዊ አዝማሚያ"
              subtitle={`${windowLabel} · ከመረጃ ማጠራቀሚያው በቀጥታ`}
              icon={TrendingUp}
            />

            <WindowToggle
              value={months}
              busy={series.status === 'loading'}
              onChange={(next) => setMonths(next)}
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-5">
            {canSeeMoney && (
              <div className="lg:col-span-3">
                <SeriesPanel
                  title="ገቢና ወጪ በወር"
                  subtitle={`${windowLabel} · ${currency}`}
                  icon={DollarSign}
                  action={
                    <Button asChild variant="ghost" size="sm">
                      <Link to={ROUTES.finance}>
                        ፋይናንስ
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  }
                  state={series}
                  onRetry={refreshAll}
                  hasData={(rows) =>
                    rows.some(
                      (row) => row.income > 0 || row.expense > 0 || row.donations > 0
                    )
                  }
                  emptyTitle="በዚህ ጊዜ ምንም የተመዘገበ ገቢ የለም"
                  emptyBody="ገቢ፣ ወጪ ወይም ልገሳ ሲመዘገብ ወርሃዊው ግራፍ እዚህ ይሞላል።"
                  render={(rows) => {
                    const total = rows.reduce(
                      (acc, row) => ({
                        income: acc.income + row.income,
                        expense: acc.expense + row.expense,
                        donations: acc.donations + row.donations,
                      }),
                      { income: 0, expense: 0, donations: 0 }
                    );

                    const diff = total.income - total.expense;

                    return (
                      <>
                        <TrendChart points={rows} currency={currency} />

                        <div className="mt-5 grid grid-cols-2 gap-4 rounded-2xl bg-gradient-to-r from-emerald-500/10 to-blue-500/10 p-4 sm:grid-cols-4">
                          {[
                            {
                              label: 'ጠቅላላ ገቢ',
                              value: br(total.income, { cents: false }),
                              tone: 'text-emerald-700 dark:text-emerald-400',
                            },
                            {
                              label: 'ጠቅላላ ወጪ',
                              value: br(total.expense, { cents: false }),
                              tone: 'text-rose-700 dark:text-rose-400',
                            },
                            {
                              label: 'ጠቅላላ ልገሳ',
                              value: br(total.donations, { cents: false }),
                              tone: 'text-amber-700 dark:text-amber-400',
                            },
                            {
                              label: 'ገቢ − ወጪ',
                              value: br(diff, { cents: false }),
                              tone:
                                diff >= 0
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : 'text-red-700 dark:text-red-400',
                            },
                          ].map((item) => (
                            <div key={item.label} className="min-w-0">
                              <p className="text-xs text-muted-foreground">{item.label}</p>

                              <p
                                className={`mt-1 truncate text-sm font-bold tabular-nums ${item.tone}`}
                              >
                                {item.value}
                              </p>
                            </div>
                          ))}
                        </div>

                        <p className="mt-3 text-xs text-muted-foreground">
                          ልገሳ የተቀበለው ገቢውንም ይወክላል፤ ስለዚህ ገቢ ላይ ተደራሪ ቢታይ ሁለቴ አይቆጠርም።
                        </p>
                      </>
                    );
                  }}
                />
              </div>
            )}

            <div className={canSeeMoney ? 'lg:col-span-2' : 'lg:col-span-5'}>
              <SeriesPanel
                title={barsMetric === 'attendance' ? 'የመገኘት መጠን በወር' : 'እንቅስቃሴ በወር'}
                subtitle={windowLabel}
                icon={barsMetric === 'attendance' ? ClipboardCheck : Activity}
                action={
                  <div
                    className="flex items-center gap-1 rounded-xl border border-border bg-muted/40 p-1"
                    role="group"
                    aria-label="የአሞሌ መለኪያ"
                  >
                    {(
                      [
                        { key: 'attendance', label: 'መገኘት' },
                        { key: 'activity', label: 'እንቅስቃሴ' },
                      ] as const
                    ).map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        aria-pressed={barsMetric === option.key}
                        onClick={() => setBarsMetric(option.key)}
                        className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                          barsMetric === option.key
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                }
                state={series}
                onRetry={refreshAll}
                hasData={(rows) =>
                  rows.some(
                    (row) => row.attendanceRate > 0 || row.events > 0 || row.news > 0
                  )
                }
                emptyTitle="ገና የተመዘገበ መገኘት የለም"
                emptyBody="መገኘት ሲመዘገብ ወይም ዜና ሲታተም የወሩ አሞሌ እዚህ ይሞላል።"
                render={(rows) => {
                  const metricEmpty =
                    barsMetric === 'attendance'
                      ? !rows.some((row) => row.attendanceRate > 0)
                      : !rows.some((row) => row.events > 0 || row.news > 0);

                  return (
                    <>
                      {metricEmpty && (
                        <p className="mb-3 rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
                          {barsMetric === 'attendance'
                            ? 'በተመረጠው ጊዜ ውስጥ የተመዘገበ መገኘት የለም፤ የእንቅስቃሴ መለኪያውን ይምረጡ።'
                            : 'በተመረጠው ጊዜ ውስጥ የታተመ ፕሮግራምና ዜና የለም።'}
                        </p>
                      )}

                      <BarsChart points={rows} metric={barsMetric} />

                      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-muted/50 p-4 text-sm">
                        <span className="text-muted-foreground">
                          የአሁኑ ንቁ ተማሪዎች
                        </span>

                        <span className="font-bold tabular-nums">
                          {br(rows[rows.length - 1]?.studentsActive ?? 0, { cents: false }).replace(
                            'ብር ',
                            ''
                          )}{' '}
                          ተማሪዎች
                        </span>
                      </div>
                    </>
                  );
                }}
              />
            </div>
          </div>
        </section>
      )}

      {/* ================================================================
          4. APPROVALS AND QUICK ACCESS
      ================================================================= */}

      <section className="grid gap-5 lg:grid-cols-5">

        <div className="lg:col-span-3">
          <Panel
            title={UI.pendingApprovals}
            subtitle="የእርስዎን ውሳኔ የሚጠብቁ ጥያቄዎች"
            icon={HandCoins}
            action={
              canDecide && (
                <Link
                  to={ROUTES.approvals}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  ሁሉንም ይመልከቱ
                </Link>
              )
            }
          >
            {!canDecide ? (
              <div className="flex items-center gap-3 rounded-xl bg-muted/50 p-4">
                <ShieldCheck className="h-6 w-6 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  ለማጽደቅ ፈቃድ የለዎትም።
                </p>
              </div>
            ) : approvals === null ? (
              <Spinner label="ማጽደቆችን በመጫን ላይ…" />
            ) : approvals.length === 0 ? (
              <EmptyState
                icon={<CheckCircle2 className="h-7 w-7 text-emerald-500" />}
                title="የሚጠብቅ ነገር የለም"
                description="ሁሉም ጥያቄዎች ተወስነዋል።"
              />
            ) : (
              <>
                <div className="mb-4 flex items-center gap-2 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
                  <Clock3 className="h-4 w-4 shrink-0" />
                  {approvals.length} ጥያቄዎች ውሳኔ ይጠብቃሉ።
                </div>

                <div className="divide-y divide-border">
                  {approvals.slice(0, 6).map((row) => (
                    <div
                      key={row.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          <FileSearch className="h-5 w-5" />
                        </div>

                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">
                            {row.entity_label}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {row.submitter_name} · {dateTimeAm(row.submitted_at)}
                          </p>
                        </div>
                      </div>

                      <StatusBadge
                        tone={
                          row.amount && Number(row.amount) > 0
                            ? 'gold'
                            : 'info'
                        }
                      >
                        {row.action}
                      </StatusBadge>
                    </div>
                  ))}
                </div>

                <Button asChild variant="outline" className="mt-5 w-full">
                  <Link to={ROUTES.approvals}>
                    ማጽደቆችን ይክፈቱ
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </>
            )}
          </Panel>
        </div>

        {/* Quick access */}
        <div className="lg:col-span-2">
          <Panel
            title="ፈጣን መዳረሻ"
            subtitle="በቀጥታ ወደ ዋና ሥራዎች ይሂዱ"
            icon={LayoutGrid}
          >
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              {can('attendance.mark') && (
                <QuickLink
                  to={ROUTES.markAttendance}
                  icon={ClipboardCheck}
                >
                  የዛሬን መገኘት መዝግብ
                </QuickLink>
              )}

              {can('students.read') && (
                <QuickLink
                  to={ROUTES.applications}
                  icon={FileSearch}
                >
                  ማመልከቻዎችን ተመልከት
                </QuickLink>
              )}

              {can('news.write', 'website.write') && (
                <QuickLink
                  to={ROUTES.news}
                  icon={Newspaper}
                >
                  ዜና አዘጋጅ
                </QuickLink>
              )}

              {canSeeMoney && (
                <QuickLink
                  to={ROUTES.finance}
                  icon={Wallet}
                >
                  የፋይናንስ መዝገብ
                </QuickLink>
              )}

              <QuickLink to="/" icon={Globe}>
                ድረ ገጹን ተመልከት
              </QuickLink>
            </ul>
          </Panel>
        </div>
      </section>

      {/* ================================================================
          5. ACTIVITY
      ================================================================= */}

      {kpis && (
        <section className="space-y-4">
          <SectionHeading
            title="የድርጅቱ እንቅስቃሴ"
            subtitle="የድረ ገጽ፣ መገኘትና መልእክት አጠቃላይ መረጃ"
            icon={Activity}
          />

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

            <Metric
              label="አዲስ መልእክቶች"
              value={n('unread_messages')}
              tone={n('unread_messages') > 0 ? 'info' : 'neutral'}
              hint="ያልተነበቡ"
            />

            <Metric
              label="የታተሙ ዜናዎች"
              value={n('content_published')}
              hint={`${n('content_drafts')} ረቂቅ`}
            />

            <Metric
              label="የሚመጡ ፕሮግራሞች"
              value={n('events_upcoming')}
              hint="የወደፊት ፕሮግራሞች"
            />

            <Metric
              label="የመገኘት መጠን"
              value={pct(n('attendance_rate'))}
              hint="ባለፉት 60 ቀናት"
            />
          </div>
        </section>
      )}

      {/* Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5 text-xs text-muted-foreground">
        <p>
          {UI.appName} · Management Dashboard
        </p>

        <p className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          የዳታቤዝ ግንኙነት ተዘጋጅቷል
        </p>
      </div>
    </div>
  );
}
