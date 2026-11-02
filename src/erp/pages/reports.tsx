// ሪፖርትና ትንተና — reports and analytics.
//
// The migrations define no `report_*` function, so these four screens aggregate
// real rows in this file and use the RPCs that do exist: `finance_summary`,
// `attendance_summary`, `content_meta` and `pending_approvals`, plus
// `dashboard_kpis` for the website counters. Every chart is drawn from the same
// numbers the table underneath it prints — a bar is never a decoration — and a
// table the caller may not read is reported as an Amharic note instead of
// quietly becoming a zero.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Download, Printer, RefreshCw, Table2 } from 'lucide-react';

import { useAuth } from '@/components/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Field, Select } from '@/components/ui/form';
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
import { Tabs, TabPanel } from '@/components/ui/tabs';
import {
  ETH_MONTHS,
  ethMonthLength,
  ethToday,
  ethYearLabel,
  ethYearOf,
  formatEthiopian,
  formatGregorian,
  fromEthiopian,
  toEthiopian,
  type EthDate,
} from '@/lib/ethiopian';
import { friendlyError } from '@/lib/errors';
import { exportCsv, exportExcel, printDocument } from '@/lib/export';
import { br, dateAm, fileSize, num, pct, truncate } from '@/lib/format';
import { ATTENDANCE_STATUS, TRANSACTION_TYPE, UI } from '@/lib/i18n';
import { fetchKpis, kpiNumber } from '@/lib/kpis';
import type { PermissionKey } from '@/lib/permissions';
import { callFn, fetchRows, listRows, supabase, type Row } from '@/lib/supabase';
import { cn } from '@/lib/utils';

// ─── shared plumbing ─────────────────────────────────────────────────────────

/** `content_meta`, `finance_summary` and `attendance_summary` all return `Json`. */
type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function numOf(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function strOf(value: unknown, fallback = ''): string {
  return value === null || value === undefined ? fallback : String(value);
}

/** A table this person may not read, or a row set that came back empty. */
type LoadNote = { source: string; message: string };

/** One read that must not sink the whole report: keep going, collect the reason. */
async function gather<T>(source: string, run: () => Promise<T>, notes: LoadNote[], fallback: T): Promise<T> {
  try {
    return await run();
  } catch (error) {
    notes.push({ source, message: friendlyError(error) });
    return fallback;
  }
}

function Notes({ notes }: { notes: readonly LoadNote[] }) {
  if (notes.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>ከፊል ብቻ የተገኘ መረጃ</CardTitle>
        <CardDescription>
          ከተመዘገቡት መንጠረዦች መካከል ለዚህ መለያ በር የተከለከሉ ካሉ እዚህ ይገለጻሉ፻ ከላይ ያሉት ቁጥሮች የተገኙትን ብቻ ይወክላሉ።
        </CardDescription>
      </CardHeader>
      <CardBody className="space-y-2">
        {notes.map((note) => (
          <ErrorNote key={`${note.source}-${note.message}`} message={`“${note.source}”፦ ${note.message}`} />
        ))}
      </CardBody>
    </Card>
  );
}

type LoadState<T> = { data: T | null; loading: boolean; error: string | null; reload: () => void };

/** Reads on mount and whenever `deps` change, while the caller is allowed in. */
function useLoad<T>(loader: () => Promise<T>, deps: readonly unknown[], enabled: boolean): LoadState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [nonce, setNonce] = useState(0);
  const run = useRef(loader);
  run.current = loader;

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    run
      .current()
      .then((value) => {
        if (alive) {
          setData(value);
          setLoading(false);
        }
      })
      .catch((failure: unknown) => {
        if (alive) {
          setError(friendlyError(failure));
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce, enabled]);

  return { data, loading, error, reload: () => setNonce((value) => value + 1) };
}

/** Every report screen opens with the same three states. */
function ScreenFrame(props: {
  allowed: boolean;
  need: string;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  loadingLabel?: string;
  children: ReactNode;
}) {
  if (!props.allowed) {
    return (
      <div className="space-y-4">
        <PageHeading title="ሪፖርት" description={UI.reports} />
        <EmptyState
          title={UI.permissionDenied}
          description={`ይህ ሪፖርት “${props.need}” ፍቃድ ይጠይቃል። ለአቅም ያለዎትን ክፍል ይጠይቁ።`}
        />
      </div>
    );
  }
  return (
    <div className="space-y-5">
      {props.children}
      {props.loading ? <Spinner label={props.loadingLabel ?? UI.loading} /> : null}
      {props.error ? <ErrorNote message={props.error} onRetry={props.onRetry} /> : null}
    </div>
  );
}

function ReloadButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick} disabled={disabled} icon={<RefreshCw className="h-4 w-4" aria-hidden />}>
      {UI.tryAgain}
    </Button>
  );
}

// ─── the dependency-free charts ──────────────────────────────────────────────

type Measure = 'count' | 'money' | 'percent' | 'bytes';

function fmt(measure: Measure, value: number): string {
  if (measure === 'money') return br(value);
  if (measure === 'percent') return pct(value);
  if (measure === 'bytes') return fileSize(value);
  return num(value);
}

type Datum = { key: string; label: string; value: number; note?: string; tone?: Tone };

const BAR_CLASS: Record<Tone, string> = {
  neutral: 'bg-muted-foreground/45',
  info: 'bg-sky-500',
  success: 'bg-leaf',
  warning: 'bg-amber-500',
  danger: 'bg-destructive',
  gold: 'bg-gold',
};

const SVG_FILL: Record<Tone, string> = {
  neutral: 'fill-muted-foreground',
  info: 'fill-sky-500',
  success: 'fill-leaf',
  warning: 'fill-amber-500',
  danger: 'fill-destructive',
  gold: 'fill-gold',
};

/** Horizontal ranking bars: the widest bar is the largest value in the set. */
function RankBars({
  items,
  measure = 'count',
  emptyTitle,
}: {
  items: readonly Datum[];
  measure?: Measure;
  emptyTitle: string;
}) {
  const max = Math.max(0, ...items.map((item) => item.value));
  if (items.length === 0 || max <= 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyTitle}</p>;
  }
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.key}>
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="min-w-0 font-medium">{item.label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {fmt(measure, item.value)}
              {item.note ? ` · ${item.note}` : ''}
            </span>
          </div>
          <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn('h-full rounded-full', BAR_CLASS[item.tone ?? 'neutral'])}
              style={{ width: `${Math.max(1.5, (item.value / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

type Series = { key: string; label: string; tone: Tone; values: readonly number[] };

/** Grouped SVG columns with a scaled axis — every rect is one measured number. */
function ColumnChart({
  groups,
  series,
  measure = 'count',
  emptyTitle,
}: {
  groups: readonly { key: string; label: string }[];
  series: readonly Series[];
  measure?: Measure;
  emptyTitle: string;
}) {
  const max = Math.max(0, ...series.flatMap((item) => [...item.values]));
  if (groups.length === 0 || series.length === 0 || max <= 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyTitle}</p>;
  }
  const width = 640;
  const height = 220;
  const padX = 34;
  const top = 12;
  const base = height - 34;
  const groupWidth = (width - padX - 8) / groups.length;
  const barWidth = Math.max(2, (groupWidth - 8) / series.length);
  const scale = (value: number) => (value / max) * (base - top);

  return (
    <figure className="space-y-2">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="የተለካ ቁጥሮች ሐምራዊ ንድፍ">
        {[0, 0.5, 1].map((tick) => {
          const y = base - tick * (base - top);
          return (
            <g key={tick}>
              <line x1={padX} y1={y} x2={width - 8} y2={y} className="stroke-border" strokeWidth="1" />
              <text x={2} y={y + 3} className="fill-muted-foreground text-[9px]">
                {fmt(measure, max * tick)}
              </text>
            </g>
          );
        })}
        {groups.map((group, gi) => (
          <g key={group.key}>
            {series.map((item, si) => {
              const value = numOf(item.values[gi]);
              const barHeight = scale(value);
              return (
                <rect
                  key={item.key}
                  x={padX + gi * groupWidth + 4 + si * barWidth}
                  y={base - barHeight}
                  width={Math.max(1.5, barWidth - 1.5)}
                  height={Math.max(1, barHeight)}
                  rx="1.5"
                  className={SVG_FILL[item.tone]}
                >
                  <title>{`${group.label} · ${item.label}፦ ${fmt(measure, value)}`}</title>
                </rect>
              );
            })}
            <text
              x={padX + gi * groupWidth + groupWidth / 2}
              y={height - 12}
              textAnchor="middle"
              className="fill-muted-foreground text-[9px]"
            >
              {truncate(group.label, 12)}
            </text>
          </g>
        ))}
        <line x1={padX} y1={base} x2={width - 8} y2={base} className="stroke-border" strokeWidth="1" />
      </svg>
      <figcaption className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {series.map((item) => (
          <span key={item.key} className="flex items-center gap-1.5">
            <svg viewBox="0 0 8 8" className="h-2.5 w-2.5" aria-hidden>
              <rect x="0" y="0" width="8" height="8" rx="1.5" className={SVG_FILL[item.tone]} />
            </svg>
            {item.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

type Point = { key: string; label: string; value: number };

/** A single-series SVG line over evenly spaced points, with the real value on each dot. */
function TrendChart({
  points,
  measure = 'count',
  emptyTitle,
}: {
  points: readonly Point[];
  measure?: Measure;
  emptyTitle: string;
}) {
  const max = Math.max(0, ...points.map((point) => point.value));
  if (points.length === 0 || max <= 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyTitle}</p>;
  }
  const width = 640;
  const height = 200;
  const padX = 34;
  const top = 12;
  const base = height - 30;
  const step = points.length > 1 ? (width - padX - 10) / (points.length - 1) : 0;
  const at = (value: number) => base - (value / max) * (base - top);
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${padX + index * step} ${at(point.value)}`).join(' ');
  const every = Math.max(1, Math.ceil(points.length / 7));

  return (
    <figure className="space-y-2">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="በጊዜ ላይ የተመሠረተ መስመር ንድፍ">
        <line x1={padX} y1={base} x2={width - 10} y2={base} className="stroke-border" strokeWidth="1" />
        <line x1={padX} y1={top} x2={width - 10} y2={top} className="stroke-border" strokeWidth="1" strokeDasharray="3 3" />
        <text x={2} y={top + 4} className="fill-muted-foreground text-[9px]">
          {fmt(measure, max)}
        </text>
        <text x={2} y={base + 4} className="fill-muted-foreground text-[9px]">
          {fmt(measure, 0)}
        </text>
        <path d={path} fill="none" className="stroke-leaf" strokeWidth="2" strokeLinejoin="round" />
        {points.map((point, index) => (
          <g key={point.key}>
            <circle cx={padX + index * step} cy={at(point.value)} r="3" className={SVG_FILL.gold}>
              <title>{`${point.label}፦ ${fmt(measure, point.value)}`}</title>
            </circle>
            {index % every === 0 ? (
              <text x={padX + index * step} y={height - 8} textAnchor="middle" className="fill-muted-foreground text-[9px]">
                {truncate(point.label, 10)}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
    </figure>
  );
}

type Segment = { key: string; label: string; value: number; tone: Tone };

/** One stacked SVG bar: widths are value ÷ total, so the parts always sum. */
function StackedBar({
  segments,
  measure = 'count',
  ariaLabel,
}: {
  segments: readonly Segment[];
  measure?: Measure;
  ariaLabel: string;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  if (total <= 0) {
    return <p className="py-2 text-center text-sm text-muted-foreground">ምንም የተመዘገበ መረጃ የለም።</p>;
  }
  let cursor = 0;
  return (
    <div className="space-y-2">
      <svg viewBox="0 0 100 8" preserveAspectRatio="none" className="h-4 w-full overflow-hidden rounded" role="img" aria-label={ariaLabel}>
        {segments.map((segment) => {
          const span = (segment.value / total) * 100;
          const x = cursor;
          cursor += span;
          return span > 0 ? (
            <rect key={segment.key} x={x} y={0} width={span} height={8} className={SVG_FILL[segment.tone]}>
              <title>{`${segment.label}፦ ${fmt(measure, segment.value)}`}</title>
            </rect>
          ) : null;
        })}
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {segments.map((segment) => (
          <span key={segment.key} className="flex items-center gap-1.5">
            <svg viewBox="0 0 8 8" className="h-2.5 w-2.5" aria-hidden>
              <rect x="0" y="0" width="8" height="8" rx="1.5" className={SVG_FILL[segment.tone]} />
            </svg>
            {segment.label} {fmt(measure, segment.value)}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Ethiopian calendar date pickers ─────────────────────────────────────────

const ETH_YEAR_BACK = 12;

function isoOf(date: EthDate): string {
  return formatGregorian(fromEthiopian(date));
}

/**
 * Year / month / day in the Ethiopian calendar — the thirteen months and Geʼez
 * numerals the parish uses. The value it emits is an ISO Gregorian date, because
 * that is what the date column stores.
 */
function EthDateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
}) {
  const eth = useMemo<EthDate>(
    () => (/^\d{4}-\d{2}-\d{2}$/.test(value) ? toEthiopian(value) : ethToday()),
    [value]
  );
  const years = useMemo(() => {
    const now = ethToday().year;
    const list: number[] = [];
    for (let year = now - ETH_YEAR_BACK; year <= now + 1; year += 1) list.push(year);
    return list;
  }, []);
  const dayCount = ethMonthLength(eth.year, eth.month);

  const set = (next: Partial<EthDate>) => {
    const merged = { ...eth, ...next };
    onChange(
      isoOf({
        year: merged.year,
        month: merged.month,
        day: Math.min(merged.day, ethMonthLength(merged.year, merged.month)),
      })
    );
  };

  return (
    <Field
      label={label}
      hint={
        /^\d{4}-\d{2}-\d{2}$/.test(value)
          ? `${formatEthiopian(value, { year: true })} · ዓ.ም ዓለታዊ ${value}`
          : undefined
      }
    >
      <div className="grid grid-cols-3 gap-2">
        <Select
          aria-label={`${label} — ዓመት`}
          value={String(eth.year)}
          options={years.map((year) => ({ value: String(year), label: ethYearLabel(year) }))}
          onChange={(event) => set({ year: Number(event.target.value) })}
        />
        <Select
          aria-label={`${label} — ወር`}
          value={String(eth.month)}
          options={ETH_MONTHS.map((month, index) => ({ value: String(index + 1), label: month }))}
          onChange={(event) => set({ month: Number(event.target.value) })}
        />
        <Select
          aria-label={`${label} — ቀን`}
          value={String(Math.min(eth.day, dayCount))}
          options={Array.from({ length: dayCount }, (_unused, index) => ({
            value: String(index + 1),
            label: `${index + 1}`,
          }))}
          onChange={(event) => set({ day: Number(event.target.value) })}
        />
      </div>
    </Field>
  );
}

// ─── 1. የትምህርት ሥራ ሪፖርት — AcademicReportScreen ──────────────────────────────

/** `student_enrollments.status` — the CHECK list of the enrollments table. */
const ENROLLMENT_STATE: Record<string, string> = {
  enrolled: 'የተመዘገቡ',
  graduated: 'የጨረሱ',
  transferred: 'የተሾሙ',
  dropped: 'የተወጡ',
  suspended: 'የተገደዱ',
};

const ENROLLMENT_TONE: Record<string, Tone> = {
  enrolled: 'success',
  graduated: 'info',
  transferred: 'gold',
  dropped: 'danger',
  suspended: 'warning',
};

const GRADE_TONE: Record<string, Tone> = {
  'A+': 'success',
  A: 'success',
  B: 'info',
  C: 'warning',
  D: 'warning',
  F: 'danger',
};

/** The distribution `grade_scales` is seeded with, used when a result has no letter. */
function gradeOf(percent: number): string {
  if (percent >= 90) return 'A+';
  if (percent >= 80) return 'A';
  if (percent >= 70) return 'B';
  if (percent >= 60) return 'C';
  if (percent >= 50) return 'D';
  return 'F';
}

type ClassReport = {
  key: string;
  name: string;
  level: string;
  enrolled: number;
  left: number;
  sessions: number;
  expected: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  rate: number | null;
  graded: number;
  passed: number;
  failed: number;
  earned: number;
  possible: number;
};

type LevelReport = {
  key: string;
  name: string;
  classes: number;
  enrolled: number;
  left: number;
  sessions: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  graded: number;
  passed: number;
  failed: number;
};

type AcademicBundle = {
  years: Row<'academic_years'>[];
  year: Row<'academic_years'> | null;
  levels: Row<'class_levels'>[];
  classes: Row<'classes'>[];
  enrollments: Row<'student_enrollments'>[];
  exams: Row<'exams'>[];
  results: Row<'exam_results'>[];
  sessions: Row<'attendance_sessions'>[];
  notes: LoadNote[];
};

type AcademicModel = {
  classes: ClassReport[];
  levels: LevelReport[];
  distribution: Datum[];
  attendanceByClass: Datum[];
  enrolmentMix: Segment[];
  statuses: Segment[];
  passFail: Segment[];
  enrolled: number;
  left: number;
  graded: number;
  passPercent: number | null;
  averagePercent: number | null;
  attendanceRate: number | null;
};

function chunksOf<T>(list: readonly T[], size = 60): T[][] {
  const parts: T[][] = [];
  for (let index = 0; index < list.length; index += size) parts.push(list.slice(index, index + size));
  return parts;
}

/** Attendance rate over a set of session counters: present + late over those marked. */
function rateOf(present: number, late: number, marked: number): number | null {
  return marked > 0 ? Math.round(((present + late) / marked) * 1000) / 10 : null;
}

function buildAcademic(bundle: AcademicBundle, levelId: string): AcademicModel {
  const levelNames = new Map(bundle.levels.map((level) => [level.id, level.name_am] as const));
  const examsById = new Map(bundle.exams.map((exam) => [exam.id, exam] as const));

  const held = new Map<string, ClassReport>();
  for (const item of bundle.classes) {
    if (levelId && item.level_id !== levelId) continue;
    held.set(item.id, {
      key: item.id,
      name: item.name_am,
      level: item.level_id ? levelNames.get(item.level_id) ?? '—' : '—',
      enrolled: 0,
      left: 0,
      sessions: 0,
      expected: 0,
      present: 0,
      absent: 0,
      late: 0,
      excused: 0,
      rate: null,
      graded: 0,
      passed: 0,
      failed: 0,
      earned: 0,
      possible: 0,
    });
  }
  const track = (classId: string): ClassReport | null => {
    const row = held.get(classId) ?? null;
    return row;
  };

  const statusCount = new Map<string, number>();
  for (const enrollment of bundle.enrollments) {
    statusCount.set(enrollment.status, (statusCount.get(enrollment.status) ?? 0) + 1);
    const row = track(enrollment.class_id);
    if (!row) continue;
    if (enrollment.status === 'enrolled') row.enrolled += 1;
    else row.left += 1;
  }

  for (const session of bundle.sessions) {
    const row = track(session.class_id);
    if (!row) continue;
    row.sessions += 1;
    row.expected += numOf(session.expected_count);
    row.present += numOf(session.present_count);
    row.absent += numOf(session.absent_count);
    row.late += numOf(session.late_count);
    row.excused += numOf(session.excused_count);
    row.rate = rateOf(row.present, row.late, row.present + row.absent + row.late + row.excused);
  }

  const letters = new Map<string, number>();
  // A student's class comes from their live enrolment, so results attach to a class
  // even when the exam row itself names none.
  const classOfStudent = new Map<string, string>();
  for (const enrollment of bundle.enrollments) {
    if (enrollment.status === 'enrolled' || !classOfStudent.has(enrollment.student_id)) {
      classOfStudent.set(enrollment.student_id, enrollment.class_id);
    }
  }
  for (const result of bundle.results) {
    const marks = numOf(result.marks);
    const total = numOf(examsById.get(result.exam_id)?.total_marks);
    const percent = total > 0 ? (marks / total) * 100 : 0;
    const letter = (result.grade_letter ?? (marks > 0 || total > 0 ? gradeOf(percent) : '')).trim();
    if (letter) letters.set(letter, (letters.get(letter) ?? 0) + 1);

    const examClassId = examsById.get(result.exam_id)?.class_id;
    const row = track(examClassId ?? classOfStudent.get(result.student_id) ?? '');
    if (!row || marks <= 0) continue;
    const passMark = examsById.get(result.exam_id)?.pass_mark;
    const passed = passMark !== null && passMark !== undefined ? marks >= numOf(passMark) : letter !== 'F';
    row.graded += 1;
    if (passed) row.passed += 1;
    else row.failed += 1;
    row.earned += marks;
    row.possible += total;
  }

  const classes = [...held.values()].sort((a, b) => a.name.localeCompare(b.name, 'am'));
  const totals = classes.reduce(
    (sum, row) => ({
      enrolled: sum.enrolled + row.enrolled,
      left: sum.left + row.left,
      graded: sum.graded + row.graded,
      passed: sum.passed + row.passed,
      failed: sum.failed + row.failed,
      earned: sum.earned + row.earned,
      possible: sum.possible + row.possible,
      present: sum.present + row.present,
      late: sum.late + row.late,
      absent: sum.absent + row.absent,
      excused: sum.excused + row.excused,
    }),
    {
      enrolled: 0,
      left: 0,
      graded: 0,
      passed: 0,
      failed: 0,
      earned: 0,
      possible: 0,
      present: 0,
      late: 0,
      absent: 0,
      excused: 0,
    }
  );

  const byLevel = new Map<string, LevelReport>();
  for (const row of classes) {
    const key = row.level;
    const bucket =
      byLevel.get(key) ??
      {
        key,
        name: key,
        classes: 0,
        enrolled: 0,
        left: 0,
        sessions: 0,
        present: 0,
        absent: 0,
        late: 0,
        excused: 0,
        graded: 0,
        passed: 0,
        failed: 0,
      };
    bucket.classes += 1;
    bucket.enrolled += row.enrolled;
    bucket.left += row.left;
    bucket.sessions += row.sessions;
    bucket.present += row.present;
    bucket.absent += row.absent;
    bucket.late += row.late;
    bucket.excused += row.excused;
    bucket.graded += row.graded;
    bucket.passed += row.passed;
    bucket.failed += row.failed;
    byLevel.set(key, bucket);
  }

  const order = Object.keys(GRADE_TONE);
  const distribution = [...letters.entries()]
    .sort((a, b) => {
      const left = order.indexOf(a[0]);
      const right = order.indexOf(b[0]);
      if (left !== right && left > -1 && right > -1) return left - right;
      if (left !== right) return left === -1 ? 1 : -1;
      return a[0].localeCompare(b[0]);
    })
    .map(([letter, count]) => ({ key: letter, label: letter, value: count, tone: GRADE_TONE[letter] ?? 'neutral' }));

  const marked = totals.present + totals.absent + totals.late + totals.excused;

  // The register's five states, in the order the CHECK constraint lists them, so a
  // status nobody has yet is absent rather than a misleading zero-length bar.
  const enrolmentMix = Object.keys(ENROLLMENT_STATE)
    .map((status) => ({
      key: status,
      label: ENROLLMENT_STATE[status],
      value: statusCount.get(status) ?? 0,
      tone: ENROLLMENT_TONE[status] ?? 'neutral',
    }))
    .filter((item) => item.value > 0);

  return {
    classes,
    levels: [...byLevel.values()].sort((a, b) => a.name.localeCompare(b.name, 'am')),
    distribution,
    enrolmentMix,
    attendanceByClass: classes
      .filter((row) => row.rate !== null)
      .map((row) => ({
        key: row.key,
        label: row.name,
        value: row.rate ?? 0,
        note: `${num(row.sessions)} ክፍለ ጊዜ`,
        tone: (row.rate ?? 0) >= 75 ? 'success' : (row.rate ?? 0) >= 50 ? 'warning' : 'danger',
      })),
    statuses: [
      { key: 'present', label: ATTENDANCE_STATUS.present, value: totals.present, tone: 'success' },
      { key: 'late', label: ATTENDANCE_STATUS.late, value: totals.late, tone: 'warning' },
      { key: 'absent', label: ATTENDANCE_STATUS.absent, value: totals.absent, tone: 'danger' },
      { key: 'excused', label: ATTENDANCE_STATUS.excused, value: totals.excused, tone: 'info' },
    ],
    passFail: [
      { key: 'passed', label: 'አልፈዋል', value: totals.passed, tone: 'success' },
      { key: 'failed', label: 'ያልፈዱ', value: totals.failed, tone: 'danger' },
    ],
    enrolled: totals.enrolled,
    left: totals.left,
    graded: totals.graded,
    passPercent: totals.graded > 0 ? Math.round((totals.passed / totals.graded) * 1000) / 10 : null,
    averagePercent: totals.possible > 0 ? Math.round((totals.earned / totals.possible) * 1000) / 10 : null,
    attendanceRate: rateOf(totals.present, totals.late, marked),
  };
}

export function AcademicReportScreen() {
  const { can, identity } = useAuth();
  const allowed = can('reports.read', 'academics.read');
  const mayExport = can('reports.export');
  const [yearId, setYearId] = useState('');
  const [levelId, setLevelId] = useState('');
  const [tab, setTab] = useState('class');

  const bundle = useLoad<AcademicBundle>(
    async () => {
      const notes: LoadNote[] = [];
      const years = await listRows(supabase.from('academic_years').select('*').order('starts_on', { ascending: false }).limit(60));
      const year = years.find((item) => item.id === yearId) ?? years.find((item) => item.is_current) ?? years[0] ?? null;
      const activeId = year?.id ?? '';

      const [levels, classes, enrollments, exams, sessions] = await Promise.all([
        gather('class_levels', () => listRows(supabase.from('class_levels').select('*').order('order_no').limit(120)), notes, [] as Row<'class_levels'>[]),
        gather('classes', () => listRows(supabase.from('classes').select('*').order('name_am').limit(500)), notes, [] as Row<'classes'>[]),
        gather('student_enrollments', async () => {
          let query = supabase.from('student_enrollments').select('*');
          if (activeId) query = query.eq('academic_year_id', activeId);
          return listRows(query.limit(6000));
        }, notes, [] as Row<'student_enrollments'>[]),
        gather('exams', async () => {
          let query = supabase.from('exams').select('*');
          if (activeId) query = query.eq('academic_year_id', activeId);
          return listRows(query.order('exam_on', { ascending: false }).limit(1000));
        }, notes, [] as Row<'exams'>[]),
        gather('attendance_sessions', async () => {
          let query = supabase.from('attendance_sessions').select('*');
          if (year?.starts_on) query = query.gte('taken_on', year.starts_on);
          if (year?.ends_on) query = query.lte('taken_on', year.ends_on);
          return listRows(query.order('taken_on', { ascending: false }).limit(4000));
        }, notes, [] as Row<'attendance_sessions'>[]),
      ]);

      const results: Row<'exam_results'>[] = [];
      const examIds = exams.map((exam) => exam.id);
      for (const part of chunksOf(examIds)) {
        results.push(
          ...(await gather(
            'exam_results',
            () => listRows(supabase.from('exam_results').select('*').in('exam_id', part).limit(5000)),
            notes,
            [] as Row<'exam_results'>[]
          ))
        );
        // One read of the register is enough for the report; a closed table is a note.
        if (notes.some((note) => note.source === 'exam_results')) break;
      }

      return { years, year, levels, classes, enrollments, exams, results, sessions, notes };
    },
    [yearId],
    allowed
  );

  const model = useMemo(
    () => (bundle.data ? buildAcademic(bundle.data, levelId) : null),
    [bundle.data, levelId]
  );

  const rows = model?.classes ?? [];
  const columns: Column<ClassReport>[] = [
    { key: 'name', header: 'ክፍል', sortable: true, value: (row) => row.name },
    { key: 'level', header: 'ደረጃ', sortable: true, hideBelow: 'sm', value: (row) => row.level },
    { key: 'enrolled', header: 'ተመዘጋቢ', align: 'end', sortable: true, value: (row) => row.enrolled, cell: (row) => num(row.enrolled) },
    { key: 'left', header: 'ያቋርጠው', align: 'end', hideBelow: 'lg', value: (row) => row.left, cell: (row) => num(row.left) },
    { key: 'sessions', header: 'ክፍለ ጊዜ', align: 'end', hideBelow: 'md', value: (row) => row.sessions },
    {
      key: 'rate',
      header: 'የመገኘት መጠን',
      align: 'end',
      sortable: true,
      value: (row) => row.rate,
      cell: (row) => (row.rate === null ? '—' : <StatusBadge tone={row.rate >= 75 ? 'success' : row.rate >= 50 ? 'warning' : 'danger'}>{pct(row.rate)}</StatusBadge>),
    },
    { key: 'graded', header: 'ውጤት', align: 'end', hideBelow: 'md', value: (row) => row.graded },
    { key: 'passed', header: 'አልፈዋል', align: 'end', value: (row) => row.passed },
    { key: 'failed', header: 'ያልፈዱ', align: 'end', value: (row) => row.failed, cell: (row) => (row.failed > 0 ? <span className="font-medium text-destructive">{num(row.failed)}</span> : '0') },
    {
      key: 'average',
      header: 'አማካይ %',
      align: 'end',
      hideBelow: 'lg',
      value: (row) => (row.possible > 0 ? row.earned / row.possible : null),
      cell: (row) => (row.possible > 0 ? pct((row.earned / row.possible) * 100) : '—'),
    },
  ];

  const yearLabel = bundle.data?.year ? `${bundle.data.year.label_am}${bundle.data.year.eth_year ? ` · ${ethYearLabel(bundle.data.year.eth_year)}` : ''}` : UI.all;

  const exportWorkbook = () => {
    if (!model) return;
    exportExcel(
      [
        {
          name: 'በክፍል',
          columns: [
            { header: 'ክፍል', key: 'name' },
            { header: 'ደረጃ', key: 'level' },
            { header: 'ተመዘጋቢ', key: 'enrolled' },
            { header: 'ያቋርጠው', key: 'left' },
            { header: 'ክፍለ ጊዜ', key: 'sessions' },
            { header: 'ተገኝቷል', key: 'present' },
            { header: 'ዘግይቶ', key: 'late' },
            { header: 'አልተገኘም', key: 'absent' },
            { header: 'በፈቃድ', key: 'excused' },
            { header: 'የመገኘት %', key: 'rate' },
            { header: 'የተመዘገበ ውጤት', key: 'graded' },
            { header: 'አልፈዋል', key: 'passed' },
            { header: 'ያልፈዱ', key: 'failed' },
            { header: 'አማካይ %', key: 'average' },
          ],
          rows: model.classes.map((row) => ({
            name: row.name,
            level: row.level,
            enrolled: row.enrolled,
            left: row.left,
            sessions: row.sessions,
            present: row.present,
            late: row.late,
            absent: row.absent,
            excused: row.excused,
            rate: row.rate ?? '',
            graded: row.graded,
            passed: row.passed,
            failed: row.failed,
            average: row.possible > 0 ? Math.round((row.earned / row.possible) * 1000) / 10 : '',
          })),
        },
        {
          name: 'በደረጃ',
          columns: [
            { header: 'ደረጃ', key: 'name' },
            { header: 'ክፍሎች', key: 'classes' },
            { header: 'ተመዘጋቢ', key: 'enrolled' },
            { header: 'ያቋርጠው', key: 'left' },
            { header: 'ክፍለ ጊዜ', key: 'sessions' },
            { header: 'ተገኝቷል', key: 'present' },
            { header: 'ዘግይቶ', key: 'late' },
            { header: 'አልተገኘም', key: 'absent' },
            { header: 'በፈቃድ', key: 'excused' },
            { header: 'ውጤት', key: 'graded' },
            { header: 'አልፈዋል', key: 'passed' },
            { header: 'ያልፈዱ', key: 'failed' },
          ],
          rows: model.levels.map((row) => ({ ...row })),
        },
        {
          name: 'የውጤት ስርጭት',
          columns: [
            { header: 'ደረጃ ፊደል', key: 'letter' },
            { header: 'ተማሪዎች', key: 'count' },
          ],
          rows: model.distribution.map((item) => ({ letter: item.label, count: item.value })),
        },
      ],
      `academic-report-${yearId || 'year'}-${formatGregorian(new Date())}`
    );
    toast.success('የትምህርት ሥራ ሪፖርቱ ወደ ኤክሴል ተዘጋጅቷል።');
  };

  const exportCsvRows = () => {
    if (!model) return;
    exportCsv(
      [
        { header: 'ክፍል', key: 'name' },
        { header: 'ደረጃ', key: 'level' },
        { header: 'ተመዘጋቢ', key: 'enrolled' },
        { header: 'ያቋርጠው', key: 'left' },
        { header: 'ክፍለ ጊዜ', key: 'sessions' },
        { header: 'የመገኘት %', key: 'rate' },
        { header: 'ውጤት', key: 'graded' },
        { header: 'አልፈዋል', key: 'passed' },
        { header: 'ያልፈዱ', key: 'failed' },
      ],
      model.classes.map((row) => ({
        name: row.name,
        level: row.level,
        enrolled: row.enrolled,
        left: row.left,
        sessions: row.sessions,
        rate: row.rate ?? '',
        graded: row.graded,
        passed: row.passed,
        failed: row.failed,
      })),
      `academic-report-${yearId || 'year'}`
    );
  };

  const print = () => {
    if (!model) return;
    printDocument({
      title: 'የትምህርት ሥራ ሪፖርት',
      subtitle: `${UI.churchName} — በክፍልና በደረጃ`,
      meta: [
        { label: 'አካዳሚያዊ ዓመት', value: yearLabel },
        { label: 'ደረጃ አጣራ', value: levelId ? model.levels.find((level) => level.key === levelId)?.name ?? UI.all : UI.all },
        { label: 'ተመዘጋቢ', value: num(model.enrolled) },
        { label: 'የመገኘት መጠን', value: model.attendanceRate === null ? '—' : pct(model.attendanceRate) },
        { label: 'አማካይ ውጤት', value: model.averagePercent === null ? '—' : pct(model.averagePercent) },
        { label: 'አዘጋጅ', value: identity?.nameAm ?? '—' },
      ],
      table: {
        columns: ['ክፍል', 'ደረጃ', 'ተመዘጋቢ', 'ክፍለ ጊዜ', 'የመገኘት %', 'ውጤት', 'አልፈዋል', 'ያልፈዱ'],
        rows: model.classes.map((row) => [
          row.name,
          row.level,
          row.enrolled,
          row.sessions,
          row.rate === null ? '—' : row.rate,
          row.graded,
          row.passed,
          row.failed,
        ]),
      },
      footerNote: 'ውጤቱ ከፈተና መዝገቡና ከሐዘር መከታተያ ሰንጠረዞች በቀጥታ የተሰላ ነው።',
    });
  };

  return (
    <ScreenFrame allowed={allowed} need="reports.read ወይም academics.read" loading={bundle.loading} error={bundle.error} onRetry={bundle.reload}>
      <PageHeading
        title="የትምህርት ሥራ ሪፖርት"
        description="ለተመረጠው አካዳሚያዊ ዓመት የምዝገባ፣ የመገኘትና የውጤት ስርጭት እና የማለፊያ ቁጥሮች። በ Postgres ውስጥ ልዩ የሪፖርት አገልግሎት ስለሌለ ሁሉም ቁጥሮች ከመዝገቡ ረድፎች እዚህ ይሰላሉ።"
        actions={
          <>
            {mayExport ? (
              <>
                <Button variant="outline" size="sm" onClick={exportWorkbook} disabled={bundle.loading || rows.length === 0} icon={<Download className="h-4 w-4" aria-hidden />}>
                  {UI.exportExcel}
                </Button>
                <Button variant="outline" size="sm" onClick={exportCsvRows} disabled={bundle.loading || rows.length === 0} icon={<Table2 className="h-4 w-4" aria-hidden />}>
                  CSV
                </Button>
              </>
            ) : null}
            <Button variant="outline" size="sm" onClick={print} disabled={bundle.loading || rows.length === 0} icon={<Printer className="h-4 w-4" aria-hidden />}>
              {UI.exportPdf}
            </Button>
            <ReloadButton onClick={bundle.reload} disabled={bundle.loading} />
          </>
        }
      />

      <Card>
        <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="አካዳሚያዊ ዓመት">
            <Select
              id="academic-report-year"
              value={bundle.data?.year?.id ?? ''}
              placeholder={UI.loading}
              options={(bundle.data?.years ?? []).map((year) => ({
                value: year.id,
                label: year.eth_year ? `${year.label_am} · ${ethYearLabel(year.eth_year)}` : year.label_am,
              }))}
              onChange={(event) => setYearId(event.target.value)}
            />
          </Field>
          <Field label="ደረጃ" hint="በሁሉም ክፍሎች ላይ ያደርጋል፤ እንደገና አያነብም።">
            <Select
              id="academic-report-level"
              value={levelId}
              placeholder={UI.all}
              options={(bundle.data?.levels ?? []).map((level) => ({ value: level.id, label: level.name_am }))}
              onChange={(event) => setLevelId(event.target.value)}
            />
          </Field>
          <div className="flex items-end text-xs text-muted-foreground">
            {bundle.data?.year?.starts_on
              ? `ክፍለ ጊዜዎች ${dateAm(bundle.data.year.starts_on)} — ${bundle.data.year.ends_on ? dateAm(bundle.data.year.ends_on) : '…'} መካከል ይቆጠራሉ።`
              : 'ለዓመቱ የቀን ወሰን ስለሌለ ሁሉም የተዘጉ ክፍለ ጊዜዎች ይቆጠራሉ።'}
          </div>
        </CardBody>
      </Card>

      {model ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="የተመዘገቡ ተማሪዎች" value={num(model.enrolled)} hint={`${num(model.left)} ያቋርጣሉ`} tone="success" />
            <Metric label="የመገኘት መጠን" value={model.attendanceRate === null ? '—' : pct(model.attendanceRate)} hint="ተገኝቷል + ዘግይቶ" tone="gold" />
            <Metric label="የተመዘገበ ውጤት" value={num(model.graded)} hint={model.averagePercent === null ? undefined : `አማካይ ${pct(model.averagePercent)}`} />
            <Metric label="ማለፊያ መጠን" value={model.passPercent === null ? '—' : pct(model.passPercent)} hint={`${num(model.passFail[0]?.value ?? 0)} አልፈዋል`} tone="success" />
          </div>

          <Notes notes={bundle.data?.notes ?? []} />

          <Tabs
            className="space-y-4"
            value={tab}
            onValueChange={setTab}
            items={[
              { value: 'class', label: 'በክፍል', count: model.classes.length },
              { value: 'level', label: 'በደረጃ', count: model.levels.length },
              { value: 'result', label: 'የውጤት ስርጭት', count: model.distribution.length },
            ]}
          >
            <TabPanel value="class" className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>በክፍል የተመዘገቡ ተማሪዎች</CardTitle>
                    <CardDescription>የሐዘር መከታተያ መዝገብ ባለው ክፍል ብቻ ይወሰናል።</CardDescription>
                  </CardHeader>
                  <CardBody>
                    <RankBars
                      items={model.classes.map((row) => ({ key: row.key, label: row.name, value: row.enrolled, tone: 'success' as Tone }))}
                      emptyTitle="ለዚህ ዓመት የተመዘገበ ተማሪ የለም።"
                    />
                  </CardBody>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>የመገኘት መጠን በክፍል</CardTitle>
                    <CardDescription>ከሐዘር መከታተያ ቆጣሪዎች (present + late ÷ የተመዘገቡት)።</CardDescription>
                  </CardHeader>
                  <CardBody>
                    <RankBars items={model.attendanceByClass} measure="percent" emptyTitle="ለተመረጠው ዓመት የተዘጋ ክፍለ ጊዜ የለም።" />
                  </CardBody>
                </Card>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>የሁኔታ አጠቃላይ ስርጭት</CardTitle>
                    <CardDescription>በምዝገባው ውስጥ ያሉ አራቱ የሐዘር ሁኔታዎች።</CardDescription>
                  </CardHeader>
                  <CardBody>
                    <StackedBar segments={model.statuses} ariaLabel="የሐዘር ሁኔታ ስርጭት" />
                  </CardBody>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>የምዝገባ ሁኔታ ስርጭት</CardTitle>
                    <CardDescription>እያንዳንዱ ተማሪ በሌላ ዓመት ሲተሳፈር ያለበትን ደረጃ ይከተላል።</CardDescription>
                  </CardHeader>
                  <CardBody>
                    <StackedBar segments={model.enrolmentMix} ariaLabel="የምዝገባ ሁኔታ ስርጭት" />
                  </CardBody>
                </Card>
              </div>
              <DataTable
                rows={model.classes}
                columns={columns}
                rowKey={(row) => row.key}
                loading={bundle.loading}
                error={bundle.error}
                onRetry={bundle.reload}
                pageSize={20}
                caption="በክፍል"
                emptyTitle="ምንም ክፍል አልተገኘም"
                emptyDescription="ለተመረጠው ዓመትና ደረጃ ምንም ክፍል የለም።"
              />
            </TabPanel>

            <TabPanel value="level" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>ተማሪ በደረጃ</CardTitle>
                  <CardDescription>እያንዳንዱ የክፍል መረጃ በደረጃው ተደምሯል።</CardDescription>
                </CardHeader>
                <CardBody>
                  <RankBars
                    items={model.levels.map((row) => ({ key: row.key, label: row.name, value: row.enrolled, note: `${num(row.classes)} ክፍል`, tone: 'gold' as Tone }))}
                    emptyTitle="ምንም ደረጃ መረጃ የለውም።"
                  />
                </CardBody>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>ማለፍና መደፈፍ በደረጃ</CardTitle>
                  <CardDescription>ከፈተና ውጤት መዝገቡ የተዘጋጀ።</CardDescription>
                </CardHeader>
                <CardBody>
                  <ColumnChart
                    groups={model.levels.map((row) => ({ key: row.key, label: row.name }))}
                    series={[
                      { key: 'passed', label: 'አልፈዋል', tone: 'success', values: model.levels.map((row) => row.passed) },
                      { key: 'failed', label: 'ያልፈዱ', tone: 'danger', values: model.levels.map((row) => row.failed) },
                    ]}
                    emptyTitle="የተመዘገበ የፈተና ውጤት የለም።"
                  />
                </CardBody>
              </Card>
              <DataTable
                rows={model.levels}
                columns={[
                  { key: 'name', header: 'ደረጃ', sortable: true },
                  { key: 'classes', header: 'ክፍሎች', align: 'end', value: (row) => row.classes },
                  { key: 'enrolled', header: 'ተመዘጋቢ', align: 'end', sortable: true, value: (row) => row.enrolled },
                  { key: 'left', header: 'ያቋርጠው', align: 'end', hideBelow: 'md', value: (row) => row.left },
                  { key: 'sessions', header: 'ክፍለ ጊዜ', align: 'end', hideBelow: 'lg', value: (row) => row.sessions },
                  {
                    key: 'rate',
                    header: 'የመገኘት መጠን',
                    align: 'end',
                    value: (row) => (row.present + row.absent + row.late + row.excused > 0 ? ((row.present + row.late) / (row.present + row.absent + row.late + row.excused)) * 100 : null),
                    cell: (row) => {
                      const marked = row.present + row.absent + row.late + row.excused;
                      return marked > 0 ? pct(((row.present + row.late) / marked) * 100) : '—';
                    },
                  },
                  { key: 'graded', header: 'ውጤት', align: 'end', value: (row) => row.graded },
                  { key: 'passed', header: 'አልፈዋል', align: 'end', value: (row) => row.passed },
                  { key: 'failed', header: 'ያልፈዱ', align: 'end', value: (row) => row.failed },
                ]}
                rowKey={(row) => row.key}
                loading={bundle.loading}
                pageSize={20}
                caption="በደረጃ"
                emptyTitle="ምንም ደረጃ የለም"
              />
            </TabPanel>

            <TabPanel value="result" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>የደረጃ ፊደል ስርጭት</CardTitle>
                  <CardDescription>
                    ፊደል በመዝገቡ ላይ ከሌለ ከፐርሰንቱ በዚሁ ገጽ ይሰላል (A+ ≥ 90% እስከ F)።
                  </CardDescription>
                </CardHeader>
                <CardBody>
                  <ColumnChart
                    groups={model.distribution.map((item) => ({ key: item.key, label: item.label }))}
                    series={[{ key: 'count', label: 'ተማሪዎች', tone: 'info', values: model.distribution.map((item) => item.value) }]}
                    emptyTitle="ለተመረጠው ዓመት የተመዘገበ የፈተና ውጤት የለም።"
                  />
                </CardBody>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>ማለፊያ</CardTitle>
                  <CardDescription>ከፈተናው የማለፊያ ነጥብ (pass_mark) ጋር በማወዳደር።</CardDescription>
                </CardHeader>
                <CardBody className="space-y-4">
                  <StackedBar segments={model.passFail} ariaLabel="የማለፊያ ስርጭት" />
                  <p className="text-xs text-muted-foreground">
                    አጠቃላይ አማካይ {model.averagePercent === null ? '—' : pct(model.averagePercent)} · ከተመዘገቡ {num(model.graded)} ውጤቶች
                  </p>
                </CardBody>
              </Card>
              <DataTable
                rows={model.distribution}
                columns={[
                  { key: 'label', header: 'ደረጃ ፊደል', sortable: true },
                  { key: 'value', header: 'ተማሪዎች', align: 'end', sortable: true, value: (row) => row.value, cell: (row) => num(row.value) },
                  {
                    key: 'share',
                    header: 'ድርሻ',
                    align: 'end',
                    value: (row) => (model.graded > 0 ? (row.value / model.graded) * 100 : 0),
                    cell: (row) => (model.graded > 0 ? pct((row.value / model.graded) * 100) : '—'),
                  },
                ]}
                rowKey={(row) => row.key}
                loading={bundle.loading}
                pageSize={15}
                caption="የውጤት ስርጭት"
                emptyTitle="ውጤት አልተመዘገበም"
              />
            </TabPanel>
          </Tabs>
        </>
      ) : null}
    </ScreenFrame>
  );
}

// ─── 2. ሒሳብና ገንዘብ ሪፖርት — FinanceReportScreen ───────────────────────────────

/** `donations.status` — the CHECK list of the donations table. */
const DONATION_STATE: Record<string, string> = {
  pledged: 'የተሰጠ ቃል',
  partially_paid: 'በከፊል የተከፈለ',
  paid: 'የተከፈለ',
  cancelled: 'ተሰርዟል',
  refunded: 'ተመልሷል',
};

const DONATION_TONE: Record<string, Tone> = {
  pledged: 'warning',
  partially_paid: 'gold',
  paid: 'success',
  cancelled: 'danger',
  refunded: 'info',
};

const BUDGET_STATE: Record<string, string> = {
  draft: 'ቅድመ ሐሳብ',
  submitted: 'የቀረበ',
  approved: 'ጸድቋል',
  rejected: 'ውድቅ',
  closed: 'ተዘግቷል',
};

type MonthBucket = { key: string; label: string; income: number; expense: number; count: number };

type FinanceBundle = {
  summary: JsonRecord;
  transactions: Row<'transactions'>[];
  categories: Row<'finance_categories'>[];
  campaigns: Row<'donation_campaigns'>[];
  donations: Row<'donations'>[];
  budgets: Row<'budgets'>[];
  notes: LoadNote[];
};

type CampaignRow = {
  key: string;
  name: string;
  goal: number;
  paid: number;
  partial: number;
  pledged: number;
  gifts: number;
  percent: number | null;
};

type BudgetRow = {
  key: string;
  period: string;
  category: string;
  allocated: number;
  actual: number;
  variance: number;
  status: string;
};

type FinanceModel = {
  income: number;
  expense: number;
  net: number;
  donationTotal: number;
  pendingCount: number;
  categoryFromFn: Datum[];
  categoryFromRows: Datum[];
  uncategorised: { count: number; amount: number };
  months: MonthBucket[];
  campaigns: CampaignRow[];
  donationMix: Segment[];
  budgets: BudgetRow[];
};

/** Ethiopian month a `date` column value falls in — the bucket reports are grouped by. */
function ethMonthKey(iso: string): { key: string; year: number; month: number } {
  const eth = toEthiopian(iso.slice(0, 10));
  return { key: `${eth.year}-${String(eth.month).padStart(2, '0')}`, year: eth.year, month: eth.month };
}

function monthLabel(year: number, month: number): string {
  return `${ETH_MONTHS[month - 1] ?? '?'} ${String(year).slice(-2)}`;
}

/** `finance_summary.by_category` is a jsonb object keyed by the category name. */
function categoryTotals(summary: JsonRecord): Datum[] {
  return Object.entries(asRecord(summary.by_category))
    .map(([name, value]) => ({ key: name, label: name, value: numOf(value), tone: 'gold' as Tone }))
    .sort((a, b) => b.value - a.value);
}

function buildFinance(bundle: FinanceBundle): FinanceModel {
  const names = new Map(bundle.categories.map((category) => [category.id, category.name_am] as const));
  const approved = bundle.transactions.filter((row) => row.status === 'approved');

  const months = new Map<string, MonthBucket>();
  const localCategory = new Map<string, number>();
  let income = 0;
  let expense = 0;
  let uncategorisedCount = 0;
  let uncategorisedAmount = 0;

  for (const row of approved) {
    const amount = numOf(row.amount);
    const found = ethMonthKey(row.occurred_on);
    const held = months.get(found.key) ?? {
      key: found.key,
      label: monthLabel(found.year, found.month),
      income: 0,
      expense: 0,
      count: 0,
    };
    held.count += 1;
    if (row.type === 'income') {
      held.income += amount;
      income += amount;
    } else if (row.type === 'expense') {
      held.expense += amount;
      expense += amount;
    }
    months.set(found.key, held);

    if (row.category_id) {
      const name = names.get(row.category_id) ?? row.category_id.slice(0, 8);
      localCategory.set(name, (localCategory.get(name) ?? 0) + amount);
    } else {
      uncategorisedCount += 1;
      uncategorisedAmount += amount;
    }
  }

  const spentByCategory = new Map<string, number>();
  let spentTotal = 0;
  for (const row of approved) {
    if (row.type !== 'expense') continue;
    spentTotal += numOf(row.amount);
    if (row.category_id) {
      spentByCategory.set(row.category_id, (spentByCategory.get(row.category_id) ?? 0) + numOf(row.amount));
    }
  }

  return {
    income: numOf(bundle.summary.income) || income,
    expense: numOf(bundle.summary.expense) || expense,
    net: numOf(bundle.summary.net) || income - expense,
    donationTotal: numOf(bundle.summary.donations),
    pendingCount: numOf(bundle.summary.pending_count),
    categoryFromFn: categoryTotals(bundle.summary),
    categoryFromRows: [...localCategory.entries()]
      .map(([name, value]) => ({ key: name, label: name, value, tone: 'success' as Tone }))
      .sort((a, b) => b.value - a.value),
    uncategorised: { count: uncategorisedCount, amount: uncategorisedAmount },
    months: [...months.values()].sort((a, b) => a.key.localeCompare(b.key)),
    campaigns: bundle.campaigns.map((campaign) => {
      const gifts = bundle.donations.filter((donation) => donation.campaign_id === campaign.id);
      const paid = gifts.filter((d) => d.status === 'paid').reduce((sum, d) => sum + numOf(d.amount), 0);
      const partial = gifts
        .filter((d) => d.status === 'partially_paid')
        .reduce((sum, d) => sum + numOf(d.amount), 0);
      const pledged = gifts.filter((d) => d.status === 'pledged').reduce((sum, d) => sum + numOf(d.amount), 0);
      const goal = numOf(campaign.goal_amount);
      return {
        key: campaign.id,
        name: campaign.name_am,
        goal,
        paid,
        partial,
        pledged,
        gifts: gifts.length,
        percent: goal > 0 ? Math.round(((paid + partial) / goal) * 1000) / 10 : null,
      };
    }),
    donationMix: Object.keys(DONATION_STATE)
      .map((status) => ({
        key: status,
        label: DONATION_STATE[status],
        value: bundle.donations.filter((donation) => donation.status === status).length,
        tone: DONATION_TONE[status] ?? 'neutral',
      }))
      .filter((item) => item.value > 0),
    budgets: bundle.budgets.map((budget) => {
      const planned = numOf(budget.planned_amount);
      const approvedAmount = budget.approved_amount === null || budget.approved_amount === undefined ? null : numOf(budget.approved_amount);
      const allocated = approvedAmount ?? planned;
      const actual = budget.category_id ? spentByCategory.get(budget.category_id) ?? 0 : spentTotal;
      return {
        key: budget.id,
        period: budget.period_label_am,
        category: budget.category_id ? names.get(budget.category_id) ?? '—' : 'አጠቃላይ',
        allocated,
        actual,
        variance: allocated - actual,
        status: budget.status,
      };
    }),
  };
}

export function FinanceReportScreen() {
  const { can, identity } = useAuth();
  const allowed = can('reports.read', 'finance.read');
  const mayExport = can('reports.export', 'finance.export');
  // The ledger tables have their own RLS read grants, so asking without one is a
  // wasted query that returns nothing: the screen says which key is missing.
  const mayDonations = can('donations.read');
  const mayBudgets = can('budget.read');
  const today = useMemo(() => isoOf(ethToday()), []);
  const [from, setFrom] = useState(() => isoOf({ ...ethToday(), month: 1, day: 1 }));
  const [to, setTo] = useState(today);
  const [tab, setTab] = useState('category');

  const bundle = useLoad<FinanceBundle>(
    async () => {
      const notes: LoadNote[] = [];
      const summary = await gather('finance_summary', () => callFn('finance_summary', { p_from: from, p_to: to }), notes, null);
      const [transactions, categories] = await Promise.all([
        gather('transactions', () =>
          listRows(
            supabase
              .from('transactions')
              .select('*')
              .gte('occurred_on', from)
              .lte('occurred_on', to)
              .order('occurred_on', { ascending: false })
              .limit(6000)
          ), notes, [] as Row<'transactions'>[]),
        gather('finance_categories', () => listRows(supabase.from('finance_categories').select('*').order('sort_order').limit(300)), notes, [] as Row<'finance_categories'>[]),
      ]);

      let campaigns: Row<'donation_campaigns'>[] = [];
      let donations: Row<'donations'>[] = [];
      if (mayDonations) {
        const pair = await gather(
          'donation_campaigns',
          () =>
            Promise.all([
              listRows(supabase.from('donation_campaigns').select('*').order('created_at', { ascending: false }).limit(200)),
              listRows(supabase.from('donations').select('*').order('created_at', { ascending: false }).limit(6000)),
            ]),
          notes,
          null
        );
        campaigns = pair?.[0] ?? [];
        donations = pair?.[1] ?? [];
      } else {
        notes.push({ source: 'ልገሳ', message: 'የልገሳ መዝገብ ለማየት “donations.read” ፍቃድ ያስፈልጋል።' });
      }

      const budgets = mayBudgets
        ? await gather('budgets', () => listRows(supabase.from('budgets').select('*').order('created_at', { ascending: false }).limit(1200)), notes, [] as Row<'budgets'>[])
        : [];
      if (!mayBudgets) {
        notes.push({ source: 'በጀት', message: 'የበጀት ንጽጽር ለማየት “budget.read” ፍቃድ ያስፈልጋል።' });
      }

      return {
        summary: asRecord(summary),
        transactions,
        categories,
        campaigns,
        donations,
        budgets,
        notes,
      };
    },
    [from, to, mayDonations, mayBudgets],
    allowed
  );

  const model = useMemo(() => (bundle.data ? buildFinance(bundle.data) : null), [bundle.data]);

  const exportWorkbook = () => {
    if (!model) return;
    exportExcel(
      [
        {
          name: 'ማጠቃለያ',
          columns: [
            { header: 'ወር', key: 'label' },
            { header: 'ገቢ', key: 'income' },
            { header: 'ወጪ', key: 'expense' },
            { header: 'ንጹህ', key: 'net' },
            { header: 'ንቅናቄ ብዛት', key: 'count' },
          ],
          rows: model.months.map((month) => ({
            label: month.label,
            income: month.income,
            expense: month.expense,
            net: month.income - month.expense,
            count: month.count,
          })),
        },
        {
          name: 'በመደብ',
          columns: [
            { header: 'መደብ', key: 'name' },
            { header: 'ድምር', key: 'total' },
            { header: 'ምንጭ', key: 'source' },
          ],
          rows: [
            ...model.categoryFromFn.map((item) => ({ name: item.label, total: item.value, source: 'finance_summary' })),
            ...model.categoryFromRows
              .filter((item) => !model.categoryFromFn.some((fromFn) => fromFn.label === item.label))
              .map((item) => ({ name: item.label, total: item.value, source: 'በረድፎች የተሰላ' })),
          ],
        },
        {
          name: 'ልገሳ',
          columns: [
            { header: 'ዘመቻ', key: 'name' },
            { header: 'ግብ', key: 'goal' },
            { header: 'የተከፈለ', key: 'paid' },
            { header: 'በከፊል', key: 'partial' },
            { header: 'ቃል የተሰጠ', key: 'pledged' },
            { header: 'ስጦታ ብዛት', key: 'gifts' },
            { header: 'ዕጤት %', key: 'percent' },
          ],
          rows: model.campaigns.map((row) => ({ ...row, percent: row.percent ?? '' })),
        },
        {
          name: 'የበጀት ልዩነት',
          columns: [
            { header: 'ጊዜ', key: 'period' },
            { header: 'መደብ', key: 'category' },
            { header: 'የተመደበ', key: 'allocated' },
            { header: 'የተወጣ', key: 'actual' },
            { header: 'ልዩነት', key: 'variance' },
            { header: 'ሁኔታ', key: 'status' },
          ],
          rows: model.budgets,
        },
      ],
      `finance-report-${from}_${to}`
    );
    toast.success('የሒሳብ ሪፖርቱ ወደ ኤክሴል ተዘጋጅቷል።');
  };

  const exportLedgerCsv = () => {
    if (!bundle.data) return;
    exportCsv(
      [
        { header: 'ማጣቀሻ', key: 'ref' },
        { header: 'ዓይነት', key: 'type' },
        { header: 'መደብ', key: 'category' },
        { header: 'መጠን', key: 'amount' },
        { header: 'ቀን', key: 'on' },
        { header: 'መግለጫ', key: 'description' },
        { header: 'ሁኔታ', key: 'status' },
      ],
      bundle.data.transactions.map((row) => ({
        ref: row.ref_no,
        type: TRANSACTION_TYPE[row.type] ?? row.type,
        category: bundle.data?.categories.find((category) => category.id === row.category_id)?.name_am ?? '—',
        amount: numOf(row.amount),
        on: row.occurred_on,
        description: row.description_am,
        status: row.status,
      })),
      `finance-ledger-${from}_${to}`
    );
  };

  const print = () => {
    if (!model) return;
    printDocument({
      title: 'የሒሳብና ገንዘብ ሪፖርት',
      subtitle: `${UI.churchName} — ${dateAm(from)} እስከ ${dateAm(to)}`,
      meta: [
        { label: 'ጠቅላላ ገቢ', value: br(model.income) },
        { label: 'ጠቅላላ ወጪ', value: br(model.expense) },
        { label: 'ንጹህ', value: br(model.net) },
        { label: 'ልገሳ', value: br(model.donationTotal) },
        { label: 'አዘጋጅ', value: identity?.nameAm ?? '—' },
      ],
      table: {
        columns: ['ወር', 'ገቢ', 'ወጪ', 'ንጹህ'],
        rows: model.months.map((month) => [month.label, month.income, month.expense, month.income - month.expense]),
      },
      footerNote: 'በ Postgres የሚሰጠው finance_summary የጸደቁ ንቅናቄዎች ብቻ ይወክላል።',
    });
  };

  return (
    <ScreenFrame allowed={allowed} need="reports.read ወይም finance.read" loading={bundle.loading} error={bundle.error} onRetry={bundle.reload}>
      <PageHeading
        title="የሒሳብና ገንዘብ ሪፖርት"
        description="ገቢና ወጪ በመደብና በኢትዮጵያ ወር፣ የልገሳ ዘመቻ ውጤትና የበጀት ልዩነት። ማጠቃለያው ከ finance_summary፣ ዝርዝሩ ከራሱ ከንቅናቄ መዝገቡ ይመፃል።"
        actions={
          <>
            {mayExport ? (
              <>
                <Button variant="outline" size="sm" onClick={exportWorkbook} disabled={bundle.loading || !model} icon={<Download className="h-4 w-4" aria-hidden />}>
                  {UI.exportExcel}
                </Button>
                <Button variant="outline" size="sm" onClick={exportLedgerCsv} disabled={bundle.loading || !bundle.data} icon={<Table2 className="h-4 w-4" aria-hidden />}>
                  CSV (ዝርዝር)
                </Button>
              </>
            ) : null}
            <Button variant="outline" size="sm" onClick={print} disabled={bundle.loading || !model} icon={<Printer className="h-4 w-4" aria-hidden />}>
              {UI.exportPdf}
            </Button>
            <ReloadButton onClick={bundle.reload} disabled={bundle.loading} />
          </>
        }
      />

      <Card>
        <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <EthDateField label="ከ" value={from} onChange={setFrom} />
          <EthDateField label="እስከ" value={to} onChange={setTo} />
          <div className="flex items-end">
            <Button variant="ghost" size="sm" onClick={() => { setFrom(isoOf({ ...ethToday(), month: 1, day: 1 })); setTo(today); }}>
              {UI.reset}
            </Button>
          </div>
          <p className="flex items-end text-xs text-muted-foreground">
            ወረሀዱ በኢትዮጵያ ዘርፍ ይታዛረ፤ መዝገቡ ግን ዓለታዊ ቀን ይይዛል።
          </p>
        </CardBody>
      </Card>

      {model ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="ገቢ" value={br(model.income)} tone="success" hint="የጸደቁ ብቻ" />
            <Metric label="ወጪ" value={br(model.expense)} tone="danger" hint="የጸደቁ ብቻ" />
            <Metric label="ንጹህ" value={br(model.net)} tone="gold" />
            <Metric label="ልገሳ" value={br(model.donationTotal)} hint={`የሚጠብቁ ${num(model.pendingCount)}`} />
          </div>

          <Notes notes={bundle.data?.notes ?? []} />

          <Tabs
            className="space-y-4"
            value={tab}
            onValueChange={setTab}
            items={[
              { value: 'category', label: 'በመደብ', count: model.categoryFromFn.length || model.categoryFromRows.length },
              { value: 'month', label: 'ወር በወር', count: model.months.length },
              { value: 'donation', label: 'ልገሳ', count: model.campaigns.length },
              { value: 'budget', label: 'በጀት ልዩነት', count: model.budgets.length },
            ]}
          >
            <TabPanel value="category" className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>በመደብ — ከማጠቃለያ አገልግሎቱ</CardTitle>
                    <CardDescription>finance_summary የሚመድባቸው ድርሻ ያላቸው ንቅናቄዎች ብቻ ናቸው።</CardDescription>
                  </CardHeader>
                  <CardBody>
                    <RankBars items={model.categoryFromFn} measure="money" emptyTitle="በተመረጠው ጊዜ የጸደቀ ድርሻ ያለው ንቅናቄ የለም።" />
                  </CardBody>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>በመደብ — ከረድፎች የተሰላ</CardTitle>
                    <CardDescription>
                      ያለ መደብ ያላቸው {num(model.uncategorised.count)} ንቅናቄዎች ({br(model.uncategorised.amount)}) እዚህ ይጨምራሉ።
                    </CardDescription>
                  </CardHeader>
                  <CardBody>
                    <RankBars items={model.categoryFromRows} measure="money" emptyTitle="የተመደበ ንቅናቄ የለም።" />
                  </CardBody>
                </Card>
              </div>
              <DataTable
                rows={model.categoryFromRows}
                columns={[
                  { key: 'label', header: 'መደብ', sortable: true },
                  { key: 'value', header: 'ድምር', align: 'end', sortable: true, value: (row) => row.value, cell: (row) => br(row.value) },
                  {
                    key: 'share',
                    header: 'ድርሻ',
                    align: 'end',
                    value: (row) => row.value,
                    cell: (row) => {
                      const total = model.categoryFromRows.reduce((sum, item) => sum + item.value, 0);
                      return total > 0 ? pct((row.value / total) * 100) : '—';
                    },
                  },
                ]}
                rowKey={(row) => row.key}
                loading={bundle.loading}
                pageSize={20}
                caption="በመደብ"
                emptyTitle="ምንም ድርሽ ያለው ንቅናቄ የለም"
              />
            </TabPanel>

            <TabPanel value="month" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>ገቢና ወጪ በኢትዮጵያ ወር</CardTitle>
                  <CardDescription>እያንዳንዱ አምድ በተመረጠው ጊዜ ውስጥ የጸደቀውን ንቅናቄ ይወክላል።</CardDescription>
                </CardHeader>
                <CardBody>
                  <ColumnChart
                    groups={model.months.map((month) => ({ key: month.key, label: month.label }))}
                    series={[
                      { key: 'income', label: TRANSACTION_TYPE.income, tone: 'success', values: model.months.map((month) => month.income) },
                      { key: 'expense', label: TRANSACTION_TYPE.expense, tone: 'danger', values: model.months.map((month) => month.expense) },
                    ]}
                    measure="money"
                    emptyTitle="በተመረጠው ጊዜ የተመዘገበ የጸደቀ ንቅናቄ የለም።"
                  />
                </CardBody>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>የወር ንጹህ</CardTitle>
                  <CardDescription>ገቢ − ወጪ።</CardDescription>
                </CardHeader>
                <CardBody>
                  <TrendChart
                    points={model.months.map((month) => ({ key: month.key, label: month.label, value: month.income - month.expense }))}
                    measure="money"
                    emptyTitle="ለምስሌት የሚበቃ ወር የለም።"
                  />
                </CardBody>
              </Card>
              <DataTable
                rows={model.months}
                columns={[
                  { key: 'label', header: 'ወር', sortable: true },
                  { key: 'count', header: 'ንቅናቄ', align: 'end', value: (row) => row.count },
                  { key: 'income', header: 'ገቢ', align: 'end', sortable: true, value: (row) => row.income, cell: (row) => br(row.income) },
                  { key: 'expense', header: 'ወጪ', align: 'end', sortable: true, value: (row) => row.expense, cell: (row) => br(row.expense) },
                  {
                    key: 'net',
                    header: 'ንጹህ',
                    align: 'end',
                    sortable: true,
                    value: (row) => row.income - row.expense,
                    cell: (row) => (
                      <span className={row.income - row.expense >= 0 ? 'text-leaf' : 'text-destructive'}>{br(row.income - row.expense)}</span>
                    ),
                  },
                ]}
                rowKey={(row) => row.key}
                loading={bundle.loading}
                pageSize={18}
                caption="ወር በወር"
                emptyTitle="በተመረጠው ጊዜ ምንም የተመዘገበ የለም"
              />
            </TabPanel>

            <TabPanel value="donation" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>በዘመቻ የተሰበሰበ ልገሳ</CardTitle>
                  <CardDescription>
                    finance_summary የሚመድበው የተከፈለና በከፊል የተከፈለ ልገሳ {br(model.donationTotal)} ነው፤ ዘመቻው ድርሻው ብቻ ነው።
                  </CardDescription>
                </CardHeader>
                <CardBody>
                  <RankBars
                    items={model.campaigns.map((row) => ({
                      key: row.key,
                      label: row.name,
                      value: row.paid + row.partial,
                      note: row.percent === null ? undefined : `${pct(row.percent)} ዕጤት`,
                      tone: 'gold' as Tone,
                    }))}
                    measure="money"
                    emptyTitle="በተመረጠው ጊዜ የተከፈለ ልገሳ የለም።"
                  />
                </CardBody>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>የልገሳ ሁኔታ ስርጭት</CardTitle>
                  <CardDescription>የተሰጠ ቃል፣ በከፊል የተከፈለና የተከፈለ ስጦታዎች በብዛት።</CardDescription>
                </CardHeader>
                <CardBody>
                  <StackedBar segments={model.donationMix} ariaLabel="የልገሳ ሁኔታ ስርጭት" />
                </CardBody>
              </Card>
              <DataTable
                rows={model.campaigns}
                columns={[
                  { key: 'name', header: 'ዘመቻ', sortable: true },
                  { key: 'gifts', header: 'ስጦታ', align: 'end', value: (row) => row.gifts },
                  { key: 'goal', header: 'ግብ', align: 'end', hideBelow: 'md', value: (row) => row.goal, cell: (row) => (row.goal > 0 ? br(row.goal) : '—') },
                  { key: 'paid', header: 'የተከፈለ', align: 'end', sortable: true, value: (row) => row.paid, cell: (row) => br(row.paid) },
                  { key: 'partial', header: 'በከፊል', align: 'end', hideBelow: 'lg', value: (row) => row.partial, cell: (row) => (row.partial > 0 ? br(row.partial) : '—') },
                  { key: 'pledged', header: 'ቃል', align: 'end', hideBelow: 'lg', value: (row) => row.pledged, cell: (row) => (row.pledged > 0 ? br(row.pledged) : '—') },
                  {
                    key: 'percent',
                    header: 'ዕጤት',
                    align: 'end',
                    value: (row) => row.percent,
                    cell: (row) => (row.percent === null ? '—' : <StatusBadge tone={row.percent >= 100 ? 'success' : row.percent >= 50 ? 'gold' : 'warning'}>{pct(row.percent)}</StatusBadge>),
                  },
                ]}
                rowKey={(row) => row.key}
                loading={bundle.loading}
                pageSize={20}
                caption="ልገሳ በዘመቻ"
                emptyTitle="የልገሳ ዘመቻ መረጃ የለም"
                emptyDescription="ለዚህ መለያ የልገሳ መዝገቡ በር ላልፈቀወው ሊሆን ይችላል።"
              />
            </TabPanel>

            <TabPanel value="budget" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>የበጀት ልዩነት</CardTitle>
                  <CardDescription>
                    የተመደበው ከመደቡ በጀት (ወይም ከአጠቃላዩ)፣ የተወጣው ግን በተመረጠው ጊዜ ውስጥ ካሉ የጸደቁ ወጪዎች ነው። በጀቱ የጊዜ ወሰን ስለሌለው ልዩነቱ የጊዜ ማመጣጠን አያካትትም።
                  </CardDescription>
                </CardHeader>
                <CardBody>
                  <ColumnChart
                    groups={model.budgets.slice(0, 12).map((row) => ({ key: row.key, label: `${row.category} · ${row.period}` }))}
                    series={[
                      { key: 'allocated', label: 'የተመደበ', tone: 'info', values: model.budgets.slice(0, 12).map((row) => row.allocated) },
                      { key: 'actual', label: 'የተወጣ', tone: 'warning', values: model.budgets.slice(0, 12).map((row) => row.actual) },
                    ]}
                    measure="money"
                    emptyTitle="የበጀት መዝገብ ለዚህ መለያ በር አልተከፈተም ወይም ባዶ ነው።"
                  />
                </CardBody>
              </Card>
              <DataTable
                rows={model.budgets}
                columns={[
                  { key: 'period', header: 'ጊዜ', sortable: true },
                  { key: 'category', header: 'መደብ', sortable: true },
                  { key: 'allocated', header: 'የተመደበ', align: 'end', sortable: true, value: (row) => row.allocated, cell: (row) => br(row.allocated) },
                  { key: 'actual', header: 'የተወጣ', align: 'end', sortable: true, value: (row) => row.actual, cell: (row) => br(row.actual) },
                  {
                    key: 'variance',
                    header: 'ልዩነት',
                    align: 'end',
                    sortable: true,
                    value: (row) => row.variance,
                    cell: (row) => (
                      <span className={row.variance < 0 ? 'font-medium text-destructive' : 'text-leaf'}>
                        {row.variance < 0 ? `ከበጀት ወጪ ${br(Math.abs(row.variance))}` : br(row.variance)}
                      </span>
                    ),
                  },
                  {
                    key: 'status',
                    header: 'ሁኔታ',
                    value: (row) => row.status,
                    cell: (row) => (
                      <StatusBadge tone={row.status === 'approved' ? 'success' : row.status === 'submitted' ? 'info' : row.status === 'rejected' ? 'danger' : 'neutral'}>
                        {BUDGET_STATE[row.status] ?? row.status}
                      </StatusBadge>
                    ),
                  },
                ]}
                rowKey={(row) => row.key}
                loading={bundle.loading}
                pageSize={20}
                caption="በጀት ልዩነት"
                emptyTitle="የበጀት መዝገብ የለም"
              />
            </TabPanel>
          </Tabs>
        </>
      ) : null}
    </ScreenFrame>
  );
}

// ─── 3. የሐዘር መከታተያ ሪፖርት — AttendanceReportScreen ──────────────────────────

const SESSION_STATE: Record<string, string> = {
  open: 'ክፍት',
  closed: 'ተዘግቷል',
};

type AttendanceBundle = {
  classes: Row<'classes'>[];
  sessions: Row<'attendance_sessions'>[];
  records: Row<'attendance_records'>[];
  names: Record<string, string>;
  rpc: JsonRecord | null;
  notes: LoadNote[];
};

type ClassAttendanceRow = {
  key: string;
  name: string;
  sessions: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  marked: number;
  rate: number | null;
};

type SessionRow = {
  key: string;
  on: string;
  className: string;
  label: string;
  expected: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  rate: number | null;
  status: string;
};

type StudentAttendanceRow = {
  key: string;
  studentId: string;
  name: string;
  code: string;
  className: string;
  present: number;
  absent: number;
  late: number;
  excused: number;
  sessions: number;
  rate: number | null;
};

type DayRow = { key: string; label: string; sessions: number; present: number; absent: number; late: number; excused: number; rate: number | null };

type AttendanceModel = {
  classes: ClassAttendanceRow[];
  sessions: SessionRow[];
  students: StudentAttendanceRow[];
  days: DayRow[];
  statuses: Segment[];
  held: number;
  marked: number;
  present: number;
  absent: number;
  rate: number | null;
  weakest: StudentAttendanceRow[];
};

function buildAttendance(bundle: AttendanceBundle, classId: string, studentId: string): AttendanceModel {
  const classNames = new Map(bundle.classes.map((item) => [item.id, item.name_am] as const));
  const codes = new Map<string, string>();
  const names = new Map(Object.entries(bundle.names));

  const classes = new Map<string, ClassAttendanceRow>();
  for (const item of bundle.classes) {
    if (classId && item.id !== classId) continue;
    classes.set(item.id, {
      key: item.id,
      name: item.name_am,
      sessions: 0,
      present: 0,
      absent: 0,
      late: 0,
      excused: 0,
      marked: 0,
      rate: null,
    });
  }

  const days = new Map<string, DayRow>();
  const sessionRows: SessionRow[] = [];
  const sessionClass = new Map<string, string>();
  for (const session of bundle.sessions) {
    sessionClass.set(session.id, session.class_id);
    const row = classes.get(session.class_id) ?? null;
    if (row) {
      row.sessions += 1;
      row.present += numOf(session.present_count);
      row.absent += numOf(session.absent_count);
      row.late += numOf(session.late_count);
      row.excused += numOf(session.excused_count);
      row.marked = row.present + row.absent + row.late + row.excused;
      row.rate = rateOf(row.present, row.late, row.marked);
    }

    const on = session.taken_on.slice(0, 10);
    const day = days.get(on) ?? {
      key: on,
      label: `${ETH_MONTHS[toEthiopian(on).month - 1] ?? ''} ${toEthiopian(on).day} · ${ethYearOf(on)}`,
      sessions: 0,
      present: 0,
      absent: 0,
      late: 0,
      excused: 0,
      rate: null,
    };
    day.sessions += 1;
    day.present += numOf(session.present_count);
    day.absent += numOf(session.absent_count);
    day.late += numOf(session.late_count);
    day.excused += numOf(session.excused_count);
    day.rate = rateOf(day.present, day.late, day.present + day.absent + day.late + day.excused);
    days.set(on, day);

    sessionRows.push({
      key: session.id,
      on,
      className: classNames.get(session.class_id) ?? session.class_id.slice(0, 8),
      label: session.label_am ?? (session.session_id ? 'የተመደበ ክፍለ ጊዜ' : 'ግልጽ ያልሆነ ክፍለ ጊዜ'),
      expected: numOf(session.expected_count),
      present: numOf(session.present_count),
      absent: numOf(session.absent_count),
      late: numOf(session.late_count),
      excused: numOf(session.excused_count),
      rate: rateOf(numOf(session.present_count), numOf(session.late_count), numOf(session.present_count) + numOf(session.absent_count) + numOf(session.late_count) + numOf(session.excused_count)),
      status: session.status,
    });
  }

  const students = new Map<string, StudentAttendanceRow>();
  for (const record of bundle.records) {
    if (studentId && record.student_id !== studentId) continue;
    const cid = sessionClass.get(record.session_id) ?? '';
    if (classId && cid !== classId) continue;
    const key = `${record.student_id}|${cid}`;
    const row =
      students.get(key) ??
      ({
        key,
        studentId: record.student_id,
        name: names.get(record.student_id) ?? 'የማይታወቅ ተማሪ',
        code: codes.get(record.student_id) ?? '',
        className: classNames.get(cid) ?? '—',
        present: 0,
        absent: 0,
        late: 0,
        excused: 0,
        sessions: 0,
        rate: null,
      } as StudentAttendanceRow);
    row.sessions += 1;
    if (record.status === 'present') row.present += 1;
    else if (record.status === 'absent') row.absent += 1;
    else if (record.status === 'late') row.late += 1;
    else row.excused += 1;
    row.rate = rateOf(row.present, row.late, row.sessions);
    students.set(key, row);
  }

  const totals = [...classes.values()].reduce(
    (sum, row) => ({
      held: sum.held + row.marked,
      present: sum.present + row.present,
      late: sum.late + row.late,
      absent: sum.absent + row.absent,
      excused: sum.excused + row.excused,
    }),
    { held: 0, present: 0, late: 0, absent: 0, excused: 0 }
  );

  const fromFn = numOf(bundle.rpc?.sessions) > 0 ? numOf(bundle.rpc?.present_percent) : null;

  return {
    classes: [...classes.values()].sort((a, b) => a.name.localeCompare(b.name, 'am')),
    sessions: sessionRows.sort((a, b) => b.on.localeCompare(a.on)),
    students: [...students.values()].sort((a, b) => (a.rate ?? 100) - (b.rate ?? 100) || a.name.localeCompare(b.name, 'am')),
    days: [...days.values()].sort((a, b) => a.key.localeCompare(b.key)),
    statuses: [
      { key: 'present', label: ATTENDANCE_STATUS.present, value: totals.present, tone: 'success' },
      { key: 'late', label: ATTENDANCE_STATUS.late, value: totals.late, tone: 'warning' },
      { key: 'absent', label: ATTENDANCE_STATUS.absent, value: totals.absent, tone: 'danger' },
      { key: 'excused', label: ATTENDANCE_STATUS.excused, value: totals.excused, tone: 'info' },
    ],
    held: totals.held,
    marked: totals.held,
    present: totals.present + totals.late,
    absent: totals.absent,
    rate: studentId && fromFn !== null ? fromFn : rateOf(totals.present, totals.late, totals.held),
    weakest: [...students.values()].filter((row) => row.sessions >= 2).slice(0, 12),
  };
}

export function AttendanceReportScreen() {
  const { can } = useAuth();
  const allowed = can('reports.read', 'attendance.read');
  const mayExport = can('reports.export');
  const today = useMemo(() => isoOf(ethToday()), []);
  const [from, setFrom] = useState(() => isoOf({ ...ethToday(), month: 1, day: 1 }));
  const [to, setTo] = useState(today);
  const [classId, setClassId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('class');

  const bundle = useLoad<AttendanceBundle>(
    async () => {
      const notes: LoadNote[] = [];
      const classes = await gather(
        'classes',
        () => listRows(supabase.from('classes').select('*').order('name_am').limit(500)),
        notes,
        [] as Row<'classes'>[]
      );

      let sessionQuery = supabase
        .from('attendance_sessions')
        .select('*')
        .gte('taken_on', from)
        .lte('taken_on', to);
      if (classId) sessionQuery = sessionQuery.eq('class_id', classId);
      const sessions = await gather('attendance_sessions', () => listRows(sessionQuery.order('taken_on', { ascending: false }).limit(6000)), notes, [] as Row<'attendance_sessions'>[]);

      const records: Row<'attendance_records'>[] = [];
      for (const part of chunksOf(sessions.map((session) => session.id))) {
        const found = await gather(
          'attendance_records',
          () => listRows(supabase.from('attendance_records').select('*').in('session_id', part).limit(4000)),
          notes,
          [] as Row<'attendance_records'>[]
        );
        records.push(...found);
        if (notes.some((note) => note.source === 'attendance_records')) break;
      }

      const ids = [...new Set(records.map((record) => record.student_id))];
      const profiles: Row<'student_profiles'>[] = [];
      for (const part of chunksOf(ids, 80)) {
        profiles.push(
          ...(await gather(
            'student_profiles',
            () => listRows(supabase.from('student_profiles').select('*').in('id', part).limit(200)),
            notes,
            [] as Row<'student_profiles'>[]
          ))
        );
      }
      const names: Record<string, string> = {};
      for (const profile of profiles) names[profile.id] = profile.full_name_am;

      const rpc = studentId
        ? asRecord(
            await gather(
              'attendance_summary',
              () => callFn('attendance_summary', { p_student: studentId, p_from: from, p_to: to }),
              notes,
              null
            )
          )
        : null;

      return { classes, sessions, records, names, rpc, notes };
    },
    [from, to, classId, studentId],
    allowed
  );

  const model = useMemo(() => (bundle.data ? buildAttendance(bundle.data, classId, studentId) : null), [bundle.data, classId, studentId]);

  const options = useMemo(() => {
    const list = bundle.data ? Object.entries(bundle.data.names).map(([id, name]) => ({ id, name })) : [];
    const wanted = query.trim().toLowerCase();
    return list
      .filter((item) => !wanted || item.name.toLowerCase().includes(wanted))
      .slice(0, 300)
      .map((item) => ({ value: item.id, label: item.name }));
  }, [bundle.data, query]);

  const exportWorkbook = () => {
    if (!model) return;
    exportExcel(
      [
        {
          name: 'በክፍል',
          columns: [
            { header: 'ክፍል', key: 'name' },
            { header: 'ክፍለ ጊዜ', key: 'sessions' },
            { header: 'ተገኝቷል', key: 'present' },
            { header: 'ዘግይቶ', key: 'late' },
            { header: 'አልተገኘም', key: 'absent' },
            { header: 'በፈቃድ', key: 'excused' },
            { header: 'የመገኘት %', key: 'rate' },
          ],
          rows: model.classes,
        },
        {
          name: 'በክፍለ ጊዜ',
          columns: [
            { header: 'ቀን', key: 'on' },
            { header: 'ክፍል', key: 'className' },
            { header: 'መግለጫ', key: 'label' },
            { header: 'የሚጠበቁ', key: 'expected' },
            { header: 'ተገኝቷል', key: 'present' },
            { header: 'ዘግይቶ', key: 'late' },
            { header: 'አልተገኘም', key: 'absent' },
            { header: 'በፈቃድ', key: 'excused' },
            { header: 'ሁኔታ', key: 'status' },
          ],
          rows: model.sessions,
        },
        {
          name: 'በተማሪ',
          columns: [
            { header: 'ተማሪ', key: 'name' },
            { header: 'የመለያ ቁጥር', key: 'code' },
            { header: 'ክፍል', key: 'className' },
            { header: 'ክፍለ ጊዜ', key: 'sessions' },
            { header: 'ተገኝቷል', key: 'present' },
            { header: 'ዘግይቶ', key: 'late' },
            { header: 'አልተገኘም', key: 'absent' },
            { header: 'በፈቃድ', key: 'excused' },
            { header: 'የመገኘት %', key: 'rate' },
          ],
          rows: model.students.map((row) => ({ ...row, code: row.code, key: undefined, studentId: undefined })),
        },
      ],
      `attendance-report-${from}_${to}`
    );
    toast.success('የሐዘር መከታተያ ሪፖርቱ ወደ ኤክሴል ተዘጋጅቷል።');
  };

  const exportStudentsCsv = () => {
    if (!model) return;
    exportCsv(
      [
        { header: 'ተማሪ', key: 'name' },
        { header: 'ክፍል', key: 'className' },
        { header: 'ክፍለ ጊዜ', key: 'sessions' },
        { header: 'ተገኝቷል', key: 'present' },
        { header: 'አልተገኘም', key: 'absent' },
        { header: 'የመገኘት %', key: 'rate' },
      ],
      model.students.map((row) => ({
        name: row.name,
        className: row.className,
        sessions: row.sessions,
        present: row.present,
        absent: row.absent,
        rate: row.rate ?? '',
      })),
      `attendance-students-${from}_${to}`
    );
  };

  const print = () => {
    if (!model) return;
    printDocument({
      title: 'የሐዘር መከታተያ ሪፖርት',
      subtitle: `${UI.churchName} — ${dateAm(from)} እስከ ${dateAm(to)}`,
      meta: [
        { label: 'ክፍለ ጊዜ', value: num(model.sessions.length) },
        { label: 'የተመዘገበ መገኘት', value: num(model.marked) },
        { label: 'የመገኘት መጠን', value: model.rate === null ? '—' : pct(model.rate) },
      ],
      table: {
        columns: ['ክፍል', 'ክፍለ ጊዜ', 'ተገኝቷል', 'ዘግይቶ', 'አልተገኘም', 'በፈቃድ', 'የመገኘት %'],
        rows: model.classes.map((row) => [row.name, row.sessions, row.present, row.late, row.absent, row.excused, row.rate ?? '—']),
      },
    });
  };

  return (
    <ScreenFrame allowed={allowed} need="reports.read ወይም attendance.read" loading={bundle.loading} error={bundle.error} onRetry={bundle.reload} loadingLabel="ሐዘር መዝገብ በማንበብ ላይ…">
      <PageHeading
        title="የሐዘር መከታተያ ሪፖርት"
        description="በክፍል፣ በክፍለ ጊዜና በተማሪ የተከፋፈለ መገኘት። ቀኑ በኢትዮጵያ ዘርፍ ይመረጣል፤ የተማሪ ማጠቃለያው በ attendance_summary ይሰላል።"
        actions={
          <>
            {mayExport ? (
              <>
                <Button variant="outline" size="sm" onClick={exportWorkbook} disabled={bundle.loading || !model} icon={<Download className="h-4 w-4" aria-hidden />}>
                  {UI.exportExcel}
                </Button>
                <Button variant="outline" size="sm" onClick={exportStudentsCsv} disabled={bundle.loading || !model} icon={<Table2 className="h-4 w-4" aria-hidden />}>
                  CSV (ተማሪ)
                </Button>
              </>
            ) : null}
            <Button variant="outline" size="sm" onClick={print} disabled={bundle.loading || !model} icon={<Printer className="h-4 w-4" aria-hidden />}>
              {UI.exportPdf}
            </Button>
            <ReloadButton onClick={bundle.reload} disabled={bundle.loading} />
          </>
        }
      />

      <Card>
        <CardBody className="grid gap-4 lg:grid-cols-5">
          <EthDateField label="ከ" value={from} onChange={setFrom} />
          <EthDateField label="እስከ" value={to} onChange={setTo} />
          <Field label="ክፍል">
            <Select
              id="attendance-report-class"
              value={classId}
              placeholder={UI.all}
              options={(bundle.data?.classes ?? []).map((item) => ({ value: item.id, label: item.name_am }))}
              onChange={(event) => setClassId(event.target.value)}
            />
          </Field>
          <Field label="ተማሪ" hint="ለማጠቃለያው አንድ ተማሪ ይምረጡ።">
            <div className="space-y-2">
              <input
                className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm"
                value={query}
                placeholder={UI.search}
                aria-label="ተማሪ ፈልግ"
                onChange={(event) => setQuery(event.target.value)}
              />
              <Select
                id="attendance-report-student"
                value={studentId}
                placeholder={UI.all}
                options={options}
                onChange={(event) => setStudentId(event.target.value)}
              />
            </div>
          </Field>
          <div className="flex items-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFrom(isoOf({ ...ethToday(), month: 1, day: 1 }));
                setTo(today);
                setClassId('');
                setStudentId('');
                setQuery('');
              }}
            >
              {UI.reset}
            </Button>
          </div>
        </CardBody>
      </Card>

      {model ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="የተዘጉ ክፍለ ጊዜዎች" value={num(model.sessions.length)} tone="gold" />
            <Metric label="የተመዘገበ መገኘት" value={num(model.marked)} />
            <Metric label="አልተገኘም" value={num(model.absent)} tone="danger" />
            <Metric
              label={studentId ? 'የተመረጠው ተማሪ መገኘት' : 'አማካይ የመገኘት መጠን'}
              value={model.rate === null ? '—' : pct(model.rate)}
              tone={model.rate !== null && model.rate >= 75 ? 'success' : 'warning'}
              hint={
                studentId && bundle.data?.rpc
                  ? `${num(numOf(bundle.data.rpc.sessions))} ክፍለ ጊዜ · ${num(numOf(bundle.data.rpc.present))} ተገኝቷል`
                  : undefined
              }
            />
          </div>

          <Notes notes={bundle.data?.notes ?? []} />

          <Tabs
            className="space-y-4"
            value={tab}
            onValueChange={setTab}
            items={[
              { value: 'class', label: 'በክፍል', count: model.classes.length },
              { value: 'session', label: 'በክፍለ ጊዜ', count: model.sessions.length },
              { value: 'student', label: 'በተማሪ', count: model.students.length },
              { value: 'trend', label: 'በጊዜ', count: model.days.length },
            ]}
          >
            <TabPanel value="class" className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>የመገኘት መጠን በክፍል</CardTitle>
                    <CardDescription>ከ attendance_sessions ቆጠራዎች (present + late ÷ የተመዘገቡት)።</CardDescription>
                  </CardHeader>
                  <CardBody>
                    <RankBars
                      items={model.classes
                        .filter((row) => row.rate !== null)
                        .map((row) => ({
                          key: row.key,
                          label: row.name,
                          value: row.rate ?? 0,
                          note: `${num(row.sessions)} ክፍለ ጊዜ`,
                          tone: (row.rate ?? 0) >= 75 ? ('success' as Tone) : (row.rate ?? 0) >= 50 ? ('warning' as Tone) : ('danger' as Tone),
                        }))}
                      measure="percent"
                      emptyTitle="በተመረጠው ጊዜ የተዘጋ ክፍለ ጊዜ የለም።"
                    />
                  </CardBody>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>የሁኔታ ስርጭት</CardTitle>
                    <CardDescription>የክፍል መዝገቦች ድምር።</CardDescription>
                  </CardHeader>
                  <CardBody className="space-y-4">
                    <StackedBar segments={model.statuses} ariaLabel="የሁኔታ ስርጭት" />
                    <ColumnChart
                      groups={model.classes.slice(0, 10).map((row) => ({ key: row.key, label: row.name }))}
                      series={[
                        { key: 'present', label: ATTENDANCE_STATUS.present, tone: 'success', values: model.classes.slice(0, 10).map((row) => row.present) },
                        { key: 'absent', label: ATTENDANCE_STATUS.absent, tone: 'danger', values: model.classes.slice(0, 10).map((row) => row.absent) },
                      ]}
                      emptyTitle="ምንም የተመዘገበ መገኘት የለም።"
                    />
                  </CardBody>
                </Card>
              </div>
              <DataTable
                rows={model.classes}
                columns={[
                  { key: 'name', header: 'ክፍል', sortable: true },
                  { key: 'sessions', header: 'ክፍለ ጊዜ', align: 'end', sortable: true },
                  { key: 'present', header: 'ተገኝቷል', align: 'end', value: (row) => row.present },
                  { key: 'late', header: 'ዘግይቶ', align: 'end', hideBelow: 'md', value: (row) => row.late },
                  { key: 'absent', header: 'አልተገኘም', align: 'end', hideBelow: 'sm', value: (row) => row.absent, cell: (row) => (row.absent > 0 ? <span className="font-medium text-destructive">{num(row.absent)}</span> : '0') },
                  { key: 'excused', header: 'በፈቃድ', align: 'end', hideBelow: 'lg', value: (row) => row.excused },
                  {
                    key: 'rate',
                    header: 'የመገኘት መጠን',
                    align: 'end',
                    sortable: true,
                    value: (row) => row.rate,
                    cell: (row) => (row.rate === null ? '—' : <StatusBadge tone={row.rate >= 75 ? 'success' : row.rate >= 50 ? 'warning' : 'danger'}>{pct(row.rate)}</StatusBadge>),
                  },
                ]}
                rowKey={(row) => row.key}
                loading={bundle.loading}
                pageSize={20}
                caption="በክፍል"
                emptyTitle="ምንም ክፍል መረጃ የለውም"
              />
            </TabPanel>

            <TabPanel value="session" className="space-y-4">
              <DataTable
                rows={model.sessions}
                columns={[
                  { key: 'on', header: 'ቀን', sortable: true, value: (row) => row.on, cell: (row) => <span title={formatEthiopian(row.on)}>{dateAm(row.on)}</span> },
                  { key: 'className', header: 'ክፍል', sortable: true },
                  { key: 'label', header: 'መግለጫ', hideBelow: 'md' },
                  { key: 'expected', header: 'የሚጠበቁ', align: 'end', hideBelow: 'lg', value: (row) => row.expected },
                  { key: 'present', header: 'ተገኝቷል', align: 'end', value: (row) => row.present },
                  { key: 'absent', header: 'አልተገኘም', align: 'end', hideBelow: 'sm', value: (row) => row.absent },
                  {
                    key: 'rate',
                    header: 'መጠን',
                    align: 'end',
                    sortable: true,
                    value: (row) => row.rate,
                    cell: (row) => (row.rate === null ? '—' : pct(row.rate)),
                  },
                  {
                    key: 'status',
                    header: 'ሁኔታ',
                    hideBelow: 'md',
                    value: (row) => row.status,
                    cell: (row) => <StatusBadge tone={row.status === 'closed' ? 'success' : 'info'}>{SESSION_STATE[row.status] ?? row.status}</StatusBadge>,
                  },
                ]}
                rowKey={(row) => row.key}
                loading={bundle.loading}
                pageSize={25}
                caption="በክፍለ ጊዜ"
                emptyTitle="በተመረጠው ጊዜ የተዘጋ ክፍለ ጊዜ የለም"
                emptyDescription="ቀኖቹን ወሰን ወደ ኋላ አራዝመው ይሞክሩ።"
              />
            </TabPanel>

            <TabPanel value="student" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>ዝቅተኛ መገኘት ያላቸው ተማሪዎች</CardTitle>
                  <CardDescription>በሁለት ወይም ከዚያ በላይ ባሉ ክፍለ ጊዜዎች መሰረት።</CardDescription>
                </CardHeader>
                <CardBody>
                  <RankBars
                    items={model.weakest.map((row) => ({
                      key: row.key,
                      label: row.name,
                      value: row.rate ?? 0,
                      note: `${row.className} · ${num(row.sessions)}`,
                      tone: (row.rate ?? 0) >= 75 ? ('success' as Tone) : (row.rate ?? 0) >= 50 ? ('warning' as Tone) : ('danger' as Tone),
                    }))}
                    measure="percent"
                    emptyTitle="በእያንዳንዱ ተማሪ ደረጃ የተመዘገበ መገኘት የለም።"
                  />
                </CardBody>
              </Card>
              <DataTable
                rows={model.students}
                columns={[
                  { key: 'name', header: 'ተማሪ', sortable: true },
                  { key: 'code', header: 'የመለያ ቁጥር', hideBelow: 'md', sortable: true },
                  { key: 'className', header: 'ክፍል', hideBelow: 'sm', sortable: true },
                  { key: 'sessions', header: 'ክፍለ ጊዜ', align: 'end', sortable: true, value: (row) => row.sessions },
                  { key: 'present', header: 'ተገኝቷል', align: 'end', value: (row) => row.present },
                  { key: 'late', header: 'ዘግይቶ', align: 'end', hideBelow: 'lg', value: (row) => row.late },
                  { key: 'absent', header: 'አልተገኘም', align: 'end', value: (row) => row.absent, cell: (row) => (row.absent > 0 ? <span className="font-medium text-destructive">{num(row.absent)}</span> : '0') },
                  { key: 'excused', header: 'በፈቃድ', align: 'end', hideBelow: 'lg', value: (row) => row.excused },
                  {
                    key: 'rate',
                    header: 'የመገኘት መጠን',
                    align: 'end',
                    sortable: true,
                    value: (row) => row.rate,
                    cell: (row) => (row.rate === null ? '—' : pct(row.rate)),
                  },
                ]}
                rowKey={(row) => row.key}
                loading={bundle.loading}
                pageSize={25}
                caption="በተማሪ"
                emptyTitle="በእያንዳንዱ ተማሪ ደረጃ ለማየት attendance.read ወይም የክፍል መምህር መሆን ያስፈልጋል"
              />
            </TabPanel>

            <TabPanel value="trend" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>በቀን የተመዘገበ መገኘት</CardTitle>
                  <CardDescription>እያንዳንዱ ነጥብ በዛ ቀን ባሉ ክፍለ ጊዜዎች ድምር ነው።</CardDescription>
                </CardHeader>
                <CardBody>
                  <TrendChart
                    points={model.days.map((day) => ({ key: day.key, label: day.label, value: day.present + day.late }))}
                    emptyTitle="ለምስሌት የሚበቁ ቀናት የለም።"
                  />
                </CardBody>
              </Card>
              <DataTable
                rows={model.days}
                columns={[
                  { key: 'key', header: 'ቀን', sortable: true, value: (row) => row.key, cell: (row) => dateAm(row.key) },
                  { key: 'label', header: 'በኢትዮጵያ ዘርፍ', hideBelow: 'sm' },
                  { key: 'sessions', header: 'ክፍለ ጊዜ', align: 'end', value: (row) => row.sessions },
                  { key: 'present', header: 'ተገኝቷል', align: 'end', value: (row) => row.present },
                  { key: 'absent', header: 'አልተገኘም', align: 'end', value: (row) => row.absent },
                  { key: 'rate', header: 'መጠን', align: 'end', sortable: true, value: (row) => row.rate, cell: (row) => (row.rate === null ? '—' : pct(row.rate)) },
                ]}
                rowKey={(row) => row.key}
                loading={bundle.loading}
                pageSize={30}
                caption="በቀን"
                emptyTitle="የቀን መረጃ የለም"
              />
            </TabPanel>
          </Tabs>
        </>
      ) : null}
    </ScreenFrame>
  );
}

// ─── 4. የድረ-ገጽ ሪፖርት — WebsiteReportScreen ──────────────────────────────────

/**
 * The eleven workflow types `content_types` is seeded with. `perm` is the key the
 * table's own RLS policy reads, so the screen never asks for rows it cannot get;
 * `counter` names the view/download column that table really has.
 */
const CONTENT_REPORTS: readonly {
  key: string;
  label: string;
  perm: PermissionKey;
  counter?: { column: string; label: string };
}[] = [
  { key: 'news', label: 'ዜና', perm: 'news.read', counter: { column: 'views', label: 'ማንበብ' } },
  { key: 'event', label: 'ፕሮግራሞች', perm: 'events.read' },
  { key: 'page', label: 'ገጾች', perm: 'website.read' },
  { key: 'sermon', label: 'ንግዶች', perm: 'media.read', counter: { column: 'listen_count', label: 'ማዳመጥ' } },
  { key: 'mezmur', label: 'መዝሙሮች', perm: 'media.read', counter: { column: 'play_count', label: 'ማጫወት' } },
  { key: 'publication', label: 'ሐተሚሞች', perm: 'media.read', counter: { column: 'download_count', label: 'ማውረድ' } },
  { key: 'album', label: 'ፎቶ ማህደሮች', perm: 'gallery.read' },
  { key: 'announcement', label: 'ማስታወቂያዎች', perm: 'communication.read' },
  { key: 'faq', label: 'ጥያቄዎች', perm: 'website.read' },
  { key: 'leader', label: 'መሪዎች', perm: 'website.read' },
  { key: 'material', label: 'የትምህርት ንብረት', perm: 'academics.read', counter: { column: 'download_count', label: 'ማውረድ' } },
];

/** `pending_approvals` returns a typed row set; only the columns shown are needed. */
type AwaitingRow = {
  id: string;
  entity_table: string;
  entity_label: string;
  action: string;
  status: string;
  submitted_at: string;
};

type ContentReport = {
  key: string;
  label: string;
  table: string;
  total: number;
  published: number;
  draft: number;
  pending: number;
  archived: number;
  counterLabel: string | null;
  counter: number;
  top: { key: string; label: string; value: number }[];
  note: string | null;
};

type MediaKindRow = { key: string; kind: string; count: number; bytes: number; downloads: number };

type WebsiteBundle = {
  reports: ContentReport[];
  media: Row<'media_files'>[];
  albums: number;
  awaiting: AwaitingRow[];
  kpis: Record<string, unknown>;
  monthly: { key: string; label: string; value: number }[];
  notes: LoadNote[];
};

const STATE_TONE: Record<string, Tone> = {
  draft: 'neutral',
  submitted: 'info',
  changes_requested: 'warning',
  approved: 'success',
  published: 'gold',
  archived: 'neutral',
};

export function WebsiteReportScreen() {
  const { can, identity } = useAuth();
  const allowed = can('reports.read', 'website.read');
  const mayExport = can('reports.export');
  const [tab, setTab] = useState('content');

  const bundle = useLoad<WebsiteBundle>(
    async () => {
      const notes: LoadNote[] = [];
      const reports: ContentReport[] = [];
      const created: string[] = [];

      for (const def of CONTENT_REPORTS) {
        if (!can(def.perm)) {
          reports.push({
            key: def.key,
            label: def.label,
            table: '—',
            total: 0,
            published: 0,
            draft: 0,
            pending: 0,
            archived: 0,
            counterLabel: def.counter?.label ?? null,
            counter: 0,
            top: [],
            note: `“${def.perm}” ፍቃድ ስለሌለዎት ይህ ዐይነት አልነበበም።`,
          });
          continue;
        }

        const meta = asRecord(await gather(`content_meta(${def.key})`, () => callFn('content_meta', { p_type: def.key }), notes, null));
        const table = strOf(meta.table_name);
        if (!table) {
          notes.push({ source: def.label, message: 'በመዝገቡ ውስጥ የሰንጠረዙ ስም ስላልተገኘ አልተመዘነም።' });
          continue;
        }
        const labelColumn = strOf(meta.label_column, 'title_am');
        const stateColumn = strOf(meta.state_column, 'state');
        const select = def.counter
          ? `${labelColumn}, ${stateColumn}, created_at, ${def.counter.column}`
          : `${labelColumn}, ${stateColumn}, created_at`;

        const rows = await gather(
          table,
          () => fetchRows<Record<string, unknown>>(table, { select, limit: 3000 }),
          notes,
          [] as Record<string, unknown>[]
        );

        let published = 0;
        let draft = 0;
        let pending = 0;
        let archived = 0;
        let counter = 0;
        const measured: { key: string; label: string; value: number }[] = [];
        rows.forEach((row, index) => {
          const state = strOf(row[stateColumn], 'draft');
          if (state === 'published') published += 1;
          else if (state === 'draft') draft += 1;
          else if (state === 'archived') archived += 1;
          else pending += 1;
          const on = strOf(row.created_at);
          if (on) created.push(on);
          const value = def.counter ? numOf(row[def.counter.column]) : 0;
          if (def.counter) {
            counter += value;
            measured.push({
              key: strOf(row.id, `${table}-${index}`),
              label: strOf(row[labelColumn], `${def.label} ${index + 1}`),
              value,
            });
          }
        });

        reports.push({
          key: def.key,
          label: def.label,
          table,
          total: rows.length,
          published,
          draft,
          pending,
          archived,
          counterLabel: def.counter ? `${def.counter.label} ብዛት` : null,
          counter,
          top: measured.filter((item) => item.value > 0).sort((a, b) => b.value - a.value).slice(0, 5),
          note: rows.length === 0 ? 'በዚህ መለያ ምንም ረድፍ አልተገኘም።' : null,
        });
      }

      const media = await gather(
        'media_files',
        () => listRows(supabase.from('media_files').select('*').order('created_at', { ascending: false }).limit(4000)),
        notes,
        [] as Row<'media_files'>[]
      );

      const albums = can('gallery.read')
        ? (await gather('gallery_albums', () => listRows(supabase.from('gallery_albums').select('id').limit(1)), notes, [] as { id: string }[])).length
        : 0;

      const awaitingRaw = await gather(
        'pending_approvals',
        () => callFn('pending_approvals', { p_domain: 'content' }),
        notes,
        [] as { id: string; entity_table: string; entity_label: string; action: string; status: string; submitted_at: string }[]
      );

      const kpis = await gather('dashboard_kpis', () => fetchKpis(), notes, {} as Record<string, unknown>);

      const months = new Map<string, number>();
      for (const on of created) {
        const found = ethMonthKey(on);
        const key = found.key;
        months.set(key, (months.get(key) ?? 0) + 1);
      }

      return {
        reports,
        media,
        albums,
        awaiting: awaitingRaw,
        kpis,
        monthly: [...months.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([key, value]) => ({ key, label: monthLabel(Number(key.slice(0, 4)), Number(key.slice(5, 7))), value })),
        notes,
      };
    },
    [],
    allowed
  );

  const data = bundle.data;

  const mediaByKind = useMemo<MediaKindRow[]>(() => {
    if (!data) return [];
    const held = new Map<string, MediaKindRow>();
    for (const file of data.media) {
      const kind = file.kind || '—';
      const row = held.get(kind) ?? { key: kind, kind, count: 0, bytes: 0, downloads: 0 };
      row.count += 1;
      row.bytes += numOf(file.byte_size);
      row.downloads += numOf(file.download_count);
      held.set(kind, row);
    }
    return [...held.values()].sort((a, b) => b.bytes - a.bytes);
  }, [data]);

  const totals = useMemo(() => {
    const items = data?.reports ?? [];
    return {
      total: items.reduce((sum, row) => sum + row.total, 0),
      published: items.reduce((sum, row) => sum + row.published, 0),
      draft: items.reduce((sum, row) => sum + row.draft, 0),
      pending: items.reduce((sum, row) => sum + row.pending, 0),
      counters: items.reduce((sum, row) => sum + row.counter, 0),
      bytes: (data?.media ?? []).reduce((sum, file) => sum + numOf(file.byte_size), 0),
      downloads: (data?.media ?? []).reduce((sum, file) => sum + numOf(file.download_count), 0),
    };
  }, [data]);

  const mostRead = useMemo(
    () =>
      (data?.reports ?? [])
        .flatMap((row) => row.top.map((item) => ({ ...item, key: `${row.key}-${item.key}`, label: `${item.label} (${row.label})` })))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10),
    [data]
  );

  const exportWorkbook = () => {
    if (!data) return;
    exportExcel(
      [
        {
          name: 'በይዘት ዐይነት',
          columns: [
            { header: 'ዐይነት', key: 'label' },
            { header: 'ሰንጠረዝ', key: 'table' },
            { header: 'ጠቅላላ', key: 'total' },
            { header: 'የታወቀ', key: 'published' },
            { header: 'ቅድመ ሐሳብ', key: 'draft' },
            { header: 'በግምገማ ላይ', key: 'pending' },
            { header: 'ማህደር', key: 'archived' },
            { header: 'ቆጣሪ', key: 'counter' },
            { header: 'ማስታወሻ', key: 'note' },
          ],
          rows: data.reports.map((row) => ({ ...row, note: row.note ?? '' })),
        },
        {
          name: 'ሚዲያ',
          columns: [
            { header: 'ዓይነት', key: 'kind' },
            { header: 'ብዛት', key: 'count' },
            { header: 'መጠን (ባይት)', key: 'bytes' },
            { header: 'የማውረድ ብዛት', key: 'downloads' },
          ],
          rows: mediaByKind,
        },
        {
          name: 'ከፍተኛ የተነበቡ',
          columns: [
            { header: 'ርዕስ', key: 'label' },
            { header: 'ቆጣሪ', key: 'value' },
          ],
          rows: mostRead.map((item) => ({ key: item.key, label: item.label, value: item.value })),
        },
        {
          name: 'ማጽደቅ የሚጠብቁ',
          columns: [
            { header: 'ሰንጠረዝ', key: 'entity_table' },
            { header: 'ርዕስ', key: 'entity_label' },
            { header: 'ተግባር', key: 'action' },
            { header: 'ሁኔታ', key: 'status' },
            { header: 'የቀረበበት', key: 'submitted_at' },
          ],
          rows: data.awaiting.map((row) => ({ ...row, key: undefined })),
        },
      ],
      `website-report-${formatGregorian(new Date())}`
    );
    toast.success('የድረ-ገጽ ሪፖርቱ ወደ ኤክሴል ተዘጋጅቷል።');
  };

  const exportContentCsv = () => {
    if (!data) return;
    exportCsv(
      [
        { header: 'ዐይነት', key: 'label' },
        { header: 'ሰንጠረዝ', key: 'table' },
        { header: 'ጠቅላላ', key: 'total' },
        { header: 'የታወቀ', key: 'published' },
        { header: 'ቅድመ ሐሳብ', key: 'draft' },
        { header: 'በግምገማ ላይ', key: 'pending' },
        { header: 'ቆጣሪ ድምር', key: 'counter' },
      ],
      data.reports.map((row) => ({
        label: row.label,
        table: row.table,
        total: row.total,
        published: row.published,
        draft: row.draft,
        pending: row.pending,
        counter: row.counter,
      })),
      `website-content-${formatGregorian(new Date())}`
    );
  };

  const print = () => {
    if (!data) return;
    printDocument({
      title: 'የድረ-ገጽ ይዘት ሪፖርት',
      subtitle: UI.churchName,
      meta: [
        { label: 'አጠቃላይ ይዘት', value: num(totals.total) },
        { label: 'የታወቀ', value: num(totals.published) },
        { label: 'ቅድመ ሐሳብ', value: num(totals.draft) },
        { label: 'ቆጣሪ ድምር', value: num(totals.counters) },
        { label: 'አዘጋጅ', value: identity?.nameAm ?? '—' },
      ],
      table: {
        columns: ['ዐይነት', 'ሰንጠረዝ', 'ጠቅላላ', 'የታወቀ', 'ቅድመ ሐሳብ', 'በግምገማ ላይ', 'ቆጣሪ'],
        rows: data.reports.map((row) => [row.label, row.table, row.total, row.published, row.draft, row.pending, row.counter]),
      },
    });
  };

  return (
    <ScreenFrame allowed={allowed} need="reports.read ወይም website.read" loading={bundle.loading} error={bundle.error} onRetry={bundle.reload} loadingLabel="የድረ-ገጽ መዝገቦች በማንበብ ላይ…">
      <PageHeading
        title="የድረ-ገጽ ይዘት ሪፖርት"
        description="ለእያንዳንዱ የይዘት ዐይነት የታወቀና ቅድመ ሐሳብ ብዛት፣ የማንበብና የማውረድ ቆጣሪዎች፣ የሚዲያ መጠንና ማጽደቅ የሚጠብቁ ነገሮች። መረጃው በ content_meta ይወሰናል፣ ቆጣሪዎቹ ከራሳቸው መዝገቦች ይነበባሉ።"
        actions={
          <>
            {mayExport ? (
              <>
                <Button variant="outline" size="sm" onClick={exportWorkbook} disabled={bundle.loading || !data} icon={<Download className="h-4 w-4" aria-hidden />}>
                  {UI.exportExcel}
                </Button>
                <Button variant="outline" size="sm" onClick={exportContentCsv} disabled={bundle.loading || !data} icon={<Table2 className="h-4 w-4" aria-hidden />}>
                  CSV
                </Button>
              </>
            ) : null}
            <Button variant="outline" size="sm" onClick={print} disabled={bundle.loading || !data} icon={<Printer className="h-4 w-4" aria-hidden />}>
              {UI.exportPdf}
            </Button>
            <ReloadButton onClick={bundle.reload} disabled={bundle.loading} />
          </>
        }
      />

      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="አጠቃላይ ይዘት" value={num(totals.total)} hint={`ከ ${num(data.reports.length)} ዐይነቶች`} tone="gold" />
            <Metric label="በድረ ገጽ የታወቀ" value={num(totals.published)} hint={`ቅድመ ሐሳብ ${num(totals.draft)}`} tone="success" />
            <Metric label="የታየና የተደረገ ቆጣሪ" value={num(totals.counters)} hint={`ከፍተኛ ${num(mostRead[0]?.value ?? 0)}`} />
            <Metric
              label="ሚዲያ"
              value={num(data.media.length)}
              hint={`${fileSize(totals.bytes)} · ${num(totals.downloads)} ማውረድ`}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>ከ dashboard_kpis</CardTitle>
              <CardDescription>ይህ ማጠቃለያ ለሁሉም መለያ ተመሳሳይ ነው፤ የዜና ድርድር ብቻ ይወክላል።</CardDescription>
            </CardHeader>
            <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="የዜና ቅድመ ሐሳብ" value={num(kpiNumber(data.kpis, 'content_drafts'))} />
              <Metric label="የዜና የታወቀ" value={num(kpiNumber(data.kpis, 'content_published'))} />
              <Metric label="የሚመጡ ፕሮግራሞች" value={num(kpiNumber(data.kpis, 'events_upcoming'))} tone="info" />
              <Metric label="ማጽደቅ የሚጠብቅ" value={num(kpiNumber(data.kpis, 'approvals_pending'))} tone="warning" />
            </CardBody>
          </Card>

          <Notes notes={data.notes} />

          <Tabs
            className="space-y-4"
            value={tab}
            onValueChange={setTab}
            items={[
              { value: 'content', label: 'በይዘት ዐይነት', count: data.reports.length },
              { value: 'media', label: 'ሚዲያ', count: mediaByKind.length },
              { value: 'approval', label: 'ማጽደቅ የሚጠብቁ', count: data.awaiting.length },
            ]}
          >
            <TabPanel value="content" className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>ቆጣሪ በዐይነት</CardTitle>
                    <CardDescription>እያንዳንዱ ዐይነት የራሱን የማንበብ/ማውረድ አምድ ይጠቀማል።</CardDescription>
                  </CardHeader>
                  <CardBody>
                    <RankBars
                      items={data.reports
                        .filter((row) => row.counterLabel)
                        .map((row) => ({ key: row.key, label: row.label, value: row.counter, note: row.counterLabel ?? undefined, tone: 'gold' as Tone }))}
                      emptyTitle="የሚቆጠር ተመልካች ያለው ይዘት የለም።"
                    />
                  </CardBody>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>የታወቀና ቅድመ ሐሳብ</CardTitle>
                    <CardDescription>በእያንዳንዱ ሰንጠረዝ ውስጥ ባሉ ረድፎች የሁኔታ ድርድር።</CardDescription>
                  </CardHeader>
                  <CardBody>
                    <ColumnChart
                      groups={data.reports.filter((row) => row.total > 0).map((row) => ({ key: row.key, label: row.label }))}
                      series={[
                        {
                          key: 'published',
                          label: 'የታወቀ',
                          tone: 'success',
                          values: data.reports.filter((row) => row.total > 0).map((row) => row.published),
                        },
                        {
                          key: 'draft',
                          label: 'ቅድመ ሐሳብ',
                          tone: 'neutral',
                          values: data.reports.filter((row) => row.total > 0).map((row) => row.draft),
                        },
                        {
                          key: 'pending',
                          label: 'በግምገማ ላይ',
                          tone: 'warning',
                          values: data.reports.filter((row) => row.total > 0).map((row) => row.pending),
                        },
                      ]}
                      emptyTitle="ምንም ይዘት አልተነበበም።"
                    />
                  </CardBody>
                </Card>
              </div>
              <Card>
                <CardHeader>
                  <CardTitle>በወር የተፈጠረ ይዘት</CardTitle>
                  <CardDescription>የተነበቡ ሁሉም ዐይነቶች `created_at` በኢትዮጵያ ወር ተደምሮ ነው።</CardDescription>
                </CardHeader>
                <CardBody>
                  <TrendChart points={data.monthly} emptyTitle="ለምስሌት የሚበቃ ወር የለም።" />
                </CardBody>
              </Card>
              <DataTable
                rows={data.reports}
                columns={[
                  { key: 'label', header: 'ዐይነት', sortable: true },
                  { key: 'table', header: 'ሰንጠረዝ', hideBelow: 'md' },
                  { key: 'total', header: 'ጠቅላላ', align: 'end', sortable: true, value: (row) => row.total },
                  {
                    key: 'published',
                    header: 'የታወቀ',
                    align: 'end',
                    sortable: true,
                    value: (row) => row.published,
                    cell: (row) => <StatusBadge tone={STATE_TONE.published}>{num(row.published)}</StatusBadge>,
                  },
                  { key: 'draft', header: 'ቅድመ ሐሳብ', align: 'end', value: (row) => row.draft },
                  { key: 'pending', header: 'በግምገማ ላይ', align: 'end', hideBelow: 'sm', value: (row) => row.pending },
                  { key: 'counter', header: 'ቆጣሪ', align: 'end', sortable: true, value: (row) => row.counter, cell: (row) => (row.counterLabel ? num(row.counter) : '—') },
                  { key: 'note', header: 'ማስታወሻ', hideBelow: 'lg', cell: (row) => (row.note ? <span className="text-xs text-muted-foreground">{truncate(row.note, 60)}</span> : '—') },
                ]}
                rowKey={(row) => row.key}
                loading={bundle.loading}
                pageSize={15}
                caption="በይዘት ዐይነት"
                emptyTitle="ምንም ይዘት አልተገኘም"
              />
              {mostRead.length > 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle>ከፍተኛ የታዩ/የተወረዱ ዐሥር</CardTitle>
                    <CardDescription>በእያንዳንዱ ዐይነት ቆጣሪ መሰረት ተመርጠዋል።</CardDescription>
                  </CardHeader>
                  <CardBody>
                    <RankBars
                      items={mostRead.map((item) => ({ key: item.key, label: item.label, value: item.value, tone: 'info' as Tone }))}
                      emptyTitle="በቆጣሪ መዝገብ ምንም የታየ ወይም የተወረደ ይዘት የለም።"
                    />
                  </CardBody>
                </Card>
              ) : null}
            </TabPanel>

            <TabPanel value="media" className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Metric label="የሚዲያ ረድፎች" value={num(data.media.length)} />
                <Metric label="የማከማቸት መጠን" value={fileSize(totals.bytes)} tone="gold" />
                <Metric label="የፎቶ ማህደር ብዛት" value={num(data.albums)} hint="በgallery.read ሲከፈት" />
              </div>
              <Card>
                <CardHeader>
                  <CardTitle>በዓይነት የሚዲያ መጠንና ማውረድ</CardTitle>
                  <CardDescription>media_files `byte_size`ና `download_count` ድምር።</CardDescription>
                </CardHeader>
                <CardBody className="space-y-5">
                  <RankBars
                    items={mediaByKind.map((row) => ({ key: row.key, label: row.kind, value: row.bytes, note: `${num(row.count)} ፋይል`, tone: 'gold' as Tone }))}
                    measure="bytes"
                    emptyTitle="የሚዲያ መዝገብ ለዚህ መለያ ባዶ ነው።"
                  />
                  <ColumnChart
                    groups={mediaByKind.map((row) => ({ key: row.key, label: row.kind }))}
                    series={[
                      { key: 'downloads', label: 'ማውረድ', tone: 'success', values: mediaByKind.map((row) => row.downloads) },
                      { key: 'count', label: 'ፋይሎች', tone: 'info', values: mediaByKind.map((row) => row.count) },
                    ]}
                    emptyTitle="የተመዘገበ ማውረድ የለም።"
                  />
                </CardBody>
              </Card>
              <DataTable
                rows={mediaByKind}
                columns={[
                  { key: 'kind', header: 'ዓይነት', sortable: true },
                  { key: 'count', header: 'ብዛት', align: 'end', sortable: true },
                  { key: 'bytes', header: 'መጠን', align: 'end', sortable: true, value: (row) => row.bytes, cell: (row) => fileSize(row.bytes) },
                  { key: 'downloads', header: 'ማውረድ', align: 'end', sortable: true, value: (row) => row.downloads },
                  {
                    key: 'share',
                    header: 'የማከማቸት ድርሻ',
                    align: 'end',
                    hideBelow: 'md',
                    value: (row) => (totals.bytes > 0 ? (row.bytes / totals.bytes) * 100 : 0),
                    cell: (row) => (totals.bytes > 0 ? pct((row.bytes / totals.bytes) * 100) : '—'),
                  },
                ]}
                rowKey={(row) => row.key}
                loading={bundle.loading}
                pageSize={15}
                caption="ሚዲያ በዓይነት"
                emptyTitle="ምንም ሚዲያ የለም"
              />
            </TabPanel>

            <TabPanel value="approval" className="space-y-4">
              <Notes notes={[]} />
              <DataTable
                rows={data.awaiting}
                columns={[
                  { key: 'entity_table', header: 'ሰንጠረዝ', sortable: true },
                  { key: 'entity_label', header: 'ርዕስ', sortable: true, cell: (row) => truncate(row.entity_label, 60) },
                  { key: 'action', header: 'ተግባር', hideBelow: 'sm' },
                  { key: 'status', header: 'ሁኔታ', cell: (row) => <StatusBadge tone={STATE_TONE[row.status] ?? 'neutral'}>{row.status}</StatusBadge> },
                  { key: 'submitted_at', header: 'የቀረበበት', sortable: true, hideBelow: 'md', value: (row) => row.submitted_at, cell: (row) => dateAm(row.submitted_at) },
                ]}
                rowKey={(row) => row.id}
                loading={bundle.loading}
                pageSize={20}
                caption="ማጽደቅ የሚጠብቁ"
                emptyTitle="ማጽደቅ የሚጠብቅ ይዘት የለም"
                emptyDescription="pending_approvals ለዚህ መለያ ባዶ ሲመልስ ይህ ነው።"
              />
              <p className="text-xs text-muted-foreground">
                ዝርዝሩ የሚመጣው ከ pending_approvals (ይዘት የተባለው ወሰን ተይዞ) ነው፤ ማጽደቅ ወይም ለአስተካካይ መመለስ በ ‘{UI.pendingApprovals}’ ገጽ ይደረጋል።
              </p>
            </TabPanel>
          </Tabs>
        </>
      ) : null}
    </ScreenFrame>
  );
}
