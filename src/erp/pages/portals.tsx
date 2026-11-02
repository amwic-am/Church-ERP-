// The four portals of the specification: the student, the guardian, the teacher
// and the department head each get a screen of their own.
//
// None of these screens is given an id to look at. Every one of them asks the
// database who the signed-in person is (`my_student_id()`, `my_guardian_id()`,
// `teaches_class()`, `scope_ids('department_ids')`) and then reads only what the
// row level security policies hand back. That is the whole security boundary: a
// typed-in pupil number never opens another family's record, and where a policy
// keeps a table from a portal user the screen says so in Amharic instead of
// showing a blank page or a made-up row.
//
// Writes stay on the paths the migrations define: attendance through
// `save_attendance()`/`close_attendance_session()`, marks through `exam_results`
// under `results.mark`, lesson plans as their own drafts, department activities
// as real inserts, and an announcement that goes `draft → submitted` through
// `submit_content('announcement', …)` — publishing is somebody else's job.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  Award,
  BookOpen,
  Building2,
  CalendarDays,
  Check,
  ClipboardList,
  CreditCard,
  GraduationCap,
  Layers,
  Mail,
  Megaphone,
  Plus,
  RefreshCw,
  Save,
  School,
  Send,
  ShieldAlert,
  Users,
} from 'lucide-react';

import { useAuth } from '@/components/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { DateInput, Field, Input, Select, Switch, Textarea, type Option } from '@/components/ui/form';
import { Modal } from '@/components/ui/overlay';
import { Tabs, TabPanel, type TabItem } from '@/components/ui/tabs';
import { Card, CardBody, CardDescription, CardHeader, CardTitle, EmptyState, ErrorNote, Metric, PageHeading, Spinner, StatusBadge, type Tone } from '@/components/ui/surface';
import { ATTENDANCE_STATUS, CONTENT_STATE, GENDER, MEMBER_STATUS, UI, enumLabel } from '@/lib/i18n';
import { isSupabaseConfigured } from '@/lib/env';
import { dateAm, dateAmShort, dateTimeAm, br, num, pct, phoneAm, relativeAm, truncate } from '@/lib/format';
import { formatGregorian } from '@/lib/ethiopian';
import { friendlyError } from '@/lib/errors';
import { callFn, fetchRows, listRows, supabase, type Args, type Returns, type Row, type ViewRow } from '@/lib/supabase';
import type { AttendanceStatus, Json, TableName } from '@/types/database';

// ─── the CHECK/enum vocabularies these screens show or write ─────────────────

const ENROLLMENT_LABEL: Record<string, string> = {
  enrolled: 'የተመዘገበ',
  graduated: 'የተመረቀ',
  transferred: 'የተሻገረ',
  dropped: 'የተቋረጠ',
  suspended: 'የተገታ',
};
const ENROLLMENT_TONE: Record<string, Tone> = {
  enrolled: 'success',
  graduated: 'info',
  transferred: 'neutral',
  dropped: 'danger',
  suspended: 'warning',
};

const MATERIAL_KIND: Record<string, string> = {
  note: 'ማስታወሻ',
  slide: 'ቅንጥብ (slide)',
  audio: 'ድምጽ',
  video: 'ቪዲዮ',
  book: 'መጽሐፍ',
  worksheet: 'የእንቅስቃሴ ቅጽ',
  link: 'አገናኝ',
};

const EXAM_TYPE: Record<string, string> = {
  quiz: 'ኩዝ (አጭር ፍተሻ)',
  oral: 'የአፍ ፈተና',
  written: 'የጽሑፍ ፈተና',
  practical: 'ተግባራዊ ፈተና',
  midterm: 'የመካከለኛ ዓመት ፈተና',
  final: 'የዓመት መደምደሚያ ፈተና',
};

const RESULT_STATUS: Record<string, string> = {
  draft: 'ገና አልተመዘገበም',
  graded: 'ተመዘግቧል',
  released: 'ለተማሪው ታውቋል',
  absent: 'በፈተናው አልተገኘም',
};
const RESULT_TONE: Record<string, Tone> = { draft: 'neutral', graded: 'info', released: 'success', absent: 'danger' };

const LESSON_STATUS: Record<string, string> = { draft: 'ቅድመ ሐሳብ', submitted: 'የቀረበ', approved: 'ጸድቋል', rejected: 'አልጸደቀም' };
const LESSON_TONE: Record<string, Tone> = { draft: 'neutral', submitted: 'info', approved: 'success', rejected: 'danger' };

const DEPT_ROLE: Record<string, string> = {
  head: 'ኃላፊ',
  vice_head: 'የኃላፊ ምክትል',
  secretary: 'ደብተላ',
  treasurer: 'ገንዘብ ሐቢር',
  coordinator: 'አስተባባሪ',
  member: 'አባል',
  advisor: 'አማካሪ',
};
const DEPT_MEMBER_STATUS: Record<string, string> = { active: 'ንቁ', inactive: 'ያልተገናኘ', transferred: 'የተሻገረ' };

const ACTIVITY_KIND: Record<string, string> = {
  meeting: 'ስብሰባ',
  service: 'አገልግሎት',
  outreach: 'የውጭ ተልእኮ',
  training: 'ሰለጠና',
  performance: 'የመዝሙር አቅርቦት',
  visit: 'ጉብኝት',
  project: 'ፕሮጀክት',
  other: 'ሌላ',
};
const ACTIVITY_STATUS: Record<string, string> = { planned: 'የታቀደ', ongoing: 'በሂደት ላይ', completed: 'ጠናቋል', cancelled: 'ተሰርዟል' };
const ACTIVITY_TONE: Record<string, Tone> = { planned: 'info', ongoing: 'warning', completed: 'success', cancelled: 'danger' };

const ANNOUNCE_KIND: Record<string, string> = {
  general: 'አጠቃላይ',
  academic: 'የትምህርት',
  liturgical: 'የአገልግሎት',
  event: 'ፕሮግራም',
  finance: 'ገንዘብ',
  department: 'ዘርፍ',
  urgency: 'አስቸኳይ',
};
const PRIORITY: Record<string, string> = { low: 'ዝቅተኛ', normal: 'መደበኛ', high: 'ከፍተኛ', urgent: 'አስቸኳይ' };
const PRIORITY_TONE: Record<string, Tone> = { low: 'neutral', normal: 'info', high: 'warning', urgent: 'danger' };

const NOTICE_TONE: Record<string, Tone> = { info: 'info', success: 'success', warning: 'warning', danger: 'danger' };
const CONTENT_TONE: Record<string, Tone> = { draft: 'neutral', submitted: 'info', changes_requested: 'warning', approved: 'gold', published: 'success', archived: 'neutral' };

const ATTENDANCE_KEYS = Object.keys(ATTENDANCE_STATUS) as AttendanceStatus[];

const WEEKDAYS = ['እሁድ', 'ሰኞ', 'ማክሰኞ', 'ረቡዕ', 'ሐሙስ', 'ዓርብ', 'ቅዳሜ'];

function optionsOf(map: Record<string, string>): Option[] {
  return Object.entries(map).map(([value, label]) => ({ value, label }));
}

const ACTIVITY_KIND_OPTIONS = optionsOf(ACTIVITY_KIND);
const ACTIVITY_STATUS_OPTIONS = optionsOf(ACTIVITY_STATUS);
const ANNOUNCE_KIND_OPTIONS = optionsOf(ANNOUNCE_KIND);
const PRIORITY_OPTIONS = optionsOf(PRIORITY);
const LESSON_STATUS_OPTIONS = optionsOf(LESSON_STATUS);

// `announcements.audience` is stored as `{ roles: [...] }`; these are the only
// groups a portal may address, so the form never writes a shape the schema has
// not already seeded as its default (`{"roles":["*"]}`).
const AUDIENCE_OPTIONS: Option[] = [
  { value: '*', label: 'ሁሉም ሰው' },
  { value: 'student', label: 'ተማሪዎች' },
  { value: 'parent', label: 'ወላጆች' },
  { value: 'teacher', label: 'መምህራን' },
  { value: 'member', label: 'አባላት' },
];

// ─── defensive readers for the JSON the RPCs answer with ─────────────────────

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asList(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object') : [];
}

function strOf(value: unknown, fallback = '—'): string {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

function numOf(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isoToday(): string {
  return formatGregorian(new Date());
}

/** `present + late` over every recorded session — the same arithmetic the RPC uses. */
function rateOf(counted: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((counted / total) * 1000) / 10;
}

/** `attendance_summary()` → the six numbers it documents, nothing invented. */
type AttendanceSummary = { sessions: number; present: number; absent: number; late: number; excused: number; percent: number | null };

function parseSummary(raw: unknown): AttendanceSummary {
  const o = asRecord(raw);
  const percent = o.present_percent;
  return {
    sessions: numOf(o.sessions),
    present: numOf(o.present),
    absent: numOf(o.absent),
    late: numOf(o.late),
    excused: numOf(o.excused),
    percent: percent === null || percent === undefined ? null : numOf(percent),
  };
}

const NO_SUMMARY: AttendanceSummary = { sessions: 0, present: 0, absent: 0, late: 0, excused: 0, percent: null };

/** One released result out of `student_report_card()`. */
type ReportEntry = {
  examId: string;
  title: string;
  type: string;
  subject: string;
  className: string;
  marks: number | null;
  total: number | null;
  percent: number | null;
  grade: string;
  status: string;
  examOn: string;
  remarks: string;
};

function parseReportCard(raw: unknown): { entries: ReportEntry[]; average: number | null } {
  const card = asRecord(raw);
  const entries = asList(card.results).map((r) => ({
    examId: strOf(r.exam_id, ''),
    title: strOf(r.title, 'ያለ ርዕስ'),
    type: strOf(r.type, ''),
    subject: strOf(r.subject, '—'),
    className: strOf(r.class, '—'),
    marks: r.marks === null || r.marks === undefined ? null : numOf(r.marks),
    total: r.total === null || r.total === undefined ? null : numOf(r.total),
    percent: r.percent === null || r.percent === undefined ? null : numOf(r.percent),
    grade: strOf(r.grade, '—'),
    status: strOf(r.status, ''),
    examOn: strOf(r.exam_on, ''),
    remarks: strOf(r.remarks, ''),
  }));
  const average = card.average_percent === null || card.average_percent === undefined ? null : numOf(card.average_percent);
  return { entries, average };
}

/** A class `schedule` JSON array rendered without assuming more than day/start/end. */
function parseSchedule(raw: unknown): { day: string; span: string }[] {
  return asList(raw)
    .map((entry) => ({
      day: WEEKDAYS[numOf(entry.day) % 7] ?? strOf(entry.day, '—'),
      span: `${strOf(entry.start, '—')}–${strOf(entry.end, '')}`,
    }))
    .filter((entry) => entry.span !== '—–');
}

// ─── the shared shell: no session, no portal ────────────────────────────────

/**
 * Reads a set of ids in blocks, because a roster or a member list is longer than
 * a single `in` filter should be. Row level security still decides what comes back.
 */
async function readIn<T extends TableName>(table: T, column: string, ids: readonly string[]): Promise<Row<T>[]> {
  const found: Row<T>[] = [];
  for (let i = 0; i < ids.length; i += 60) {
    const chunk = ids.slice(i, i + 60);
    found.push(...(await listRows<Row<T>>(supabase.from(table).select('*').in(column as never, chunk).limit(chunk.length) as never)));
  }
  return found;
}

function PortalShell({ children }: { children: (uid: string) => ReactNode }) {
  const { identity, status } = useAuth();
  if (!isSupabaseConfigured) return <ErrorNote message="የግል ገጹ ለመክፈት መረጃ ማጠራቀሚያው ገና አልተገናኘም።" />;
  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center rounded-lg border border-border bg-card px-4 py-12">
        <Spinner label="በመግቢያ ማረጋገጫ ላይ…" />
      </div>
    );
  }
  if (!identity || status !== 'ready') {
    return <ErrorNote message="ይህ ገጽ የሚከፈተው በተረጋገጠ መለያ ብቻ ነው።እባክዎ ወደ መግቢያው ተመልሰው ይግቡ።" />;
  }
  return <>{children(identity.userId)}</>;
}

type MePhase = 'loading' | 'ready' | 'failed';

/**
 * Resolves "me" once per attempt. The resolver answers `null` when the database
 * has no record for this login, which every portal renders as an instruction.
 */
function useResolvedMe<T>(resolve: () => Promise<T | null>) {
  const resolver = useRef(resolve);
  resolver.current = resolve;
  const [phase, setPhase] = useState<MePhase>('loading');
  const [value, setValue] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setPhase('loading');
    setError(null);
    resolver
      .current()
      .then((found) => {
        if (cancelled) return;
        setValue(found);
        setPhase('ready');
      })
      .catch((e) => {
        if (cancelled) return;
        setError(friendlyError(e));
        setPhase('failed');
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return { phase, value, error, retry: () => setAttempt((a) => a + 1) };
}

function MeLoading() {
  return (
    <div className="flex items-center justify-center gap-3 rounded-lg border border-border bg-card px-4 py-12 text-sm text-muted-foreground">
      <Spinner label="መለያዎ ከሰርቪሱ እየተጣራ ነው…" />
    </div>
  );
}

function MeBlocked({ title, description, onRetry }: { title: string; description: string; onRetry?: () => void }) {
  return (
    <div className="space-y-4">
      <ErrorNote
        message={title}
        onRetry={onRetry}
      />
      <EmptyState icon={<ShieldAlert className="h-7 w-7" aria-hidden />} title={title} description={description} />
    </div>
  );
}

/** One labelled line of a profile — the portals read as sentences, not as dumps. */
function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 break-words text-sm">{value}</p>
    </div>
  );
}

// ═══ 1 · የተማሪ ገጽ ═══════════════════════════════════════════════════════════

export function StudentPortalScreen() {
  return <PortalShell>{() => <StudentPortal />}</PortalShell>;
}

type StudentMe = { studentId: string; portalLinked: boolean };

type StudentBundle = {
  profile: Row<'student_profiles'> | null;
  enrolments: Row<'student_enrollments'>[];
  classNames: Map<string, string>;
  yearLabels: Map<string, string>;
  idCards: Row<'student_id_cards'>[];
  certificates: Row<'issued_certificates'>[];
  materials: Row<'learning_materials'>[];
  notices: Row<'notifications'>[];
  announcements: Row<'announcements'>[];
  card: AttendanceSummary;
  average: number | null;
  results: ReportEntry[];
};

const EMPTY_BUNDLE: StudentBundle = {
  profile: null,
  enrolments: [],
  classNames: new Map(),
  yearLabels: new Map(),
  idCards: [],
  certificates: [],
  materials: [],
  notices: [],
  announcements: [],
  card: NO_SUMMARY,
  average: null,
  results: [],
};

function StudentPortal() {
  const { identity, can } = useAuth();
  const [yearId, setYearId] = useState('');
  const [bundle, setBundle] = useState<StudentBundle>(EMPTY_BUNDLE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState('overview');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ phone: '', email: '', address: '' });
  const [busy, setBusy] = useState(false);

  const me = useResolvedMe<StudentMe>(async () => {
    const studentId = await callFn('my_student_id', {});
    if (studentId) return { studentId: String(studentId), portalLinked: true };
    // No linked pupil record: say which of the two cases the office has to fix.
    const portalLinked = await callFn('is_student_portal_user', {}).catch(() => false);
    return { studentId: '', portalLinked: Boolean(portalLinked) };
  });

  const studentId = me.value?.studentId ?? '';

  const load = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    setError(null);
    try {
      const [profileRows, enrolments, publicClasses, years, card, summary] = await Promise.all([
        // RLS lets only the linked person (and staff) read this row.
        listRows(supabase.from('student_profiles').select('*').eq('id', studentId).limit(1)),
        listRows(supabase.from('student_enrollments').select('*').eq('student_id', studentId).order('enrolled_on', { ascending: false }).limit(50)).catch(() => [] as Row<'student_enrollments'>[]),
        fetchRows<ViewRow<'v_public_classes'>>('v_public_classes', { limit: 200 }).catch(() => [] as ViewRow<'v_public_classes'>[]),
        listRows(supabase.from('academic_years').select('*').order('eth_year', { ascending: false }).limit(30)).catch(() => [] as Row<'academic_years'>[]),
        callFn('student_report_card', yearId ? { p_student: studentId, p_year: yearId } : { p_student: studentId }),
        callFn('attendance_summary', { p_student: studentId }),
      ]);

      const classIds = [...new Set(enrolments.map((e) => e.class_id).filter(Boolean))];
      const classNames = new Map(publicClasses.filter((c) => c.id && classIds.includes(c.id)).map((c) => [String(c.id), String(c.name_am ?? c.code ?? '—')]));

      // A pure `student` role holds neither academics.read nor students.read, so
      // these two reads legitimately come back empty; the portal explains that.
      const [idCards, certificates, materials, notices, announcements] = await Promise.all([
        listRows(supabase.from('student_id_cards').select('*').eq('student_id', studentId).order('issued_on', { ascending: false }).limit(10)).catch(() => [] as Row<'student_id_cards'>[]),
        listRows(supabase.from('issued_certificates').select('*').eq('student_id', studentId).order('issued_on', { ascending: false }).limit(20)).catch(() => [] as Row<'issued_certificates'>[]),
        classIds.length
          ? listRows(
              supabase
                .from('learning_materials')
                .select('*')
                .in('class_id', classIds)
                .eq('state', 'published')
                .order('created_at', { ascending: false })
                .limit(60)
            ).catch(() => [] as Row<'learning_materials'>[])
          : Promise.resolve([] as Row<'learning_materials'>[]),
        listRows(supabase.from('notifications').select('*').eq('archived', false).order('created_at', { ascending: false }).limit(40)).catch(() => [] as Row<'notifications'>[]),
        listRows(supabase.from('announcements').select('*').eq('state', 'published').order('publish_at', { ascending: false }).limit(40)).catch(() => [] as Row<'announcements'>[]),
      ]);

      const report = parseReportCard(card);
      setBundle({
        profile: profileRows[0] ?? null,
        enrolments,
        classNames,
        yearLabels: new Map(years.map((y) => [y.id, y.label_am])),
        idCards,
        certificates,
        materials,
        notices,
        announcements: announcements.filter((a) => audienceFor(a, identity?.roles ?? [], classIds)),
        card: parseSummary(summary),
        average: report.average,
        results: report.entries,
      });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [studentId, yearId, identity]);

  useEffect(() => {
    if (!studentId) return;
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load, studentId]);

  const yearOptions = useMemo<Option[]>(() => {
    const ids = [...new Set(bundle.enrolments.map((e) => e.academic_year_id).filter((v): v is string => Boolean(v)))];
    return ids.map((id) => ({ value: id, label: bundle.yearLabels.get(id) ?? `የዓመት መዝገብ ${truncate(id, 6)}` }));
  }, [bundle.enrolments, bundle.yearLabels]);

  const classNamesFromResults = useMemo(() => [...new Set(bundle.results.map((r) => r.className).filter((v) => v && v !== '—'))], [bundle.results]);

  const tabs = useMemo<TabItem[]>(
    () => [
      { value: 'overview', label: 'አጠቃላይ' },
      { value: 'results', label: 'ውጤቶች', count: bundle.results.length },
      { value: 'materials', label: 'ሐቀፎች', count: bundle.materials.length },
      { value: 'notices', label: 'ማሳወቂያዎች', count: bundle.notices.length + bundle.announcements.length },
    ],
    [bundle.results.length, bundle.materials.length, bundle.notices.length, bundle.announcements.length]
  );

  function openEdit() {
    if (!bundle.profile) return;
    setDraft({ phone: bundle.profile.phone ?? '', email: bundle.profile.email ?? '', address: bundle.profile.address_am ?? '' });
    setEditing(true);
  }

  /** `students_self_update` plus the `guard_student_self_edit` trigger keep this to contact details. */
  async function saveProfile() {
    const phone = draft.phone.replace(/[^\d+]/g, '');
    if (phone && phone.replace(/\D/g, '').length < 9) {
      toast.error('ስልኩ ቢያንስ 9 አሃዝ መሆን አለበት።');
      return;
    }
    if (draft.email && !draft.email.includes('@')) {
      toast.error('የኢሜይል አድራሻው ትክክል አይደለም።');
      return;
    }
    setBusy(true);
    try {
      const patches = {
        phone: phone || null,
        email: draft.email.trim() || null,
        address_am: draft.address.trim() || null,
      } as never;
      const { error: updateError } = await supabase.from('student_profiles').update(patches).eq('id', studentId);
      if (updateError) throw new Error(friendlyError(updateError));
      toast.success('የመገናኛ መረጃዎ ተመዝግቧል።ሌሎች መረጃዎች በመዝጋቢ ቢሮ ይሻሻላሉ።');
      setEditing(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : UI.serverError);
    } finally {
      setBusy(false);
    }
  }

  /** A notification is the person's own row, so marking it read is a real write. */
  async function markRead(row: Row<'notifications'>) {
    setBusy(true);
    try {
      const { error: updateError } = await supabase.from('notifications').update({ read_at: new Date().toISOString() } as never).eq('id', row.id);
      if (updateError) throw new Error(friendlyError(updateError));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : UI.serverError);
    } finally {
      setBusy(false);
    }
  }

  const resultColumns = useMemo<Column<ReportEntry>[]>(
    () => [
      { key: 'title', header: 'ፈተና', cell: (r) => <span className="font-medium">{truncate(r.title, 60)}</span> },
      { key: 'subject', header: 'ትምህርት', hideBelow: 'sm', cell: (r) => r.subject },
      { key: 'className', header: 'ክፍል', hideBelow: 'md', cell: (r) => r.className },
      { key: 'marks', header: 'ነጥብ', align: 'end', value: (r) => r.percent ?? -1, cell: (r) => (r.marks === null ? '—' : `${num(r.marks)}${r.total ? ` / ${num(r.total)}` : ''}`) },
      { key: 'percent', header: 'ከመቶ', align: 'end', cell: (r) => (r.percent === null ? '—' : pct(r.percent, 1)) },
      { key: 'grade', header: 'ደረጃ', cell: (r) => <StatusBadge tone="gold">{r.grade}</StatusBadge> },
      { key: 'examOn', header: 'የተሰጠበት', hideBelow: 'sm', cell: (r) => (r.examOn ? dateAm(r.examOn) : '—') },
      { key: 'remarks', header: 'አስተያየት', hideBelow: 'lg', cell: (r) => (r.remarks ? truncate(r.remarks, 70) : '—') },
    ],
    []
  );

  if (me.phase === 'loading') return <MeLoading />;
  if (me.phase === 'failed') return <ErrorNote message={me.error ?? UI.serverError} onRetry={me.retry} />;
  if (!studentId) {
    return (
      <MeBlocked
        title="የተማሪ መዝገብ ከዚህ መለያ ጋር አልተያረከምም"
        description={
          me.value?.portalLinked
            ? 'መለያዎ የተማሪ ገጽ ተጠቃሚ ተብሎ ተመዝግቧል፤ የተማሪ ሐዘር መዝገብ ግን ገና አልተገናኘም።እባክዎ የመዝጋቢ ቢሮውን ይጠይቁ።'
            : 'በዚህ ኢሜይል የተመዘገበ ተማሪ ሐዘር መዝገብ የለም።እባክዎ በቤተ ክርስቲያኑ መዝጋቢ ቢሮ “የተማሪ መዝገብ ማያያዝ” እንዲደረግሎት ይጠይቁ።ከተያያዘ በኋላ ይህ ገጽ የራስዎ መረጃ ብቻ ያሳይዎታል።'
        }
        onRetry={me.retry}
      />
    );
  }

  return (
    <div className="space-y-5">
      <PageHeading
        title="የተማሪ ገጽ"
        description="እዚህ የሚያዩት የራስዎ መረጃዎች ብቻ ናቸው — ስርዓቱ መን ለማን እንደሚታይ በራሱ ይወስናል።"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={openEdit} disabled={!bundle.profile} icon={<Save className="h-4 w-4" aria-hidden />}>
              መገናኛዬን አስተካክል
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void load()} loading={loading} icon={<RefreshCw className="h-4 w-4" aria-hidden />}>
              እንደገና
            </Button>
          </>
        }
      />

      {error ? <ErrorNote message={error} onRetry={() => void load()} /> : null}
      {loading && bundle.profile === null ? <MeLoading /> : null}

      <Tabs items={tabs} value={tab} onValueChange={setTab}>
        <TabPanel value="overview" className="space-y-5">
          <Card>
            <CardHeader>
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2 text-base">
                  <School className="h-4 w-4 text-muted-foreground" aria-hidden />
                  {bundle.profile?.full_name_am ?? 'የተማሪ መገለጫ'}
                </CardTitle>
                <CardDescription>የራስዎ ሐዘር መዝገብ — ለማረሙ ወይም ለማጫወት መዝጋቢውን ቢሮ ይጠይቁ።</CardDescription>
              </div>
              {bundle.profile ? <StatusBadge tone={bundle.profile.status === 'active' ? 'success' : 'neutral'}>{enumLabel(MEMBER_STATUS, bundle.profile.status)}</StatusBadge> : null}
            </CardHeader>
            <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Detail label="የተማሪ ቁጥር" value={bundle.profile?.student_code ?? '—'} />
              <Detail label="የትምህርት ደረጃ" value={bundle.profile?.level_key ?? 'አልተመዘገበም'} />
              <Detail label="ጾታ" value={bundle.profile?.gender ? enumLabel(GENDER, bundle.profile.gender) : '—'} />
              <Detail label="የተመዘገበበት" value={bundle.profile?.enrolled_on ? dateAm(bundle.profile.enrolled_on) : '—'} />
              <Detail label="ቤተ ክርስቲያን/ሰብዐ" value={bundle.profile?.parish ?? '—'} />
              <Detail label="ስልክ" value={phoneAm(bundle.profile?.phone)} />
              <Detail label="ኢሜይል" value={bundle.profile?.email ?? '—'} />
              <Detail label="አድራሻ" value={bundle.profile?.address_am ?? '—'} />
            </CardBody>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="h-4 w-4 text-muted-foreground" aria-hidden />
                  የአሁኑ ክፍል ምዝገባ
                </CardTitle>
                <CardDescription>ክፍል፣ የትምህርት ዓመትና የመገናኛ ጊዜ።</CardDescription>
              </CardHeader>
              <CardBody className="space-y-3">
                {bundle.enrolments.length === 0 ? (
                  <div className="space-y-2">
                    <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
                      የክፍል ምዝገባ ሰንጠረዡ ለተማሪ ገጽ ገና ክፍት አይደለም (`academics.read` መብት ይፈልጋል)።{classNamesFromResults.length > 0 ? ` ከታወቁ ውጤቶችዎ እንደታየ የእርስዎ ክፍል፦ ${classNamesFromResults.join('፣ ')}` : ''} ለማረጋገጥ መዝጋቢውን ቢሮ ይጠይቁ።
                    </p>
                  </div>
                ) : (
                  bundle.enrolments.map((e) => (
                    <div key={e.id} className="rounded-lg border border-border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">{bundle.classNames.get(e.class_id) ?? `ክፍል ${truncate(e.class_id, 6)}`}</p>
                        <StatusBadge tone={ENROLLMENT_TONE[e.status] ?? 'neutral'}>{enumLabel(ENROLLMENT_LABEL, e.status)}</StatusBadge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {e.academic_year_id ? (bundle.yearLabels.get(e.academic_year_id) ?? `የዓመት መዝገብ ${truncate(e.academic_year_id, 6)}`) : `የተመዘገበበት፦ ${dateAm(e.enrolled_on)}`}
                        {e.ended_on ? ` · የተጠናቀቀበት፦ ${dateAm(e.ended_on)}` : ''}
                      </p>
                    </div>
                  ))
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CreditCard className="h-4 w-4 text-muted-foreground" aria-hidden />
                  የመታወቂያ ካርድና ምስክር ወረቀቶች
                </CardTitle>
                <CardDescription>ካርዱን የሚያዘጋጀውና ቁጥሩን የሚሰጠው በሥርዓቱ ነው፤ እዚህ ማንበብ ብቻ ነው።</CardDescription>
              </CardHeader>
              <CardBody className="space-y-3">
                {bundle.idCards.length === 0 ? (
                  <p className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground">
                    የመታወቂያ ካርድ መዝገብ ለተማሪ ገጽ ክፍት አይደለም (ማንበብ `students.read` ይፈልጋል)።ካርድ ካልተሰጥዎት ወይም ጠፍቶዎት ከቤተ ክርስቲያኑ ቢሮ ይጠይቁ።
                  </p>
                ) : (
                  bundle.idCards.map((card) => (
                    <div key={card.id} className="rounded-lg border border-border p-3">
                      <p className="font-medium">ካርድ {card.serial}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        የተሰጠበት፦ {dateAm(card.issued_on)} · የሚያበቃበት፦ {card.expires_on ? dateAm(card.expires_on) : 'ለተወሰነ ጊዜ የለውም'} · የታተመበት፦ {card.printed_at ? relativeAm(card.printed_at) : 'ገና'}
                      </p>
                    </div>
                  ))
                )}
                {bundle.certificates.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">የተሰጡ ምስክር ወረቀቶች</p>
                    {bundle.certificates.map((c) => (
                      <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{c.title_am}</p>
                          <p className="text-xs text-muted-foreground">ቁጥር {c.certificate_no} · {dateAm(c.issued_on)}</p>
                        </div>
                        <StatusBadge tone="gold">ማረጋገጫ፦ {c.verification_code}</StatusBadge>
                      </div>
                    ))}
                  </div>
                ) : null}
              </CardBody>
            </Card>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="የመገኘት መጠን" value={bundle.card.percent === null ? '—' : pct(bundle.card.percent, 1)} hint={`${num(bundle.card.sessions)} ቀናት ተመዝግበዋል`} tone={bundle.card.percent === null ? 'neutral' : bundle.card.percent >= 75 ? 'success' : 'warning'} />
            <Metric label="ተገኝቷል / ዘግይቶ" value={`${num(bundle.card.present)} / ${num(bundle.card.late)}`} hint={`አልተገኘም ${num(bundle.card.absent)} · በፈቃድ ${num(bundle.card.excused)}`} />
            <Metric label="የፈተና አማካይ" value={bundle.average === null ? '—' : pct(bundle.average, 1)} hint="የታወቁ ውጤቶች ብቻ" tone={bundle.average === null ? 'neutral' : 'success'} />
            <Metric label="የታወቀ ውጤት" value={num(bundle.results.length)} hint="ከመምህራን የታወቀ" />
          </div>
        </TabPanel>

        <TabPanel value="results" className="space-y-4">
          {yearOptions.length > 0 ? (
            <Field label="በየትኛው የትምህርት ዓመት" htmlFor="st-year" className="max-w-xs" hint="ባዶ ማለት ሁሉንም ዓመታት ማለት ነው።">
              <Select id="st-year" value={yearId} placeholder={UI.all} options={yearOptions} onChange={(e) => setYearId(e.target.value)} />
            </Field>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Award className="h-4 w-4 text-muted-foreground" aria-hidden />
                የደረጃ ሪፖርት
              </CardTitle>
              <CardDescription>“ለተማሪው ታውቋል” የተባሉ ውጤቶች ብቻ — የ `student_report_card` መልስ ነው።</CardDescription>
            </CardHeader>
            <CardBody>
              <DataTable
                rows={bundle.results}
                columns={resultColumns}
                rowKey={(r) => `${r.examId}`}
                loading={loading}
                pageSize={15}
                emptyTitle="ገና የታወቀ ውጤት የለም"
                emptyDescription="መምህርዎ ውጤቱን “ለተማሪው ታውቋል” ሲያደርግ ወዲያውኑ እዚህ ይታያል።"
                caption="የተማሪ የፈተና ውጤቶች"
              />
            </CardBody>
          </Card>
        </TabPanel>

        <TabPanel value="materials" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BookOpen className="h-4 w-4 text-muted-foreground" aria-hidden />
                የክፍሌ ሐቀፎች
              </CardTitle>
              <CardDescription>ለክፍልዎ የታወቁ ማስታወሻዎች፣ ቅንጥቦች፣ ድምጽና መጻሕፍት።</CardDescription>
            </CardHeader>
            <CardBody className="space-y-3">
              {bundle.enrolments.length === 0 ? (
                <p className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground">ክፍልዎ ስላልታወቀ ሐቀፎችን መምረጥ አልተቻለም — መዝጋቢውን ቢሮ ይጠይቁ።</p>
              ) : bundle.materials.length === 0 ? (
                <EmptyState icon={<BookOpen className="h-7 w-7" aria-hidden />} title="ለክፍልዎ የታወቀ ሐቀፍ አልታየም" description="ሐቀፎቹ የሚነበቡት `academics.read` መብት ካለ ብቻ ነው፤ ለተማሪ ገጽ ደግሞ ይህ መብት ገና አልተፈቀደም።መምህርዎ ሐቀፍ አውቆ ሲያዘጋጅ፣ ወይም መዝጋቢው ቢሮ ለተማሪ ገጽ ክፍት ሲያደርጎት እዚህ ይታያል።" />
              ) : (
                bundle.materials.map((m) => (
                  <div key={m.id} className="rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">{m.title_am}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge tone="neutral">{enumLabel(MATERIAL_KIND, m.kind)}</StatusBadge>
                        <StatusBadge tone={m.state === 'published' ? 'gold' : 'neutral'}>{enumLabel(CONTENT_STATE, m.state)}</StatusBadge>
                      </div>
                    </div>
                    {m.summary_am ? <p className="mt-1 text-sm text-muted-foreground">{truncate(m.summary_am, 180)}</p> : null}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {dateAmShort(m.created_at)} · {num(m.download_count)} ጊዜ ተወርዷል
                      {m.external_url ? (
                        <>
                          {' · '}
                          <a className="text-leaf underline underline-offset-2" href={m.external_url} target="_blank" rel="noreferrer">
                            አገናኝ
                          </a>
                        </>
                      ) : null}
                    </p>
                  </div>
                ))
              )}
            </CardBody>
          </Card>
        </TabPanel>

        <TabPanel value="notices" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Megaphone className="h-4 w-4 text-muted-foreground" aria-hidden />
                ለእኔ የተላኩ ማሳወቂያዎች
              </CardTitle>
              <CardDescription>በመተግበሪያ ውስጥ ለራስዎ የደረሱ መልእክቶችና ለተማሪዎች የታወቁ ደብዳቤዎች።</CardDescription>
            </CardHeader>
            <CardBody className="space-y-4">
              {bundle.announcements.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">ለተማሪዎች የታወቁ ደብዳቤዎች</p>
                  {bundle.announcements.map((a) => (
                    <div key={a.id} className="rounded-lg border border-border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">{a.title_am}</p>
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge tone={PRIORITY_TONE[a.priority] ?? 'neutral'}>{enumLabel(PRIORITY, a.priority)}</StatusBadge>
                          <StatusBadge tone="neutral">{enumLabel(ANNOUNCE_KIND, a.kind)}</StatusBadge>
                        </div>
                      </div>
                      <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">{a.body_am}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{a.publish_at ? dateTimeAm(a.publish_at) : relativeAm(a.created_at)}{a.pinned ? ' · የተቀመጠ' : ''}</p>
                    </div>
                  ))}
                </div>
              ) : null}

              {bundle.notices.length === 0 ? (
                <EmptyState
                  icon={<Mail className="h-7 w-7" aria-hidden />}
                  title="ማሳወቂያ የለም"
                  description="ለተማሪዎች የታወቁ ደብዳቤዎች ገና ክፍት ወይም ለእርስዎ የላከ መልእክት የለም።በመተግበሪያ ውስጥ ሲላክዎ እዚህ ይታያል።"
                />
              ) : (
                <div className="space-y-2">
                  {bundle.notices.map((n) => (
                    <div key={n.id} className="rounded-lg border border-border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">{n.title_am}</p>
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge tone={NOTICE_TONE[n.severity] ?? 'neutral'}>{n.kind}</StatusBadge>
                          {n.read_at ? <StatusBadge tone="success">ተነብቧል</StatusBadge> : <StatusBadge tone="warning">ያልተነበበ</StatusBadge>}
                        </div>
                      </div>
                      {n.body_am ? <p className="mt-1 whitespace-pre-line text-sm">{n.body_am}</p> : null}
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        <p className="text-xs text-muted-foreground">{relativeAm(n.created_at)}</p>
                        {!n.read_at ? (
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => void markRead(n)} icon={<Check className="h-4 w-4" aria-hidden />}>
                            ተነብቧል አድርግ
                          </Button>
                        ) : null}
                        {n.link ? (
                          <a className="text-xs text-leaf underline underline-offset-2" href={n.link}>
                            ወደ ገጹ ሂድ
                          </a>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!can('communication.read') && bundle.announcements.length === 0 ? (
                <p className="text-xs text-muted-foreground">የማሳወቂያ ሰንጠረዡ ለማንበብ `communication.read` ስለሚፈልግ ለተማሪ ገጽ ገና ክፍት አይደለም፤ ከላይ የታዩት ግን የራስዎ መልእክቶች ናቸው።</p>
              ) : null}
            </CardBody>
          </Card>
        </TabPanel>
      </Tabs>

      <Modal
        open={editing}
        onOpenChange={(next) => {
          if (!next) setEditing(false);
        }}
        size="md"
        title="የመገናኛ መረጃ ማስተካከል"
        description="ስልክ፣ ኢሜይልና አድራሻ ብቻ — ሁኔታ፣ ደረጃና የመዝገብ ቁጥር በመዝጋቢ ቢሮ ብቻ ይሻሻላሉ።"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              {UI.cancel}
            </Button>
            <Button onClick={() => void saveProfile()} loading={busy} icon={<Save className="h-4 w-4" aria-hidden />}>
              {UI.save}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="ስልክ" htmlFor="st-phone">
            <Input id="st-phone" value={draft.phone} onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))} placeholder="09…" />
          </Field>
          <Field label="ኢሜይል" htmlFor="st-email">
            <Input id="st-email" type="email" value={draft.email} onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))} />
          </Field>
          <Field label="አድራሻ" htmlFor="st-address">
            <Textarea id="st-address" value={draft.address} onChange={(e) => setDraft((d) => ({ ...d, address: e.target.value }))} rows={3} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

/** `announcements.audience` is a structured filter; only the keys the schema documents are read. */
function audienceFor(row: Row<'announcements'>, roles: readonly string[], classIds: readonly string[]): boolean {
  const audience = asRecord(row.audience);
  const listed = asList(audience.roles).length ? asList(audience.roles).map((r) => strOf(r, '')) : [];
  const wanted = new Set([...roles, 'student', '*']);
  if (listed.length === 0 || listed.some((r) => wanted.has(r))) return true;
  const scoped = asList(audience.class_ids).map((c) => strOf(c, ''));
  if (scoped.length === 0) return strOf(audience.public, '') === 'true';
  return scoped.some((c) => classIds.includes(c));
}

// ═══ 2 · የወላጅ ገጽ ═══════════════════════════════════════════════════════════

export function ParentPortalScreen() {
  return <PortalShell>{() => <ParentPortal />}</PortalShell>;
}

type ChildView = {
  studentId: string;
  relation: string;
  primary: boolean;
  profile: Row<'student_profiles'> | null;
  className: string;
  enrolmentState: string;
  meets: string;
  teacherNames: string[];
  summary: AttendanceSummary;
  average: number | null;
  results: ReportEntry[];
};

function ParentPortal() {
  const me = useResolvedMe<string>(async () => {
    const guardianId = await callFn('my_guardian_id', {});
    return guardianId ? String(guardianId) : null;
  });

  const [children, setChildren] = useState<ChildView[]>([]);
  const [selfName, setSelfName] = useState('');
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teacherNote, setTeacherNote] = useState<string | null>(null);

  const guardianId = me.value ?? '';

  const load = useCallback(async () => {
    if (!guardianId) return;
    setLoading(true);
    setError(null);
    try {
      // Only this guardian's own rows come back — `guardian_students` is policy-scoped.
      const [guardianRows, links] = await Promise.all([
        listRows(supabase.from('guardians').select('*').eq('id', guardianId).limit(1)),
        listRows(supabase.from('guardian_students').select('*').eq('guardian_id', guardianId).limit(40)),
      ]);
      setSelfName(guardianRows[0]?.full_name_am ?? '');

      const studentIds = [...new Set(links.map((l) => l.student_id))];
      if (studentIds.length === 0) {
        setChildren([]);
        setSelected('');
        return;
      }

      const [profiles, enrolments, publicClasses] = await Promise.all([
        listRows(supabase.from('student_profiles').select('*').in('id', studentIds).limit(40)),
        listRows(supabase.from('student_enrollments').select('*').in('student_id', studentIds).order('enrolled_on', { ascending: false }).limit(120)),
        fetchRows<ViewRow<'v_public_classes'>>('v_public_classes', { limit: 200 }).catch(() => [] as ViewRow<'v_public_classes'>[]),
      ]);
      const byStudent = new Map(profiles.map((p) => [p.id, p] as const));
      const classNames = new Map(publicClasses.map((c) => [String(c.id ?? ''), String(c.name_am ?? c.code ?? '—')]));
      const meetsById = new Map(publicClasses.map((c) => [String(c.id ?? ''), String(c.meets_summary_am ?? '')]));
      const classIds = [...new Set(enrolments.map((e) => e.class_id).filter(Boolean))];

      // The class view already carries the assigned teachers' names (joined from
      // `class_teachers` by the migration that made it public), so a guardian reads
      // the real name without needing that staff-only table.
      const teacherNamesById = new Map(
        publicClasses.map((c) => [
          String(c.id ?? ''),
          String(c.teacher_names ?? '')
            .split('፣')
            .map((n) => n.trim())
            .filter(Boolean),
        ])
      );
      const unnamed = classIds.filter((cid) => (teacherNamesById.get(cid) ?? []).length === 0);
      setTeacherNote(
        classIds.length === 0
          ? 'ልጅዎ በየትኛው ክፍል እንደሚማር ምዝገባ ስላልተገኘ የክፍል መምህር ስሙን መናገር አልተቻለም — መዝጋቢውን ቢሮ ይጠይቁ።'
          : unnamed.length
            ? 'የክፍሉ መምህር ስም በሰንጠረዡ ላይ ገና ስላልተመዘገበ አልታይም — ከመዝጋቢ ቢሮው ወይም ከመምህሩ ይጠይቁ።'
            : null
      );

      const byClass = new Map(enrolments.map((e) => [e.student_id, e] as const));
      const detailed = await Promise.all(
        studentIds.map(async (studentId) => {
          const link = links.find((l) => l.student_id === studentId);
          const enrolment = byClass.get(studentId);
          const [card, summary] = await Promise.all([
            callFn('student_report_card', { p_student: studentId }),
            callFn('attendance_summary', { p_student: studentId }),
          ]);
          const report = parseReportCard(card);
          const classId = enrolment?.class_id;
          return {
            studentId,
            relation: link?.relation_am ?? 'ወላጅ',
            primary: Boolean(link?.is_primary),
            profile: byStudent.get(studentId) ?? null,
            className: (classId && classNames.get(classId)) || report.entries.find((r) => r.className && r.className !== '—')?.className || 'አልታወቀም',
            enrolmentState: enrolment?.status ?? '',
            meets: (classId && meetsById.get(classId)) || '',
            teacherNames: (classId && teacherNamesById.get(classId)) || [],
            summary: parseSummary(summary),
            average: report.average,
            results: report.entries,
          } as ChildView;
        })
      );

      setChildren(detailed);
      setSelected((prev) => prev && detailed.some((c) => c.studentId === prev) ? prev : (detailed[0]?.studentId ?? ''));
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [guardianId]);

  useEffect(() => {
    if (!guardianId) return;
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load, guardianId]);

  const tabs = useMemo<TabItem[]>(() => children.map((c) => ({ value: c.studentId, label: truncate(c.profile?.full_name_am ?? 'ተማሪ', 22), count: c.results.length })), [children]);
  const active = children.find((c) => c.studentId === selected) ?? children[0] ?? null;

  if (me.phase === 'loading') return <MeLoading />;
  if (me.phase === 'failed') return <ErrorNote message={me.error ?? UI.serverError} onRetry={me.retry} />;
  if (!guardianId) {
    return (
      <MeBlocked
        title="የወላጅ መዝገብ ከዚህ መለያ ጋር አልተያረከምም"
        description="ልጅዎ በቤተ ክርስቲያኑ ወላጅ ሐዘር ውስጥ ተመዝግቦ ከመለያዎ ጋር ካልተገናኘ ይህ ገጽ ባዶ ይቆያል።እባክዎ በተመዘገበው ኢሜይል የመዝጋቢ ቢሮውን ይጠይቁ፤ ግንኙነቱ ከተመዘገበ በኋላ የልጆችዎ መረጃ ብቻ ይታያል።"
        onRetry={me.retry}
      />
    );
  }

  return (
    <div className="space-y-5">
      <PageHeading
        title="የወላጅ ገጽ"
        description={selfName ? `${selfName} — የተያያዙ ልጆች መረጃ ብቻ፤ የእያንዳንዱ ልጅ መዝገብ በየቦታው ሕግ ብቻ ይከፈታል።` : 'ልጆችዎ የተመዘገቡ መረጃዎች ብቻ እዚህ ይታያሉ።'}
        actions={
          <Button variant="ghost" size="sm" onClick={() => void load()} loading={loading} icon={<RefreshCw className="h-4 w-4" aria-hidden />}>
            እንደገና
          </Button>
        }
      />

      {error ? <ErrorNote message={error} onRetry={() => void load()} /> : null}

      {children.length === 0 && !loading ? (
        <EmptyState
          icon={<Users className="h-7 w-7" aria-hidden />}
          title="ከዚህ መዝገብ ጋር የተያረኩ ልጆች የለም"
          description="የወላጅ መዝገብዎ ከተማሪ ሐዘር ጋር አልተገናኘም።እባክዎ መዝጋቢውን ቢሮ “ልጅ ማያያዝ” እንዲደረግ ይጠይቁ።"
        />
      ) : (
        <>
          <Tabs items={tabs} value={active?.studentId ?? ''} onValueChange={setSelected}>
            <TabPanel value={active?.studentId ?? ''} className="space-y-5">
              {active ? (
                <>
                  <Card>
                    <CardHeader>
                      <div className="space-y-1">
                        <CardTitle className="flex items-center gap-2 text-base">
                          <GraduationCap className="h-4 w-4 text-muted-foreground" aria-hidden />
                          {active.profile?.full_name_am ?? 'የተማሪ ስም ያልተገኘ'}
                        </CardTitle>
                        <CardDescription>
                          ግንኙነት፦ {active.relation}
                          {active.primary ? ' · ዋና ወላጅ' : ''} · {active.className}
                          {active.meets ? ` · ${active.meets}` : ''}
                        </CardDescription>
                      </div>
                      {active.enrolmentState ? <StatusBadge tone={ENROLLMENT_TONE[active.enrolmentState] ?? 'neutral'}>{enumLabel(ENROLLMENT_LABEL, active.enrolmentState)}</StatusBadge> : <StatusBadge tone="warning">ምዝገባ አልተገኘም</StatusBadge>}
                    </CardHeader>
                    <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <Detail label="የተማሪ ቁጥር" value={active.profile?.student_code ?? '—'} />
                      <Detail label="የትምህርት ደረጃ" value={active.profile?.level_key ?? '—'} />
                      <Detail label="ቤተ ክርስቲያን/ሰብዐ" value={active.profile?.parish ?? '—'} />
                      <Detail label="የክፍል መምህር" value={active.teacherNames.length ? active.teacherNames.join('፣ ') : '—'} />
                    </CardBody>
                  </Card>

                  {teacherNote ? <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">{teacherNote}</p> : null}

                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Metric label="የመገኘት መጠን" value={active.summary.percent === null ? '—' : pct(active.summary.percent, 1)} hint={`${num(active.summary.sessions)} ቀናት`} tone={active.summary.percent === null ? 'neutral' : active.summary.percent >= 75 ? 'success' : 'warning'} />
                    <Metric label="ተገኝቷል" value={num(active.summary.present)} hint={`ዘግይቶ ${num(active.summary.late)}`} tone="success" />
                    <Metric label="ያልተገኙ" value={num(active.summary.absent)} hint={`በፈቃድ ${num(active.summary.excused)}`} tone={active.summary.absent > 0 ? 'danger' : 'neutral'} />
                    <Metric label="የፈተና አማካይ" value={active.average === null ? '—' : pct(active.average, 1)} hint={`${num(active.results.length)} የታወቁ ውጤቶች`} />
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">የታወቀ ውጤት</CardTitle>
                      <CardDescription>“ለተማሪው ታውቋል” ካሉ ውጤቶች ብቻ — የራሱ የተማሪው መረጃ ነው።</CardDescription>
                    </CardHeader>
                    <CardBody>
                      {active.results.length === 0 ? (
                        <EmptyState title="ገና የታወቀ ውጤት የለም" description="መምህሩ ውጤቱን ለወላጅ ሲያወጣ እዚህ ይታያል።" />
                      ) : (
                        <ul className="divide-y divide-border">
                          {active.results.map((r) => (
                            <li key={`${r.examId}`} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                              <div className="min-w-0">
                                <p className="truncate font-medium">{truncate(r.title, 60)}</p>
                                <p className="text-xs text-muted-foreground">
                                  {r.subject} · {r.className} · {r.examOn ? dateAm(r.examOn) : 'ቀኑ አልተመዘገበም'}
                                </p>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <StatusBadge tone="gold">{r.grade}</StatusBadge>
                                <StatusBadge tone="neutral">{r.marks === null ? '—' : `${num(r.marks)}${r.total ? ` / ${num(r.total)}` : ''}`}</StatusBadge>
                                <StatusBadge tone={RESULT_TONE[r.status] ?? 'neutral'}>{enumLabel(RESULT_STATUS, r.status)}</StatusBadge>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </CardBody>
                  </Card>
                </>
              ) : (
                <EmptyState title={UI.empty} description="ልጅ ለመመዘገብ መዝጋቢውን ቢሮ ይጠይቁ።" />
              )}
            </TabPanel>
          </Tabs>

          {/* One glanceable row per child, because a guardian often has several. */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">ሁሉም ልጆች</CardTitle>
              <CardDescription>አጭር ማጠቃለያ፤ ዝርዝሩን ለማየት ስማቸውን ይጫኑ።</CardDescription>
            </CardHeader>
            <CardBody className="space-y-2">
              {children.map((c) => (
                <button
                  key={c.studentId}
                  type="button"
                  onClick={() => setSelected(c.studentId)}
                  className={`flex w-full flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-start transition-colors hover:bg-accent/50 ${c.studentId === selected ? 'border-primary' : 'border-border'}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{c.profile?.full_name_am ?? 'የተማሪ ስም ያልተገኘ'}</span>
                    <span className="block text-xs text-muted-foreground">
                      {c.className} · {c.relation} · የመገኘት {c.summary.percent === null ? '—' : pct(c.summary.percent, 1)}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone="info">{num(c.results.length)} ውጤት</StatusBadge>
                    {c.primary ? <StatusBadge tone="gold">ዋና ወላጅ</StatusBadge> : null}
                  </span>
                </button>
              ))}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}

// ═══ 3 · የመምህር ገጽ ══════════════════════════════════════════════════════════

export function TeacherPortalScreen() {
  return <PortalShell>{(uid) => <TeacherPortal uid={uid} />}</PortalShell>;
}

type ClassOption = { id: string; nameAm: string; code: string; meets: string; room: string; schedule: unknown };
type RosterEntry = { studentId: string; nameAm: string; code: string };
type Mark = { status: AttendanceStatus; minutesLate: string; reason: string };
const EMPTY_MARK: Mark = { status: 'present', minutesLate: '0', reason: '' };

function TeacherPortal({ uid }: { uid: string }) {
  const { can, identity } = useAuth();
  const mayWriteAll = can('attendance.write', 'academics.write');

  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [classId, setClassId] = useState('');
  const [resolveNote, setResolveNote] = useState<string | null>(null);
  const [teacherLinkNote, setTeacherLinkNote] = useState<string | null>(null);
  const [classesLoading, setClassesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState('attendance');

  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [takenOn, setTakenOn] = useState(isoToday());
  const [labelAm, setLabelAm] = useState('');
  const [session, setSession] = useState<Row<'attendance_sessions'> | null>(null);
  const [mayMark, setMayMark] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const [teacherId, setTeacherId] = useState('');
  const [plans, setPlans] = useState<Row<'lesson_plans'>[]>([]);
  const [planDraftOpen, setPlanDraftOpen] = useState(false);
  const [planDraft, setPlanDraft] = useState({ planFor: isoToday(), titleAm: '', objectives: '', content: '', activities: '', assessment: '', status: 'draft' });

  const [exams, setExams] = useState<Row<'exams'>[]>([]);
  const [examId, setExamId] = useState('');
  const [existing, setExisting] = useState<Map<string, Row<'exam_results'>>>(new Map());
  const [entered, setEntered] = useState<Record<string, string>>({});
  const [ranking, setRanking] = useState<Returns<'class_ranking'>>([]);

  const [days, setDays] = useState<Row<'class_sessions'>[]>([]);

  // The classes this person teaches. `classes` is already filtered by RLS
  // (`classes_teacher_read`), and scoped grants add the classes a role holds.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    setClassesLoading(true);
    async function resolve() {
      try {
        const direct = await listRows(supabase.from('classes').select('*').eq('is_active', true).limit(200));
        const scoped = await callFn('scope_ids', { p_scope_key: 'class_ids' }).catch(() => [] as string[]);
        if (direct.length > 0) {
          const byId = new Map(direct.map((c) => [c.id, c] as const));
          const extra = await fetchRows<ViewRow<'v_public_classes'>>('v_public_classes', { limit: 200 });
          for (const id of scoped) if (!byId.has(id)) {
            const row = extra.find((c) => c.id === id);
            if (row?.id) {
              byId.set(id, {
                id,
                name_am: row.name_am ?? '—',
                code: row.code ?? '—',
                meets_summary_am: row.meets_summary_am ?? undefined,
                room_am: row.room_am ?? undefined,
                schedule: row.schedule as Json,
              } as unknown as Row<'classes'>);
            }
          }
          if (!cancelled) {
            setClasses([...byId.values()].map((c) => ({ id: c.id, nameAm: c.name_am, code: c.code, meets: c.meets_summary_am ?? '', room: c.room_am ?? '', schedule: c.schedule })));
            setClassId((prev) => prev || [...byId.keys()][0] || '');
            setResolveNote(null);
          }
          return;
        }

        // Teachers hold no module permission, so ask the database per active class.
        const all = await fetchRows<ViewRow<'v_public_classes'>>('v_public_classes', { limit: 120 });
        const verdicts = await Promise.all(all.map((c) => (c.id ? callFn('teaches_class', { p_class: c.id }).catch(() => false) : Promise.resolve(false))));
        const mine = all.filter((c, i) => verdicts[i] || scoped.includes(String(c.id)));
        if (cancelled) return;
        setClasses(
          mine.map((c) => ({
            id: String(c.id ?? ''),
            nameAm: String(c.name_am ?? '—'),
            code: String(c.code ?? '—'),
            meets: String(c.meets_summary_am ?? ''),
            room: String(c.room_am ?? ''),
            schedule: c.schedule,
          }))
        );
        setClassId((prev) => prev || String(mine[0]?.id ?? ''));
        setResolveNote(mine.length === 0 ? 'በአሁኑ ጊዜ የሚያስተምሩበት ክፍል አልተመዘገበም።እባክዎ በ “የክፍል መምህራን” ላይ እንዲመደቡሉ መዝጋቢውን ቢሮ ይጠይቁ።' : null);
      } catch (e) {
        if (!cancelled) setError(friendlyError(e));
      } finally {
        if (!cancelled) setClassesLoading(false);
      }
    }
    void resolve();
    return () => {
      cancelled = true;
    };
  }, []);

  // Everything below follows the selected class.
  const loadClass = useCallback(async () => {
    if (!classId) return;
    setError(null);
    setBusy(true);
    try {
      const enrollments = await listRows(
        supabase.from('student_enrollments').select('*').eq('class_id', classId).eq('status', 'enrolled').limit(400)
      );
      const studentIds = [...new Set(enrollments.map((e) => e.student_id))];
      const profiles = await readIn('student_profiles', 'id', studentIds);
      const byId = new Map(profiles.map((p) => [p.id, p] as const));
      const entries: RosterEntry[] = studentIds
        .map((id) => ({ studentId: id, nameAm: byId.get(id)?.full_name_am ?? `ተማሪ ${truncate(id, 6)}`, code: byId.get(id)?.student_code ?? '—' }))
        .sort((a, b) => a.nameAm.localeCompare(b.nameAm, 'am'));

      const sessions = await listRows(supabase.from('attendance_sessions').select('*').eq('class_id', classId).eq('taken_on', takenOn).limit(3));
      const open = sessions[0] ?? null;
      let prefill: Record<string, Mark> = {};
      if (open) {
        const records = await listRows(supabase.from('attendance_records').select('*').eq('session_id', open.id).limit(400));
        prefill = Object.fromEntries(records.map((r) => [r.student_id, { status: r.status, minutesLate: String(r.minutes_late ?? 0), reason: r.reason_am ?? '' } as Mark]));
      }

      const verdict = mayWriteAll ? null : await callFn('teaches_class', { p_class: classId }).catch(() => false);
      const [daySessions, examRows, teacherRows] = await Promise.all([
        listRows(supabase.from('class_sessions').select('*').eq('class_id', classId).order('held_on', { ascending: false }).limit(30)),
        listRows(supabase.from('exams').select('*').eq('class_id', classId).order('exam_on', { ascending: false }).limit(40)),
        listRows(supabase.from('teacher_profiles').select('*').eq('user_id', uid).limit(1)).catch(() => [] as Row<'teacher_profiles'>[]),
      ]);

      let resolvedTeacherId = teacherRows[0]?.id ?? '';
      let linkNote: string | null = null;
      if (!resolvedTeacherId) {
        // `teacher_profiles` is readable only with `teachers.read`, which the plain
        // `teacher` role does not hold, so the person's own row cannot be resolved
        // from the login directly. The public teacher view is the last real read
        // left: the session's own Amharic name matched against exactly one teacher.
        // The `lesson_plans` policy re-checks `teacher_id = own row` on insert, so a
        // wrong guess is refused by the database instead of touching another record.
        const publicTeachers = await fetchRows<ViewRow<'v_public_teachers'>>('v_public_teachers', { limit: 500 }).catch(() => [] as ViewRow<'v_public_teachers'>[]);
        const matches = publicTeachers.filter((t) => t.full_name_am && t.full_name_am === (identity?.nameAm ?? ''));
        if (matches.length === 1 && matches[0].id) {
          resolvedTeacherId = String(matches[0].id);
          linkNote = 'መምህር መዝገብዎ ከመለያዎ ጋር በቀጥታ ስላልተያያዘ በስም ማዛመጥ ጥቅም ላይ ውሏል — በመዝጋቢ ቢሮ ማያያዝ የተሻለ ነው።';
        }
      }
      setTeacherLinkNote(linkNote);

      setRoster(entries);
      setSession(open);
      setDays(daySessions);
      setExams(examRows);
      setExamId((prev) => (examRows.some((x) => x.id === prev) ? prev : (examRows[0]?.id ?? '')));
      setTeacherId((prev) => prev || resolvedTeacherId);
      setMayMark(verdict);
      setMarks(() => {
        const next: Record<string, Mark> = { ...prefill };
        for (const entry of entries) next[entry.studentId] = next[entry.studentId] ?? prefill[entry.studentId] ?? EMPTY_MARK;
        return next;
      });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }, [classId, takenOn, uid, mayWriteAll, identity]);

  useEffect(() => {
    if (!classId) return;
    const timer = setTimeout(() => void loadClass(), 0);
    return () => clearTimeout(timer);
  }, [loadClass, classId]);

  const loadPlans = useCallback(async () => {
    if (!teacherId) {
      setPlans([]);
      return;
    }
    try {
      setPlans(await listRows(supabase.from('lesson_plans').select('*').eq('teacher_id', teacherId).order('plan_for', { ascending: false }).limit(60)));
    } catch (e) {
      setError(friendlyError(e));
    }
  }, [teacherId]);

  useEffect(() => {
    const timer = setTimeout(() => void loadPlans(), 0);
    return () => clearTimeout(timer);
  }, [loadPlans]);

  const loadResults = useCallback(async () => {
    if (!examId) {
      setExisting(new Map());
      setEntered({});
      setRanking([]);
      return;
    }
    try {
      const rows = await listRows(supabase.from('exam_results').select('*').eq('exam_id', examId).limit(400));
      setExisting(new Map(rows.map((r) => [r.student_id, r] as const)));
      setEntered(Object.fromEntries(rows.filter((r) => r.marks !== null && r.marks !== undefined).map((r) => [r.student_id, String(r.marks)])));
      const ranked = await callFn('class_ranking', { p_class_id: classId, p_exam_id: examId });
      setRanking(ranked ?? []);
    } catch (e) {
      setError(friendlyError(e));
    }
  }, [examId, classId]);

  useEffect(() => {
    const timer = setTimeout(() => void loadResults(), 0);
    return () => clearTimeout(timer);
  }, [loadResults]);

  const activeClass = classes.find((c) => c.id === classId) ?? null;
  const schedule = useMemo(() => parseSchedule(activeClass?.schedule), [activeClass]);
  const selectedExam = exams.find((e) => e.id === examId) ?? null;
  const blocked = mayMark === false;

  const totals = useMemo(() => {
    const acc: Record<AttendanceStatus, number> = { present: 0, absent: 0, late: 0, excused: 0 };
    for (const entry of roster) acc[marks[entry.studentId]?.status ?? 'present'] += 1;
    return { acc, rate: rateOf(acc.present + acc.late, roster.length) };
  }, [roster, marks]);

  function setMark(studentId: string, patch: Partial<Mark>) {
    setMarks((prev) => ({ ...prev, [studentId]: { ...(prev[studentId] ?? EMPTY_MARK), ...patch } }));
  }

  function allPresent() {
    const next: Record<string, Mark> = {};
    for (const entry of roster) next[entry.studentId] = { ...EMPTY_MARK };
    setMarks(next);
    toast.info('ሁሉም “ተገኝቷል” ሆነው ተሞልተዋል፤ አስቀምጥ ሲጫኑ ይመዘገባል።');
  }

  /** The only writer of the session and its records — the counts come back recomputed. */
  async function saveAttendance() {
    if (!classId || roster.length === 0) return;
    setBusy(true);
    try {
      const args: Args<'save_attendance'> = {
        p_class_id: classId,
        p_taken_on: takenOn,
        p_records: roster.map((entry) => {
          const mark = marks[entry.studentId] ?? EMPTY_MARK;
          return {
            student_id: entry.studentId,
            status: mark.status,
            minutes_late: Math.max(0, Math.round(numOf(mark.minutesLate))),
            reason_am: mark.reason.trim() || null,
          };
        }),
      };
      if (session) args.p_session_id = session.id;
      if (labelAm.trim()) args.p_label_am = labelAm.trim();

      const sessionId = await callFn('save_attendance', args);
      const rows = await listRows(supabase.from('attendance_sessions').select('*').eq('id', sessionId).limit(1));
      setSession(rows[0] ?? session);
      toast.success(`መገኘቱ ተቀምጧል — ${num(roster.length)} ተማሪዎች።ዳግም ቆጠራው በሰርቪሱ ተደርጟል።`);
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function closeSession() {
    if (!session) return;
    setBusy(true);
    try {
      const closed = await callFn('close_attendance_session', { p_session: session.id });
      setSession(closed);
      toast.success('የትምህርቱ ቀን መገኘት ተዘግቷል።');
      await loadClass();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function createPlan() {
    if (!teacherId) return;
    if (planDraft.titleAm.trim().length < 3) {
      toast.error('የዕቅዱ ርዕስ ቢያንስ 3 ፊደል መሆን አለበት።');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        teacher_id: teacherId,
        class_id: classId || null,
        plan_for: planDraft.planFor,
        title_am: planDraft.titleAm.trim(),
        objectives_am: planDraft.objectives.trim() || null,
        content_am: planDraft.content.trim() || null,
        activities_am: planDraft.activities.trim() || null,
        assessment_am: planDraft.assessment.trim() || null,
        status: planDraft.status,
      } as never;
      const { error: insertError } = await supabase.from('lesson_plans').insert(payload);
      if (insertError) throw new Error(friendlyError(insertError));
      toast.success('የትምህርት ዕቅድዎ ተመዝግቧል፤ የግምገማ ሐዘር ለማየት ቅድመ ሐሳብ ተብሎ ይቆያል።');
      setPlanDraftOpen(false);
      setPlanDraft({ planFor: isoToday(), titleAm: '', objectives: '', content: '', activities: '', assessment: '', status: 'draft' });
      await loadPlans();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : UI.serverError);
    } finally {
      setBusy(false);
    }
  }

  /** Marks only; the percentage and the grade letter belong to the database triggers. */
  async function saveMarks() {
    if (!selectedExam) return;
    const total = numOf(selectedExam.total_marks);
    const entries = Object.entries(entered).filter(([, v]) => v.trim() !== '');
    if (entries.length === 0) {
      toast.error('ለማንኛውም ተማሪ ነጥብ ይስጡ።');
      return;
    }
    for (const [, v] of entries) {
      const value = Number(v);
      if (!Number.isFinite(value) || value < 0) {
        toast.error('ነጥቡ ከዜሮ መብለጥ የለበትም።');
        return;
      }
      if (total > 0 && value > total) {
        toast.error(`ነጥቡ ከፈተናው ጠቅላላ (${num(total)}) በላይ ሊሆን አይችልም።`);
        return;
      }
    }
    setBusy(true);
    let written = 0;
    let failed = 0;
    for (const [studentId, raw] of entries) {
      const value = Number(raw);
      const row = existing.get(studentId);
      try {
        if (row) {
          const { error: updateError } = await supabase.from('exam_results').update({ marks: value } as never).eq('id', row.id);
          if (updateError) throw new Error(friendlyError(updateError));
        } else {
          const { error: insertError } = await supabase.from('exam_results').insert({ exam_id: selectedExam.id, student_id: studentId, marks: value } as never);
          if (insertError) throw new Error(friendlyError(insertError));
        }
        written += 1;
      } catch {
        failed += 1;
      }
    }
    setBusy(false);
    if (failed > 0) toast.warning(`${num(written)} ተመዝግበዋል፤ ${num(failed)} ግን አልተሳካም (ውጤት ለማሳወቅ “ውጤት ማሳወቅ” መብት ያስፈልጋል)።`);
    else toast.success(`${num(written)} የተማሪ ነጥቦች ተቀምጠዋል — ከመቶኛና የደረጃ ፊደል በሰርቪሱ ይሰላሉ።`);
    await loadResults();
  }

  const planColumns = useMemo<Column<Row<'lesson_plans'>>[]>(
    () => [
      { key: 'plan_for', header: 'የታቀደበት', sortable: true, cell: (r) => <span className="whitespace-nowrap text-xs">{dateAm(r.plan_for)}</span> },
      { key: 'title_am', header: 'ርዕስ', cell: (r) => <span className="font-medium">{truncate(r.title_am, 60)}</span> },
      { key: 'objectives_am', header: 'ዓላማ', hideBelow: 'md', cell: (r) => (r.objectives_am ? truncate(r.objectives_am, 80) : '—') },
      { key: 'status', header: 'ሁኔታ', cell: (r) => <StatusBadge tone={LESSON_TONE[r.status] ?? 'neutral'}>{enumLabel(LESSON_STATUS, r.status)}</StatusBadge> },
      { key: 'review_notes', header: 'የግምገማ ማስታወሻ', hideBelow: 'lg', cell: (r) => (r.review_notes ? truncate(r.review_notes, 60) : '—') },
    ],
    []
  );

  const dayColumns = useMemo<Column<Row<'class_sessions'>>[]>(
    () => [
      { key: 'held_on', header: 'ቀን', sortable: true, cell: (r) => <span className="whitespace-nowrap text-xs">{dateAm(r.held_on)}</span> },
      { key: 'topic_am', header: 'የዕለቱ ርዕስ', cell: (r) => r.topic_am ?? '—' },
      { key: 'starts_at', header: 'ሰዓት', hideBelow: 'sm', cell: (r) => (r.starts_at ? `${r.starts_at.slice(0, 5)}${r.ends_at ? `–${r.ends_at.slice(0, 5)}` : ''}` : '—') },
      { key: 'homework_am', header: 'ቤት ሥራ', hideBelow: 'md', cell: (r) => (r.homework_am ? truncate(r.homework_am, 60) : '—') },
      { key: 'attendance_taken', header: 'መገኘት', cell: (r) => (r.attendance_taken ? <StatusBadge tone="success">ተመዝግቧል</StatusBadge> : <StatusBadge tone="warning">ገና</StatusBadge>) },
    ],
    []
  );

  const tabs = useMemo<TabItem[]>(
    () => [
      { value: 'attendance', label: 'መገኘት' },
      { value: 'results', label: 'ፈተናና ውጤት' },
      { value: 'plans', label: 'የትምህርት ዕቅድ', count: plans.length },
      { value: 'schedule', label: 'የትምህርት ቀናት', count: days.length },
    ],
    [plans.length, days.length]
  );

  return (
    <div className="space-y-5">
      <PageHeading
        title="የመምህር ገጽ"
        description="የሚያስተምሯቸው ክፍሎች ብቻ ይታዩዎታል — የክፍል ኃላፊነትዎ በ `teaches_class`ና በሰንጠረዡ ሕግ ብቻ ይወሰናል።"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void loadClass()} disabled={!classId} loading={busy} icon={<RefreshCw className="h-4 w-4" aria-hidden />}>
              እንደገና
            </Button>
          </>
        }
      />

      {error ? <ErrorNote message={error} onRetry={() => void loadClass()} /> : null}
      {resolveNote ? <EmptyState icon={<School className="h-7 w-7" aria-hidden />} title="የሚያስተምሩበት ክፍል አልተገኘም" description={resolveNote} /> : null}

      <Card>
        <CardBody className="flex flex-wrap items-end gap-4">
          <Field label="ክፍል" htmlFor="tc-class" className="w-72" hint={classes.length > 0 ? `${num(classes.length)} ክፍል ለእርስዎ ክፍት ነው` : undefined}>
            <Select id="tc-class" value={classId} placeholder={classesLoading ? UI.loading : UI.all} options={classesLoading ? [] : classes.map((c) => ({ value: c.id, label: `${c.nameAm} (${c.code})` }))} onChange={(e) => setClassId(e.target.value)} />
          </Field>
          {activeClass ? (
            <div className="flex flex-wrap items-center gap-2 pb-2 text-xs text-muted-foreground">
              <StatusBadge tone="info">{activeClass.meets || 'የመገናኛ ጊዜ አልተጻፈም'}</StatusBadge>
              {activeClass.room ? <StatusBadge tone="neutral">ቦታ፦ {activeClass.room}</StatusBadge> : null}
              {schedule.map((s) => (
                <StatusBadge key={`${s.day}${s.span}`} tone="gold">
                  {s.day} {s.span}
                </StatusBadge>
              ))}
            </div>
          ) : null}
        </CardBody>
      </Card>

      {!classId && !classesLoading ? (
        <EmptyState icon={<Users className="h-7 w-7" aria-hidden />} title="ክፍል ይምረጡ" description="ከላይ ክፍል ሲመርጡ ዝርዝር ተማሪዎች፣ መገኘት፣ ውጤትና ዕቅድ አንድ ላይ ይከፈታሉ።" />
      ) : (
        <Tabs items={tabs} value={tab} onValueChange={setTab}>
          <TabPanel value="attendance" className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="ተገኙ" value={num(totals.acc.present)} hint={`ዘግይተው ${num(totals.acc.late)}`} tone="success" />
              <Metric label="ያልተገኙ" value={num(totals.acc.absent)} tone={totals.acc.absent > 0 ? 'danger' : 'neutral'} />
              <Metric label="በፈቃድ" value={num(totals.acc.excused)} />
              <Metric label="ዛሬው መገኘት" value={totals.rate === null ? '—' : pct(totals.rate, 1)} hint={`${num(roster.length)} በዝርዝሩ ላይ`} />
            </div>

            <Card>
              <CardHeader>
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ClipboardList className="h-4 w-4 text-muted-foreground" aria-hidden />
                    የዕለቱ መገኘት
                  </CardTitle>
                  <CardDescription>ማንኛውም ለውጥ በ `save_attendance` ይቀመጣል — መዝገቡ ቢኖር ይከፈታል፣ የሌለ አዲስ ይፈጠራል።</CardDescription>
                </div>
                {session ? <StatusBadge tone={session.status === 'open' ? 'info' : 'success'}>{session.status === 'open' ? 'ክፍት' : 'ተዘግቷል'}</StatusBadge> : <StatusBadge tone="neutral">ገና አልተመዘገበም</StatusBadge>}
              </CardHeader>
              <CardBody className="space-y-4">
                <div className="flex flex-wrap items-end gap-4">
                  <Field label="ቀን" htmlFor="ta-date" className="w-48">
                    <DateInput id="ta-date" value={takenOn} onValueChange={setTakenOn} />
                  </Field>
                  <Field label="ለዕለቱ ማስታወሻ (ምሳሌ በዓል)" htmlFor="ta-label" className="w-64">
                    <Input id="ta-label" value={labelAm} onChange={(e) => setLabelAm(e.target.value)} placeholder="ለምሳሌ ልባዕል — ንባብ" />
                  </Field>
                  <div className="flex flex-wrap items-center gap-2 pb-2">
                    <Button size="sm" variant="outline" onClick={allPresent} disabled={roster.length === 0 || blocked} icon={<Check className="h-4 w-4" aria-hidden />}>
                      ሁሉም ተገኝተዋል
                    </Button>
                  </div>
                </div>

                {blocked ? (
                  <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
                    ይህንን ክፍል ለመቅመጥ የተመደቡ መምህር አይደሉም — `teaches_class` አይደለም ማለት ነው።
                  </p>
                ) : null}

                {roster.length === 0 ? (
                  <EmptyState icon={<Users className="h-7 w-7" aria-hidden />} title="በዚህ ክፍል የተመዘገበ ተማሪ የለም" description="ዝርዝሩ በ `student_enrollments` ሁኔታ “የተመዘገበ” ካሉ ብቻ ይሞላል።" />
                ) : (
                  <ul className="divide-y divide-border">
                    {roster.map((entry) => {
                      const mark = marks[entry.studentId] ?? EMPTY_MARK;
                      return (
                        <li key={entry.studentId} className="space-y-2 py-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="min-w-0">
                              <span className="block truncate font-medium">{entry.nameAm}</span>
                              <span className="block text-xs text-muted-foreground">{entry.code}</span>
                            </span>
                            <span className="flex flex-wrap items-center gap-1.5">
                              {ATTENDANCE_KEYS.map((key) => (
                                <Button
                                  key={key}
                                  size="sm"
                                  variant={mark.status === key ? 'primary' : 'outline'}
                                  disabled={blocked}
                                  onClick={() => setMark(entry.studentId, { status: key })}
                                >
                                  {enumLabel(ATTENDANCE_STATUS, key)}
                                </Button>
                              ))}
                            </span>
                          </div>
                          {mark.status === 'late' ? (
                            <Field label="በደቂቃ" htmlFor={`late-${entry.studentId}`} className="w-32">
                              <Input id={`late-${entry.studentId}`} type="number" min={0} value={mark.minutesLate} onChange={(e) => setMark(entry.studentId, { minutesLate: e.target.value })} />
                            </Field>
                          ) : null}
                          {mark.status !== 'present' ? (
                            <Field label="ምክንያት (ከፈለጉ)" htmlFor={`why-${entry.studentId}`} className="max-w-xl">
                              <Input id={`why-${entry.studentId}`} value={mark.reason} onChange={(e) => setMark(entry.studentId, { reason: e.target.value })} placeholder="ለምሳሌ ሕመም፣ ጉዞ፣ የቤተሰብ ችግር" />
                            </Field>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}

                <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
                  <Button onClick={() => void saveAttendance()} loading={busy} disabled={roster.length === 0 || blocked} icon={<Save className="h-4 w-4" aria-hidden />}>
                    መገኘት አስቀምጥ
                  </Button>
                  <Button variant="outline" onClick={() => void closeSession()} disabled={!session || busy} icon={<Check className="h-4 w-4" aria-hidden />}>
                    የዕለቱን መዝገብ ዘጋ
                  </Button>
                  {session ? <span className="text-xs text-muted-foreground">ቆጠራ፦ {num(session.present_count)} ተገኝተዋል · {num(session.absent_count)} አልተገኙም · {num(session.expected_count)} ተስፋ የታደሰ</span> : null}
                </div>
              </CardBody>
            </Card>
          </TabPanel>

          <TabPanel value="results" className="space-y-4">
            <Card>
              <CardBody className="flex flex-wrap items-end gap-4">
                <Field label="ፈተና" htmlFor="te-exam" className="w-80" hint={exams.length === 0 ? 'ለዚህ ክፍል የተዘጋጀ ፈተና የለም — ዳይሬክተሩ በ “ፈተናዎች” ይፈጥራል።' : 'ነጥብ ብቻ ይመዘግባሉ፤ ከመቶኛና ፊደሉ በሰርቪሱ ይሰላሉ።'}>
                  <Select id="te-exam" value={examId} placeholder={UI.all} options={exams.map((e) => ({ value: e.id, label: `${e.title_am} · ${enumLabel(EXAM_TYPE, e.exam_type)}` }))} onChange={(e) => setExamId(e.target.value)} />
                </Field>
                {selectedExam ? (
                  <div className="flex flex-wrap items-center gap-2 pb-2 text-xs">
                    <StatusBadge tone="info">ጠቅላላ {num(selectedExam.total_marks)}</StatusBadge>
                    {selectedExam.pass_mark ? <StatusBadge tone="neutral">የማለፊያ {num(selectedExam.pass_mark)}</StatusBadge> : null}
                    <StatusBadge tone={selectedExam.exam_on && selectedExam.exam_on < isoToday() ? 'success' : 'warning'}>{selectedExam.exam_on ? dateAm(selectedExam.exam_on) : 'ቀን ሳይታወቅ'}</StatusBadge>
                  </div>
                ) : null}
                <div className="ms-auto flex items-center gap-2 pb-2">
                  <Button size="sm" onClick={() => void saveMarks()} disabled={!selectedExam || busy} loading={busy} icon={<Save className="h-4 w-4" aria-hidden />}>
                    ነጥቦችን አስቀምጥ
                  </Button>
                </div>
              </CardBody>
            </Card>

            {selectedExam ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">የተማሪ ነጥብ</CardTitle>
                  <CardDescription>“ለተማሪው ታውቋል” ማድረግ የሚችለው የውጤት ማሳወቂያ መብት ያለው ብቻ ነው።</CardDescription>
                </CardHeader>
                <CardBody className="space-y-2">
                  {roster.length === 0 ? (
                    <EmptyState title="ተማሪ ዝርዝር የለም" description="ክፍሉ ሲሞላ እዚህ ይታያል።" />
                  ) : (
                    roster.map((entry) => {
                      const row = existing.get(entry.studentId);
                      return (
                        <div key={entry.studentId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{entry.nameAm}</span>
                            <span className="block text-xs text-muted-foreground">{entry.code}</span>
                          </span>
                          <span className="flex flex-wrap items-center gap-2">
                            <Input
                              aria-label={`ነጥብ ${entry.nameAm}`}
                              className="w-24"
                              type="number"
                              min={0}
                              max={numOf(selectedExam.total_marks) || undefined}
                              value={entered[entry.studentId] ?? ''}
                              onChange={(e) => setEntered((prev) => ({ ...prev, [entry.studentId]: e.target.value }))}
                              placeholder="—"
                            />
                            {row ? (
                              <StatusBadge tone={RESULT_TONE[row.status] ?? 'neutral'}>{enumLabel(RESULT_STATUS, row.status)}</StatusBadge>
                            ) : (
                              <StatusBadge tone="neutral">ገና</StatusBadge>
                            )}
                            {row?.grade_letter ? <StatusBadge tone="gold">{row.grade_letter}</StatusBadge> : null}
                          </span>
                        </div>
                      );
                    })
                  )}
                </CardBody>
              </Card>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Award className="h-4 w-4 text-muted-foreground" aria-hidden />
                  የክፍል ደረጃ
                </CardTitle>
                <CardDescription>የ `class_ranking` መልስ — የታወቁ ውጤቶች ብቻ ይቆጠራሉ።</CardDescription>
              </CardHeader>
              <CardBody>
                {ranking.length === 0 ? (
                  <EmptyState title="የታወቀ ደረጃ የለም" description="ውጤቱ “ለተማሪው ታውቋል” ሲባል ደረጃው እዚህ ይታያል።" />
                ) : (
                  <ul className="divide-y divide-border">
                    {ranking.map((r) => (
                      <li key={r.student_id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                        <span className="flex min-w-0 items-center gap-3">
                          <StatusBadge tone="gold">{num(r.ranking)}</StatusBadge>
                          <span className="truncate font-medium">{r.full_name_am}</span>
                        </span>
                        <span className="flex items-center gap-2 text-sm">
                          <span>{num(r.marks)}</span>
                          <span className="text-muted-foreground">{pct(numOf(r.percent), 1)}</span>
                          <StatusBadge tone="neutral">{String(r.grade_letter ?? '—')}</StatusBadge>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </TabPanel>

          <TabPanel value="plans" className="space-y-4">
            {teacherLinkNote ? <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">{teacherLinkNote}</p> : null}
            {!teacherId ? (
              <MeBlocked
                title="የመምህር ሐዘር መዝገብዎ ለዚህ መለያ አልተገኘም"
                description="ዕቅድ ለመዘጋጀት መምህር መዝገብዎ ከመተግበሪያ መለያዎ ጋር በቀጥታ የተያያዘ መሆን አለበት።`teacher_profiles` ሰንጠረዡን ለማንበብ `teachers.read` ስለሚፈልግ፣ የመምህራን መዝገብ ለእርስዎ ክፍት ካልሆነ እባክዎ የመዝጋቢ ቢሮውን “መምህር ማያያዝ” እንዲያደርጉ ይጠይቁ።"
              />
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">የራስዎ ዕቅዶች — ቅድመ ሐሳብ ሆነው ይጀምራሉ፤ ግምገማቸውን የሚያደርገው ኃላፊነት ያለው ቢሮ ነው።</p>
                  <Button size="sm" onClick={() => setPlanDraftOpen(true)} icon={<ClipboardList className="h-4 w-4" aria-hidden />}>
                    አዲስ ዕቅድ
                  </Button>
                </div>
                <DataTable
                  rows={plans}
                  columns={planColumns}
                  rowKey={(r) => r.id}
                  pageSize={15}
                  emptyTitle="ገና ዕቅድ አልዘጋጀሁም"
                  emptyDescription="“አዲስ ዕቅድ” በመጫን የሚያስተምሩትን ዓላማና ይዘት ይመዝግቡ።"
                  caption="የመምህር የትምህርት ዕቅዶች"
                />
              </>
            )}

            <Modal
              open={planDraftOpen}
              onOpenChange={(next) => {
                if (!next) setPlanDraftOpen(false);
              }}
              size="lg"
              title="አዲስ የትምህርት ዕቅድ"
              description="እነዚህ መረጃዎች በቀጥታ በ `lesson_plans` ይቀመጣሉ — የዕቅድ ገጹ የእርስዎ መዝገብ ሲሆን ብቻ ይገኛል።"
              footer={
                <>
                  <Button variant="ghost" onClick={() => setPlanDraftOpen(false)}>
                    {UI.cancel}
                  </Button>
                  <Button onClick={() => void createPlan()} loading={busy} icon={<Save className="h-4 w-4" aria-hidden />}>
                    {UI.save}
                  </Button>
                </>
              }
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="የታቀደበት ቀን" htmlFor="tp-date" required>
                  <DateInput id="tp-date" value={planDraft.planFor} onValueChange={(v) => setPlanDraft((d) => ({ ...d, planFor: v }))} />
                </Field>
                <Field label="ክፍል" htmlFor="tp-class" hint="አሁን የመረጡት ይሞላል።">
                  <Select id="tp-class" value={classId} placeholder={UI.all} options={classes.map((c) => ({ value: c.id, label: c.nameAm }))} onChange={(e) => setClassId(e.target.value)} />
                </Field>
                <Field label="ርዕስ" htmlFor="tp-title" required className="sm:col-span-2">
                  <Input id="tp-title" value={planDraft.titleAm} onChange={(e) => setPlanDraft((d) => ({ ...d, titleAm: e.target.value }))} placeholder="ለምሳሌ አብርሃምና ሦስቱ እንግዶች" />
                </Field>
                <Field label="ዓላማዎች" htmlFor="tp-objectives" className="sm:col-span-2">
                  <Textarea id="tp-objectives" value={planDraft.objectives} onChange={(e) => setPlanDraft((d) => ({ ...d, objectives: e.target.value }))} rows={3} />
                </Field>
                <Field label="የትምህርት ይዘት" htmlFor="tp-content" className="sm:col-span-2">
                  <Textarea id="tp-content" value={planDraft.content} onChange={(e) => setPlanDraft((d) => ({ ...d, content: e.target.value }))} rows={4} />
                </Field>
                <Field label="ተግባራት" htmlFor="tp-activities">
                  <Textarea id="tp-activities" value={planDraft.activities} onChange={(e) => setPlanDraft((d) => ({ ...d, activities: e.target.value }))} rows={3} />
                </Field>
                <Field label="የግምገማ ዘዴ" htmlFor="tp-assessment">
                  <Textarea id="tp-assessment" value={planDraft.assessment} onChange={(e) => setPlanDraft((d) => ({ ...d, assessment: e.target.value }))} rows={3} />
                </Field>
                <Field label="ሁኔታ" htmlFor="tp-status" className="sm:col-span-2" hint="“የቀረበ” ማድረግ የግምገማ ቢሮ ሥራ ነው፤ እዚህ ቅድመ ሐሳብ ተብሎ ይቀመጣል።">
                  <Select id="tp-status" value={planDraft.status} options={LESSON_STATUS_OPTIONS.filter((o) => o.value === 'draft')} onChange={(e) => setPlanDraft((d) => ({ ...d, status: e.target.value }))} />
                </Field>
              </div>
            </Modal>
          </TabPanel>

          <TabPanel value="schedule" className="space-y-4">
            {schedule.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden />
                    ሳምንታዊ ሰዓተ ትምህርት
                  </CardTitle>
                  <CardDescription>ከክፍሉ `schedule` መዝገብ የተወሰደ፤ 0 = እሁድ።</CardDescription>
                </CardHeader>
                <CardBody className="flex flex-wrap gap-2">
                  {schedule.map((s) => (
                    <StatusBadge key={`${s.day}${s.span}`} tone="gold">
                      {s.day} · {s.span}
                    </StatusBadge>
                  ))}
                </CardBody>
              </Card>
            ) : (
              <p className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground">ለክፍሉ ሳምንታዊ ሰዓት አልተመዘገበም — {activeClass?.meets || 'በመዝጋቢ ቢሮ የክፍሉ ሰዓት እንዲታዘዝ ይጠይቁ።'}</p>
            )}

            <DataTable
              rows={days}
              columns={dayColumns}
              rowKey={(r) => r.id}
              pageSize={15}
              emptyTitle="የተሠራ ቀን መዝገብ የለም"
              emptyDescription="የክፍል ትምህርት ቀኑ ከተመዘገበ በኋላ እዚህ ይታያል፤ መገኘቱ በላይ ባለው ሐዘር ይቆጠራል።"
              caption="የክፍል ትምህርት ቀናት"
            />
          </TabPanel>
        </Tabs>
      )}
    </div>
  );
}

// ═══ 4 · የዘርፍ ኃላፊ ገጽ ═══════════════════════════════════════════════════════

export function DepartmentPortalScreen() {
  return <PortalShell>{(uid) => <DepartmentPortal uid={uid} />}</PortalShell>;
}

const BUDGET_STATE: Record<string, string> = {
  draft: 'ቅድመ ሐሳብ',
  submitted: 'የቀረበ',
  approved: 'ጸድቋል',
  rejected: 'አልጸደቀም',
  closed: 'ተዘግቷል',
};
const BUDGET_TONE: Record<string, Tone> = {
  draft: 'neutral',
  submitted: 'info',
  approved: 'success',
  rejected: 'danger',
  closed: 'neutral',
};

type DeptBundle = {
  members: Row<'department_members'>[];
  names: Map<string, string>;
  activities: Row<'department_activities'>[];
  classes: Row<'classes'>[];
  teacherCount: Map<string, number>;
  publicClasses: Map<string, ViewRow<'v_public_classes'>>;
  budgets: Row<'budgets'>[];
  notices: Row<'announcements'>[];
};

const EMPTY_DEPT: DeptBundle = {
  members: [],
  names: new Map(),
  activities: [],
  classes: [],
  teacherCount: new Map(),
  publicClasses: new Map(),
  budgets: [],
  notices: [],
};

const EMPTY_ACTIVITY = {
  titleAm: '',
  kind: 'meeting',
  activityOn: isoToday(),
  locationAm: '',
  summaryAm: '',
  hours: '',
  spent: '',
  status: 'planned',
};

const EMPTY_NOTICE = { titleAm: '', bodyAm: '', kind: 'department', priority: 'normal', audienceRole: 'member', pinned: false };

function DepartmentPortal({ uid }: { uid: string }) {
  const { can } = useAuth();
  const mayWrite = can('departments.write');
  const mayAnnounce = can('communication.write');

  const [depts, setDepts] = useState<Row<'departments'>[]>([]);
  const [deptId, setDeptId] = useState('');
  const [scopeNote, setScopeNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState('overview');
  const [bundle, setBundle] = useState<DeptBundle>(EMPTY_DEPT);
  const [activityOpen, setActivityOpen] = useState(false);
  const [activity, setActivity] = useState(EMPTY_ACTIVITY);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [notice, setNotice] = useState(EMPTY_NOTICE);

  const dept = depts.find((row) => row.id === deptId) ?? null;

  // Which department is this person responsible for? `scope_ids` reads the JSONB
  // scope the administrator put on the role grant. An empty scope is not a
  // failure: the rows below are then whatever `departments.read` already allows.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    async function resolve() {
      try {
        const scoped = await callFn('scope_ids', { p_scope_key: 'department_ids' }).catch(() => [] as string[]);
        const readable = await listRows(supabase.from('departments').select('*').order('sort_order').limit(80));
        const byId = new Map(readable.map((row) => [row.id, row] as const));
        const mine = scoped.map((id) => byId.get(id)).filter((row): row is Row<'departments'> => Boolean(row));
        const rest = readable.filter((row) => !scoped.includes(row.id));
        if (cancelled) return;
        setDepts(mine.length > 0 ? [...mine, ...rest] : readable);
        setDeptId((prev) => prev || (mine[0] ?? readable[0])?.id || '');
        setScopeNote(
          mine.length === 0 && readable.length > 0
            ? 'ለዚህ መለያ የተወሰነ ዘርፍ ገና አልተመዘበም፤ ከታች የተዘረዘሙት ዘርፎች በ `departments.read` ፍቃድዎ የተከፈቱ ናቸው።መዝጋቢው ወሰን (scope) ሲያስቀምጥ ለዘርፍዎ ብቻ ይገደባል።'
            : null
        );
      } catch (e) {
        if (!cancelled) setError(friendlyError(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void resolve();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadBundle = useCallback(async () => {
    if (!deptId) return;
    setError(null);
    setBusy(true);
    try {
      const [members, activities, classes, budgets, notices] = await Promise.all([
        listRows(supabase.from('department_members').select('*').eq('department_id', deptId).order('joined_on').limit(400)).catch(() => [] as Row<'department_members'>[]),
        listRows(supabase.from('department_activities').select('*').eq('department_id', deptId).order('activity_on', { ascending: false }).limit(300)),
        listRows(supabase.from('classes').select('*').eq('department_id', deptId).eq('is_active', true).limit(200)).catch(() => [] as Row<'classes'>[]),
        listRows(supabase.from('budgets').select('*').eq('department_id', deptId).order('created_at', { ascending: false }).limit(120)).catch(() => [] as Row<'budgets'>[]),
        listRows(supabase.from('announcements').select('*').eq('department_id', deptId).order('created_at', { ascending: false }).limit(60)),
      ]);

      const memberIds = [...new Set(members.map((row) => row.member_id))];
      const people = await readIn('members', 'id', memberIds).catch(() => [] as Row<'members'>[]);

      const classIds = classes.map((row) => row.id);
      const links = classIds.length > 0 ? await readIn('class_teachers', 'class_id', classIds).catch(() => [] as Row<'class_teachers'>[]) : [];
      const teacherCount = new Map<string, number>();
      for (const link of links) {
        if (link.removed_on) continue;
        teacherCount.set(link.class_id, (teacherCount.get(link.class_id) ?? 0) + 1);
      }
      const publicRows = classIds.length > 0 ? await fetchRows<ViewRow<'v_public_classes'>>('v_public_classes', { limit: 400 }).catch(() => [] as ViewRow<'v_public_classes'>[]) : [];

      setBundle({
        members,
        names: new Map(people.map((row) => [row.id, row.full_name_am] as const)),
        activities,
        classes,
        teacherCount,
        publicClasses: new Map(publicRows.filter((row) => row.id && classIds.includes(String(row.id))).map((row) => [String(row.id), row] as const)),
        budgets,
        notices,
      });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }, [deptId]);

  useEffect(() => {
    if (deptId) void loadBundle();
  }, [deptId, loadBundle]);

  const totals = useMemo(() => {
    const activeMembers = bundle.members.filter((row) => row.status === 'active').length;
    const completed = bundle.activities.filter((row) => row.status === 'completed').length;
    const spent = bundle.activities.reduce((sum, row) => sum + Number(row.budget_spent ?? 0), 0);
    const hours = bundle.activities.reduce((sum, row) => sum + Number(row.hours ?? 0), 0);
    const planned = bundle.budgets.reduce((sum, row) => sum + Number(row.planned_amount ?? 0), 0);
    const approved = bundle.budgets.reduce((sum, row) => sum + Number(row.approved_amount ?? 0), 0);
    const openNotices = bundle.notices.filter((row) => row.state === 'draft' || row.state === 'submitted').length;
    return { activeMembers, completed, spent, hours, planned, approved, openNotices };
  }, [bundle]);

  async function createActivity() {
    if (!dept) return;
    if (activity.titleAm.trim().length < 3) {
      toast.error('የእንቅስቃሴው ርዕስ ቢያንስ 3 ፊደል መሆን አለበት።');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        department_id: dept.id,
        title_am: activity.titleAm.trim(),
        kind: activity.kind,
        activity_on: activity.activityOn,
        location_am: activity.locationAm.trim() || null,
        summary_am: activity.summaryAm.trim() || null,
        hours: activity.hours === '' ? null : Number(activity.hours),
        budget_spent: activity.spent === '' ? null : Number(activity.spent),
        status: activity.status,
        created_by: uid,
      };
      const { error: insertError } = await supabase.from('department_activities').insert(payload as never);
      if (insertError) throw new Error(friendlyError(insertError));
      toast.success('እንቅስቃሴው በዘርፉ መዝገብ ተቀምጧል።');
      setActivityOpen(false);
      setActivity(EMPTY_ACTIVITY);
      await loadBundle();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : UI.serverError);
    } finally {
      setBusy(false);
    }
  }

  async function setActivityStatus(row: Row<'department_activities'>, next: string) {
    setBusy(true);
    try {
      const { error: updateError } = await supabase.from('department_activities').update({ status: next } as never).eq('id', row.id);
      if (updateError) throw new Error(friendlyError(updateError));
      toast.success(`እንቅስቃሴው ${ACTIVITY_STATUS[next] ?? next} ሆኗል።`);
      await loadBundle();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : UI.serverError);
    } finally {
      setBusy(false);
    }
  }

  async function createNotice() {
    if (!dept) return;
    if (notice.titleAm.trim().length < 3) {
      toast.error('የማሳወቂያ ርዕስ ቢያንስ 3 ፊደል መሆን አለበት።');
      return;
    }
    if (notice.bodyAm.trim().length < 10) {
      toast.error('የማሳወቂያው መልእክት በቂ ዝርዝር የለውም (ቢያንስ 10 ፊደል)።');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        title_am: notice.titleAm.trim(),
        body_am: notice.bodyAm.trim(),
        kind: notice.kind,
        audience: { department_ids: [dept.id], roles: [notice.audienceRole] },
        priority: notice.priority,
        channels: ['in_app'],
        state: 'draft',
        pinned: notice.pinned,
        department_id: dept.id,
        created_by: uid,
      };
      const { error: insertError } = await supabase.from('announcements').insert(payload as never);
      if (insertError) throw new Error(friendlyError(insertError));
      toast.success('ማሳወቂያው እንደ ቅድመ ሐሳብ ተመዝግቧል — ለማሳወቅ ግምገማ ያስፈልጋል።');
      setNoticeOpen(false);
      setNotice(EMPTY_NOTICE);
      await loadBundle();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : UI.serverError);
    } finally {
      setBusy(false);
    }
  }

  async function submitNotice(row: Row<'announcements'>) {
    setBusy(true);
    try {
      await callFn('submit_content', { p_type: 'announcement', p_id: row.id });
      toast.success('ወደ ግምገማ ቀርቧል፤ ማሳወቁ የመገናኛ ክፍል ሥራ ነው።');
      await loadBundle();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : UI.serverError);
    } finally {
      setBusy(false);
    }
  }

  const memberColumns = useMemo<Column<Row<'department_members'>>[]>(
    () => [
      {
        key: 'member_id',
        header: 'አባል',
        cell: (r) => <span className="font-medium">{bundle.names.get(r.member_id) ?? `አባል ${truncate(r.member_id, 6)}`}</span>,
      },
      { key: 'role_key', header: 'ሐላፊነት', cell: (r) => enumLabel(DEPT_ROLE, r.role_key) },
      { key: 'title_am', header: 'የሥልጣን ማዕረግ', hideBelow: 'md', cell: (r) => r.title_am ?? '—' },
      { key: 'joined_on', header: 'የገባበት', hideBelow: 'sm', sortable: true, cell: (r) => <span className="whitespace-nowrap text-xs">{dateAm(r.joined_on)}</span> },
      {
        key: 'status',
        header: 'ሁኔታ',
        cell: (r) => (
          <StatusBadge tone={r.status === 'active' ? 'success' : r.status === 'transferred' ? 'info' : 'neutral'}>
            {enumLabel(DEPT_MEMBER_STATUS, r.status)}
          </StatusBadge>
        ),
      },
      { key: 'ended_on', header: 'የጨረቀበት', hideBelow: 'lg', cell: (r) => (r.ended_on ? dateAm(r.ended_on) : '—') },
    ],
    [bundle.names]
  );

  const activityColumns = useMemo<Column<Row<'department_activities'>>[]>(
    () => [
      { key: 'activity_on', header: 'ቀን', sortable: true, cell: (r) => <span className="whitespace-nowrap text-xs">{dateAm(r.activity_on)}</span> },
      { key: 'title_am', header: 'እንቅስቃሴ', cell: (r) => <span className="font-medium">{truncate(r.title_am, 54)}</span> },
      { key: 'kind', header: 'ዓይነት', hideBelow: 'sm', cell: (r) => enumLabel(ACTIVITY_KIND, r.kind) },
      { key: 'location_am', header: 'ቦታ', hideBelow: 'md', cell: (r) => r.location_am ?? '—' },
      { key: 'hours', header: 'ሰዓት', hideBelow: 'md', cell: (r) => (r.hours ? `${num(r.hours)} ሰዓት` : '—') },
      { key: 'budget_spent', header: 'ወጪ', hideBelow: 'lg', cell: (r) => (Number(r.budget_spent ?? 0) > 0 ? br(r.budget_spent) : '—') },
      { key: 'status', header: 'ሁኔታ', cell: (r) => <StatusBadge tone={ACTIVITY_TONE[r.status] ?? 'neutral'}>{enumLabel(ACTIVITY_STATUS, r.status)}</StatusBadge> },
      {
        key: 'move',
        header: 'ሐላፊነት',
        cell: (r) =>
          mayWrite && r.status !== 'completed' && r.status !== 'cancelled' ? (
            <Button size="sm" variant="outline" onClick={() => void setActivityStatus(r, r.status === 'planned' ? 'ongoing' : 'completed')} disabled={busy} icon={<Check className="h-3.5 w-3.5" aria-hidden />}>
              {r.status === 'planned' ? 'ጀምሮአል' : 'ጨርሷል'}
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
    ],
    [busy, mayWrite]
  );

  const classColumns = useMemo<Column<Row<'classes'>>[]>(
    () => [
      { key: 'name_am', header: 'ክፍል', cell: (r) => <span className="font-medium">{r.name_am}</span> },
      { key: 'code', header: 'ኮድ', hideBelow: 'sm', cell: (r) => <span className="whitespace-nowrap text-xs">{r.code}</span> },
      {
        key: 'teachers',
        header: 'መምህራን',
        cell: (r) => {
          const published = bundle.publicClasses.get(r.id);
          const names = published?.teacher_names;
          if (names) return truncate(names, 46);
          const count = bundle.teacherCount.get(r.id) ?? 0;
          return count > 0 ? `${num(count)} ሐዘር` : <span className="text-xs text-muted-foreground">አልተመደበም</span>;
        },
      },
      {
        key: 'enrolled',
        header: 'ተመዝጋቢዎች',
        hideBelow: 'md',
        cell: (r) => {
          const enrolled = bundle.publicClasses.get(r.id)?.enrolled_count ?? 0;
          return r.capacity ? `${num(enrolled)} / ${num(r.capacity)}` : num(enrolled);
        },
      },
      { key: 'meets_summary_am', header: 'የመገናኛ ጊዜ', hideBelow: 'lg', cell: (r) => r.meets_summary_am ?? '—' },
      { key: 'room_am', header: 'ቦታ', hideBelow: 'lg', cell: (r) => r.room_am ?? '—' },
    ],
    [bundle.publicClasses, bundle.teacherCount]
  );

  const budgetColumns = useMemo<Column<Row<'budgets'>>[]>(
    () => [
      { key: 'period_label_am', header: 'ዘመን', cell: (r) => <span className="font-medium">{r.period_label_am}</span> },
      { key: 'planned_amount', header: 'የታቀደ', sortable: true, cell: (r) => br(r.planned_amount) },
      { key: 'approved_amount', header: 'የጸደቀ', hideBelow: 'sm', cell: (r) => (r.approved_amount === null || r.approved_amount === undefined ? '—' : br(r.approved_amount)) },
      { key: 'status', header: 'ሁኔታ', cell: (r) => <StatusBadge tone={BUDGET_TONE[r.status] ?? 'neutral'}>{enumLabel(BUDGET_STATE, r.status)}</StatusBadge> },
      { key: 'notes', header: 'ማስታወሻ', hideBelow: 'lg', cell: (r) => (r.notes ? truncate(r.notes, 60) : '—') },
    ],
    []
  );

  const noticeColumns = useMemo<Column<Row<'announcements'>>[]>(
    () => [
      { key: 'title_am', header: 'ማሳወቂያ', cell: (r) => <span className="font-medium">{truncate(r.title_am, 54)}</span> },
      { key: 'kind', header: 'ዓይነት', hideBelow: 'sm', cell: (r) => enumLabel(ANNOUNCE_KIND, r.kind) },
      { key: 'priority', header: 'ቅድሚያ', hideBelow: 'md', cell: (r) => <StatusBadge tone={PRIORITY_TONE[r.priority] ?? 'neutral'}>{enumLabel(PRIORITY, r.priority)}</StatusBadge> },
      { key: 'state', header: 'ደረጃ', cell: (r) => <StatusBadge tone={CONTENT_TONE[r.state] ?? 'neutral'}>{enumLabel(CONTENT_STATE, r.state)}</StatusBadge> },
      { key: 'created_at', header: 'የተጻፈበት', hideBelow: 'lg', sortable: true, cell: (r) => <span className="whitespace-nowrap text-xs">{dateTimeAm(r.created_at)}</span> },
      {
        key: 'submit',
        header: 'ሐላፊነት',
        cell: (r) =>
          mayAnnounce && r.state === 'draft' ? (
            <Button size="sm" variant="outline" onClick={() => void submitNotice(r)} disabled={busy} icon={<Send className="h-3.5 w-3.5" aria-hidden />}>
              ለግምገማ አቅርብ
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">{r.state === 'published' ? 'አውጥቷል' : '—'}</span>
          ),
      },
    ],
    [busy, mayAnnounce]
  );

  const tabs = useMemo<TabItem[]>(
    () => [
      { value: 'overview', label: 'ዕይታ' },
      { value: 'activities', label: 'እንቅስቃሴዎች', count: bundle.activities.length },
      { value: 'members', label: 'አባሎች', count: bundle.members.length },
      { value: 'classes', label: 'ክፍሎች', count: bundle.classes.length },
      { value: 'budget', label: 'በጀት', count: bundle.budgets.length },
      { value: 'notices', label: 'ማሳወቂያዎች', count: bundle.notices.length },
    ],
    [bundle.activities.length, bundle.members.length, bundle.classes.length, bundle.budgets.length, bundle.notices.length]
  );

  if (loading) return <MeLoading />;

  if (depts.length === 0) {
    return (
      <div className="space-y-5">
        <PageHeading title="የዘርፍ ኃላፊ ገጽ" description="ዘርፍዎ የትምህርት፣ አባላትና እንቅስቃሴ መዝገብ አንድ ላይ።" />
        {error ? <ErrorNote message={error} onRetry={() => void loadBundle()} /> : null}
        <MeBlocked
          title="ለእርስዎ የተከፈተ ዘርፍ የለም"
          description="ይህ ገጽ ዘርፎችን የሚከፍተው `departments.read` ሲኖርዎ ወይም የመለያዎ ሚና ላይ ወሰን (scope → department_ids) ሲቀመጥ ነው።መዝጋቢ ቢሮው ሚናዎን `department_head` አድርጎ ወሰን ሲያስቀምጥ ወዲያውኑ እዚህ ይታያል።"
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeading
        title="የዘርፍ ኃላፊ ገጽ"
        description="የራስዎ ዘርፍ አባላት፣ ክፍሎች፣ እንቅስቃሴዎችና በጀት — ሁሉም በሰንጠረዡ ሕግ ለእርስዎ የተከፈተ ብቻ።"
        actions={
          <Button variant="outline" size="sm" onClick={() => void loadBundle()} loading={busy} icon={<RefreshCw className="h-4 w-4" aria-hidden />}>
            እንደገና
          </Button>
        }
      />

      {error ? <ErrorNote message={error} onRetry={() => void loadBundle()} /> : null}
      {scopeNote ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">{scopeNote}</p>
      ) : null}

      <Card>
        <CardBody className="flex flex-wrap items-end gap-4">
          <Field label="ዘርፍ" htmlFor="dp-dept" className="w-72" hint={`${num(depts.length)} ዘርፍ ለእርስዎ ክፍት ነው`}>
            <Select id="dp-dept" value={deptId} options={depts.map((row) => ({ value: row.id, label: row.name_am }))} onChange={(e) => setDeptId(e.target.value)} />
          </Field>
          {dept ? (
            <div className="flex flex-wrap items-center gap-2 pb-2 text-xs text-muted-foreground">
              <StatusBadge tone={dept.state === 'published' ? 'success' : CONTENT_TONE[dept.state] ?? 'neutral'}>{enumLabel(CONTENT_STATE, dept.state)}</StatusBadge>
              {dept.is_public ? <StatusBadge tone="info">ለሕዝብ ታውጧል</StatusBadge> : <StatusBadge tone="neutral">ለውስጥ ብቻ</StatusBadge>}
              {dept.slug ? <StatusBadge tone="neutral">{dept.slug}</StatusBadge> : null}
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Tabs items={tabs} value={tab} onValueChange={setTab}>
        <TabPanel value="overview" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="ንቁ አባሎች" value={num(totals.activeMembers)} hint={`ጠቅላላ ${num(bundle.members.length)}`} tone="success" />
            <Metric label="ክፍሎች" value={num(bundle.classes.length)} hint={`${num(bundle.activities.length)} እንቅስቃሴዎች`} />
            <Metric label="የእንቅስቃሴ ወጪ" value={br(totals.spent)} hint={`${num(totals.hours)} ሰዓት ተሠርቷል`} tone="gold" />
            <Metric label="የበጀት ጠያቂነት" value={br(totals.approved)} hint={`ከ ${br(totals.planned)} የታቀደ`} tone={totals.approved >= totals.planned && totals.planned > 0 ? 'success' : 'warning'} />
          </div>

          {dept ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden />
                  {dept.name_am}
                </CardTitle>
                <CardDescription>የዘርፉ መገለጫ ከመዝገቡ የተወሰደ — ለውጥ የሚያደርገው የዘርፍ አስተዳደር ማዕከል ነው።</CardDescription>
              </CardHeader>
              <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Detail label="ማጭበርበሪያ" value={dept.summary_am ?? '—'} />
                <Detail label="ዕድገት" value={dept.mission_am ?? '—'} />
                <Detail label="ስልክ" value={dept.contact_phone ? phoneAm(dept.contact_phone) : '—'} />
                <Detail label="ኢሜይል" value={dept.contact_email ?? '—'} />
                <Detail label="ኃላፊ" value={bundle.members.find((m) => m.role_key === 'head' && !m.ended_on) ? bundle.names.get(bundle.members.find((m) => m.role_key === 'head' && !m.ended_on)!.member_id) ?? '—' : 'በዚህ ዝርዝር ላይ አልታየም'} />
                <Detail label="አስተባባሪ" value={bundle.members.find((m) => m.role_key === 'coordinator' && !m.ended_on) ? bundle.names.get(bundle.members.find((m) => m.role_key === 'coordinator' && !m.ended_on)!.member_id) ?? '—' : 'በዚህ ዝርዝር ላይ አልታየም'} />
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Layers className="h-4 w-4 text-muted-foreground" aria-hidden />
                የቅርብ ጊዜ እንቅስቃሴዎች
              </CardTitle>
              <CardDescription>ዘጠኝ የሐዘር ቀናት — ሙሉ መዝገቡ በ “እንቅስቃሴዎች” ሐዘር ላይ ይገኛል።</CardDescription>
            </CardHeader>
            <CardBody>
              {bundle.activities.length === 0 ? (
                <p className="text-sm text-muted-foreground">ለዚህ ዘርፍ ገና እንቅስቃሴ አልተመዘገበም።</p>
              ) : (
                <ul className="divide-y divide-border">
                  {bundle.activities.slice(0, 9).map((row) => (
                    <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                      <span className="min-w-0">
                        <span className="font-medium">{truncate(row.title_am, 48)}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{dateAm(row.activity_on)}</span>
                      </span>
                      <StatusBadge tone={ACTIVITY_TONE[row.status] ?? 'neutral'}>{enumLabel(ACTIVITY_STATUS, row.status)}</StatusBadge>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          {totals.openNotices > 0 ? (
            <p className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground">
              {num(totals.openNotices)} ማሳወቂያ በቅድመ ሐሳብ ወይም በግምገማ ሐዘር ላይ አለ — ማሳወቅ `communication.publish` ፍቃድ ይፈልጋል።
            </p>
          ) : null}
        </TabPanel>

        <TabPanel value="activities" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              እንቅስቃሴዎች በ `department_activities` ይቀመጣሉ፤ ወጪና ሰዓት ለሪፖርት ይጠቅማሉ።
              {mayWrite ? '' : ' ለእንቅስቃሴ መዝገብ `departments.write` ያስፈልጋል።'}
            </p>
            {mayWrite ? (
              <Button size="sm" onClick={() => setActivityOpen(true)} icon={<Plus className="h-4 w-4" aria-hidden />}>
                አዲስ እንቅስቃሴ
              </Button>
            ) : null}
          </div>
          <DataTable
            rows={bundle.activities}
            columns={activityColumns}
            rowKey={(r) => r.id}
            pageSize={15}
            emptyTitle="እንቅስቃሴ ገና አልተመዘገበም"
            emptyDescription={mayWrite ? '“አዲስ እንቅስቃሴ” በመጫን ስብሰባ፣ ተልእኮ ወይም ሥልጠና ይመዝግቡ።' : 'ለዚህ ዘርፍ የተመዘገበ እንቅስቃሴ ገና የለም።'}
            caption="የዘርፍ እንቅስቃሴዎች"
          />

          <Modal
            open={activityOpen}
            onOpenChange={(next) => {
              if (!next) setActivityOpen(false);
            }}
            size="lg"
            title="አዲስ እንቅስቃሴ"
            description={`በ ${dept?.name_am ?? 'የተመረጠው ዘርፍ'} መዝገብ ይቀመጣል — የራስዎ ወሰን ብቻ ይጻፋል።`}
            footer={
              <>
                <Button variant="ghost" onClick={() => setActivityOpen(false)}>
                  {UI.cancel}
                </Button>
                <Button onClick={() => void createActivity()} loading={busy} icon={<Save className="h-4 w-4" aria-hidden />}>
                  {UI.save}
                </Button>
              </>
            }
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="ርዕስ" htmlFor="da-title" required className="sm:col-span-2">
                <Input id="da-title" value={activity.titleAm} onChange={(e) => setActivity((d) => ({ ...d, titleAm: e.target.value }))} placeholder="ለምሳሌ የወጣቶች ተልእኮ ዝግጅት" />
              </Field>
              <Field label="ዓይነት" htmlFor="da-kind" required>
                <Select id="da-kind" value={activity.kind} options={ACTIVITY_KIND_OPTIONS} onChange={(e) => setActivity((d) => ({ ...d, kind: e.target.value }))} />
              </Field>
              <Field label="ቀን" htmlFor="da-date" required>
                <DateInput id="da-date" value={activity.activityOn} onValueChange={(v) => setActivity((d) => ({ ...d, activityOn: v }))} />
              </Field>
              <Field label="ቦታ" htmlFor="da-place">
                <Input id="da-place" value={activity.locationAm} onChange={(e) => setActivity((d) => ({ ...d, locationAm: e.target.value }))} />
              </Field>
              <Field label="ሁኔታ" htmlFor="da-status">
                <Select id="da-status" value={activity.status} options={ACTIVITY_STATUS_OPTIONS} onChange={(e) => setActivity((d) => ({ ...d, status: e.target.value }))} />
              </Field>
              <Field label="ሰዓት" htmlFor="da-hours" hint="ለሪፖርት የሚደመር።">
                <Input id="da-hours" type="number" min="0" step="0.5" value={activity.hours} onChange={(e) => setActivity((d) => ({ ...d, hours: e.target.value }))} />
              </Field>
              <Field label="የተወጣ ወጪ (ብር)" htmlFor="da-spent">
                <Input id="da-spent" type="number" min="0" step="0.01" value={activity.spent} onChange={(e) => setActivity((d) => ({ ...d, spent: e.target.value }))} />
              </Field>
              <Field label="ማቅረብ" htmlFor="da-summary" className="sm:col-span-2">
                <Textarea id="da-summary" rows={3} value={activity.summaryAm} onChange={(e) => setActivity((d) => ({ ...d, summaryAm: e.target.value }))} />
              </Field>
            </div>
          </Modal>
        </TabPanel>

        <TabPanel value="members" className="space-y-4">
          <p className="text-sm text-muted-foreground">
            አባሎች በ `department_members`ና `members` መዝገብ የተወሰዱ ናችው፤ መጨመርና ማስወገድ የሚደረገው በዘርፍ አስተዳደር ማዕከል ነው።
          </p>
          <DataTable
            rows={bundle.members}
            columns={memberColumns}
            rowKey={(r) => r.id}
            pageSize={20}
            emptyTitle="አባል ገና አልተመዘገበም"
            emptyDescription="ዘርፉ ስልጣን ሲሰጥ የሚገቡት አባላት እዚህ ይታያሉ።"
            caption="የዘርፍ አባላት"
          />
        </TabPanel>

        <TabPanel value="classes" className="space-y-4">
          <p className="text-sm text-muted-foreground">
            የዘርፉ ክፍሎችና የተመደቡት መምህራን — የመምህራን ስሞች ከ `v_public_classes` ይወሰዳሉ፤ ለሐዘር መውሰድና ለመለያቸው
            የትምህርት ክፍል ቢሮው ብቻ ነው።
          </p>
          <DataTable
            rows={bundle.classes}
            columns={classColumns}
            rowKey={(r) => r.id}
            pageSize={20}
            emptyTitle="ለዚህ ዘርፍ ክፍል አልተመዘገበም"
            emptyDescription="ክፍሎች በትምህርት ክፍል ሲከፈቱና ዘርፍ ሲሰጣቸው እዚህ ይታያሉ።"
            caption="የዘርፍ ክፍሎች"
          />
        </TabPanel>

        <TabPanel value="budget" className="space-y-4">
          <p className="text-sm text-muted-foreground">
            የዘርፉ የበጀት መስመሮች ለማንበብ ብቻ ናቸው — መስመር መፍጠር `budget.write`፣ ውሳኔ ደግሞ `budget.approve` ይፈልጋል።
            ወጪዎችዎ ከእንቅስቃሴ መዝገብ በላይ በፋይናንስ ክፍል ይቆጠራሉ።
          </p>
          <DataTable
            rows={bundle.budgets}
            columns={budgetColumns}
            rowKey={(r) => r.id}
            pageSize={15}
            emptyTitle="የተመዘገበ በጀት መስመር የለም"
            emptyDescription="ለዘርፉ በጀት ሲያልፍ ወደዚህ ሐዘር ይመጣል።"
            caption="የዘርፍ በጀት መስመሮች"
          />
        </TabPanel>

        <TabPanel value="notices" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              ለዘርፍዎ የተጻፈ ማሳወቂያ — እንደ ቅድመ ሐሳብ ይቀመጣል፣ በ `submit_content` ወደ ግምገማ ይቀርባል።ለሕዝብ ማሳወቅ
              የመገናኛ ክፍል ሥራ ነው።
            </p>
            {mayAnnounce ? (
              <Button size="sm" onClick={() => setNoticeOpen(true)} icon={<Megaphone className="h-4 w-4" aria-hidden />}>
                አዲስ ማሳወቂያ
              </Button>
            ) : null}
          </div>
          <DataTable
            rows={bundle.notices}
            columns={noticeColumns}
            rowKey={(r) => r.id}
            pageSize={15}
            emptyTitle="ለዚህ ዘርፍ ማሳወቂያ የለም"
            emptyDescription={mayAnnounce ? '“አዲስ ማሳወቂያ” በመጫን ለአባሎችዎ መልእክት ይጻፉ።' : 'የተመዘገበ ማሳወቂያ ገና የለም።'}
            caption="የዘርፍ ማሳወቂያዎች"
          />

          <Modal
            open={noticeOpen}
            onOpenChange={(next) => {
              if (!next) setNoticeOpen(false);
            }}
            size="lg"
            title="አዲስ ማሳወቂያ"
            description="መልእክትዎ ለዘርፉ አባሎች ብቻ የሚነጠል ኮድ ይኖረዋል፤ ማሳወቅ ግን በግምገማ በኋላ ነው።"
            footer={
              <>
                <Button variant="ghost" onClick={() => setNoticeOpen(false)}>
                  {UI.cancel}
                </Button>
                <Button onClick={() => void createNotice()} loading={busy} icon={<Save className="h-4 w-4" aria-hidden />}>
                  {UI.save}
                </Button>
              </>
            }
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="ርዕስ" htmlFor="dn-title" required className="sm:col-span-2">
                <Input id="dn-title" value={notice.titleAm} onChange={(e) => setNotice((d) => ({ ...d, titleAm: e.target.value }))} placeholder="ለምሳሌ የፋሲካ ዕረፍት ሰዓተ ትምህርት ለውጥ" />
              </Field>
              <Field label="መልእክት" htmlFor="dn-body" required className="sm:col-span-2">
                <Textarea id="dn-body" rows={5} value={notice.bodyAm} onChange={(e) => setNotice((d) => ({ ...d, bodyAm: e.target.value }))} />
              </Field>
              <Field label="ዓይነት" htmlFor="dn-kind">
                <Select id="dn-kind" value={notice.kind} options={ANNOUNCE_KIND_OPTIONS} onChange={(e) => setNotice((d) => ({ ...d, kind: e.target.value }))} />
              </Field>
              <Field label="ቅድሚያ" htmlFor="dn-priority">
                <Select id="dn-priority" value={notice.priority} options={PRIORITY_OPTIONS} onChange={(e) => setNotice((d) => ({ ...d, priority: e.target.value }))} />
              </Field>
              <Field label="ለማን" htmlFor="dn-audience" hint="የዘርፍዎ አባሎች ሁልጊዜ ይጨምራሉ።" className="sm:col-span-2">
                <Select id="dn-audience" value={notice.audienceRole} options={AUDIENCE_OPTIONS} onChange={(e) => setNotice((d) => ({ ...d, audienceRole: e.target.value }))} />
              </Field>
              <Field label="በማሳወቂያ ሰሌዳ ጫፍ ላይ አጽና" htmlFor="dn-pin" className="sm:col-span-2">
                <Switch id="dn-pin" checked={notice.pinned} onChange={(e) => setNotice((d) => ({ ...d, pinned: e.target.checked }))} />
              </Field>
            </div>
          </Modal>
        </TabPanel>
      </Tabs>
    </div>
  );
}
