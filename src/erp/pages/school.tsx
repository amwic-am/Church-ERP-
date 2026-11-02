// School-life screens: the roll call, the term report, the end-of-year promotion
// and the printable student ID card.
//
// These four are the parts of the ERP that cannot be a plain list-and-form screen,
// because the write is a *process*: attendance goes through `save_attendance()` so
// the session head-counts stay a recount of every record (not of what the marker may
// see), promotion goes through `run_promotion()` on an approved batch, and a card is
// a row the register keeps so a re-print never invents a new serial. Every column,
// enum value and RPC argument here was read out of `supabase/migrations` first.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Award, Check, CheckCheck, ClipboardList, CreditCard, Download, IdCard as IdCardIcon, Printer, RefreshCw, Save, Users } from 'lucide-react';

import { useAuth } from '@/components/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { CheckboxField, DateInput, Field, FormActions, Input, Select } from '@/components/ui/form';
import { ConfirmDialog } from '@/components/ui/overlay';
import { Card, CardBody, CardHeader, CardTitle, EmptyState, ErrorNote, Metric, PageHeading, Spinner, StatusBadge, type Tone } from '@/components/ui/surface';
import { Tabs, TabPanel } from '@/components/ui/tabs';
import { ATTENDANCE_STATUS, UI, enumLabel } from '@/lib/i18n';
import { isSupabaseConfigured } from '@/lib/env';
import { dateAm, dateBoth, pct } from '@/lib/format';
import { exportExcel, printDocument, qrDataUrl } from '@/lib/export';
import { addDays, formatGregorian, toGeEz, ethYearOf } from '@/lib/ethiopian';
import { friendlyError } from '@/lib/errors';
import { callFn, listRows, supabase, type Args, type Row } from '@/lib/supabase';
import type { AttendanceStatus } from '@/types/database';

// ─── shared helpers ──────────────────────────────────────────────────────────

/** The four values `public.attendance_status` allows — the enum, not a guess. */
const ATTENDANCE_KEYS: AttendanceStatus[] = ['present', 'absent', 'late', 'excused'];

const ATTENDANCE_TONE: Record<AttendanceStatus, Tone> = {
  present: 'success',
  absent: 'danger',
  late: 'warning',
  excused: 'info',
};

function isoToday(): string {
  return formatGregorian(new Date());
}

function isoOffset(days: number): string {
  return formatGregorian(addDays(new Date(), days));
}

/** Today as `YYYY-MM-DD` for a `date` column, without the timezone shuffle. */
function toIso(value: Date): string {
  return formatGregorian(value);
}

/**
 * PostgREST caps a page (Supabase serves 1000 rows by default), so an `in ()`
 * filter over a long id list is split instead of silently returning a truncation.
 */
const CHUNK = 20;

function chunksOf<T>(items: readonly T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function numberOr(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function rateOf(presentish: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((presentish / total) * 1000) / 10;
}

function Denied({ hint }: { hint: string }) {
  return (
    <EmptyState
      icon={<Users className="h-7 w-7" aria-hidden />}
      title={UI.permissionDenied}
      description={hint}
    />
  );
}

function NotConfigured() {
  return <ErrorNote message="የትምህርት መረጃዎቹ ለመቅረጥ መረጃ ማጠራቀሚያው ገና አልተገናኘም።" />;
}

/** The class and year pickers the three academic screens all need. */
function useAcademicPickers(enabled: boolean) {
  const [years, setYears] = useState<Row<'academic_years'>[]>([]);
  const [classes, setClasses] = useState<Row<'classes'>[]>([]);
  const [yearId, setYearId] = useState('');
  const [classId, setClassId] = useState('');
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const [y, c] = await Promise.all([
        listRows(supabase.from('academic_years').select('*').limit(40)),
        listRows(supabase.from('classes').select('*').eq('is_active', true).limit(400)),
      ]);
      setYears(y);
      setClasses(c);
      const current = y.find((row) => row.is_current);
      if (current) setYearId((prev) => prev || current.id);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const visibleClasses = useMemo(
    () => (yearId ? classes.filter((c) => !c.academic_year_id || c.academic_year_id === yearId) : classes),
    [classes, yearId]
  );

  return { years, classes: visibleClasses, yearId, setYearId, classId, setClassId, loading, error, reload };
}

// ─── 1 · መገኘት መመዝገብ ────────────────────────────────────────────────────────

type RosterEntry = { studentId: string; nameAm: string; code: string };
type Mark = { status: AttendanceStatus; minutesLate: string; reason: string };

const EMPTY_MARK: Mark = { status: 'present', minutesLate: '0', reason: '' };

/**
 * Roll call for one class on one day.
 *
 * `save_attendance(p_class_id, p_taken_on, p_records, p_session_id, p_label_am)` is
 * the only write path: it creates or reopens the session, upserts every record on
 * `(session_id, student_id)` and re-Counts the head-counts in the database. A
 * teacher holding only `attendance.mark` may mark a class they teach — which is
 * exactly what `teaches_class(p_class, p_user)` answers, and the same predicate the
 * row level security policies use, so the check here is a courtesy and Postgres is
 * the boundary.
 */
export function AttendanceMarkScreen() {
  const { can } = useAuth();
  const allowed = can('attendance.mark', 'attendance.write');
  const mayWriteAll = can('attendance.write');
  const pickers = useAcademicPickers(allowed && isSupabaseConfigured);

  const [takenOn, setTakenOn] = useState(isoToday());
  const [labelAm, setLabelAm] = useState('');
  const [classSessionId, setClassSessionId] = useState('');
  const [classSessions, setClassSessions] = useState<Row<'class_sessions'>[]>([]);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [session, setSession] = useState<Row<'attendance_sessions'> | null>(null);
  const [mayMarkClass, setMayMarkClass] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedSessionId, setSavedSessionId] = useState<string | null>(null);

  const { classId } = pickers;

  // The roster, any session already taken that day, and the class session to link.
  useEffect(() => {
    if (!allowed || !classId) {
      setRoster([]);
      setMarks({});
      setSession(null);
      setClassSessions([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setMayMarkClass(null);
    setSavedSessionId(null);

    async function load() {
      try {
        let enrollmentQuery = supabase
          .from('student_enrollments')
          .select('*')
          .eq('class_id', classId)
          .eq('status', 'enrolled')
          .limit(500);
        if (pickers.yearId) enrollmentQuery = enrollmentQuery.eq('academic_year_id', pickers.yearId);
        const enrollments = await listRows(enrollmentQuery);

        const studentIds = enrollments.map((e) => e.student_id);
        const found: Row<'student_profiles'>[] = [];
        for (const part of chunksOf(studentIds, 80)) {
          found.push(...(await listRows(supabase.from('student_profiles').select('*').in('id', part).limit(200))));
        }
        const byId = new Map(found.map((s) => [s.id, s] as const));
        const entries: RosterEntry[] = studentIds
          .map((id) => byId.get(id))
          .filter((s): s is Row<'student_profiles'> => Boolean(s))
          .map((s) => ({ studentId: s.id, nameAm: s.full_name_am, code: s.student_code }))
          .sort((a, b) => a.nameAm.localeCompare(b.nameAm, 'am'));

        const sessions = await listRows(
          supabase.from('attendance_sessions').select('*').eq('class_id', classId).eq('taken_on', takenOn).limit(5)
        );
        const open = sessions[0] ?? null;
        let prefill: Record<string, Mark> = {};
        if (open) {
          const records = await listRows(supabase.from('attendance_records').select('*').eq('session_id', open.id).limit(500));
          prefill = Object.fromEntries(
            records.map((r) => [
              r.student_id,
              { status: r.status, minutesLate: String(r.minutes_late ?? 0), reason: r.reason_am ?? '' } as Mark,
            ])
          );
        }

        const daySessions = await listRows(
          supabase.from('class_sessions').select('*').eq('class_id', classId).eq('held_on', takenOn).limit(10)
        );

        // A teacher with no module-wide write grant only touches their own classes.
        let verdict: boolean | null = null;
        if (!mayWriteAll) {
          verdict = await callFn('teaches_class', { p_class: classId });
        }

        if (cancelled) return;
        setRoster(entries);
        setSession(open);
        setClassSessions(daySessions);
        setMayMarkClass(verdict);
        setMarks((prev) => {
          const next: Record<string, Mark> = { ...prefill };
          for (const entry of entries) next[entry.studentId] = next[entry.studentId] ?? prev[entry.studentId] ?? EMPTY_MARK;
          return next;
        });
      } catch (e) {
        if (!cancelled) setError(friendlyError(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, classId, takenOn, pickers.yearId, mayWriteAll]);

  const totals = useMemo(() => {
    const acc: Record<AttendanceStatus, number> = { present: 0, absent: 0, late: 0, excused: 0 };
    for (const entry of roster) acc[marks[entry.studentId]?.status ?? 'present'] += 1;
    const marked = Object.keys(marks).filter((id) => roster.some((r) => r.studentId === id)).length;
    return { acc, marked, rate: rateOf(acc.present + acc.late, roster.length) };
  }, [roster, marks]);

  const blocked = mayMarkClass === false;

  function setMark(studentId: string, patch: Partial<Mark>) {
    setMarks((prev) => ({ ...prev, [studentId]: { ...(prev[studentId] ?? EMPTY_MARK), ...patch } }));
  }

  function fillAllPresent() {
    setMarks(() => {
      const next: Record<string, Mark> = {};
      for (const entry of roster) next[entry.studentId] = { ...EMPTY_MARK };
      return next;
    });
  }

  async function save() {
    if (!classId || roster.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const args: Args<'save_attendance'> = {
        p_class_id: classId,
        p_taken_on: takenOn,
        p_records: roster.map((entry) => {
          const mark = marks[entry.studentId] ?? EMPTY_MARK;
          return {
            student_id: entry.studentId,
            status: mark.status,
            minutes_late: Math.max(0, Math.round(numberOr(mark.minutesLate))),
            reason_am: mark.reason.trim() ? mark.reason.trim() : null,
          };
        }),
      };
      if (classSessionId) args.p_session_id = classSessionId;
      if (labelAm.trim()) args.p_label_am = labelAm.trim();

      const sessionId = await callFn('save_attendance', args);
      setSavedSessionId(sessionId);
      toast.success(`መገኘቱ ተቀምጧል — ${roster.length} ተማሪዎች።`);
      const rows = await listRows(supabase.from('attendance_sessions').select('*').eq('id', sessionId).limit(1));
      setSession(rows[0] ?? null);
    } catch (e) {
      setError(friendlyError(e));
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  /** `close_attendance_session()` also stamps the linked class session as taken. */
  async function closeSession() {
    if (!savedSessionId && !session) return;
    setBusy(true);
    setError(null);
    try {
      const closed = await callFn('close_attendance_session', { p_session: (savedSessionId ?? session?.id) as string });
      setSession(closed);
      setSavedSessionId(null);
      toast.success('መዝገቡ ተዘግቷል።');
    } catch (e) {
      setError(friendlyError(e));
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  if (!isSupabaseConfigured) return <NotConfigured />;
  if (!allowed) {
    return (
      <div className="space-y-5">
        <PageHeading title="መገኘት መመዝገብ" description="ለዛሬው ቀን የክፍል ሐዘር መዝገብ።" />
        <Denied hint="ይህ ገጽ የሚከፈተው ለክፍል መምህራን (attendance.mark) ወይም ለሐዘር ኃላፊ (attendance.write) ብቻ ነው።" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeading
        title="መገኘት መመዝገብ"
        description="ዓመቱን፣ ክፍሉንና ቀኑን ይምረጡ፤ ተመራጭ የትምህርት ቀን ሲያስተሳስሩ መዝገቡ መዝጊያ ሲታነሳው ዕለቱም “መገኘት ተመዝግቧል” ይሆናል።"
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => void pickers.reload()} icon={<RefreshCw className="h-4 w-4" aria-hidden />}>
              እንደገና
            </Button>
            <Button variant="outline" size="sm" onClick={fillAllPresent} disabled={roster.length === 0} icon={<CheckCheck className="h-4 w-4" aria-hidden />}>
              ሁሉም ተገኝቷል
            </Button>
          </>
        }
      />

      {pickers.error ? <ErrorNote message={pickers.error} onRetry={() => void pickers.reload()} /> : null}

      <Card>
        <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="የትምህርት ዓመት" htmlFor="mark-year">
            <Select
              id="mark-year"
              value={pickers.yearId}
              onChange={(e) => pickers.setYearId(e.target.value)}
              options={pickers.years.map((y) => ({ value: y.id, label: y.label_am }))}
              placeholder="— ዓመት ይምረጡ —"
            />
          </Field>
          <Field label="ክፍል" htmlFor="mark-class" required hint={blocked ? 'የእርስዎ ክፍል አይደለም — ማስመዝገብ አይችሉም።' : undefined}>
            <Select
              id="mark-class"
              value={classId}
              onChange={(e) => pickers.setClassId(e.target.value)}
              options={pickers.classes.map((c) => ({ value: c.id, label: `${c.name_am} (${c.code})` }))}
              placeholder="— ክፍል ይምረጡ —"
              invalid={blocked}
            />
          </Field>
          <Field label="ቀን (ዓ.ም)" htmlFor="mark-date" required>
            <DateInput id="mark-date" value={takenOn} onValueChange={setTakenOn} />
          </Field>
          <Field label="ለዕለቱ ማስታወሻ" htmlFor="mark-label" hint="ለምሳሌ “ዕርገት ማርያም – ንባብ”።">
            <Input id="mark-label" value={labelAm} onChange={(e) => setLabelAm(e.target.value)} placeholder="የጉባኤው ዓይነት" />
          </Field>
          <Field label="የተያያዘ የትምህርት ቀን" htmlFor="mark-session" hint="በ“የክፍል ትምህርት ቀናት” ተመዝግቦ የሚገኝ ቀን፤ ለማያስተሳሰሩ ባዶ ይውጡ።" className="lg:col-span-2">
            <Select
              id="mark-session"
              value={classSessionId}
              onChange={(e) => setClassSessionId(e.target.value)}
              options={classSessions.map((s) => ({ value: s.id, label: s.topic_am || `ርዕስ የለውም · ${s.starts_at ?? 'ሰዓት የለም'}` }))}
              placeholder="— አያስተሳስርም —"
            />
          </Field>
        </CardBody>
      </Card>

      {error ? <ErrorNote message={error} /> : null}

      {pickers.loading || loading ? (
        <Spinner label="ዝርዝር ተማሪዎች በመጫን ላይ…" />
      ) : !classId ? (
        <EmptyState title="ክፍል ይምረጡ" description="ዓመትና ክፍል ሲመርጡ የተመዘገቡ ተማሪዎች ዝርዝር እዚህ ይቀመጣል።" />
      ) : roster.length === 0 ? (
        <EmptyState title="በዚህ ክፍል የተመዘገበ ተማሪ የለም" description="በ“የክፍል ምዝገባዎች” ገጽ ሐዘሩን ያረጋግጡ።" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {ATTENDANCE_KEYS.map((key) => (
              <Metric
                key={key}
                label={enumLabel(ATTENDANCE_STATUS, key)}
                value={totals.acc[key]}
                hint={`${roster.length} ተማሪዎች`}
                tone={ATTENDANCE_TONE[key]}
              />
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            የተመዘገቡ {totals.marked} / {roster.length} · የመገኘት መጠን <strong className="text-foreground">{totals.rate === null ? '—' : pct(totals.rate)}</strong>
            {session ? ` · ቀድሞ የተመዘገበ መዝገብ (${enumLabel({ open: 'ክግት', closed: 'ተዘጋ', corrected: 'ተአስተካክሏል' }, session.status)}) ዳግም ይከፈታል` : ''}
          </p>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-leaf" aria-hidden />
                ሐዘር — {dateAm(takenOn)}
              </CardTitle>
              <span className="text-xs text-muted-foreground">ነጠላ ስም ላይ ያሉ አራቱ ሁኔታዎች ብቻ ይቀበላሉ (present · absent · late · excused)።</span>
            </CardHeader>
            <CardBody className="space-y-3">
              {roster.map((entry, index) => {
                const mark = marks[entry.studentId] ?? EMPTY_MARK;
                return (
                  <div key={entry.studentId} className="rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">
                          <span className="me-2 text-xs text-muted-foreground">{index + 1}.</span>
                          {entry.nameAm}
                        </p>
                        <p className="text-xs text-muted-foreground">{entry.code}</p>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {ATTENDANCE_KEYS.map((key) => (
                          <Button
                            key={key}
                            size="sm"
                            variant={mark.status === key ? 'primary' : 'outline'}
                            onClick={() => setMark(entry.studentId, { status: key })}
                            aria-pressed={mark.status === key}
                          >
                            {mark.status === key ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}
                            {enumLabel(ATTENDANCE_STATUS, key)}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      {mark.status === 'late' ? (
                        <Field label="የዘጘይ ሰዓት (ደቂቃ)" htmlFor={`late-${entry.studentId}`}>
                          <Input
                            id={`late-${entry.studentId}`}
                            type="number"
                            min={0}
                            max={600}
                            value={mark.minutesLate}
                            onChange={(e) => setMark(entry.studentId, { minutesLate: e.target.value })}
                          />
                        </Field>
                      ) : null}
                      {mark.status === 'absent' || mark.status === 'excused' ? (
                        <Field label="ምክንያት" htmlFor={`reason-${entry.studentId}`} className="sm:col-span-2" hint="በወላጅ ማሳወቂያ ላይ ይታያል።">
                          <Input
                            id={`reason-${entry.studentId}`}
                            value={mark.reason}
                            onChange={(e) => setMark(entry.studentId, { reason: e.target.value })}
                            placeholder="ለምሳሌ ሕመም፣ የቤት ጉዳይ"
                          />
                        </Field>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </CardBody>
          </Card>

          <FormActions>
            <Button onClick={() => void save()} loading={busy} disabled={!classId || roster.length === 0 || blocked} icon={<Save className="h-4 w-4" aria-hidden />}>
              {UI.save}
            </Button>
            <Button variant="outline" onClick={() => void closeSession()} loading={busy} disabled={!session && !savedSessionId}>
              መዝገቡን ዝጋ
            </Button>
            <span className="text-xs text-muted-foreground">
              በ`save_attendance` RPC ይቀመጣል — የክፍል ቆጠራዎች በመረጃ ማጠራቀሚያው ዳግም ተቆጥረው ይሞላሉ።
            </span>
          </FormActions>
        </>
      )}
    </div>
  );
}

// ─── 2 · የመገኘት ማጠቃለያ ──────────────────────────────────────────────────────

type ClassReportRow = {
  classId: string;
  className: string;
  sessions: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  rate: number | null;
};

type StudentReportRow = {
  studentId: string;
  name: string;
  code: string;
  className: string;
  sessions: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  rate: number | null;
};

type SummaryValues = { sessions: number; present: number; absent: number; late: number; excused: number; present_percent: number | null };

/**
 * Attendance rates for a date range, per class and per student.
 *
 * The table itself is a grouped read — `attendance_summary()` is per student, so it
 * would be one RPC per pupil; instead the same definition is used here
 * ((present + late) over every record) and the RPC backs the single-student panel,
 * so the screen and the student portal can never disagree.
 */
export function AttendanceReportScreen() {
  const { can } = useAuth();
  const allowed = can('attendance.read');
  const pickers = useAcademicPickers(allowed && isSupabaseConfigured);
  const [from, setFrom] = useState(isoOffset(-30));
  const [to, setTo] = useState(isoToday());
  const [studentId, setStudentId] = useState('');
  const [classRows, setClassRows] = useState<ClassReportRow[]>([]);
  const [studentRows, setStudentRows] = useState<StudentReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SummaryValues | null>(null);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [tab, setTab] = useState('students');

  const classNames = useMemo(() => new Map(pickers.classes.map((c) => [c.id, c.name_am] as const)), [pickers.classes]);

  const run = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setError(null);
    try {
      let sessionQuery = supabase
        .from('attendance_sessions')
        .select('*')
        .gte('taken_on', from)
        .lte('taken_on', to)
        .limit(2000);
      if (pickers.classId) sessionQuery = sessionQuery.eq('class_id', pickers.classId);
      if (pickers.yearId) sessionQuery = sessionQuery.in('class_id', pickers.classes.map((c) => c.id));
      const sessions = await listRows(sessionQuery);

      const sessionClass = new Map(sessions.map((s) => [s.id, s.class_id] as const));
      const records: Row<'attendance_records'>[] = [];
      for (const part of chunksOf(sessions.map((s) => s.id))) {
        records.push(...(await listRows(supabase.from('attendance_records').select('*').in('session_id', part))));
      }

      const held = new Map<string, ClassReportRow>();
      for (const s of sessions) {
        const row = held.get(s.class_id) ?? {
          classId: s.class_id,
          className: classNames.get(s.class_id) ?? s.class_id.slice(0, 8),
          sessions: 0,
          present: 0,
          absent: 0,
          late: 0,
          excused: 0,
          rate: null,
        };
        row.sessions += 1;
        row.present += numberOr(s.present_count);
        row.absent += numberOr(s.absent_count);
        row.late += numberOr(s.late_count);
        row.excused += numberOr(s.excused_count);
        row.rate = rateOf(row.present + row.late, row.present + row.absent + row.late + row.excused);
        held.set(s.class_id, row);
      }

      const wanted = new Map<string, StudentReportRow>();
      const ids = [...new Set(records.map((r) => r.student_id))];
      const students: Row<'student_profiles'>[] = [];
      for (const part of chunksOf(ids, 80)) {
        students.push(...(await listRows(supabase.from('student_profiles').select('*').in('id', part).limit(200))));
      }
      const names = new Map(students.map((s) => [s.id, { name: s.full_name_am, code: s.student_code }] as const));

      for (const record of records) {
        if (studentId && record.student_id !== studentId) continue;
        const cid = sessionClass.get(record.session_id) ?? '';
        const key = `${record.student_id}|${cid}`;
        const identity = names.get(record.student_id);
        const row =
          wanted.get(key) ??
          {
            studentId: record.student_id,
            name: identity?.name ?? record.student_id.slice(0, 8),
            code: identity?.code ?? '—',
            className: classNames.get(cid) ?? '—',
            sessions: 0,
            present: 0,
            absent: 0,
            late: 0,
            excused: 0,
            rate: null,
          };
        row[rowKeyFor(record.status)] += 1;
        row.sessions += 1;
        row.rate = rateOf(row.present + row.late, row.sessions);
        wanted.set(key, row);
      }

      setClassRows([...held.values()]);
      setStudentRows([...wanted.values()]);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [allowed, classNames, from, pickers.classId, pickers.classes, pickers.yearId, studentId]);

  useEffect(() => {
    void run();
  }, [run]);

  // The database's own answer for one pupil, straight from `attendance_summary`.
  useEffect(() => {
    if (!allowed || !studentId) {
      setSummary(null);
      return;
    }
    let cancelled = false;
    setSummaryBusy(true);
    callFn('attendance_summary', { p_student: studentId, p_from: from, p_to: to })
      .then((json) => {
        if (cancelled) return;
        const raw = (json ?? {}) as Record<string, unknown>;
        setSummary({
          sessions: numberOr(raw.sessions),
          present: numberOr(raw.present),
          absent: numberOr(raw.absent),
          late: numberOr(raw.late),
          excused: numberOr(raw.excused),
          present_percent: raw.present_percent === null || raw.present_percent === undefined ? null : numberOr(raw.present_percent),
        });
      })
      .catch((e) => {
        if (!cancelled) setError(friendlyError(e));
      })
      .finally(() => {
        if (!cancelled) setSummaryBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [allowed, studentId, from, to]);

  function exportAll() {
    exportExcel(
      [
        {
          name: 'በክፍል',
          columns: [
            { header: 'ክፍል', key: 'className' },
            { header: 'ጉባኤዎች', key: 'sessions' },
            { header: 'ተገኝቷል', key: 'present' },
            { header: 'አልተገኘም', key: 'absent' },
            { header: 'ዘግይቶ', key: 'late' },
            { header: 'በፈቃድ', key: 'excused' },
            { header: 'የመገኘት መቶኛ', key: 'rate' },
          ],
          rows: classRows as unknown as Record<string, unknown>[],
        },
        {
          name: 'በተማሪ',
          columns: [
            { header: 'ተማሪ', key: 'name' },
            { header: 'የተማሪ ቁጥር', key: 'code' },
            { header: 'ክፍል', key: 'className' },
            { header: 'ጉባኤዎች', key: 'sessions' },
            { header: 'ተገኝቷል', key: 'present' },
            { header: 'አልተገኘም', key: 'absent' },
            { header: 'ዘግይቶ', key: 'late' },
            { header: 'በፈቃድ', key: 'excused' },
            { header: 'የመገኘት መቶኛ', key: 'rate' },
          ],
          rows: studentRows as unknown as Record<string, unknown>[],
        },
      ],
      `የመገኘት-ማጠቃለያ-${from}-እስከ-${to}`
    );
  }

  if (!isSupabaseConfigured) return <NotConfigured />;
  if (!allowed) {
    return (
      <div className="space-y-5">
        <PageHeading title="የመገኘት ማጠቃለያ" description="በተመረጠ ጊዜ ውስጥ በክፍልና በተማሪ የመገኘት መጠን።" />
        <Denied hint="ይህ ገጽ attendance.read ፍቃድ ይጠይቃል።" />
      </div>
    );
  }

  const classColumns: Column<ClassReportRow>[] = [
    { key: 'className', header: 'ክፍል', sortable: true, cell: (r) => <span className="font-medium">{r.className}</span> },
    { key: 'sessions', header: 'ጉባኤዎች', sortable: true, align: 'end', hideBelow: 'md' },
    { key: 'present', header: enumLabel(ATTENDANCE_STATUS, 'present'), sortable: true, align: 'end', hideBelow: 'sm' },
    { key: 'absent', header: enumLabel(ATTENDANCE_STATUS, 'absent'), sortable: true, align: 'end', hideBelow: 'sm' },
    { key: 'late', header: enumLabel(ATTENDANCE_STATUS, 'late'), sortable: true, align: 'end', hideBelow: 'lg' },
    { key: 'excused', header: enumLabel(ATTENDANCE_STATUS, 'excused'), sortable: true, align: 'end', hideBelow: 'lg' },
    {
      key: 'rate',
      header: 'የመገኘት መጠን',
      sortable: true,
      align: 'end',
      value: (r) => r.rate ?? -1,
      cell: (r) => <StatusBadge tone={r.rate === null ? 'neutral' : r.rate >= 80 ? 'success' : r.rate >= 60 ? 'warning' : 'danger'}>{r.rate === null ? '—' : pct(r.rate)}</StatusBadge>,
    },
  ];

  const studentColumns: Column<StudentReportRow>[] = [
    { key: 'name', header: 'ተማሪ', sortable: true, cell: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'code', header: 'የተማሪ ቁጥር', sortable: true, hideBelow: 'md' },
    { key: 'className', header: 'ክፍል', sortable: true, hideBelow: 'sm' },
    { key: 'sessions', header: 'ጉባኤዎች', sortable: true, align: 'end', hideBelow: 'md' },
    { key: 'present', header: 'ተገኝቷል', sortable: true, align: 'end', hideBelow: 'sm' },
    { key: 'absent', header: 'አልተገኘም', sortable: true, align: 'end', hideBelow: 'sm' },
    { key: 'late', header: 'ዘግይቶ', sortable: true, align: 'end', hideBelow: 'lg' },
    { key: 'excused', header: 'በፈቃድ', sortable: true, align: 'end', hideBelow: 'lg' },
    {
      key: 'rate',
      header: 'የመገኘት መጠን',
      sortable: true,
      align: 'end',
      value: (r) => r.rate ?? -1,
      cell: (r) => <StatusBadge tone={r.rate === null ? 'neutral' : r.rate >= 80 ? 'success' : r.rate >= 60 ? 'warning' : 'danger'}>{r.rate === null ? '—' : pct(r.rate)}</StatusBadge>,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeading
        title="የመገኘት ማጠቃለያ"
        description="ቀናው የሚገባው በኢትዮጵያ ዘርዕ ሲታይ፣ የሚቀመጠው ግን ግሪጎሪያን ነው — ልክ እንደ መዝገቡ።"
        actions={
          can('reports.export', 'finance.export') ? (
            <Button variant="outline" size="sm" onClick={exportAll} disabled={classRows.length === 0 && studentRows.length === 0} icon={<Download className="h-4 w-4" aria-hidden />}>
              {UI.exportExcel}
            </Button>
          ) : null
        }
      />

      <Card>
        <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="ከቀን" htmlFor="rep-from" required>
            <DateInput id="rep-from" value={from} onValueChange={setFrom} max={to} />
          </Field>
          <Field label="እስከ ቀን" htmlFor="rep-to" required>
            <DateInput id="rep-to" value={to} onValueChange={setTo} min={from} />
          </Field>
          <Field label="ክፍል" htmlFor="rep-class" hint="ባዶ = የሁሉም ክፍሎች ማጠቃለያ።">
            <Select
              id="rep-class"
              value={pickers.classId}
              onChange={(e) => pickers.setClassId(e.target.value)}
              options={pickers.classes.map((c) => ({ value: c.id, label: c.name_am }))}
              placeholder="— ሁሉም ክፍሎች —"
            />
          </Field>
          <Field label="ተማሪ" htmlFor="rep-student" hint="ተመርጧል ከሆነ በሥርዓቱ ቆጠራ (`attendance_summary`) ማረጋገጫ ይታያል።">
            <Select
              id="rep-student"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              options={[...new Map(studentRows.map((r) => [r.studentId, { value: r.studentId, label: `${r.name} · ${r.code}` }] as const)).values()]}
              placeholder="— ሁሉም ተማሪዎች —"
            />
          </Field>
        </CardBody>
      </Card>

      {error ? <ErrorNote message={error} onRetry={() => void run()} /> : null}

      {summaryBusy ? <Spinner label="የተማሪ ማጠቃለያ በመጫን ላይ…" /> : null}
      {summary ? (
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Metric label="ጠቅላላ ጉባኤዎች" value={summary.sessions} hint="በሥርዓቱ የተቆጠረ" />
          <Metric label="ተገኝቷል" value={summary.present} tone="success" />
          <Metric label="አልተገኘም" value={summary.absent} tone="danger" />
          <Metric label="ዘግይቶ" value={summary.late} tone="warning" />
          <Metric label="በፈቃድ" value={summary.excused} tone="info" />
          <Metric label="የመገኘት መጠን" value={summary.present_percent === null ? '—' : pct(summary.present_percent)} tone="gold" />
        </div>
      ) : null}

      <Tabs
        items={[
          { value: 'students', label: 'በተማሪ ዝርዝር', count: studentRows.length },
          { value: 'classes', label: 'በክፍል ዝርዝር', count: classRows.length },
        ]}
        value={tab}
        onValueChange={setTab}
      >
        <TabPanel value="classes">
          <DataTable
            rows={classRows}
            columns={classColumns}
            rowKey={(r) => r.classId}
            loading={loading}
            pageSize={20}
            emptyTitle="በዚህ ጊዜ የተመዘገበ መገኘት የለም"
            emptyDescription="ቀናውን ወሰን ቀይረው ወይም መገኘት በ“መገኘት መመዝገብ” ይስቀሙ።"
            caption="በክፍል የመገኘት ማጠቃለያ"
          />
        </TabPanel>
        <TabPanel value="students">
          <DataTable
            rows={studentRows}
            columns={studentColumns}
            rowKey={(r) => `${r.studentId}|${r.className}`}
            loading={loading}
            pageSize={25}
            emptyTitle="ተማሪ አልተገኘም"
            emptyDescription="ለተመረጠው ክፍልና ጊዜ መዝገብ የለም።"
            caption="በተማሪ የመገኘት ማጠቃለያ"
          />
        </TabPanel>
      </Tabs>
    </div>
  );
}

/** Which counter a record's status feeds — the same mapping the recount uses. */
function rowKeyFor(status: AttendanceStatus): 'present' | 'absent' | 'late' | 'excused' {
  return status;
}

// ─── 3 · የዓመት መጨረሻ ማሳለፍ ───────────────────────────────────────────────────

type PromotionRow = {
  studentId: string;
  name: string;
  code: string;
  fromClassId: string;
  fromClassName: string;
  average: number | null;
  attendance: number | null;
  decision: 'promote' | 'hold' | 'repeat';
};

const DECISION_OPTIONS = [
  { value: 'promote', label: 'ይሳለፍ' },
  { value: 'hold', label: 'ይቆይ (ወላጅ/ጉባኤ)' },
  { value: 'repeat', label: 'ዳግም ይለማመድ' },
] as const;

/**
 * The end-of-year promotion run.
 *
 * `run_promotion(p_batch_id)` refuses anything but an *approved* batch, and the
 * migrations define no approval RPC — so the screen writes the batch, its items and
 * the approval stamp through the table policies (`students.promote` owns both tables)
 * and then calls the RPC. Real enrolment and released results decide the preview; the
 * person may still overturn a single pupil before running.
 */
export function PromotionScreen() {
  const { identity, can } = useAuth();
  const allowed = can('students.promote');
  const pickers = useAcademicPickers(allowed && isSupabaseConfigured);

  const [levels, setLevels] = useState<Row<'class_levels'>[]>([]);
  const [fromLevelId, setFromLevelId] = useState('');
  const [toLevelId, setToLevelId] = useState('');
  const [toYearId, setToYearId] = useState('');
  const [minPercent, setMinPercent] = useState('60');
  const [maxAbsence, setMaxAbsence] = useState('25');
  const [rows, setRows] = useState<PromotionRow[]>([]);
  const [targetClassId, setTargetClassId] = useState('');
  const [batches, setBatches] = useState<Row<'promotion_batches'>[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<{ promoted: number; held: number } | null>(null);

  useEffect(() => {
    if (!allowed) return;
    listRows(supabase.from('class_levels').select('*').eq('is_active', true).limit(60))
      .then(setLevels)
      .catch((e) => setError(friendlyError(e)));
  }, [allowed]);

  const loadBatches = useCallback(async () => {
    if (!allowed) return;
    try {
      setBatches(await listRows(supabase.from('promotion_batches').select('*').limit(20).order('created_at', { ascending: false })));
    } catch (e) {
      setError(friendlyError(e));
    }
  }, [allowed]);

  useEffect(() => {
    void loadBatches();
  }, [loadBatches]);

  const promotedCount = rows.filter((r) => r.decision === 'promote').length;
  const heldCount = rows.length - promotedCount;

  /** Read enrolment, released results and attendance, then decide each pupil. */
  async function buildPreview() {
    if (!pickers.yearId || !fromLevelId) {
      setError('ዓመትና የሚነሳው ደረጃ ያስፈልጋሉ።');
      return;
    }
    setLoading(true);
    setError(null);
    setNotice(null);
    setResult(null);
    try {
      const fromClasses = pickers.classes.filter((c) => c.level_id === fromLevelId);
      if (fromClasses.length === 0) {
        setRows([]);
        setNotice('በዚህ ደረጃ የሚሠራ ክፍል የለም።');
        return;
      }
      const classIds = fromClasses.map((c) => c.id);
      const classOf = new Map(fromClasses.map((c) => [c.id, c.name_am] as const));

      const enrollments = await listRows(
        supabase.from('student_enrollments').select('*').in('class_id', classIds).eq('status', 'enrolled').limit(1000)
      );
      const studentIds = [...new Set(enrollments.map((e) => e.student_id))];
      const students: Row<'student_profiles'>[] = [];
      for (const part of chunksOf(studentIds, 80)) {
        students.push(...(await listRows(supabase.from('student_profiles').select('*').in('id', part).limit(200))));
      }
      const names = new Map(students.map((s) => [s.id, s] as const));

      // Released results of the chosen year, for these classes only.
      const exams = await listRows(
        supabase.from('exams').select('*').in('class_id', classIds).eq('academic_year_id', pickers.yearId).limit(300)
      );
      const average = new Map<string, { total: number; marks: number }>();
      for (const part of chunksOf(exams.map((e) => e.id), 12)) {
        const results = await listRows(
          supabase.from('exam_results').select('*').in('exam_id', part).eq('status', 'released')
        );
        for (const r of results) {
          if (r.percent === null || r.percent === undefined) continue;
          const acc = average.get(r.student_id) ?? { total: 0, marks: 0 };
          acc.total += 1;
          acc.marks += numberOr(r.percent);
          average.set(r.student_id, acc);
        }
      }

      // Attendance rate of the same classes, over the year's sessions.
      const sessions = await listRows(
        supabase.from('attendance_sessions').select('*').in('class_id', classIds).limit(1000)
      );
      const attendance = new Map<string, { present: number; all: number }>();
      for (const part of chunksOf(sessions.map((s) => s.id))) {
        const records = await listRows(supabase.from('attendance_records').select('*').in('session_id', part));
        for (const r of records) {
          const acc = attendance.get(r.student_id) ?? { present: 0, all: 0 };
          acc.all += 1;
          if (r.status === 'present' || r.status === 'late') acc.present += 1;
          attendance.set(r.student_id, acc);
        }
      }

      const threshold = numberOr(minPercent);
      const absenceLimit = numberOr(maxAbsence);
      const next: PromotionRow[] = [];
      for (const enrollment of enrollments) {
        const student = names.get(enrollment.student_id);
        if (!student) continue;
        const acc = average.get(student.id);
        const att = attendance.get(student.id);
        const avg = acc && acc.total > 0 ? Math.round((acc.marks / acc.total) * 10) / 10 : null;
        const rate = att && att.all > 0 ? Math.round((att.present / att.all) * 1000) / 10 : null;
        const absence = rate === null ? null : 100 - rate;

        let decision: PromotionRow['decision'] = 'hold';
        if (avg === null) decision = 'hold';
        else if (avg >= threshold && absence !== null && absence <= absenceLimit) decision = 'promote';
        else if (avg >= threshold) decision = 'hold';
        else decision = 'repeat';

        next.push({
          studentId: student.id,
          name: student.full_name_am,
          code: student.student_code,
          fromClassId: enrollment.class_id,
          fromClassName: classOf.get(enrollment.class_id) ?? '—',
          average: avg,
          attendance: rate,
          decision,
        });
      }

      // The class pupils land in: the target level's class of the same/next year.
      const target = toLevelId
        ? pickers.classes.find((c) => c.level_id === toLevelId && (!toYearId || !c.academic_year_id || c.academic_year_id === toYearId))
        : undefined;
      setTargetClassId(target?.id ?? '');
      if (toLevelId && !target) setNotice('ለየተመረጠው ደረጃ ክፍል ስላልተከፈተ ማሳለፍ በራሱ አዲስ ምዝገባ አይፈጥርም።');

      next.sort((a, b) => a.name.localeCompare(b.name, 'am'));
      setRows(next);
      if (next.length === 0) setNotice('በዚህ ደረጃ የተመዘገበ ተማሪ የለም።');
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }

  /** Batch → items → approved → `run_promotion()`, in that order, or nothing runs. */
  async function execute() {
    if (!identity || rows.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const fromYear = pickers.years.find((y) => y.id === pickers.yearId);
      const title = `ማሳለፍ — ${fromYear?.label_am ?? toGeEz(ethYearOf(new Date()))} · ${
        levels.find((l) => l.id === fromLevelId)?.name_am ?? ''
      }`;

      const inserted = await supabase
        .from('promotion_batches')
        .insert(
          {
            title_am: title,
            from_year_id: pickers.yearId || null,
            to_year_id: toYearId || null,
            from_level_id: fromLevelId || null,
            to_level_id: toLevelId || null,
            criteria: { min_percent: numberOr(minPercent), max_absence_pct: numberOr(maxAbsence) },
            status: 'draft',
            created_by: identity.userId,
          } as never
        )
        .select('id');
      if (inserted.error) throw new Error(friendlyError(inserted.error));
      const batchId = (inserted.data as unknown as { id: string }[] | null)?.[0]?.id;
      if (!batchId) throw new Error('የማሳለፍ ቡድኑ መዝገብ አልተፈጠረም።');

      const items = rows.map((row) => ({
        batch_id: batchId,
        student_id: row.studentId,
        from_class_id: row.fromClassId,
        to_class_id: row.decision === 'promote' && targetClassId ? targetClassId : null,
        average_percent: row.average,
        attendance_percent: row.attendance,
        decision: row.decision,
        note_am: row.average === null ? 'የተገናኘ የፈተና ውጤት የለም' : null,
      }));
      for (const part of chunksOf(items, 50)) {
        const made = await supabase.from('promotion_items').insert(part as never);
        if (made.error) throw new Error(friendlyError(made.error));
      }

      // No approval RPC exists, so the stamp is a plain update — the table policy
      // already requires `students.promote` for it.
      const approved = await supabase
        .from('promotion_batches')
        .update({ status: 'approved', decided_by: identity.userId } as never)
        .eq('id', batchId);
      if (approved.error) throw new Error(friendlyError(approved.error));

      const json = (await callFn('run_promotion', { p_batch_id: batchId })) as Record<string, unknown> | null;
      setResult({ promoted: numberOr(json?.promoted), held: numberOr(json?.held) });
      toast.success(`ማሳለፉ ተጠናቋል — ${numberOr(json?.promoted)} ተሳልፈዋል፣ ${numberOr(json?.held)} ቆይተዋል።`);
      setConfirmOpen(false);
      setRows([]);
      await loadBatches();
    } catch (e) {
      setError(friendlyError(e));
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  if (!isSupabaseConfigured) return <NotConfigured />;
  if (!allowed) {
    return (
      <div className="space-y-5">
        <PageHeading title="ዓመት መደምደሚያ ማሳለፍ" description="የዓመቱ ማሳለፍ በቡድንና በጽደቅ ቅድመ ሁኔታ ይፈጸማል።" />
        <Denied hint="ማሳለፍ students.promote ፍቃድ ይጠይቃል (RPCውም በPostgres ያ ተመሳሳይ ፍቃድ ያረጋግጋል)።" />
      </div>
    );
  }

  const columns: Column<PromotionRow>[] = [
    { key: 'name', header: 'ተማሪ', sortable: true, cell: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'code', header: 'የተማሪ ቁጥር', sortable: true, hideBelow: 'md' },
    { key: 'fromClassName', header: 'ከየት', sortable: true, hideBelow: 'sm' },
    {
      key: 'average',
      header: 'አማካይ (%)',
      sortable: true,
      align: 'end',
      value: (r) => r.average ?? -1,
      cell: (r) => (r.average === null ? '—' : pct(r.average)),
    },
    {
      key: 'attendance',
      header: 'መገኘት (%)',
      sortable: true,
      align: 'end',
      hideBelow: 'sm',
      value: (r) => r.attendance ?? -1,
      cell: (r) => (r.attendance === null ? '—' : pct(r.attendance)),
    },
    {
      key: 'decision',
      header: 'ውሳኔ',
      sortable: true,
      cell: (r) => (
        <Select
          aria-label={`ውሳኔ — ${r.name}`}
          value={r.decision}
          options={DECISION_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          onChange={(e) =>
            setRows((prev) => prev.map((row) => (row.studentId === r.studentId ? { ...row, decision: e.target.value as PromotionRow['decision'] } : row)))
          }
        />
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeading
        title="ዓመት መደምደሚያ ማሳለፍ"
        description="ቅድመ እይታው ከእውነተኛ ምዝገባ፣ ከጸደቁ ውጤቶችና ከመገኘት መዝገብ ይሰራል፤ “አሻግር” ከተደገፈ በላይ `run_promotion` ብቻ ይሠራል።"
        actions={
          <Button variant="outline" size="sm" onClick={() => void buildPreview()} loading={loading} icon={<RefreshCw className="h-4 w-4" aria-hidden />}>
            ቅድመ እይታ አዘጋጅ
          </Button>
        }
      />

      {error ? <ErrorNote message={error} /> : null}
      {notice ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">{notice}</p>
      ) : null}

      <Card>
        <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="የሚዘጋ የትምህርት ዓመት" htmlFor="pro-year" required>
            <Select
              id="pro-year"
              value={pickers.yearId}
              onChange={(e) => pickers.setYearId(e.target.value)}
              options={pickers.years.map((y) => ({ value: y.id, label: y.label_am }))}
              placeholder="— ዓመት ይምረጡ —"
            />
          </Field>
          <Field label="የሚነሳ ደረጃ" htmlFor="pro-from" required>
            <Select
              id="pro-from"
              value={fromLevelId}
              onChange={(e) => setFromLevelId(e.target.value)}
              options={levels.map((l) => ({ value: l.id, label: `${l.name_am} (${toGeEz(l.order_no)})` }))}
              placeholder="— ደረጃ ይምረጡ —"
            />
          </Field>
          <Field label="ወደ የትኛው ደረጃ" htmlFor="pro-to-level">
            <Select
              id="pro-to-level"
              value={toLevelId}
              onChange={(e) => setToLevelId(e.target.value)}
              options={levels.filter((l) => l.id !== fromLevelId).map((l) => ({ value: l.id, label: l.name_am }))}
              placeholder="— አይቀየርም —"
            />
          </Field>
          <Field label="ወደ የትኛው ዓመት" htmlFor="pro-to-year" hint="ባዶ ከሆነ RPCው የሚሠራውን ዓመት ይወስዳል።">
            <Select
              id="pro-to-year"
              value={toYearId}
              onChange={(e) => setToYearId(e.target.value)}
              options={pickers.years.map((y) => ({ value: y.id, label: y.label_am }))}
              placeholder="— የሚሠራው ዓመት —"
            />
          </Field>
          <Field label="የማለፊያ አማካይ (%)" htmlFor="pro-min" required>
            <Input id="pro-min" type="number" min={0} max={100} value={minPercent} onChange={(e) => setMinPercent(e.target.value)} />
          </Field>
          <Field label="ፈቀደ የእገዳ መጠን (%)" htmlFor="pro-absence" required hint="ከዚህ በላይ ሲያልፍ ተማሪው “ይቆይ” ይሆናል።">
            <Input id="pro-absence" type="number" min={0} max={100} value={maxAbsence} onChange={(e) => setMaxAbsence(e.target.value)} />
          </Field>
        </CardBody>
      </Card>

      {loading ? <Spinner label="ቅድመ እይታ በመሥራት ላይ…" /> : null}

      {!loading && rows.length > 0 ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="የሚሳለፉ" value={promotedCount} tone="success" hint="ውጤትና መገኘት ሲሟላ" />
            <Metric label="የሚቆዩ / ዳግም የሚለምዱ" value={heldCount} tone="warning" />
            <Metric label="የመድረሻ ክፍል" value={targetClassId ? pickers.classes.find((c) => c.id === targetClassId)?.name_am ?? '—' : '—'} hint="ከተመረጠው ደረጃ" />
          </div>

          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(r) => r.studentId}
            pageSize={25}
            emptyTitle="አልተመዘገበም"
            caption="የማሳለፍ ቅድመ እይታ"
          />

          <FormActions>
            <Button variant="gold" onClick={() => setConfirmOpen(true)} disabled={promotedCount === 0 && heldCount === 0} icon={<Award className="h-4 w-4" aria-hidden />}>
              ማሳለፉን ፈጽም
            </Button>
            <span className="text-xs text-muted-foreground">ቡድኑ በሠርጉ “executed” ሆኖ ይቆያል፤ ውጤቱ የሳለፉና የቆዩ ብዛት ነው።</span>
          </FormActions>
        </>
      ) : null}

      {!loading && rows.length === 0 ? (
        <EmptyState
          icon={<Award className="h-7 w-7" aria-hidden />}
          title="ቅድመ እይታ አልተዘጋጀም"
          description="ዓመት፣ የሚነሳ ደረጃና የማለፊያ መርህ መርጠው “ቅድመ እይታ አዘጋጅ” ይጫኑ።"
        />
      ) : null}

      {result ? (
        <Card>
          <CardBody>
            <p className="font-display text-lg font-semibold">
              {result.promoted} ተማሪዎች ሳለፍዋል · {result.held} ቆይተዋል
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              ቁጥሮቹ ከማሳለፍ ሠራሹ ተቀጥቶ የመጡ ናቸው — የድሮው ምዝገባ “graduated” ተደርጎ ለአዲሱ ክፍል ምዝገባ ተፈጥሯል፤ የቆዩት ደግሞ በማስታወሻው ተዘግበዋል።
            </p>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>የቀድሞ ቡድኖች</CardTitle>
        </CardHeader>
        <CardBody>
          {batches.length === 0 ? (
            <p className="text-sm text-muted-foreground">ገና የማሳለፍ ቡድን አልተፈጠረም።</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {batches.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
                  <span className="min-w-0">
                    <span className="font-medium">{b.title_am}</span>
                    <span className="block text-xs text-muted-foreground">{dateBoth(b.created_at)}</span>
                  </span>
                  <StatusBadge tone={b.status === 'executed' ? 'success' : b.status === 'approved' ? 'info' : b.status === 'rejected' ? 'danger' : 'neutral'}>
                    {enumLabel({ draft: 'ቅድመ ሐሳብ', submitted: 'የቀረበ', approved: 'ጸድቋል', executed: 'ተፈጽሟል', rejected: 'ውድቅ' }, b.status)}
                  </StatusBadge>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        busy={busy}
        destructive
        title="ማሳለፉን ማረጋገጥ"
        description={
          <span>
            {rows.length} ተማሪዎች ላይ ቡድን ይፈጠራል፦ {promotedCount} ይሻገራሉ፣ {heldCount} ይቆዩ ወይም ዳግም ይለምዳሉ። ይህ ከተፈጸመ በኋላ ወደ ኋላ አይመለስም።
          </span>
        }
        confirmLabel="ፈጽም"
        onConfirm={() => void execute()}
        onOpenChange={setConfirmOpen}
      />
    </div>
  );
}

// ─── 4 · የተማሪ መታወቂያ ካርድ ───────────────────────────────────────────────────

type CardStudent = {
  studentId: string;
  name: string;
  code: string;
  className: string;
  photoUrl: string | null;
  serial: string;
  payload: string;
  qr: string | null;
  cardId: string | null;
  issuedOn: string | null;
  expiresOn: string | null;
};

/**
 * A card serial is the register's own number, not `student_profiles.qr_token`: the
 * migrations have no ID-card RPC, so the row is written here and the serial is the
 * stable part of the QR payload a scanner will read back.
 */
function serialFor(index: number, issuedOn: string): string {
  return `IDC-${ethYearOf(issuedOn)}-${String(index + 1).padStart(4, '0')}-${issuedOn.replace(/-/g, '')}`;
}

function payloadFor(code: string, serial: string, name: string): string {
  return `TOMOA-IDCARD|${serial}|${code}|${name}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Printable student ID cards.
 *
 * `student_id_cards` keeps `serial` unique and has no issuing RPC, so the card is
 * created once per pupil and re-prints reuse the stored serial and QR payload — the
 * same number the check-in scanner will read. The card rows are written with the
 * register's own columns (`qr_payload`, `card_design`, `issued_on`) and `printed_by` /
 * `printed_at` are stamped when the print dialog is opened.
 */
export function IdCardScreen() {
  const { identity, can } = useAuth();
  const allowed = can('students.read');
  const mayWrite = can('students.write');
  const pickers = useAcademicPickers(allowed && isSupabaseConfigured);

  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [students, setStudents] = useState<CardStudent[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!allowed || selectedClasses.length === 0) {
      setStudents([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const enrollments = await listRows(
        supabase.from('student_enrollments').select('*').in('class_id', selectedClasses).eq('status', 'enrolled').limit(1000)
      );
      const ids = [...new Set(enrollments.map((e) => e.student_id))];
      const classOf = new Map(selectedClasses.map((id) => [id, pickers.classes.find((c) => c.id === id)?.name_am ?? '—'] as const));
      const firstClass = new Map<string, string>();
      for (const e of enrollments) if (!firstClass.has(e.student_id)) firstClass.set(e.student_id, e.class_id);

      const found: Row<'student_profiles'>[] = [];
      for (const part of chunksOf(ids, 80)) {
        found.push(...(await listRows(supabase.from('student_profiles').select('*').in('id', part).limit(200))));
      }

      const cards: Row<'student_id_cards'>[] = [];
      for (const part of chunksOf(ids, 80)) {
        cards.push(...(await listRows(supabase.from('student_id_cards').select('*').in('student_id', part).limit(200))));
      }
      const cardOf = new Map(cards.map((c) => [c.student_id, c] as const));

      // Photos are private media: a signed URL, and no failure if the media store
      // is outside this person's grants.
      const photoIds = [...new Set(found.map((s) => s.photo_media_id).filter((v): v is string => Boolean(v)))];
      const photoUrl = new Map<string, string | null>();
      if (photoIds.length > 0) {
        try {
          const media = await listRows(supabase.from('media_files').select('*').in('id', photoIds).limit(200));
          const { signedMediaUrl } = await import('@/lib/supabase');
          for (const m of media) {
            photoUrl.set(m.id, m.is_public && m.public_url ? m.public_url : await signedMediaUrl(m.storage_path));
          }
        } catch {
          setNotice('የፎቶ ማህደሩን ለማንበብ መብት የለኝም — ካርዶቹ ያለ ፎቶ ይዘጋጃሉ።');
        }
      }

      const today = isoToday();
      const rows: CardStudent[] = found
        .map((s, index) => {
          const card = cardOf.get(s.id) ?? null;
          const serial = card?.serial ?? serialFor(index, today);
          return {
            studentId: s.id,
            name: s.full_name_am,
            code: s.student_code,
            className: classOf.get(firstClass.get(s.id) ?? '') ?? '—',
            photoUrl: s.photo_media_id ? photoUrl.get(s.photo_media_id) ?? null : null,
            serial,
            payload: card?.qr_payload ?? payloadFor(s.student_code, serial, s.full_name_am),
            qr: null,
            cardId: card?.id ?? null,
            issuedOn: card?.issued_on ?? null,
            expiresOn: card?.expires_on ?? null,
          };
        })
        .sort((a, b) => a.className.localeCompare(b.className, 'am') || a.name.localeCompare(b.name, 'am'));

      setStudents(rows);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [allowed, pickers.classes, selectedClasses]);

  useEffect(() => {
    void load();
  }, [load]);

  // QR images are generated in the browser, then handed to the print path as data URLs.
  useEffect(() => {
    if (students.length === 0) return;
    let cancelled = false;
    void (async () => {
      const withQr: CardStudent[] = [];
      for (const student of students) {
        if (student.qr) withQr.push(student);
        else withQr.push({ ...student, qr: await qrDataUrl(student.payload, 220) });
      }
      if (!cancelled) setStudents(withQr);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students.length]);

  function toggleClass(id: string) {
    setSelectedClasses((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }

  /** Persist the cards the register does not have yet, then re-read the table. */
  async function issueCards() {
    if (!identity) return;
    const missing = students.filter((s) => !s.cardId);
    if (missing.length === 0) {
      toast.info('ሁሉም ተማሪዎች ካርድ አላቸው።');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const issuedOn = toIso(new Date());
      const expires = toIso(addDays(new Date(), 365));
      for (const student of missing) {
        const made = await supabase
          .from('student_id_cards')
          .insert(
            {
              student_id: student.studentId,
              serial: student.serial,
              issued_on: issuedOn,
              expires_on: expires,
              qr_payload: student.payload,
              card_design: { template: 'cr80', theme: 'leaf-gold', church: UI.appName },
            } as never
          );
        if (made.error) throw new Error(friendlyError(made.error));
      }
      toast.success(`${missing.length} ካርድ በመዝገቡ ተቀምጧል።`);
      await load();
    } catch (e) {
      setError(friendlyError(e));
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  /** The print path, and the register records that the batch was printed. */
  async function printCards() {
    if (students.length === 0) return;
    const grid = students
      .map(
        (s) => `
        <section class="card">
          <div class="top"><b>${escapeHtml(UI.appName)}</b><span>${escapeHtml(s.className)}</span></div>
          <div class="body">
            ${s.photoUrl ? `<img class="ph" src="${escapeHtml(s.photoUrl)}" alt="" />` : '<div class="ph empty"></div>'}
            <div class="who">
              <p class="nm">${escapeHtml(s.name)}</p>
              <p class="cd">${escapeHtml(s.code)}</p>
              <p class="ex">የሚያበቃበት፦ ${escapeHtml(s.expiresOn ? dateAm(s.expiresOn) : '—')}</p>
            </div>
            ${s.qr ? `<img class="qr" src="${escapeHtml(s.qr)}" alt="QR" />` : ''}
          </div>
          <div class="serial">${escapeHtml(s.serial)}</div>
        </section>`
      )
      .join('');

    printDocument({
      title: 'የተማሪ መታወቂያ ካርዶች',
      subtitle: `${students.length} ካርድ · ${dateAm(isoToday())}`,
      meta: [{ label: 'ቤተ ክርስቲያን', value: UI.churchName }],
      html:
        `<style>.card{width:86mm;height:54mm;border:1px solid #1f6b4f;border-radius:4px;padding:6px;margin:0 6px 6px 0;display:inline-block;vertical-align:top;font-size:9px;break-inside:avoid}` +
        `.card .top{display:flex;justify-content:space-between;gap:4px;background:#1f6b4f;color:#fff;padding:2px 4px;border-radius:2px}` +
        `.card .body{display:flex;gap:6px;margin-top:6px;align-items:flex-start}` +
        `.card .ph{width:17mm;height:21mm;object-fit:cover;border:1px solid #cfd8d4}.card .ph.empty{background:#f2f5f3}` +
        `.card .nm{font-weight:600;font-size:11px;margin:0}.card .cd{margin:2px 0}.card .ex{margin:0;color:#4b5a54}` +
        `.card .qr{width:16mm;height:16mm;margin-inline-start:auto}` +
        `.card .serial{margin-top:4px;border-top:1px dashed #cfd8d4;padding-top:2px;letter-spacing:.5px}</style>${grid}`,
      footerNote: 'የQR ኮዱ ለሐዘር መመዘኛ ተሠጥቷል — ማተሚያ ክፍሉን ሲከፍቱ “ውሃ ማስቀመጥ” ወይም PDF ይምረጡ።',
    });

    const printedIds = students.map((s) => s.cardId).filter((v): v is string => Boolean(v));
    if (printedIds.length === 0 || !identity) return;
    try {
      const stamp = await supabase
        .from('student_id_cards')
        .update({ printed_by: identity.userId, printed_at: new Date().toISOString() } as never)
        .in('id', printedIds);
      if (stamp.error) throw new Error(friendlyError(stamp.error));
      await load();
    } catch (e) {
      setError(friendlyError(e));
    }
  }

  if (!isSupabaseConfigured) return <NotConfigured />;
  if (!allowed) {
    return (
      <div className="space-y-5">
        <PageHeading title="የተማሪ መታወቂያ ካርድ" description="ለምረጥ ክፍሎች ተመዝጋቢ ካርዶችን ማዘጋጀትና ማተም።" />
        <Denied hint="ካርድ ማዘጋጀት students.read ፍቃድ ይጠይቃል፤ መቅመጥ ግን students.write ያስፈልጋል።" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeading
        title="የተማሪ መታወቂያ ካርድ"
        description="ክፍል ከተመረጠ በኋላ ካርዱ በስም፣ በክፍል፣ በተማሪ ቁጥር፣ በቀጣይ መስመርና በQR ይዘጋጃል፤ ተመሳሳይ ተማሪ ሁሌ አንድ መዝገብ ቁጥር ይዞ ይቆያል።"
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => void load()} icon={<RefreshCw className="h-4 w-4" aria-hidden />}>
              እንደገና
            </Button>
            {mayWrite ? (
              <Button variant="outline" size="sm" onClick={() => void issueCards()} loading={busy} disabled={students.length === 0} icon={<CreditCard className="h-4 w-4" aria-hidden />}>
                ካርድ መዝግብ
              </Button>
            ) : null}
            <Button size="sm" onClick={() => void printCards()} disabled={students.length === 0} icon={<Printer className="h-4 w-4" aria-hidden />}>
              {UI.exportPdf}
            </Button>
          </>
        }
      />

      {error ? <ErrorNote message={error} onRetry={() => void load()} /> : null}
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IdCardIcon className="h-4 w-4 text-leaf" aria-hidden />
            ክፍሎች ይምረጡ
          </CardTitle>
          <span className="text-xs text-muted-foreground">{selectedClasses.length} ከ{pickers.classes.length} ክፍሎች ተመርጠዋል</span>
        </CardHeader>
        <CardBody>
          {pickers.loading ? (
            <Spinner />
          ) : pickers.classes.length === 0 ? (
            <EmptyState title="የሚሠራ ክፍል የለም" description="በ“ክፍሎች” ገጽ ዓመቱንና ክፍሉን ንቁ ያድርጉ።" />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {pickers.classes.map((c) => (
                <CheckboxField
                  key={c.id}
                  label={`${c.name_am} (${c.code})`}
                  hint={c.meets_summary_am ?? undefined}
                  checked={selectedClasses.includes(c.id)}
                  onChange={() => toggleClass(c.id)}
                />
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {loading ? <Spinner label="ካርዶች በመዘጋጀት ላይ…" /> : null}

      {!loading && selectedClasses.length === 0 ? (
        <EmptyState icon={<CreditCard className="h-7 w-7" aria-hidden />} title="ክፍል ይምረጡ" description="የተመረጡት ክፍሎች የተማሪ ዝርዝርና ካርድ እዚህ ይታያል።" />
      ) : null}

      {!loading && students.length > 0 ? (
        <>
          <p className="text-sm text-muted-foreground">
            {students.length} ካርድ · {students.filter((s) => s.cardId).length} በመዝገቡ አሉ · {students.filter((s) => !s.cardId).length} ገና ያልተመዘገቡ
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {students.map((s) => (
              <Card key={s.studentId} className="overflow-hidden">
                <div className="flex items-start justify-between gap-2 bg-primary px-4 py-2 text-primary-foreground">
                  <span className="font-display text-sm">{UI.appName}</span>
                  <StatusBadge tone="gold">{s.className}</StatusBadge>
                </div>
                <CardBody className="flex gap-3">
                  {s.photoUrl ? (
                    <img src={s.photoUrl} alt={s.name} className="h-24 w-20 shrink-0 rounded-md border border-border object-cover" />
                  ) : (
                    <div className="h-24 w-20 shrink-0 rounded-md border border-dashed border-border bg-muted" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-base font-semibold">{s.name}</p>
                    <p className="text-xs text-muted-foreground">የተማሪ ቁጥር · {s.code}</p>
                    <p className="mt-1 text-xs text-muted-foreground">ካርድ · {s.serial}</p>
                    <p className="text-xs text-muted-foreground">
                      የተሰጠበት · {s.issuedOn ? dateAm(s.issuedOn) : 'ገና'} · የሚያበቃበት · {s.expiresOn ? dateAm(s.expiresOn) : '—'}
                    </p>
                  </div>
                  {s.qr ? <img src={s.qr} alt={`QR — ${s.name}`} className="h-20 w-20 shrink-0 rounded border border-border" /> : <Spinner label="QR…" className="text-xs" />}
                </CardBody>
                <div className="border-t border-border px-5 py-2">
                  <p className="truncate font-mono text-[10px] text-muted-foreground">{s.payload}</p>
                </div>
              </Card>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
