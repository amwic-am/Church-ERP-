// Operations screens: the library desk, the store, the certificate office and the
// volunteer roster.
//
// These are the four places in the module where the write is not a plain form submit.
// The library has no domain RPC at all — the migrations only give `mark_overdue_loans()`
// — so issuing a copy is an insert on `library_loans` whose status the
// `sync_copy_status()` trigger reads back into `library_copies`. Stock is an insert on
// `inventory_movements` for the same reason: `apply_inventory_movement()` owns the
// `quantity` column and refuses anything that would drive it below zero. Certificates do
// run through `issue_certificate(p_student, p_template, p_title)`, because
// `certificate_no` and `verification_code` are NOT NULL with no default, so a hand-built
// row could never satisfy them. Volunteer hours are trigger-owned too
// (`sync_volunteer_hours` + `recalc_volunteer_hours(p_volunteer)`), so the screens only
// ever read them. Every column, enum value and grant below was read out of
// `supabase/migrations` first — 20261102001000_operations.sql,
// 20261102000600_academics.sql, 20261102000800_departments.sql.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Award,
  BookOpen,
  Boxes,
  CalendarClock,
  CheckCheck,
  Download,
  Plus,
  RefreshCw,
  Save,
  ScrollText,
  SearchCheck,
  Send,
  Star,
  Undo2,
  Users,
} from 'lucide-react';

import { useAuth } from '@/components/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { CheckboxField, DateInput, Field, FormActions, Input, Select, Textarea, type Option } from '@/components/ui/form';
import { ConfirmDialog, Modal } from '@/components/ui/overlay';
import { Card, CardBody, CardHeader, CardTitle, EmptyState, ErrorNote, Metric, PageHeading, Spinner, StatusBadge, type Tone } from '@/components/ui/surface';
import { Tabs, TabPanel } from '@/components/ui/tabs';
import { MODULE_NAMES, UI } from '@/lib/i18n';
import { isSupabaseConfigured } from '@/lib/env';
import { br, dateAm, dateTimeAm, num } from '@/lib/format';
import { exportExcel } from '@/lib/export';
import { addDays, formatGregorian } from '@/lib/ethiopian';
import { friendlyError } from '@/lib/errors';
import type { PermissionKey } from '@/lib/permissions';
import { callFn, listRows, supabase, type Row } from '@/lib/supabase';

import { ResourceScreen } from '@/erp/crud/ResourceScreen';
import {
  certificateTemplatesResource,
  inventoryItemsResource,
  inventoryMovementsResource,
  libraryBooksResource,
  libraryCopiesResource,
  volunteerAssignmentsResource,
  volunteerProfilesResource,
} from '@/erp/resources/operations';

// ─── shared helpers ──────────────────────────────────────────────────────────

function isoToday(): string {
  return formatGregorian(new Date());
}

function isoOffset(days: number): string {
  return formatGregorian(addDays(new Date(), days));
}

function numberOr(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** A `numeric` column arrives as a string over PostgREST, so every total is coerced. */
function amountOr(value: unknown): number {
  return numberOr(value);
}

/** PostgREST pages are capped, so a long `in ()` list is split rather than truncated. */
const CHUNK = 80;

function chunksOf<T>(items: readonly T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function Denied({ hint }: { hint: string }) {
  return <EmptyState icon={<Users className="h-7 w-7" aria-hidden />} title={UI.permissionDenied} description={hint} />;
}

function NotConfigured() {
  return <ErrorNote message="የአሠራር መረጃዎቹ ለማንበብ መረጃ ማጠራቀሚያው ገና አልተገናኘም።" />;
}

/** The plain Amharic labels the resource files keep to themselves, mirrored here. */
const COPY_LABEL: Record<string, string> = {
  available: 'ዝግጁ',
  on_loan: 'በተበዳሪ ዘንድ',
  lost: 'ጠፍቷል',
  damaged: 'ጉዳት የደረሰ',
  processing: 'በማዘጋጀት ላይ',
};

const COPY_TONE: Record<string, Tone> = {
  available: 'success',
  on_loan: 'info',
  lost: 'danger',
  damaged: 'warning',
  processing: 'neutral',
};

const LOAN_LABEL: Record<string, string> = {
  borrowed: 'በዕዳ ላይ',
  returned: 'ተመልሷል',
  overdue: 'የመመለሻ ቀኑ አልፏል',
  lost_written_off: 'ጠፍቶ ተከፍሏል',
};

const LOAN_TONE: Record<string, Tone> = {
  borrowed: 'info',
  returned: 'success',
  overdue: 'danger',
  lost_written_off: 'warning',
};

const MOVEMENT_LABEL: Record<string, string> = {
  in: 'ገቢ',
  out: 'ወጪ',
  adjust: 'ማስተካከያ',
};

const MOVEMENT_TONE: Record<string, Tone> = {
  in: 'success',
  out: 'warning',
  adjust: 'info',
};

const VOLUNTEER_LABEL: Record<string, string> = {
  pending: 'በመጠባበቂያ ላይ',
  active: 'ንቁ አገልጋይ',
  on_hold: 'ለጊዜው ቆሟል',
  inactive: 'ያልተገናኘ',
};

const VOLUNTEER_TONE: Record<string, Tone> = {
  pending: 'warning',
  active: 'success',
  on_hold: 'neutral',
  inactive: 'danger',
};

const ASSIGNMENT_LABEL: Record<string, string> = {
  assigned: 'ተመድቧል',
  completed: 'ተጠናቋል',
  cancelled: 'ተሰርዟል',
};

const ASSIGNMENT_TONE: Record<string, Tone> = {
  assigned: 'info',
  completed: 'success',
  cancelled: 'neutral',
};

/** Snapshot values the `issue_certificate()` RPC writes into `render_snapshot`. */
function snapshotText(value: unknown, key: string): string {
  if (value === null || value === undefined || typeof value !== 'object') return '—';
  const hit = (value as Record<string, unknown>)[key];
  return hit === null || hit === undefined || hit === '' ? '—' : String(hit);
}

// ─── 1 · መጻሕፍት ማዕከል ────────────────────────────────────────────────────────

/** Which of the three borrower columns a loan fills — the CHECK allows exactly one. */
type BorrowerKind = 'member' | 'student' | 'staff';

const BORROWER_COLUMN: Record<BorrowerKind, 'borrower_member_id' | 'borrower_student_id' | 'borrower_staff_id'> = {
  member: 'borrower_member_id',
  student: 'borrower_student_id',
  staff: 'borrower_staff_id',
};

const BORROWER_LABEL: Record<BorrowerKind, string> = {
  member: 'አባል',
  student: 'ተማሪ',
  staff: 'መምህር/ሠራተኛ',
};

const BORROWER_KIND_OPTIONS: readonly Option[] = (Object.keys(BORROWER_LABEL) as BorrowerKind[]).map((kind) => ({
  value: kind,
  label: BORROWER_LABEL[kind],
}));

function borrowerOf(loan: Row<'library_loans'>): { kind: BorrowerKind; id: string } | null {
  if (loan.borrower_member_id) return { kind: 'member', id: loan.borrower_member_id };
  if (loan.borrower_student_id) return { kind: 'student', id: loan.borrower_student_id };
  if (loan.borrower_staff_id) return { kind: 'staff', id: loan.borrower_staff_id };
  return null;
}

type StockRow = {
  bookId: string;
  title: string;
  declared: number;
  registered: number;
  available: number;
  onLoan: number;
  unavailable: number;
  /** The copy statuses that make up `unavailable`, so the count says what is wrong. */
  mix: { key: string; label: string; value: number; tone: Tone }[];
  mismatch: boolean;
};

/**
 * The library desk: catalogue, copies, the loan ledger and a stock count.
 *
 * There is no `library_*` RPC in the migrations — only `mark_overdue_loans()`, which is
 * what the daily job runs and what the "የመመለሻ ያለፉትን ምዘን" button calls. Issuing is
 * therefore an insert on `library_loans` and returning is an update of its status; the
 * `library_loan_sync` trigger then flips `library_copies.status`, so this screen never
 * writes the copy status itself. Neither table may be deleted from (the RLS rule lists no
 * delete grant), which is why the ledger keeps every loan.
 */
export function LibraryScreen() {
  const { identity, can } = useAuth();
  const allowed = can('operations.read');
  const mayWrite = can('operations.write');
  const mayExport = can('reports.export', 'finance.export');

  const [tab, setTab] = useState('loans');
  const [books, setBooks] = useState<Row<'library_books'>[]>([]);
  const [copies, setCopies] = useState<Row<'library_copies'>[]>([]);
  const [loans, setLoans] = useState<Row<'library_loans'>[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Issue form.
  const [copyId, setCopyId] = useState('');
  const [kind, setKind] = useState<BorrowerKind>('member');
  const [personId, setPersonId] = useState('');
  const [loanedOn, setLoanedOn] = useState(isoToday());
  const [dueOn, setDueOn] = useState(isoOffset(14));
  const [issueNote, setIssueNote] = useState('');
  const [people, setPeople] = useState<readonly Option[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleHint, setPeopleHint] = useState<string | null>(null);

  // Return + write-off.
  const [returning, setReturning] = useState<Row<'library_loans'> | null>(null);
  const [returnedOn, setReturnedOn] = useState(isoToday());
  const [fine, setFine] = useState('0');
  const [finePaid, setFinePaid] = useState(false);
  const [closing, setClosing] = useState<Row<'library_loans'> | null>(null);

  // Ledger filters.
  const [statusFilter, setStatusFilter] = useState('');
  const [historyKind, setHistoryKind] = useState<BorrowerKind | ''>('');
  const [historyPerson, setHistoryPerson] = useState('');

  const loadPeople = useCallback(
    async (next: BorrowerKind) => {
      setPeople([]);
      setPeopleHint(null);
      const needed: Record<BorrowerKind, PermissionKey> = {
        member: 'departments.read',
        student: 'students.read',
        staff: 'teachers.read',
      };
      if (!can(needed[next])) {
        setPeopleHint(`የ${BORROWER_LABEL[next]} ዝርዝር ለማንበብ ${needed[next]} ፍቃድ ያስፈልጋል።`);
        return;
      }
      setPeopleLoading(true);
      let loaded: readonly Option[] = [];
      try {
        if (next === 'member') {
          const rows = await listRows(
            supabase.from('members').select('*').eq('status', 'active').order('full_name_am').limit(600)
          );
          loaded = rows.map((r) => ({ value: r.id, label: r.member_code ? `${r.full_name_am} (${r.member_code})` : r.full_name_am }));
        } else if (next === 'student') {
          const rows = await listRows(supabase.from('student_profiles').select('*').order('student_code').limit(800));
          loaded = rows.map((r) => ({ value: r.id, label: `${r.full_name_am} — ${r.student_code}` }));
        } else {
          const rows = await listRows(supabase.from('teacher_profiles').select('*').order('full_name_am').limit(400));
          loaded = rows.map((r) => ({ value: r.id, label: r.staff_code ? `${r.full_name_am} (${r.staff_code})` : r.full_name_am }));
        }
        setPeople(loaded);
        if (loaded.length === 0) setPeopleHint('የሚመረጥ ስም አልተገኘም — የዚህ ዝርዝር ማንበብ መብት ላይኖር ይችላል።');
      } catch (e) {
        setPeopleHint(friendlyError(e));
      } finally {
        setPeopleLoading(false);
      }
    },
    [can]
  );

  const reload = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setError(null);
    try {
      const [bookRows, copyRows, loanRows] = await Promise.all([
        listRows(supabase.from('library_books').select('*').order('created_at', { ascending: false }).limit(500)),
        listRows(supabase.from('library_copies').select('*').order('barcode').limit(1000)),
        listRows(supabase.from('library_loans').select('*').order('created_at', { ascending: false }).limit(500)),
      ]);
      setBooks(bookRows);
      setCopies(copyRows);
      setLoans(loanRows);

      // Borrower names come from three different rosters, each behind its own grant.
      const found = new Map<string, string>();
      const memberIds = [...new Set(loanRows.map((l) => l.borrower_member_id).filter((v): v is string => Boolean(v)))];
      const studentIds = [...new Set(loanRows.map((l) => l.borrower_student_id).filter((v): v is string => Boolean(v)))];
      const staffIds = [...new Set(loanRows.map((l) => l.borrower_staff_id).filter((v): v is string => Boolean(v)))];
      if (memberIds.length > 0 && can('departments.read')) {
        for (const part of chunksOf(memberIds)) {
          for (const m of await listRows(supabase.from('members').select('*').in('id', part))) found.set(m.id, m.full_name_am);
        }
      }
      if (studentIds.length > 0 && can('students.read')) {
        for (const part of chunksOf(studentIds)) {
          for (const s of await listRows(supabase.from('student_profiles').select('*').in('id', part))) found.set(s.id, s.full_name_am);
        }
      }
      if (staffIds.length > 0 && can('teachers.read')) {
        for (const part of chunksOf(staffIds)) {
          for (const t of await listRows(supabase.from('teacher_profiles').select('*').in('id', part))) found.set(t.id, t.full_name_am);
        }
      }
      setNames(found);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [allowed, can]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (allowed) void loadPeople(kind);
  }, [allowed, kind, loadPeople]);

  const booksById = useMemo(() => new Map(books.map((b) => [b.id, b] as const)), [books]);
  const copiesById = useMemo(() => new Map(copies.map((c) => [c.id, c] as const)), [copies]);

  const copyOptions = useMemo<readonly Option[]>(
    () =>
      copies
        .filter((c) => c.status === 'available')
        .map((c) => ({
          value: c.id,
          label: `${c.barcode} — ${booksById.get(c.book_id)?.title_am ?? 'ያለ መጽሐፍ'}`,
        })),
    [copies, booksById]
  );

  const selectedCopy = copiesById.get(copyId) ?? null;
  const selectedBook = selectedCopy ? booksById.get(selectedCopy.book_id) ?? null : null;
  const referenceOnly = Boolean(selectedBook?.is_reference_only);

  const stock = useMemo<StockRow[]>(() => {
    const held = new Map<string, StockRow>();
    for (const b of books) {
      held.set(b.id, {
        bookId: b.id,
        title: b.title_am,
        declared: numberOr(b.total_copies),
        registered: 0,
        available: 0,
        onLoan: 0,
        unavailable: 0,
        mix: [],
        mismatch: false,
      });
    }
    const tally = new Map<string, Map<string, number>>();
    for (const c of copies) {
      const row = held.get(c.book_id);
      if (!row) continue;
      row.registered += 1;
      if (c.status === 'available') row.available += 1;
      else if (c.status === 'on_loan') row.onLoan += 1;
      else row.unavailable += 1;
      const byStatus = tally.get(c.book_id) ?? new Map<string, number>();
      byStatus.set(c.status, (byStatus.get(c.status) ?? 0) + 1);
      tally.set(c.book_id, byStatus);
    }
    const out = [...held.values()];
    for (const row of out) {
      row.mismatch = row.registered !== row.declared;
      const byStatus = tally.get(row.bookId);
      row.mix = Object.keys(COPY_LABEL)
        .filter((status) => status !== 'available' && status !== 'on_loan')
        .map((status) => ({
          key: status,
          label: COPY_LABEL[status],
          value: byStatus?.get(status) ?? 0,
          tone: COPY_TONE[status] ?? 'neutral',
        }))
        .filter((item) => item.value > 0);
    }
    return out.sort((a, b) => a.title.localeCompare(b.title, 'am'));
  }, [books, copies]);

  const openLoans = loans.filter((l) => l.status === 'borrowed');
  const overdueLoans = loans.filter((l) => l.status === 'overdue');

  const ledger = useMemo(
    () =>
      loans.filter((l) => {
        if (statusFilter && l.status !== statusFilter) return false;
        if (historyKind) {
          const who = borrowerOf(l);
          if (!who || who.kind !== historyKind) return false;
          if (historyPerson && who.id !== historyPerson) return false;
        }
        return true;
      }),
    [loans, statusFilter, historyKind, historyPerson]
  );

  /** Issue: one insert; the trigger makes the copy `on_loan`. */
  async function issue() {
    if (!identity || !copyId || !personId) return;
    if (referenceOnly) {
      toast.error('ይህ መጽሐፍ መመሪያ ብቻ ስለሆነ አይበደርም።');
      return;
    }
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        copy_id: copyId,
        [BORROWER_COLUMN[kind]]: personId,
        loaned_on: loanedOn,
        status: 'borrowed',
        fine: 0,
        fine_paid: false,
        handled_by: identity.userId,
      };
      if (dueOn) payload.due_on = dueOn;
      if (issueNote.trim()) payload.note_am = issueNote.trim();
      const made = await supabase.from('library_loans').insert(payload as never);
      if (made.error) throw new Error(friendlyError(made.error));
      toast.success('ቅጂው ተበድሯል — የቅጂው ሁኔታ በራሱ “በተበዳሪ ዘንድ” ሆኗል።');
      setCopyId('');
      setPersonId('');
      setIssueNote('');
      await reload();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  /** Return: the same row closes; the trigger hands the copy back to the shelf. */
  async function saveReturn() {
    const loan = returning;
    if (!loan) return;
    setBusy(true);
    try {
      const updated = await supabase
        .from('library_loans')
        .update({ status: 'returned', returned_on: returnedOn, fine: amountOr(fine), fine_paid: finePaid } as never)
        .eq('id', loan.id);
      if (updated.error) throw new Error(friendlyError(updated.error));
      toast.success('ተመልሷል — ቅጂው ወደ “ዝግጁ” ተመልሷል።');
      setReturning(null);
      await reload();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function writeOff(loan: Row<'library_loans'>) {
    setBusy(true);
    try {
      const updated = await supabase
        .from('library_loans')
        .update({ status: 'lost_written_off', note_am: loan.note_am ? `${loan.note_am} · ጠፍቶ ተከፍሏል` : 'ጠፍቶ ተከፍሏል' } as never)
        .eq('id', loan.id);
      if (updated.error) throw new Error(friendlyError(updated.error));
      toast.success('ቅጂው “ጠፍቷል” ተብሎ ተመዝግቧል።');
      setClosing(null);
      await reload();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  /** The only library RPC in the schema: it flags every passed due date. */
  async function flagOverdue() {
    setBusy(true);
    try {
      const count = numberOr(await callFn('mark_overdue_loans', {}));
      toast.success(count === 0 ? 'የመመለሻ ቀን ያለፈ ብድር የለም።' : `${count} ብድሮች “ያለፉ” ተብለዋል።`);
      await reload();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  function exportAll() {
    exportExcel(
      [
        {
          name: 'የክምችት ቆጠራ',
          columns: [
            { header: 'መጽሐፍ', key: 'title' },
            { header: 'የተባለ ቅጂ', key: 'declared' },
            { header: 'የተመዘገበ ቅጂ', key: 'registered' },
            { header: 'ዝግጁ', key: 'available' },
            { header: 'በተበዳሪ ዘንድ', key: 'onLoan' },
            { header: 'ያልዝጋ (ጠፉ/ጉዳት)', key: 'unavailable' },
            { header: 'ክልክል', key: 'mismatch' },
          ],
          rows: stock.map((s) => ({ ...s, mismatch: s.mismatch ? 'የተሳሳተ' : 'ተስማምቷል' })),
        },
        {
          name: 'ብድሮች',
          columns: [
            { header: 'ባርኖድ', key: 'barcode' },
            { header: 'መጽሐፍ', key: 'title' },
            { header: 'ተበዳሪ', key: 'borrower' },
            { header: 'ዓይነት', key: 'kind' },
            { header: 'የተበዳረበት', key: 'loaned_on' },
            { header: 'የሚመለስበት', key: 'due_on' },
            { header: 'የተመለሰበት', key: 'returned_on' },
            { header: 'ሁኔታ', key: 'status' },
            { header: 'ቅጣት', key: 'fine' },
            { header: 'ቅጣቱ ተከፍሏል', key: 'fine_paid' },
          ],
          rows: ledger.map((l) => {
            const who = borrowerOf(l);
            const copy = copiesById.get(l.copy_id);
            return {
              barcode: copy?.barcode ?? '—',
              title: copy ? booksById.get(copy.book_id)?.title_am ?? '—' : '—',
              borrower: who ? names.get(who.id) ?? who.id.slice(0, 8) : '—',
              kind: who ? BORROWER_LABEL[who.kind] : '—',
              loaned_on: l.loaned_on,
              due_on: l.due_on ?? '—',
              returned_on: l.returned_on ?? '—',
              status: LOAN_LABEL[l.status] ?? l.status,
              fine: amountOr(l.fine),
              fine_paid: l.fine_paid ? 'አዎ' : 'አይ',
            };
          }),
        },
      ],
      'የመጻሕፍት-ማዕከል-ሒሳብ'
    );
  }

  if (!isSupabaseConfigured) return <NotConfigured />;
  if (!allowed) {
    return (
      <div className="space-y-5">
        <PageHeading title={MODULE_NAMES.library} description="የመጻሕፍት ማዕከሉ መዝገብ፣ ብድርና ክምችት ቆጠራ።" />
        <Denied hint="የመጻሕፍት ማዕከል መረጃ ለማየት operations.read ያስፈልጋሉ።" />
      </div>
    );
  }

  const ledgerColumns: Column<Row<'library_loans'>>[] = [
    {
      key: 'copy_id',
      header: 'ቅጂና መጽሐፍ',
      sortable: true,
      value: (r) => copiesById.get(r.copy_id)?.barcode ?? '',
      cell: (r) => {
        const copy = copiesById.get(r.copy_id);
        return (
          <div className="min-w-0">
            <p className="truncate font-medium">{copy ? booksById.get(copy.book_id)?.title_am ?? 'ያለ መጽሐፍ' : r.copy_id.slice(0, 8)}</p>
            <p className="font-mono text-xs text-muted-foreground">{copy?.barcode ?? '—'}</p>
          </div>
        );
      },
    },
    {
      key: 'borrower',
      header: 'ተበዳሪ',
      sortable: true,
      value: (r) => {
        const who = borrowerOf(r);
        return who ? names.get(who.id) ?? who.id : '';
      },
      cell: (r) => {
        const who = borrowerOf(r);
        if (!who) return <span className="text-muted-foreground">—</span>;
        return (
          <div className="min-w-0">
            <p className="truncate">{names.get(who.id) ?? `ያልተታወቀ (${who.id.slice(0, 8)})`}</p>
            <p className="text-xs text-muted-foreground">{BORROWER_LABEL[who.kind]}</p>
          </div>
        );
      },
    },
    { key: 'loaned_on', header: 'የተበዳረበት', sortable: true, hideBelow: 'sm', cell: (r) => dateAm(r.loaned_on) },
    {
      key: 'due_on',
      header: 'የሚመለስበት',
      sortable: true,
      hideBelow: 'md',
      cell: (r) => {
        if (!r.due_on) return '—';
        const passed = r.status === 'borrowed' && r.due_on < isoToday();
        return <span className={passed ? 'font-medium text-destructive' : undefined}>{dateAm(r.due_on)}</span>;
      },
    },
    { key: 'returned_on', header: 'የተመለሰበት', sortable: true, hideBelow: 'lg', cell: (r) => (r.returned_on ? dateAm(r.returned_on) : '—') },
    {
      key: 'status',
      header: 'ሁኔታ',
      sortable: true,
      cell: (r) => <StatusBadge tone={LOAN_TONE[r.status] ?? 'neutral'}>{LOAN_LABEL[r.status] ?? r.status}</StatusBadge>,
    },
    {
      key: 'fine',
      header: 'ቅጣት',
      sortable: true,
      align: 'end',
      hideBelow: 'md',
      value: (r) => amountOr(r.fine),
      cell: (r) => (amountOr(r.fine) > 0 ? `${br(r.fine)}${r.fine_paid ? ' ✓' : ''}` : '—'),
    },
    ...(mayWrite
      ? [
          {
            key: 'actions',
            header: 'ተግባር',
            cell: (r: Row<'library_loans'>) => (
              <div className="flex flex-wrap gap-1">
                {r.status === 'borrowed' || r.status === 'overdue' ? (
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<Undo2 className="h-3.5 w-3.5" aria-hidden />}
                    onClick={() => {
                      setReturning(r);
                      setReturnedOn(isoToday());
                      setFine(String(amountOr(r.fine)));
                      setFinePaid(r.fine_paid);
                    }}
                  >
                    ተመልስ
                  </Button>
                ) : null}
                {r.status !== 'lost_written_off' && r.status !== 'returned' ? (
                  <Button size="sm" variant="ghost" onClick={() => setClosing(r)}>
                    ጠፍቶ ተከፍሏል
                  </Button>
                ) : null}
              </div>
            ),
          } as Column<Row<'library_loans'>>,
        ]
      : []),
  ];

  const stockColumns: Column<StockRow>[] = [
    { key: 'title', header: 'መጽሐፍ', sortable: true, cell: (r) => <span className="font-medium">{r.title}</span> },
    { key: 'declared', header: 'የተባለ ብዛት', sortable: true, align: 'end', hideBelow: 'sm', value: (r) => r.declared },
    { key: 'registered', header: 'የተመዘገበ ቅጂ', sortable: true, align: 'end', value: (r) => r.registered },
    { key: 'available', header: 'ዝግጁ', sortable: true, align: 'end', value: (r) => r.available, cell: (r) => <StatusBadge tone={r.available > 0 ? 'success' : 'danger'}>{num(r.available)}</StatusBadge> },
    { key: 'onLoan', header: 'በዕዳ ላይ', sortable: true, align: 'end', hideBelow: 'md', value: (r) => r.onLoan },
    {
      key: 'unavailable',
      header: 'ዝግጁ ያልሆነ',
      sortable: true,
      align: 'end',
      hideBelow: 'md',
      value: (r) => r.unavailable,
      cell: (r) =>
        r.unavailable === 0 ? (
          '0'
        ) : (
          <div className="flex flex-wrap justify-end gap-1">
            {r.mix.map((part) => (
              <StatusBadge key={part.key} tone={part.tone}>{`${part.label} ${num(part.value)}`}</StatusBadge>
            ))}
          </div>
        ),
    },
    {
      key: 'mismatch',
      header: 'ቆጠራ',
      sortable: true,
      cell: (r) =>
        r.mismatch ? (
          <StatusBadge tone="warning">ክልክል አለ ({r.declared !== r.registered ? `${r.declared}↔${r.registered}` : '—'})</StatusBadge>
        ) : (
          <StatusBadge tone="success">ተስማምቷል</StatusBadge>
        ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeading
        title={MODULE_NAMES.library}
        description="መጽሐፍ፣ ቅጂና ብድር መዝገብ — የቅጂው ሁኔታ ከብድሩ በራሱ ይከታተላል፤ ቀጣሪው ቀን ማለፉ በመሐምሪያው ሠራሽ ብቻ ይመዘገባል።"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void reload()} icon={<RefreshCw className="h-4 w-4" aria-hidden />}>
              {UI.filter}
            </Button>
            {mayWrite ? (
              <Button variant="outline" size="sm" onClick={() => void flagOverdue()} loading={busy} icon={<CalendarClock className="h-4 w-4" aria-hidden />}>
                የመመለሻ ያለፉትን ምዘን
              </Button>
            ) : null}
            {mayExport ? (
              <Button variant="outline" size="sm" onClick={exportAll} icon={<Download className="h-4 w-4" aria-hidden />}>
                {UI.exportExcel}
              </Button>
            ) : null}
          </>
        }
      />

      {error ? <ErrorNote message={error} onRetry={() => void reload()} /> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="መጻሕፍት" value={num(books.length)} hint="በዋናው ዝርዝር" />
        <Metric label="የተመዘገቡ ቅጂዎች" value={num(copies.length)} hint={`ከነዚህ ${num(copies.filter((c) => c.status === 'available').length)} ዝግጁ`} />
        <Metric label="በዕዳ ላይ" value={num(openLoans.length)} tone="info" hint="ያልተመለሱ ብድሮች" />
        <Metric label="ቀን ያለፈባቸው" value={num(overdueLoans.length)} tone={overdueLoans.length > 0 ? 'danger' : 'neutral'} hint="በሠራሹ የተመለከቱ" />
      </div>

      <Tabs
        value={tab}
        onValueChange={setTab}
        items={[
          { value: 'loans', label: 'ብድር መዝገብ', count: ledger.length },
          { value: 'stock', label: 'የክምችት ቆጠራ', count: stock.length },
          { value: 'books', label: 'መጻሕፍት ዝርዝር', count: books.length },
          { value: 'copies', label: 'ቅጂዎች', count: copies.length },
        ]}
      >
        <TabPanel value="loans">
          <div className="space-y-4">
            {mayWrite ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-leaf" aria-hidden />
                    ቅጂ ማበደር
                  </CardTitle>
                  <span className="text-xs text-muted-foreground">
                    መሐምሪያው የቅጂውን ሁኔታ በራሱ ወደ “በተበዳሪ ዘንድ” ይቀይረዋል — እዚህ ሁለተኛ ማስታወሻ አያስፈልግም።
                  </span>
                </CardHeader>
                <CardBody className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Field label="የሚበደር ቅጂ" htmlFor="lib-copy" required hint="‘ዝግጁ’ የሆኑ ቅጂዎች ብቻ ይታያሉ።">
                      <Select
                        id="lib-copy"
                        value={copyId}
                        onChange={(e) => setCopyId(e.target.value)}
                        options={copyOptions}
                        placeholder={copyOptions.length === 0 ? 'ዝግጁ ቅጂ የለም' : 'ባርኮድ ወይም መጽሐፍ ይምረጡ'}
                      />
                    </Field>
                    <Field label="የተበዳሪ ዓይነት" htmlFor="lib-kind" required>
                      <Select
                        id="lib-kind"
                        value={kind}
                        onChange={(e) => {
                          setKind(e.target.value as BorrowerKind);
                          setPersonId('');
                        }}
                        options={BORROWER_KIND_OPTIONS}
                      />
                    </Field>
                    <Field label="ተበዳሪው ስም" htmlFor="lib-person" required hint={peopleHint ?? undefined}>
                      {peopleLoading ? <Spinner label="ዝርዝር በመጫን ላይ…" /> : (
                        <Select
                          id="lib-person"
                          value={personId}
                          onChange={(e) => setPersonId(e.target.value)}
                          options={people}
                          placeholder={people.length === 0 ? 'ዝርዝር የለም' : 'ስም ይምረጡ'}
                        />
                      )}
                    </Field>
                    <Field label="የተበዳረበት ቀን" htmlFor="lib-loaned">
                      <DateInput id="lib-loaned" value={loanedOn} onValueChange={setLoanedOn} />
                    </Field>
                    <Field label="የመመለሻ ቀን" htmlFor="lib-due" hint="ባዶ ከሆነ መዝገቡ ቀን አይዝጋም፤ ‘ማለፍ’ አይባልም።">
                      <DateInput id="lib-due" value={dueOn} onValueChange={setDueOn} min={loanedOn} />
                    </Field>
                    <Field label="ማስታወሻ" htmlFor="lib-note" className="lg:col-span-1">
                      <Input id="lib-note" value={issueNote} onChange={(e) => setIssueNote(e.target.value)} placeholder="ለምሳሌ ለሳምንት ጥናት" />
                    </Field>
                  </div>
                  {referenceOnly ? (
                    <p className="text-sm font-medium text-gold-deep dark:text-gold-soft">
                      የተመረጠው መጽሐፍ “መመሪያ ብቻ” ስለሆነ አይበደርም — በዚህ ክፍል ውስጥ ብቻ ያዩት።
                    </p>
                  ) : null}
                  <FormActions>
                    <Button onClick={() => void issue()} loading={busy} disabled={!copyId || !personId || referenceOnly} icon={<Send className="h-4 w-4" aria-hidden />}>
                      አብድር
                    </Button>
                    <span className="text-xs text-muted-foreground">የመቆጣጠሪያ ስም ({identity?.nameAm || '—'}) በመዝገቡ ላይ ይቀመጣል።</span>
                  </FormActions>
                </CardBody>
              </Card>
            ) : (
              <p className="text-sm text-muted-foreground">ቅጂ ለማበደር ወይም ለመመለስ operations.write ያስፈልጋሉ — አሁን ማንበብ ብቻ ይችላሉ።</p>
            )}

            <Card>
              <CardHeader>
                <CardTitle>የብድር መዝገብና ታሪክ</CardTitle>
                <div className="flex flex-wrap gap-3">
                  <Field label="ሁኔታ" htmlFor="lib-status">
                    <Select
                      id="lib-status"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      placeholder={UI.all}
                      options={Object.entries(LOAN_LABEL).map(([value, label]) => ({ value, label }))}
                    />
                  </Field>
                  <Field label="የተበዳሪ ዓይነት" htmlFor="lib-hkind">
                    <Select
                      id="lib-hkind"
                      value={historyKind}
                      onChange={(e) => {
                        setHistoryKind(e.target.value as BorrowerKind | '');
                        setHistoryPerson('');
                      }}
                      placeholder={UI.all}
                      options={BORROWER_KIND_OPTIONS}
                    />
                  </Field>
                  <Field label="ተበዳሪ (ታሪክ)" htmlFor="lib-hperson" hint="ዝርዝሩ ከላይ ከተመረጠው ዓይነት ጋር አንድ ነው።">
                    <Select
                      id="lib-hperson"
                      value={historyPerson}
                      onChange={(e) => setHistoryPerson(e.target.value)}
                      options={people}
                      placeholder={UI.all}
                      disabled={!historyKind}
                    />
                  </Field>
                </div>
              </CardHeader>
              <CardBody>
                <DataTable
                  rows={ledger}
                  columns={ledgerColumns}
                  rowKey={(r) => r.id}
                  loading={loading}
                  pageSize={15}
                  emptyTitle="በዚህ ማጣሪያ ብድር የለም"
                  emptyDescription="ሁኔታውን ወይም ተበዳሪውን ቀይረው ይሞክሩ።"
                  caption="የብድር መዝገብ"
                />
              </CardBody>
            </Card>
          </div>
        </TabPanel>

        <TabPanel value="stock">
          <Card>
            <CardHeader>
              <CardTitle>የቅጂ ክምችት ቆጠራ</CardTitle>
              <span className="text-xs text-muted-foreground">
                “የተባለ ብዛት” በመጽሐፉ መዝገብ ላይ ያለ ግምት፣ “የተመዘገበ” ደግሞ በእውነት ባርኮድ የተሰጣቸው ቅጂዎች ውጤት ነው።
              </span>
            </CardHeader>
            <CardBody>
              <DataTable
                rows={stock}
                columns={stockColumns}
                rowKey={(r) => r.bookId}
                loading={loading}
                pageSize={20}
                emptyTitle="የተመዘገበ መጽሐፍ የለም"
                emptyDescription="በ“መጻሕፍት ዝርዝር” ታብ መጽሐፍ ይጨምሩ።"
                caption="በመጽሐፍ የቅጂ ብዛት"
              />
            </CardBody>
          </Card>
        </TabPanel>

        <TabPanel value="books">
          <ResourceScreen resource={libraryBooksResource} />
        </TabPanel>

        <TabPanel value="copies">
          <ResourceScreen resource={libraryCopiesResource} />
        </TabPanel>
      </Tabs>

      <Modal
        open={Boolean(returning)}
        onOpenChange={(next) => {
          if (!next) setReturning(null);
        }}
        title="ቅጂ መመለስ"
        description={returning ? `ባርኮድ ${copiesById.get(returning.copy_id)?.barcode ?? returning.copy_id.slice(0, 8)} — የቅጂው ሁኔታ ወደ “ዝግጁ” ይመለሳል።` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setReturning(null)}>
              {UI.cancel}
            </Button>
            <Button onClick={() => void saveReturn()} loading={busy} icon={<Undo2 className="h-4 w-4" aria-hidden />}>
              መመለሱን አስቀምጥ
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="የተመለሰበት ቀን" htmlFor="lib-returned" required>
            <DateInput id="lib-returned" value={returnedOn} onValueChange={setReturnedOn} />
          </Field>
          <Field label="ቅጣት (ብር)" htmlFor="lib-fine" hint="የቀን ብዛት እዚህ አይሰላም — በዕዳ ላይ የቆየ ቀን በ‘የመመለሻ ያለፉትን ምዘን’ ብቻ ይመዘገባል።">
            <Input id="lib-fine" type="number" min={0} step="0.01" value={fine} onChange={(e) => setFine(e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <CheckboxField label="ቅጣቱ ተከፍሏል" checked={finePaid} onChange={(e) => setFinePaid(e.target.checked)} />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(closing)}
        onOpenChange={(next) => {
          if (!next) setClosing(null);
        }}
        title="ቅጂው ጠፍቷል ተብሎ ይመዘገብ?"
        description="ብድሩ ‘ጠፍቶ ተከፍሏል’ ይሆናል፤ ቅጂው ደግሞ በመሐምሪያው ‘ጠፍቷል’ ተብሎ ይታከማል። መሰረዝ ስለማይቻል መዝገቡ ይቆያል።"
        confirmLabel="ጠፍቶ ተከፍሏል አል።"
        destructive
        busy={busy}
        onConfirm={() => {
          if (closing) void writeOff(closing);
        }}
      />
    </div>
  );
}

// ─── 2 · እቃ ክምችት ────────────────────────────────────────────────────────────

type MovementDirection = 'in' | 'out' | 'adjust';

const DIRECTION_OPTIONS: readonly Option[] = [
  { value: 'in', label: MOVEMENT_LABEL.in },
  { value: 'out', label: MOVEMENT_LABEL.out },
  { value: 'adjust', label: MOVEMENT_LABEL.adjust },
];

type StockLevels = {
  items: number;
  low: number;
  empty: number;
  value: number;
};

/**
 * The store: live stock plus a receive/issue slip.
 *
 * `inventory_items.quantity` is written by `apply_inventory_movement()` on insert (and
 * rebuilt by `rebuild_inventory_stock(p_item)` when a slip is edited), so this screen
 * never updates the column — it inserts a movement and reads the result. A movement can
 * also be deleted by the schema's own `resync_inventory()` trigger path, but the RLS rule
 * gives `inventory_movements` no delete grant, so the ledger stays append-only here.
 */
export function InventoryScreen() {
  const { identity, can } = useAuth();
  const allowed = can('operations.read');
  const mayWrite = can('operations.write');
  const mayExport = can('reports.export', 'finance.export');

  const [tab, setTab] = useState('stock');
  const [items, setItems] = useState<Row<'inventory_items'>[]>([]);
  const [movements, setMovements] = useState<Row<'inventory_movements'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [slipOpen, setSlipOpen] = useState(false);
  const [itemId, setItemId] = useState('');
  const [direction, setDirection] = useState<MovementDirection>('in');
  const [qty, setQty] = useState('1');
  const [movedOn, setMovedOn] = useState(isoToday());
  const [reason, setReason] = useState('');
  const [counterparty, setCounterparty] = useState('');
  const [recounting, setRecounting] = useState('');

  const reload = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setError(null);
    try {
      const [itemRows, movementRows] = await Promise.all([
        listRows(supabase.from('inventory_items').select('*').order('sku').limit(800)),
        listRows(supabase.from('inventory_movements').select('*').order('moved_on', { ascending: false }).limit(400)),
      ]);
      setItems(itemRows);
      setMovements(movementRows);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [allowed]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i] as const)), [items]);

  const level = useMemo<StockLevels>(() => {
    let low = 0;
    let empty = 0;
    let value = 0;
    for (const i of items) {
      if (!i.is_active) continue;
      const quantity = numberOr(i.quantity);
      const reorder = numberOr(i.reorder_level);
      if (quantity <= 0) empty += 1;
      else if (quantity <= reorder) low += 1;
      value += quantity * amountOr(i.unit_cost);
    }
    return { items: items.filter((i) => i.is_active).length, low, empty, value };
  }, [items]);

  function openSlip(forItem: string, nextDirection: MovementDirection) {
    setItemId(forItem);
    setDirection(nextDirection);
    setQty('1');
    setMovedOn(isoToday());
    setReason('');
    setCounterparty('');
    setFormError(null);
    setSlipOpen(true);
  }

  /** One insert moves the stock — the trigger does the arithmetic and the guard. */
  async function saveSlip() {
    if (!itemId) {
      setFormError('እቃ ይምረጡ።');
      return;
    }
    const value = numberOr(qty);
    if (!Number.isFinite(value) || value === 0) {
      setFormError('መጠኑ ከዜሮ የተለየ ቁጥር መሆን አለበት (በእርግጥ “ማስተካከያ” ምልክቱ አስፈላጊ ነው)።');
      return;
    }
    if ((direction === 'in' || direction === 'out') && value < 0) {
      setFormError('ለገቢና ወጪ መጠኑ አዎንታዊ ይሁን፤ ልዩነት ለማስተካከል “የቆጠራ ማስተካከያ” ይምረጡ።');
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const made = await supabase
        .from('inventory_movements')
        .insert({
          item_id: itemId,
          direction,
          quantity: value,
          moved_on: movedOn,
          moved_by: identity?.userId ?? null,
          reason_am: reason.trim() || null,
          counterparty: counterparty.trim() || null,
        } as never);
      if (made.error) throw new Error(friendlyError(made.error));
      toast.success('እንቅስቃሴው ተመዝግቧል — የቀሪው ብዛት በመሐምሪያው ደረስቷል።');
      setSlipOpen(false);
      await reload();
    } catch (e) {
      const message = friendlyError(e);
      setFormError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  /** The schema's own recount, for a stock-take that disagrees with the ledger. */
  async function recount(id: string) {
    setBusy(true);
    setRecounting(id);
    try {
      await callFn('rebuild_inventory_stock', { p_item: id });
      toast.success('ክምችቱ እንደገና ተቆጥሯል።');
      await reload();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
      setRecounting('');
    }
  }

  function exportAll() {
    exportExcel(
      [
        {
          name: 'ክምችት',
          columns: [
            { header: 'ኮድ', key: 'sku' },
            { header: 'እቃ', key: 'name_am' },
            { header: 'ምድብ', key: 'category_am' },
            { header: 'ያለ መጠን', key: 'quantity' },
            { header: 'መለኪያ', key: 'unit_am' },
            { header: 'ወሰን', key: 'reorder_level' },
            { header: 'የአሃድ ዋጋ', key: 'unit_cost' },
            { header: 'ዋጋ ጠቅላላ', key: 'value' },
            { header: 'ቦታ', key: 'location_am' },
            { header: 'ሁኔታ', key: 'state' },
          ],
          rows: items.map((i) => ({
            sku: i.sku,
            name_am: i.name_am,
            category_am: i.category_am ?? '—',
            quantity: numberOr(i.quantity),
            unit_am: i.unit_am,
            reorder_level: numberOr(i.reorder_level),
            unit_cost: amountOr(i.unit_cost),
            value: numberOr(i.quantity) * amountOr(i.unit_cost),
            location_am: i.location_am ?? '—',
            state: stockState(i).label,
          })),
        },
        {
          name: 'እንቅስቃሴዎች',
          columns: [
            { header: 'እቃ', key: 'item' },
            { header: 'አቅጣጫ', key: 'direction' },
            { header: 'መጠን', key: 'quantity' },
            { header: 'ቀን', key: 'moved_on' },
            { header: 'ምክንያት', key: 'reason_am' },
            { header: 'ከነጋዴ/ተቋቋሚ', key: 'counterparty' },
          ],
          rows: movements.map((m) => ({
            item: itemsById.get(m.item_id)?.name_am ?? m.item_id.slice(0, 8),
            direction: MOVEMENT_LABEL[m.direction] ?? m.direction,
            quantity: numberOr(m.quantity),
            moved_on: m.moved_on,
            reason_am: m.reason_am ?? '—',
            counterparty: m.counterparty ?? '—',
          })),
        },
      ],
      'እቃ-ክምችት-ሒሳብ'
    );
  }

  if (!isSupabaseConfigured) return <NotConfigured />;
  if (!allowed) {
    return (
      <div className="space-y-5">
        <PageHeading title={MODULE_NAMES.inventory} description="እቃዎችና የገቢ-ወጪ መዝገብ።" />
        <Denied hint="እቃ ክምችት ለማየት operations.read ያስፈልጋሉ።" />
      </div>
    );
  }

  const stockColumns: Column<Row<'inventory_items'>>[] = [
    { key: 'sku', header: 'ኮድ', sortable: true, hideBelow: 'sm', cell: (r) => <span className="font-mono text-xs">{r.sku}</span> },
    {
      key: 'name_am',
      header: 'እቃ',
      sortable: true,
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.name_am}</p>
          <p className="text-xs text-muted-foreground">{r.category_am ?? '—'} · {r.location_am ?? 'የለ'}</p>
        </div>
      ),
    },
    {
      key: 'quantity',
      header: 'ያለ መጠን',
      sortable: true,
      align: 'end',
      value: (r) => numberOr(r.quantity),
      cell: (r) => {
        const state = stockState(r);
        return (
          <div className="flex items-center justify-end gap-2">
            <span className="font-display font-semibold tabular-nums">{num(r.quantity)}</span>
            <span className="text-xs text-muted-foreground">{r.unit_am}</span>
            <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
          </div>
        );
      },
    },
    { key: 'reorder_level', header: 'ወሰን', sortable: true, align: 'end', hideBelow: 'md', value: (r) => numberOr(r.reorder_level), cell: (r) => num(r.reorder_level) },
    {
      key: 'value',
      header: 'እሴት',
      sortable: true,
      align: 'end',
      hideBelow: 'lg',
      value: (r) => numberOr(r.quantity) * amountOr(r.unit_cost),
      cell: (r) => br(numberOr(r.quantity) * amountOr(r.unit_cost)),
    },
    { key: 'last_move', header: 'የመጨረሻ እንቅስቃሴ', hideBelow: 'lg', sortable: true, value: (r) => lastMove(movements, r.id)?.moved_on ?? '', cell: (r) => {
      const hit = lastMove(movements, r.id);
      return hit ? `${dateAm(hit.moved_on)} · ${MOVEMENT_LABEL[hit.direction] ?? hit.direction}` : 'ከለ መዝገብ የለም';
    } },
    ...(mayWrite
      ? [
          {
            key: 'actions',
            header: 'ተግባር',
            cell: (r: Row<'inventory_items'>) => (
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="outline" onClick={() => openSlip(r.id, 'in')} icon={<Plus className="h-3.5 w-3.5" aria-hidden />}>
                  ገቢ
                </Button>
                <Button size="sm" variant="outline" onClick={() => openSlip(r.id, 'out')}>
                  ወጪ
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void recount(r.id)} loading={recounting === r.id && busy} icon={<RefreshCw className="h-3.5 w-3.5" aria-hidden />}>
                  እንደገና ቆጠር
                </Button>
              </div>
            ),
          } as Column<Row<'inventory_items'>>,
        ]
      : []),
  ];

  const movementColumns: Column<Row<'inventory_movements'>>[] = [
    {
      key: 'item_id',
      header: 'እቃ',
      sortable: true,
      value: (r) => itemsById.get(r.item_id)?.name_am ?? '',
      cell: (r) => <span className="font-medium">{itemsById.get(r.item_id)?.name_am ?? r.item_id.slice(0, 8)}</span>,
    },
    {
      key: 'direction',
      header: 'አቅጣጫ',
      sortable: true,
      cell: (r) => <StatusBadge tone={MOVEMENT_TONE[r.direction] ?? 'neutral'}>{MOVEMENT_LABEL[r.direction] ?? r.direction}</StatusBadge>,
    },
    { key: 'quantity', header: 'መጠን', sortable: true, align: 'end', value: (r) => numberOr(r.quantity), cell: (r) => num(r.quantity) },
    { key: 'moved_on', header: 'ቀን', sortable: true, cell: (r) => dateAm(r.moved_on) },
    { key: 'reason_am', header: 'ምክንያት', hideBelow: 'md', cell: (r) => r.reason_am ?? '—' },
    { key: 'counterparty', header: 'ከነጋዴ', hideBelow: 'lg', cell: (r) => r.counterparty ?? '—' },
  ];

  const selected = itemsById.get(itemId) ?? null;

  return (
    <div className="space-y-5">
      <PageHeading
        title={MODULE_NAMES.inventory}
        description="የቀሪው ብዛት ከእንቅስቃሴ መዝገብ በራሱ ይሰላል — ስለዚህ እዚህ ቁጥር በእጅ አይቀየርም፤ ወጪ ሲቀንስ ከዜሮ በታች ከሆነ መረጃ ማጠራቀሚያው ራሱ ይከልክላል።"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void reload()} icon={<RefreshCw className="h-4 w-4" aria-hidden />}>
              አድስ
            </Button>
            {mayExport ? (
              <Button variant="outline" size="sm" onClick={exportAll} icon={<Download className="h-4 w-4" aria-hidden />}>
                {UI.exportExcel}
              </Button>
            ) : null}
            {mayWrite ? (
              <Button size="sm" onClick={() => openSlip(items[0]?.id ?? '', 'in')} disabled={items.length === 0} icon={<Boxes className="h-4 w-4" aria-hidden />}>
                እንቅስቃሴ ይመዝገቡ
              </Button>
            ) : null}
          </>
        }
      />

      {error ? <ErrorNote message={error} onRetry={() => void reload()} /> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="ንቁ እቃዎች" value={num(level.items)} hint="በመዝገብ ውስጥ" />
        <Metric label="አነስተኛ የሆኑ" value={num(level.low)} tone={level.low > 0 ? 'warning' : 'neutral'} hint="ከወሰናቸው በታች" />
        <Metric label="ጠልቀው" value={num(level.empty)} tone={level.empty > 0 ? 'danger' : 'neutral'} hint="ያለ መጠናቸው ዜሮ ሆኗል" />
        <Metric label="የክምችት እሴት" value={br(level.value)} tone="gold" hint="ብዛት × የአሃድ ዋጋ" />
      </div>

      <Tabs
        value={tab}
        onValueChange={setTab}
        items={[
          { value: 'stock', label: 'በራሱ የሚሰላ ክምችት', count: items.length },
          { value: 'movements', label: 'የቅርብ እንቅስቃሴዎች', count: movements.length },
          { value: 'ledger', label: 'ሙሉ የእንቅስቃሴ ዝርዝር' },
          { value: 'items', label: 'እቃ ዝርዝር', count: items.length },
        ]}
      >
        <TabPanel value="stock">
          <DataTable
            rows={items}
            columns={stockColumns}
            rowKey={(r) => r.id}
            loading={loading}
            pageSize={20}
            emptyTitle="የተመዘገበ እቃ የለም"
            emptyDescription="በ“እቃ ዝርዝር” ታብ እቃዎችን ይጨምሩ — ከዚያ እንቅስቃሴ መመዝገብ ይቻላል።"
            caption="የእቃ ክምችት ሁኔታ"
            toolbar={
              level.low + level.empty > 0 ? (
                <p className="text-sm text-muted-foreground">
                  እነሆ — {num(level.low)} እቃዎች ከወሰናቸው በታች፣ {num(level.empty)} ደግሞ ጠልቀዋል።
                </p>
              ) : null
            }
          />
        </TabPanel>

        <TabPanel value="movements">
          <Card>
            <CardHeader>
              <CardTitle>የመጨረሾቹ እንቅስቃሴዎች</CardTitle>
              <span className="text-xs text-muted-foreground">እያንዳንዱ መስመር የእቃውን ቀሪ ያንቀሳቅሳል፤ መሰረዝ ስለማይቻል መዝገቡ ይጠበቃል።</span>
            </CardHeader>
            <CardBody>
              <DataTable
                rows={movements}
                columns={movementColumns}
                rowKey={(r) => r.id}
                loading={loading}
                pageSize={20}
                emptyTitle="እንቅስቃሴ አልተመዘገበም"
                caption="የእቃ እንቅስቃሴ መዝገብ"
              />
            </CardBody>
          </Card>
        </TabPanel>

        <TabPanel value="ledger">
          <ResourceScreen resource={inventoryMovementsResource} />
        </TabPanel>

        <TabPanel value="items">
          <ResourceScreen resource={inventoryItemsResource} />
        </TabPanel>
      </Tabs>

      <Modal
        open={slipOpen}
        onOpenChange={setSlipOpen}
        title="የእቃ እንቅስቃሴ"
        description="መዝገቡ ብቻ ይጨምራል፤ የቀሪው ብዛት በመሐምሪያው ይሰላል።"
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSlipOpen(false)}>
              {UI.cancel}
            </Button>
            <Button onClick={() => void saveSlip()} loading={busy} icon={<Save className="h-4 w-4" aria-hidden />}>
              አስቀምጥ
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError ? <ErrorNote message={formError} /> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="እቃ" htmlFor="inv-item" required>
              <Select
                id="inv-item"
                value={itemId}
                onChange={(e) => setItemId(e.target.value)}
                options={items.map((i) => ({ value: i.id, label: `${i.name_am} (${i.sku})` }))}
                placeholder="እቃ ይምረጡ"
              />
            </Field>
            <Field label="አቅጣጫ" htmlFor="inv-direction" required>
              <Select id="inv-direction" value={direction} onChange={(e) => setDirection(e.target.value as MovementDirection)} options={DIRECTION_OPTIONS} />
            </Field>
            <Field
              label="መጠን"
              htmlFor="inv-qty"
              required
              hint={direction === 'adjust' ? 'ለማስተካከያ ምልክቱ ወሳኝ ነው፦ -3 ሲሆን ሦስት ይቀንሳል።' : 'አዎንታዊ ቁጥር ይጻፉ።'}
            >
              <Input id="inv-qty" type="number" step="0.01" value={qty} onChange={(e) => setQty(e.target.value)} />
            </Field>
            <Field label="ቀን" htmlFor="inv-date" required>
              <DateInput id="inv-date" value={movedOn} onValueChange={setMovedOn} />
            </Field>
            <Field label="ምክንያት" htmlFor="inv-reason">
              <Input id="inv-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ለምሳሌ ለዙርያ ፕሮግራም ስርጭት" />
            </Field>
            <Field label="የተሰጠው/የመጣው" htmlFor="inv-party">
              <Input id="inv-party" value={counterparty} onChange={(e) => setCounterparty(e.target.value)} placeholder="ዘርፍ፣ አቅራቢ ወይም ስም" />
            </Field>
          </div>
          {selected ? (
            <p className="rounded-md bg-accent/60 px-3 py-2 text-sm">
              <strong className="font-medium">{selected.name_am}</strong> — አሁን ያለ {num(selected.quantity)} {selected.unit_am}
              {numberOr(selected.quantity) <= numberOr(selected.reorder_level) ? (
                <span className="ms-2 text-gold-deep dark:text-gold-soft">ከወሰኑ ({num(selected.reorder_level)}) በታች ነው</span>
              ) : null}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">ያስተዳደረው፦ {identity?.nameAm || '—'} — በመዝገቡ ላይ `moved_by` ሆኖ ይቀመጣል።</p>
        </div>
      </Modal>
    </div>
  );
}

/** Is this item at, below or out of its reorder level? The badge the store uses. */
function stockState(item: Row<'inventory_items'>): { label: string; tone: Tone } {
  const quantity = numberOr(item.quantity);
  const reorder = numberOr(item.reorder_level);
  if (!item.is_active) return { label: 'አልቋል', tone: 'neutral' };
  if (quantity <= 0) return { label: 'ጠልቋል', tone: 'danger' };
  if (quantity <= reorder) return { label: 'አነስተኛ', tone: 'warning' };
  return { label: 'በቃ', tone: 'success' };
}

/** The newest movement for one item, straight out of the already-loaded ledger. */
function lastMove(movements: Row<'inventory_movements'>[], itemId: string): Row<'inventory_movements'> | null {
  for (const m of movements) {
    if (m.item_id === itemId) return m;
  }
  return null;
}

// ─── 3 · ምስክር ወረቀት ቢሮ ──────────────────────────────────────────────────────

type IssueResult = { id: string; certificateNo: string; verificationCode: string };

type VerifyResult = {
  valid: boolean;
  certificateNo: string | null;
  title: string | null;
  holder: string | null;
  issuedOn: string | null;
};

/** The tokens `certificate_templates.body_am` documents, exactly as the RPC reads them. */
const TEMPLATE_TOKENS = ['{{student}}', '{{class}}', '{{year}}', '{{date}}'] as const;

function renderBody(body: string, values: Record<string, string>): string {
  let out = body;
  for (const token of TEMPLATE_TOKENS) {
    out = out.split(token).join(values[token] ?? token);
  }
  return out;
}

/**
 * The certificate office: templates, issuing, the register and verification.
 *
 * Issuing runs through `issue_certificate(p_student, p_template, p_title)` because
 * `certificate_no` and `verification_code` are NOT NULL with no default — only that RPC
 * can mint them (it takes the student, not a member, and stamps the `is_current` academic
 * year itself, so there is no year picker here). `verify_certificate(p_code)` answers
 * `valid: false` rather than an empty row, which is what the verify box uses. The register
 * is read on purpose: an insert through the generic form could never satisfy those two
 * columns, so it appears as a table, never as `ResourceScreen`.
 */
export function CertificateScreen() {
  const { identity, can } = useAuth();
  const allowed = can('certificates.read');
  const mayWrite = can('certificates.write');

  const [tab, setTab] = useState('issue');
  const [templates, setTemplates] = useState<Row<'certificate_templates'>[]>([]);
  const [students, setStudents] = useState<Row<'student_profiles'>[]>([]);
  const [currentYear, setCurrentYear] = useState<Row<'academic_years'> | null>(null);
  const [register, setRegister] = useState<Row<'issued_certificates'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [templateId, setTemplateId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [title, setTitle] = useState('');
  const [result, setResult] = useState<IssueResult | null>(null);

  const [code, setCode] = useState('');
  const [verified, setVerified] = useState<VerifyResult | null>(null);
  const [verifyBusy, setVerifyBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setError(null);
    try {
      const [templateRows, registerRows] = await Promise.all([
        listRows(supabase.from('certificate_templates').select('*').eq('is_active', true).order('created_at', { ascending: false }).limit(200)),
        listRows(supabase.from('issued_certificates').select('*').order('certificate_no', { ascending: false }).limit(400)),
      ]);
      setTemplates(templateRows);
      setRegister(registerRows);

      // Both of these rosters sit behind other grants; a missing list is explained, not hidden.
      if (can('students.read')) {
        setStudents(await listRows(supabase.from('student_profiles').select('*').order('student_code').limit(800)));
      } else {
        setStudents([]);
      }
      if (can('academics.read')) {
        const years = await listRows(supabase.from('academic_years').select('*').eq('is_current', true).limit(2));
        setCurrentYear(years[0] ?? null);
      } else {
        setCurrentYear(null);
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [allowed, can]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const template = templates.find((t) => t.id === templateId) ?? null;
  const student = students.find((s) => s.id === studentId) ?? null;

  const preview = useMemo(() => {
    if (!template) return null;
    const values: Record<string, string> = {
      '{{student}}': student?.full_name_am ?? '{{student}}',
      // The RPC never substitutes {{class}} — the preview says so instead of pretending.
      '{{class}}': '{{class}}',
      '{{year}}': currentYear?.label_am ?? '',
      '{{date}}': isoToday(),
    };
    return {
      heading: template.heading_am ?? template.name_am,
      body: renderBody(template.body_am ?? '', values),
      issuer: template.issuer_am ?? UI.appName,
      signatureName: template.signature_name_am ?? '',
      signatureTitle: template.signature_title_am ?? '',
    };
  }, [template, student, currentYear]);

  async function issue() {
    if (!templateId || !studentId) return;
    setBusy(true);
    setFormError(null);
    try {
      const args: { p_student: string; p_template: string; p_title?: string } = {
        p_student: studentId,
        p_template: templateId,
      };
      if (title.trim()) args.p_title = title.trim();
      const json = (await callFn('issue_certificate', args)) as Record<string, unknown> | null;
      const certificateNo = String(json?.certificate_no ?? '');
      const verificationCode = String(json?.verification_code ?? '');
      if (!certificateNo) throw new Error('ሠራሹ የምስክር ቁጥር አልመለሰም።');
      setResult({ id: String(json?.id ?? ''), certificateNo, verificationCode });
      toast.success(`ምስክር ${certificateNo} ተሰጥቷል።`);
      setTitle('');
      await reload();
    } catch (e) {
      const message = friendlyError(e);
      setFormError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function runVerify() {
    setVerifyBusy(true);
    setVerified(null);
    try {
      const json = (await callFn('verify_certificate', { p_code: code.trim() })) as Record<string, unknown> | null;
      setVerified({
        valid: Boolean(json?.valid),
        certificateNo: json?.certificate_no ? String(json.certificate_no) : null,
        title: json?.title ? String(json.title) : null,
        holder: json?.holder ? String(json.holder) : null,
        issuedOn: json?.issued_on ? String(json.issued_on) : null,
      });
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setVerifyBusy(false);
    }
  }

  /** `verified_at` is the register's own stamp — no RPC sets it, so the row is updated. */
  async function stampVerified(row: Row<'issued_certificates'>) {
    setBusy(true);
    try {
      const updated = await supabase.from('issued_certificates').update({ verified_at: new Date().toISOString() } as never).eq('id', row.id);
      if (updated.error) throw new Error(friendlyError(updated.error));
      toast.success(`${row.certificate_no} የተረጋገጠበት ሰዓት ተመዝግቧል።`);
      await reload();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  if (!isSupabaseConfigured) return <NotConfigured />;
  if (!allowed) {
    return (
      <div className="space-y-5">
        <PageHeading title={MODULE_NAMES.certificates} description="የምስክር ወረቀት ቅንጮችና የተሰጡ ምስክሮች መዝገብ።" />
        <Denied hint="ምስክር ወረቀት ለማየት certificates.read ያስፈልጋሉ።" />
      </div>
    );
  }

  const registerColumns: Column<Row<'issued_certificates'>>[] = [
    { key: 'certificate_no', header: 'የምስክር ቁጥር', sortable: true, cell: (r) => <span className="font-mono text-xs font-medium">{r.certificate_no}</span> },
    {
      key: 'holder',
      header: 'ተቀባይ',
      sortable: true,
      value: (r) => snapshotText(r.render_snapshot, 'student'),
      cell: (r) => <span className="font-medium">{snapshotText(r.render_snapshot, 'student')}</span>,
    },
    { key: 'title_am', header: 'ርዕስ', sortable: true, cell: (r) => r.title_am },
    {
      key: 'template_id',
      header: 'ቅንጥ',
      sortable: true,
      hideBelow: 'md',
      value: (r) => templates.find((t) => t.id === r.template_id)?.name_am ?? '',
      cell: (r) => templates.find((t) => t.id === r.template_id)?.name_am ?? '—',
    },
    { key: 'issued_on', header: 'የተሰጠበት', sortable: true, hideBelow: 'sm', cell: (r) => dateAm(r.issued_on) },
    { key: 'verification_code', header: 'የማረጋገጫ ኮድ', sortable: true, hideBelow: 'lg', cell: (r) => <span className="font-mono text-xs">{r.verification_code}</span> },
    {
      key: 'verified_at',
      header: 'ማረጋገጫ',
      sortable: true,
      hideBelow: 'md',
      value: (r) => r.verified_at ?? '',
      cell: (r) => (r.verified_at ? <StatusBadge tone="success">{dateTimeAm(r.verified_at)}</StatusBadge> : <StatusBadge tone="neutral">አልተረጋገጠም</StatusBadge>),
    },
    ...(mayWrite
      ? [
          {
            key: 'actions',
            header: 'ተግባር',
            cell: (r: Row<'issued_certificates'>) => (
              <Button size="sm" variant="outline" onClick={() => void stampVerified(r)} loading={busy} icon={<SearchCheck className="h-3.5 w-3.5" aria-hidden />}>
                ማረጋገጩን መዝግብ
              </Button>
            ),
          } as Column<Row<'issued_certificates'>>,
        ]
      : []),
  ];

  return (
    <div className="space-y-5">
      <PageHeading
        title={MODULE_NAMES.certificates}
        description="ቅንጥ መሥርቶ ለተማሪ መስጠት — ቁጥሩና የማረጋገጫ ኮዱ በራሱ በሠራሹ ይሰጣሉ፤ በየትኛው ዓመት እንደተሰጠ ደግሞ “የሚሠራው ዓመት” ብቻ ነው።"
        actions={
          <Button variant="outline" size="sm" onClick={() => void reload()} icon={<RefreshCw className="h-4 w-4" aria-hidden />}>
            አድስ
          </Button>
        }
      />

      {error ? <ErrorNote message={error} onRetry={() => void reload()} /> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="ንቁ ቅንጮች" value={num(templates.length)} hint="ለመስጠት ዝግጁ" />
        <Metric label="የተሰጡ ምስክሮች" value={num(register.length)} tone="gold" hint="የቅርብ መዝገብ" />
        <Metric label="የሚሠራው ዓመት" value={currentYear?.label_am ?? '—'} hint={currentYear ? 'ሠራሹ ይህን ዓመት ይዝጋል' : 'academics.read ስለሌለ አልነበብም'} />
      </div>

      <Tabs
        value={tab}
        onValueChange={setTab}
        items={[
          { value: 'issue', label: 'ምስክር መስጠት' },
          { value: 'register', label: 'የተሰጡ መዝገብ', count: register.length },
          { value: 'verify', label: 'በኮድ ማረጋገጥ' },
          { value: 'templates', label: 'ቅንጮች', count: templates.length },
        ]}
      >
        <TabPanel value="issue">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ScrollText className="h-4 w-4 text-leaf" aria-hidden />
                  አዲስ ምስክር ይስጡ
                </CardTitle>
                <span className="text-xs text-muted-foreground">`issue_certificate` ብቻ መንገድ ነው — ቁጥርና ኮድ በእጅ አይሙሉም።</span>
              </CardHeader>
              <CardBody className="space-y-4">
                {formError ? <ErrorNote message={formError} /> : null}
                <Field label="ቅንጥ" htmlFor="cert-template" required hint={loading ? 'በመጫን ላይ…' : 'ንቁ ቅንጮች ብቻ ይታያሉ።'}>
                  <Select
                    id="cert-template"
                    value={templateId}
                    onChange={(e) => setTemplateId(e.target.value)}
                    options={templates.map((t) => ({ value: t.id, label: `${t.name_am} — ${CERT_KIND_LABEL[t.kind] ?? t.kind}` }))}
                    placeholder={templates.length === 0 ? 'ንቁ ቅንጥ የለም' : 'ቅንጥ ይምረጡ'}
                    disabled={loading}
                  />
                </Field>

                {can('students.read') ? (
                  <Field label="ተቀባይ ተማሪ" htmlFor="cert-student" required hint="ሠራሹ ተማሪ ይጠይቃል (አባል አይደለም)።">
                    <Select
                      id="cert-student"
                      value={studentId}
                      onChange={(e) => setStudentId(e.target.value)}
                      options={students.map((s) => ({ value: s.id, label: `${s.full_name_am} — ${s.student_code}` }))}
                      placeholder={students.length === 0 ? 'ተማሪ አልተገኘም' : 'ተማሪ ይምረጡ'}
                      disabled={loading}
                    />
                  </Field>
                ) : (
                  <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
                    የተማሪ ዝርዝር ለማንበብ students.read ያስፈልጋሉ — ያለዚት ምስክር መስጠት አይቻልም።
                  </p>
                )}

                <Field label="የምስክር ርዕስ" htmlFor="cert-title" hint="ባዶ ከሆነ የቅንጡ ስም ራሱ ይሆናል።">
                  <Input id="cert-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={template?.name_am ?? 'ለምሳሌ የመማሪያ ማጠናቀቂያ'} />
                </Field>

                <p className="text-xs text-muted-foreground">
                  የዓመት ምርጫ የለም፦ ሠራሹ `academic_years.is_current` የሆነውን ዓመት ብቻ ይዝጋል። {currentYear ? `አሁን ያለው ${currentYear.label_am} ነው።` : ''}
                </p>

                {mayWrite ? (
                  <FormActions>
                    <Button onClick={() => void issue()} loading={busy} disabled={!templateId || !studentId} icon={<Award className="h-4 w-4" aria-hidden />}>
                      ምስክር ስጥ
                    </Button>
                    <span className="text-xs text-muted-foreground">የሰጠው፦ {identity?.nameAm || '—'}</span>
                  </FormActions>
                ) : (
                  <p className="text-sm text-muted-foreground">ምስክር ለመስጠት certificates.write ያስፈልጋሉ — አሁን ማየት ብቻ ይችላሉ።</p>
                )}
              </CardBody>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>የአማርኛ ቅድመ እይታ</CardTitle>
                  <span className="text-xs text-muted-foreground">
                    ተለዋዋጮች፦ {TEMPLATE_TOKENS.join(' · ')} — {'{{class}}'} በሠራሹ አይተካም፣ ስለዚህ እንደጻፉት ይቆያል።
                  </span>
                </CardHeader>
                <CardBody>
                  {!template ? (
                    <EmptyState title="ቅንጥ ይምረጡ" description="ቅንጥና ተማሪ ሲመረጡ የሚተዋውቀው ጽሑፍ እዚህ ይታያል።" />
                  ) : (
                    <div className="space-y-3 rounded-lg border border-gold bg-parchment/40 p-5 text-center">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">{preview?.issuer}</p>
                      <p className="font-display text-xl font-semibold">{preview?.heading}</p>
                      <p className="font-display text-base font-medium">{student?.full_name_am ?? 'ተማሪ አልተመረጠም'}</p>
                      <p className="whitespace-pre-line text-sm leading-relaxed">{preview?.body}</p>
                      <div className="mt-2 flex items-end justify-between gap-4 pt-4 text-xs text-muted-foreground">
                        <span>{preview?.signatureName || '—'}</span>
                        <span>{dateAm(isoToday())}</span>
                        <span>{preview?.signatureTitle || '—'}</span>
                      </div>
                    </div>
                  )}
                </CardBody>
              </Card>

              {result ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Star className="h-4 w-4 text-gold" aria-hidden />
                      የተሰጠ ምስክር
                    </CardTitle>
                  </CardHeader>
                  <CardBody className="space-y-2 text-sm">
                    <p>
                      የምስክር ቁጥር፦ <span className="font-mono font-medium">{result.certificateNo}</span>
                    </p>
                    <p>
                      የማረጋገጫ ኮድ፦ <span className="font-mono font-medium">{result.verificationCode}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">ኮዱ በ “በኮድ ማረጋገጥ” ታብ ወይም በድረ-ገጹ ማረጋገጫ ቦታ ላይ ይሠራል።</p>
                  </CardBody>
                </Card>
              ) : null}
            </div>
          </div>
        </TabPanel>

        <TabPanel value="register">
          <Card>
            <CardHeader>
              <CardTitle>የተሰጡ ምስክር ወረቀቶች</CardTitle>
              <span className="text-xs text-muted-foreground">ለማንበብ ብቻ — ቁጥሩና ኮዱ ከሌላ መንገድ ሊሞሉ አይችሉም።</span>
            </CardHeader>
            <CardBody>
              <DataTable
                rows={register}
                columns={registerColumns}
                rowKey={(r) => r.id}
                loading={loading}
                pageSize={20}
                emptyTitle="እስይዝ የተሰጠ ምስክር የለም"
                caption="የምስክር መዝገብ"
              />
            </CardBody>
          </Card>
        </TabPanel>

        <TabPanel value="verify">
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle>በማረጋገጫ ኮድ አረጋግጥ</CardTitle>
              <span className="text-xs text-muted-foreground">`verify_certificate` ኮዱን ወደ ትልቅ ፊደል ይቀይረዋል፤ ኮዱ ስህተት ከሆነ “አልተገኘም” ይመልሳል።</span>
            </CardHeader>
            <CardBody className="space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <Field label="ኮድ" htmlFor="cert-code" className="min-w-64 grow">
                  <Input
                    id="cert-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && code.trim()) void runVerify();
                    }}
                    placeholder="ለምሳሌ A1B2C3D4E5"
                  />
                </Field>
                <Button onClick={() => void runVerify()} loading={verifyBusy} disabled={!code.trim()} icon={<SearchCheck className="h-4 w-4" aria-hidden />}>
                  አረጋግጥ
                </Button>
              </div>

              {verified ? (
                verified.valid ? (
                  <div className="space-y-1 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100">
                    <p className="font-display font-semibold">አረጋግጦ ተሰጥቷል</p>
                    <p>የምስክር ቁጥር፦ <span className="font-mono">{verified.certificateNo}</span></p>
                    <p>ርዕስ፦ {verified.title}</p>
                    <p>ተቀባይ፦ {verified.holder}</p>
                    <p>የተሰጠበት፦ {verified.issuedOn ? dateAm(verified.issuedOn) : '—'}</p>
                  </div>
                ) : (
                  <p className="rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
                    ይህ ኮድ በመዝገቡ ውስጥ አልተገኘም — ኮዱን ከምስክሩ ታችኛው ክፍል ይቅዱ።
                  </p>
                )
              ) : null}
            </CardBody>
          </Card>
        </TabPanel>

        <TabPanel value="templates">
          <ResourceScreen resource={certificateTemplatesResource} />
        </TabPanel>
      </Tabs>
    </div>
  );
}

/** `certificate_templates.kind` — the CHECK list in 20261102000600_academics.sql. */
const CERT_KIND_LABEL: Record<string, string> = {
  completion: 'የትምህርት ማጠናቀቂያ',
  merit: 'ክብር/ሽልማት',
  participation: 'ተሳትፎ',
  teacher_appreciation: 'የመምህር ማመስገን',
  leadership: 'አመራርና መሪነት',
};

// ─── 4 · በፈቃደኝነት አገልግሎት ──────────────────────────────────────────────────

const ASSIGNMENT_STATUS_OPTIONS: readonly Option[] = [
  { value: 'assigned', label: ASSIGNMENT_LABEL.assigned },
  { value: 'completed', label: ASSIGNMENT_LABEL.completed },
  { value: 'cancelled', label: ASSIGNMENT_LABEL.cancelled },
];

type VolunteerStat = {
  assignments: number;
  completed: number;
  open: number;
  plannedHours: number;
};

/**
 * Volunteers and their assignments.
 *
 * `volunteer_profiles.hours_logged` is written by `sync_volunteer_hours` — the sum of the
 * hours on `completed` assignments — so it is read-only everywhere here, and
 * `recalc_volunteer_hours(p_volunteer)` is offered as the explicit recount when a slip was
 * edited outside the screen. Assignments are ordinary rows (`volunteers.write`), so the
 * form inserts and closes them directly. Member names sit behind `departments.read`, so a
 * pure `volunteers.read` user gets the identifier plus a note instead of a broken list.
 */
export function VolunteerScreen() {
  const { can } = useAuth();
  const allowed = can('volunteers.read');
  const mayWrite = can('volunteers.write');
  const mayExport = can('reports.export', 'finance.export');

  const [tab, setTab] = useState('roster');
  const [volunteers, setVolunteers] = useState<Row<'volunteer_profiles'>[]>([]);
  const [assignments, setAssignments] = useState<Row<'volunteer_assignments'>[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [namesHint, setNamesHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [volunteerId, setVolunteerId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [activityId, setActivityId] = useState('');
  const [eventId, setEventId] = useState('');
  const [role, setRole] = useState('');
  const [hours, setHours] = useState('2');
  const [assignedOn, setAssignedOn] = useState(isoToday());
  const [status, setStatus] = useState('assigned');
  const [note, setNote] = useState('');
  const [departments, setDepartments] = useState<readonly Option[]>([]);
  const [activities, setActivities] = useState<readonly Option[]>([]);
  const [events, setEvents] = useState<readonly Option[]>([]);
  const [choicesHint, setChoicesHint] = useState<string | null>(null);

  const [summaryId, setSummaryId] = useState('');

  const reload = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setError(null);
    try {
      const [profileRows, assignmentRows] = await Promise.all([
        listRows(supabase.from('volunteer_profiles').select('*').order('created_at', { ascending: false }).limit(500)),
        listRows(supabase.from('volunteer_assignments').select('*').order('assigned_on', { ascending: false }).limit(800)),
      ]);
      setVolunteers(profileRows);
      setAssignments(assignmentRows);

      if (can('departments.read')) {
        const ids = [...new Set(profileRows.map((p) => p.member_id))];
        const found = new Map<string, string>();
        for (const part of chunksOf(ids)) {
          for (const m of await listRows(supabase.from('members').select('*').in('id', part))) found.set(m.id, m.full_name_am);
        }
        setNames(found);
        setNamesHint(null);
      } else {
        setNames(new Map());
        setNamesHint('የአባል ስሞች ለማንበብ departments.read ያስፈልጋሉ — አሁን መለያ ቁጥር ብቻ ይታያል።');
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [allowed, can]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const stats = useMemo(() => {
    const held = new Map<string, VolunteerStat>();
    for (const a of assignments) {
      const row = held.get(a.volunteer_id) ?? { assignments: 0, completed: 0, open: 0, plannedHours: 0 };
      row.assignments += 1;
      if (a.status === 'completed') row.completed += 1;
      if (a.status === 'assigned') {
        row.open += 1;
        row.plannedHours += amountOr(a.hours);
      }
      held.set(a.volunteer_id, row);
    }
    return held;
  }, [assignments]);

  const totals = useMemo(() => {
    let hours = 0;
    let completed = 0;
    for (const v of volunteers) {
      hours += amountOr(v.hours_logged);
      completed += stats.get(v.id)?.completed ?? 0;
    }
    return { volunteers: volunteers.length, active: volunteers.filter((v) => v.status === 'active').length, hours, completed };
  }, [volunteers, stats]);

  /** The foreign-key pickers, loaded only when the form opens and only if readable. */
  async function loadChoices() {
    setChoicesHint(null);
    try {
      if (can('departments.read')) {
        const [departmentRows, activityRows] = await Promise.all([
          listRows(supabase.from('departments').select('*').eq('state', 'published').order('name_am').limit(200)),
          listRows(supabase.from('department_activities').select('*').order('created_at', { ascending: false }).limit(200)),
        ]);
        setDepartments(departmentRows.map((d) => ({ value: d.id, label: d.name_am })));
        setActivities(activityRows.map((a) => ({ value: a.id, label: a.title_am })));
      } else {
        setDepartments([]);
        setActivities([]);
        setChoicesHint('ዘርፍና ተግባር ለመምረጥ departments.read ያስፈልጋሉ።');
      }
      if (can('events.read')) {
        const eventRows = await listRows(supabase.from('events').select('*').order('created_at', { ascending: false }).limit(200));
        setEvents(eventRows.map((e) => ({ value: e.id, label: e.title_am })));
      } else {
        setEvents([]);
      }
    } catch (e) {
      setChoicesHint(friendlyError(e));
    }
  }

  function openForm(forVolunteer: string) {
    setVolunteerId(forVolunteer);
    setDepartmentId('');
    setActivityId('');
    setEventId('');
    setRole('');
    setHours('2');
    setAssignedOn(isoToday());
    setStatus('assigned');
    setNote('');
    setFormError(null);
    setFormOpen(true);
    void loadChoices();
  }

  async function saveAssignment() {
    if (!volunteerId) {
      setFormError('አገልጋይ ይምረጡ።');
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const payload: Record<string, unknown> = {
        volunteer_id: volunteerId,
        hours: amountOr(hours),
        assigned_on: assignedOn,
        status,
      };
      if (departmentId) payload.department_id = departmentId;
      if (activityId) payload.activity_id = activityId;
      if (eventId) payload.event_id = eventId;
      if (role.trim()) payload.role_am = role.trim();
      if (note.trim()) payload.note_am = note.trim();
      const made = await supabase.from('volunteer_assignments').insert(payload as never);
      if (made.error) throw new Error(friendlyError(made.error));
      toast.success('ተግባሩ ተመድቧል። “ተጠናቋል” ሲባል ሰዓቱ በራሱ ይደመራል።');
      setFormOpen(false);
      await reload();
    } catch (e) {
      const message = friendlyError(e);
      setFormError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  /** Closing an assignment is what feeds `hours_logged`, so it is stated plainly. */
  async function decide(assignment: Row<'volunteer_assignments'>, next: 'completed' | 'cancelled') {
    setBusy(true);
    try {
      const updated = await supabase.from('volunteer_assignments').update({ status: next } as never).eq('id', assignment.id);
      if (updated.error) throw new Error(friendlyError(updated.error));
      toast.success(next === 'completed' ? 'ተጠናቋል ተብሎ ተመዝግቧል — የሰዓቱ ድምር አድሷል።' : 'ተግባሩ ተሰርዟል።');
      await reload();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function recount(volunteer: Row<'volunteer_profiles'>) {
    setBusy(true);
    try {
      await callFn('recalc_volunteer_hours', { p_volunteer: volunteer.id });
      toast.success('የሰዓቱ ድምር እንደገና ተሰልጧል።');
      await reload();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  function nameOf(profile: Row<'volunteer_profiles'>): string {
    return names.get(profile.member_id) ?? `አባል ${profile.member_id.slice(0, 8)}`;
  }

  function exportAll() {
    exportExcel(
      [
        {
          name: 'አገልጋዮች',
          columns: [
            { header: 'ስም', key: 'name' },
            { header: 'ሁኔታ', key: 'status' },
            { header: 'የአገልግሎት ዘርፎች', key: 'areas' },
            { header: 'የሚቻልበት ጊዜ', key: 'availability' },
            { header: 'ተግባራት', key: 'assignments' },
            { header: 'የተጠናቀቁ', key: 'completed' },
            { header: 'የተመዘገቡ ሰዓታት', key: 'hours' },
          ],
          rows: volunteers.map((v) => {
            const stat = stats.get(v.id);
            return {
              name: nameOf(v),
              status: VOLUNTEER_LABEL[v.status] ?? v.status,
              areas: v.service_areas.join('፣ ') || '—',
              availability: v.availability ?? '—',
              assignments: stat?.assignments ?? 0,
              completed: stat?.completed ?? 0,
              hours: amountOr(v.hours_logged),
            };
          }),
        },
        {
          name: 'ተግባራት',
          columns: [
            { header: 'አገልጋይ', key: 'volunteer' },
            { header: 'ሚና', key: 'role_am' },
            { header: 'ሰዓት', key: 'hours' },
            { header: 'ቀን', key: 'assigned_on' },
            { header: 'ሁኔታ', key: 'status' },
            { header: 'ማስታወሻ', key: 'note_am' },
          ],
          rows: assignments.map((a) => {
            const profile = volunteers.find((v) => v.id === a.volunteer_id);
            return {
              volunteer: profile ? nameOf(profile) : a.volunteer_id.slice(0, 8),
              role_am: a.role_am ?? '—',
              hours: amountOr(a.hours),
              assigned_on: a.assigned_on,
              status: ASSIGNMENT_LABEL[a.status] ?? a.status,
              note_am: a.note_am ?? '—',
            };
          }),
        },
      ],
      'በፈቃደኝነት-አገልግሎት-ሒሳብ'
    );
  }

  if (!isSupabaseConfigured) return <NotConfigured />;
  if (!allowed) {
    return (
      <div className="space-y-5">
        <PageHeading title={MODULE_NAMES.volunteers} description="የበፈቃደኝነት አገልጋዮች መዝገብና ተግባራት።" />
        <Denied hint="በፈቃደኝነት አገልግሎት ለማየት volunteers.read ያስፈልጋሉ።" />
      </div>
    );
  }

  const rosterColumns: Column<Row<'volunteer_profiles'>>[] = [
    {
      key: 'name',
      header: 'አገልጋይ',
      sortable: true,
      value: (r) => nameOf(r),
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{nameOf(r)}</p>
          <p className="text-xs text-muted-foreground">{r.availability ?? 'የሚቻልበት ጊዜ አልታወቀም'}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'ሁኔታ',
      sortable: true,
      cell: (r) => <StatusBadge tone={VOLUNTEER_TONE[r.status] ?? 'neutral'}>{VOLUNTEER_LABEL[r.status] ?? r.status}</StatusBadge>,
    },
    {
      key: 'service_areas',
      header: 'የአገልግሎት ዘርፎች',
      hideBelow: 'md',
      sortable: true,
      value: (r) => r.service_areas.join(','),
      cell: (r) => (r.service_areas.length > 0 ? r.service_areas.join('፣ ') : '—'),
    },
    {
      key: 'hours_logged',
      header: 'የተሰሩ ሰዓታት',
      sortable: true,
      align: 'end',
      value: (r) => amountOr(r.hours_logged),
      cell: (r) => (
        <span title="በመሐምሪያው የተሰላ — የተጠናቀቁ ተግባራት ድምር">
          {num(r.hours_logged)} <span className="text-xs text-muted-foreground">ሰዓት</span>
        </span>
      ),
    },
    {
      key: 'assignments',
      header: 'ተግባራት',
      sortable: true,
      align: 'end',
      hideBelow: 'sm',
      value: (r) => stats.get(r.id)?.assignments ?? 0,
      cell: (r) => {
        const stat = stats.get(r.id);
        return (
          <div className="tabular-nums">
            <p>{num(stat?.assignments ?? 0)}</p>
            <p className="text-xs text-muted-foreground">{num(stat?.completed ?? 0)} ተጠናቋል</p>
          </div>
        );
      },
    },
    {
      key: 'actions',
      header: 'ተግባር',
      cell: (r: Row<'volunteer_profiles'>) => (
        <div className="flex flex-wrap gap-1">
          {mayWrite ? (
            <Button size="sm" variant="outline" onClick={() => openForm(r.id)} icon={<Plus className="h-3.5 w-3.5" aria-hidden />}>
              ተግባር ይምደቡ
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setSummaryId(r.id);
              setTab('summary');
            }}
          >
            ማጠቃለያ
          </Button>
          {mayWrite ? (
            <Button size="sm" variant="ghost" onClick={() => void recount(r)} loading={busy} icon={<RefreshCw className="h-3.5 w-3.5" aria-hidden />}>
              እንደገና ደብለህ
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  const summaryAssignments = assignments.filter((a) => a.volunteer_id === summaryId);

  const summaryColumns: Column<Row<'volunteer_assignments'>>[] = [
    { key: 'assigned_on', header: 'ቀን', sortable: true, cell: (r) => dateAm(r.assigned_on) },
    { key: 'role_am', header: 'ሚና', sortable: true, cell: (r) => r.role_am ?? '—' },
    {
      key: 'activity_id',
      header: 'ተያያዝ',
      hideBelow: 'md',
      cell: (r) => {
        const activity = activities.find((o) => o.value === r.activity_id);
        const event = events.find((o) => o.value === r.event_id);
        return <span className="text-xs">{activity?.label ?? event?.label ?? (r.department_id ? 'በዘርፍ' : '—')}</span>;
      },
    },
    { key: 'hours', header: 'ሰዓት', sortable: true, align: 'end', value: (r) => amountOr(r.hours), cell: (r) => num(r.hours) },
    {
      key: 'status',
      header: 'ሁኔታ',
      sortable: true,
      cell: (r) => <StatusBadge tone={ASSIGNMENT_TONE[r.status] ?? 'neutral'}>{ASSIGNMENT_LABEL[r.status] ?? r.status}</StatusBadge>,
    },
    ...(mayWrite
      ? [
          {
            key: 'actions',
            header: 'ተግባር',
            cell: (r: Row<'volunteer_assignments'>) => (
              <div className="flex flex-wrap gap-1">
                {r.status === 'assigned' ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => void decide(r, 'completed')} icon={<CheckCheck className="h-3.5 w-3.5" aria-hidden />}>
                      አጠናቅቅ
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void decide(r, 'cancelled')}>
                      ሰርዝ
                    </Button>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">ተዘግቷል</span>
                )}
              </div>
            ),
          } as Column<Row<'volunteer_assignments'>>,
        ]
      : []),
  ];

  const summaryProfile = volunteers.find((v) => v.id === summaryId) ?? null;

  return (
    <div className="space-y-5">
      <PageHeading
        title={MODULE_NAMES.volunteers}
        description="አገልጋዮች መዝገብና ተግባራት — የተሰሩ ሰዓታት የተጠናቀቁ ተግባራት ድምር ስለሆነ እዚህ በእጅ አይቀየርም።"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void reload()} icon={<RefreshCw className="h-4 w-4" aria-hidden />}>
              አድስ
            </Button>
            {mayExport ? (
              <Button variant="outline" size="sm" onClick={exportAll} icon={<Download className="h-4 w-4" aria-hidden />}>
                {UI.exportExcel}
              </Button>
            ) : null}
            {mayWrite ? (
              <Button size="sm" onClick={() => openForm(volunteers[0]?.id ?? '')} disabled={volunteers.length === 0} icon={<Users className="h-4 w-4" aria-hidden />}>
                ተግባር ይምደቡ
              </Button>
            ) : null}
          </>
        }
      />

      {error ? <ErrorNote message={error} onRetry={() => void reload()} /> : null}
      {namesHint ? <p className="text-sm text-muted-foreground">{namesHint}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="የተመዘገቡ አገልጋዮች" value={num(totals.volunteers)} hint="በመዝገብ ውስጥ" />
        <Metric label="ንቁ አገልጋዮች" value={num(totals.active)} tone="success" />
        <Metric label="የተጠናቀቁ ተግባራት" value={num(totals.completed)} tone="info" hint="ከመዝገቡ ድምር" />
        <Metric label="የተመዘገበ ሰዓት" value={num(totals.hours)} tone="gold" hint="በመሐምሪያው የተሰላ" />
      </div>

      <Tabs
        value={tab}
        onValueChange={setTab}
        items={[
          { value: 'roster', label: 'የአገልጋይ ዝርዝር', count: volunteers.length },
          { value: 'summary', label: 'የአገልጋይ ማጠቃለያ', count: summaryAssignments.length },
          { value: 'assignments', label: 'ተግባራት', count: assignments.length },
          { value: 'profiles', label: 'የአገልጋይ መዝገብ' },
        ]}
      >
        <TabPanel value="roster">
          <DataTable
            rows={volunteers}
            columns={rosterColumns}
            rowKey={(r) => r.id}
            loading={loading}
            pageSize={20}
            emptyTitle="የተመዘገበ በፈቃደኛ አገልጋይ የለም"
            emptyDescription="በ“የአገልጋይ መዝገብ” ታብ አገልጋይ ይጨምሩ — ከአባል መዝገብ ጋር ይታሰራል።"
            caption="በፈቃደኝነት አገልጋዮች"
          />
        </TabPanel>

        <TabPanel value="summary">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>የአገልጋይ ማጠቃለያ</CardTitle>
                <span className="text-xs text-muted-foreground">አገልጋይ ይምረጡ — ተግባራቸውና የተመዘገበው ሰዓት አንድ ቦታ ላይ ይታያሉ።</span>
              </CardHeader>
              <CardBody className="space-y-4">
                <Field label="አገልጋይ" htmlFor="vol-summary" className="max-w-md">
                  <Select
                    id="vol-summary"
                    value={summaryId}
                    onChange={(e) => setSummaryId(e.target.value)}
                    options={volunteers.map((v) => ({ value: v.id, label: nameOf(v) }))}
                    placeholder="አገልጋይ ይምረጡ"
                  />
                </Field>

                {summaryProfile ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-4">
                      <Metric label="ጠቅላላ ተግባራት" value={num(stats.get(summaryProfile.id)?.assignments ?? 0)} />
                      <Metric label="የተጠናቀቁ" value={num(stats.get(summaryProfile.id)?.completed ?? 0)} tone="success" />
                      <Metric label="የሚጠብቁ" value={num(stats.get(summaryProfile.id)?.open ?? 0)} tone="info" hint="እስፋፊ ለሆኑ ሰዓታት" />
                      <Metric label="የተመዘገበ ሰዓት" value={num(summaryProfile.hours_logged)} tone="gold" hint="በመሐምሪያው የተሰላ" />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      ልምዶች፦ {summaryProfile.skills.length > 0 ? summaryProfile.skills.join('፣ ') : '—'} · ዝንባሌ፦{' '}
                      {summaryProfile.interests.length > 0 ? summaryProfile.interests.join('፣ ') : '—'}
                    </p>
                    {mayWrite ? (
                      <Button variant="outline" size="sm" onClick={() => void recount(summaryProfile)} loading={busy} icon={<RefreshCw className="h-4 w-4" aria-hidden />}>
                        ሰዓቱን እንደገና ደብለህ
                      </Button>
                    ) : null}
                  </>
                ) : (
                  <EmptyState title="አገልጋይ ይምረጡ" description="ዝርዝሩ ከላይ ባለው ምርጫ ይገኛል።" />
                )}

                {summaryProfile ? (
                  <DataTable
                    rows={summaryAssignments}
                    columns={summaryColumns}
                    rowKey={(r) => r.id}
                    loading={loading}
                    pageSize={15}
                    emptyTitle="ተግባር አልተመደበም"
                    caption="የተግባር ዝርዝር"
                  />
                ) : null}
              </CardBody>
            </Card>
          </div>
        </TabPanel>

        <TabPanel value="assignments">
          <ResourceScreen resource={volunteerAssignmentsResource} />
        </TabPanel>

        <TabPanel value="profiles">
          <ResourceScreen resource={volunteerProfilesResource} />
        </TabPanel>
      </Tabs>

      <Modal
        open={formOpen}
        onOpenChange={setFormOpen}
        title="አገልጋይ መዝገብ"
        description="ተግባሩ “ተጠናቋል” ሲባል ሰዓቱ ወደ አገልጋዩ የተሰሩ ሰዓታት በራሱ ይደመራል።"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>
              {UI.cancel}
            </Button>
            <Button onClick={() => void saveAssignment()} loading={busy} disabled={!volunteerId}>
              አመድብ
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError ? <ErrorNote message={formError} /> : null}
          {choicesHint ? <p className="text-sm text-muted-foreground">{choicesHint}</p> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="አገልጋይ" htmlFor="vol-who" required>
              <Select
                id="vol-who"
                value={volunteerId}
                onChange={(e) => setVolunteerId(e.target.value)}
                options={volunteers.map((v) => ({ value: v.id, label: nameOf(v) }))}
                placeholder="አገልጋይ ይምረጡ"
              />
            </Field>
            <Field label="የተመደበበት ቀን" htmlFor="vol-date" required>
              <DateInput id="vol-date" value={assignedOn} onValueChange={setAssignedOn} />
            </Field>
            <Field label="ዘርፍ" htmlFor="vol-department" hint={departments.length === 0 ? 'አማራጭ የለም — departments.read ያስፈልጋል።' : undefined}>
              <Select id="vol-department" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} options={departments} placeholder={UI.all} />
            </Field>
            <Field label="የዘርፍ ተግባር" htmlFor="vol-activity" hint={activities.length === 0 ? 'አማራጭ የለም — departments.read ያስፈልጋል።' : undefined}>
              <Select id="vol-activity" value={activityId} onChange={(e) => setActivityId(e.target.value)} options={activities} placeholder={UI.all} />
            </Field>
            <Field label="ፕሮግራም" htmlFor="vol-event" hint={events.length === 0 ? 'አማራጭ የለም — events.read ያስፈልጋል።' : undefined}>
              <Select id="vol-event" value={eventId} onChange={(e) => setEventId(e.target.value)} options={events} placeholder={UI.all} />
            </Field>
            <Field label="ሚና" htmlFor="vol-role">
              <Input id="vol-role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="ለምሳሌ አዘጋጅ፣ የምግብ ሠራተኛ" />
            </Field>
            <Field label="ሰዓት" htmlFor="vol-hours" hint="ሠራተኛውን ስራ ሲጨርሱ ተመዝግቧል ሲባል ይደመራል።">
              <Input id="vol-hours" type="number" min={0} step="0.25" value={hours} onChange={(e) => setHours(e.target.value)} />
            </Field>
            <Field label="ሁኔታ" htmlFor="vol-status" required>
              <Select id="vol-status" value={status} onChange={(e) => setStatus(e.target.value)} options={ASSIGNMENT_STATUS_OPTIONS} />
            </Field>
            <Field label="ማስታወሻ" htmlFor="vol-note" className="sm:col-span-2">
              <Textarea id="vol-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="ለምሳሌ ከፍተኛ የክብደት ሥራ የለም" />
            </Field>
          </div>
        </div>
      </Modal>
    </div>
  );
}

