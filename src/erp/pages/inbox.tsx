// The inbox half of the platform: what people wrote to the website, and what they
// asked the church to pray for.
//
// `MessagesScreen` works the contact queue. The reply itself is not a local edit —
// it goes through `reply_to_message(p_id, p_reply, p_email)`, which is the only
// writer of `status = 'replied'`, `reply_body`, `replied_by` and `replied_at`, and
// which hands the outbound copy to `queue_email`. Because that RPC only queues when
// an address is passed, and `queue_email` parks a message when no provider is
// configured, this screen reads the delivery row back and reports what actually
// happened instead of claiming a send.
//
// `PrayersScreen` has no RPC at all: `prayer_requests` is updated directly and row
// level security (communication.read to see, communication.write to change) is the
// whole gate. Answering, making a request public and recording who carried it in
// prayer are three separate real writes.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Download, Globe, HeartHandshake, Inbox, Mail, MailCheck, Phone, RefreshCw, Search, Send, UserPlus } from 'lucide-react';

import { useAuth } from '@/components/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Field, Input, Select, Switch } from '@/components/ui/form';
import { Modal } from '@/components/ui/overlay';
import { Tabs, TabPanel, type TabItem } from '@/components/ui/tabs';
import { Card, CardBody, CardDescription, CardHeader, CardTitle, EmptyState, ErrorNote, PageHeading, StatusBadge, type Tone } from '@/components/ui/surface';
import { dateAm, dateTimeAm, num, phoneAm, relativeAm, truncate } from '@/lib/format';
import { exportCsv } from '@/lib/export';
import { isSupabaseConfigured } from '@/lib/env';
import { DELIVERY_STATUS, UI } from '@/lib/i18n';
import { friendlyError } from '@/lib/errors';
import { callFn, listRows, supabase, type Row } from '@/lib/supabase';

// ─── the CHECK lists the migrations accept ───────────────────────────────────

/** `contact_messages.topic`. */
const TOPIC_OPTIONS = [
  { value: 'general', label: 'አጠቃላይ' },
  { value: 'registration', label: 'ምዝገባ' },
  { value: 'donation', label: 'ልገሳ' },
  { value: 'media', label: 'ሚዲያ' },
  { value: 'prayer', label: 'ጸሎት' },
  { value: 'volunteer', label: 'በፈቃደኝነት' },
  { value: 'other', label: 'ሌላ' },
];

/** `contact_messages.status` — `replied` is only ever written by the RPC. */
const MESSAGE_STATUS_OPTIONS = [
  { value: 'new', label: 'አዲስ' },
  { value: 'in_progress', label: 'በሥራ ላይ' },
  { value: 'replied', label: 'መልስ ተሰጥቷል' },
  { value: 'archived', label: 'ወደ ማህደር የተላከ' },
  { value: 'spam', label: 'አናጢ ጽሑፍ' },
];

/** `prayer_requests.category`. */
const PRAYER_CATEGORY_OPTIONS = [
  { value: 'healing', label: 'ፈውስ' },
  { value: 'family', label: 'ቤተሰብ' },
  { value: 'travel', label: 'ጉዞ' },
  { value: 'work', label: 'ሥራ' },
  { value: 'thanksgiving', label: 'ምስጋና' },
  { value: 'deceased', label: 'ለሕያዋን ለፍቷል' },
  { value: 'church', label: 'ቤተ ክርስቲያን' },
  { value: 'nation', label: 'አገር' },
  { value: 'general', label: 'አጠቃላይ' },
];

/** `prayer_requests.status`. */
const PRAYER_STATUS_OPTIONS = [
  { value: 'pending', label: 'በመጠባበቂያ ላይ' },
  { value: 'active', label: 'ንቁ' },
  { value: 'answered', label: 'መልሱ ተሰጥቷል' },
  { value: 'archived', label: 'ወደ ማህደር የተላከ' },
];

const MESSAGE_TONE: Record<string, Tone> = { new: 'info', in_progress: 'warning', replied: 'success', archived: 'neutral', spam: 'danger' };
const PRAYER_TONE: Record<string, Tone> = { pending: 'warning', active: 'info', answered: 'success', archived: 'neutral' };

const labelOf = (options: readonly { value: string; label: string }[], value: string | null | undefined) =>
  options.find((o) => o.value === value)?.label ?? String(value ?? '—');

/** Staff may read their own profile (and system.read may read the rest), so names resolve partly. */
function useProfileNames(): Map<string, string> {
  const [names, setNames] = useState<Map<string, string>>(() => new Map());
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    listRows(supabase.from('profiles').select('id, full_name_am').limit(400))
      .then((rows) => {
        if (!cancelled) setNames(new Map((rows as unknown as { id: string; full_name_am: string }[]).map((r) => [r.id, r.full_name_am])));
      })
      .catch(() => {
        // A name map is a convenience; the id stays visible instead of the screen failing.
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return names;
}

function ownerLabel(id: string | null | undefined, names: Map<string, string>, selfId: string | undefined): string {
  if (!id) return 'አልተሐየም';
  if (selfId && id === selfId) return 'እኔ';
  return names.get(id) ?? 'ሌላ ተጠቃሚ';
}

// ─── 3 · the contact-message worklist ────────────────────────────────────────

type Queue = 'unanswered' | 'mine' | 'replied' | 'all';

type EmailState = { tone: Tone; text: string };

export function MessagesScreen() {
  const { identity, can } = useAuth();
  const mayRead = can('communication.read');
  const mayWrite = can('communication.write');
  const names = useProfileNames();

  const [queue, setQueue] = useState<Queue>('unanswered');
  const [topic, setTopic] = useState('');
  const [status, setStatus] = useState('');
  const [term, setTerm] = useState('');
  const [rows, setRows] = useState<Row<'contact_messages'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Row<'contact_messages'> | null>(null);
  const [reply, setReply] = useState('');
  const [sendEmail, setSendEmail] = useState(true);
  const [statusDraft, setStatusDraft] = useState('');
  const [emailState, setEmailState] = useState<EmailState | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!identity || !isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    if (!can('communication.read')) {
      setLoading(false);
      setError(UI.permissionDenied);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let query = supabase.from('contact_messages').select('*').order('created_at', { ascending: false }).limit(400);
      if (topic) query = query.eq('topic', topic);
      // An explicit status wins; otherwise the queue tab decides which statuses show.
      if (status) query = query.eq('status', status);
      else if (queue === 'unanswered') query = query.in('status', ['new', 'in_progress']);
      else if (queue === 'replied') query = query.eq('status', 'replied');
      else if (queue === 'mine') query = query.eq('assigned_to', identity.userId);

      if (term.trim()) {
        const like = `%${term.trim().replace(/[%_]/g, '')}%`;
        query = query.or(`name_am.ilike.${like},subject_am.ilike.${like},email.ilike.${like},phone.ilike.${like}`);
      }
      setRows(await listRows(query));
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [identity, can, queue, topic, status, term]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), term ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, term]);

  const openCount = useMemo(() => rows.filter((r) => r.status === 'new' || r.status === 'in_progress').length, [rows]);
  const tabs = useMemo<TabItem[]>(
    () => [
      { value: 'unanswered', label: 'ያልተመለሱ' },
      { value: 'mine', label: 'የተሐዩልኝ' },
      { value: 'replied', label: 'መልስ የተሰጣቸው' },
      { value: 'all', label: UI.all },
    ],
    []
  );

  function open(row: Row<'contact_messages'>) {
    setSelected(row);
    setReply(row.reply_body ?? '');
    setSendEmail(Boolean(row.email));
    setStatusDraft(row.status);
    setEmailState(null);
  }

  /**
   * Statuses staff may set by hand. `replied` belongs to `reply_to_message` — it is only
   * offered here so an already-answered message still renders its own value.
   */
  const manualStatuses = useMemo(
    () => MESSAGE_STATUS_OPTIONS.filter((o) => o.value !== 'replied' || selected?.status === 'replied'),
    [selected]
  );

  /** `queue_email` writes the delivery row; read it back so the claim matches the queue. */
  async function describeQueuedEmail(email: string, messageId: string): Promise<EmailState> {
    const outbox = await listRows(
      supabase.from('outbox_messages').select('*').eq('to_address', email).order('queued_at', { ascending: false }).limit(10)
    );
    const hit = outbox.find((o) => {
      const related = o.related as Record<string, unknown> | null;
      return related && String(related.contact_message_id ?? '') === messageId;
    });
    if (!hit) return { tone: 'warning', text: 'መልሱ ተመዝግቧል፤ በወጪ ሰሌዳው ላይ ግን የኢሜይት መልእክት አላገኘሁም።' };
    if (hit.status === 'provider_not_configured') {
      return { tone: 'danger', text: `ኢሜይሉ አልተላከም — ${DELIVERY_STATUS[hit.status]}${hit.last_error ? ` (${hit.last_error})` : ''}።` };
    }
    return {
      tone: hit.status === 'sent' || hit.status === 'delivered' ? 'success' : 'info',
      text: `ኢሜይል በወጪ ሰሌዳው ላይ ነው፦ ${DELIVERY_STATUS[hit.status]} · ${relativeAm(hit.queued_at)} · ወደ ${hit.to_address}`,
    };
  }

  async function sendReply() {
    if (!selected) return;
    const body = reply.trim();
    if (body.length < 5) {
      toast.error('መልሱ ቢያንስ 5 ፊደል መሆን አለበት።');
      return;
    }
    const email = sendEmail && selected.email ? selected.email : undefined;

    setBusy(true);
    try {
      // The RPC is the only writer of the replied columns — it answers with the row it stored.
      const stored = await callFn('reply_to_message', { p_id: selected.id, p_reply: body, p_email: email });
      setSelected(stored);
      setStatusDraft(stored.status);
      toast.success(`“${truncate(stored.name_am, 24)}” መልስ ተሰጥቷል፤ ሁኔታው ${labelOf(MESSAGE_STATUS_OPTIONS, stored.status)} ሆኗል።`);
      setEmailState(email ? await describeQueuedEmail(email, stored.id) : null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : UI.serverError);
    } finally {
      setBusy(false);
    }
  }

  async function patch(patches: Record<string, unknown>, message: string) {
    if (!selected) return;
    setBusy(true);
    try {
      const { error: updateError } = await supabase.from('contact_messages').update(patches as never).eq('id', selected.id);
      if (updateError) throw new Error(friendlyError(updateError));
      toast.success(message);
      await load();
      const fresh = await listRows(supabase.from('contact_messages').select('*').eq('id', selected.id).limit(1));
      const updated = fresh[0] ?? selected;
      setSelected(updated);
      setStatusDraft(updated.status);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : UI.serverError);
    } finally {
      setBusy(false);
    }
  }

  const columns = useMemo<Column<Row<'contact_messages'>>[]>(
    () => [
      { key: 'created_at', header: 'የደረሰበት', sortable: true, value: (r) => r.created_at, cell: (r) => <span className="whitespace-nowrap text-xs">{dateTimeAm(r.created_at)}</span> },
      { key: 'name_am', header: 'እንደተሰየመ', sortable: true, cell: (r) => <span className="font-medium">{r.name_am}</span> },
      {
        key: 'subject_am',
        header: 'ርዕሱ',
        cell: (r) => (
          <span className="block max-w-[24rem] truncate" title={r.subject_am}>
            {truncate(r.subject_am, 90)}
          </span>
        ),
      },
      { key: 'topic', header: 'ጉዳዩ', hideBelow: 'sm', cell: (r) => <StatusBadge tone="neutral">{labelOf(TOPIC_OPTIONS, r.topic)}</StatusBadge> },
      { key: 'status', header: 'ሁኔታ', cell: (r) => <StatusBadge tone={MESSAGE_TONE[r.status] ?? 'neutral'}>{labelOf(MESSAGE_STATUS_OPTIONS, r.status)}</StatusBadge> },
      { key: 'assigned_to', header: 'ተመድቧል', hideBelow: 'md', cell: (r) => ownerLabel(r.assigned_to, names, identity?.userId) },
      { key: 'replied_at', header: 'መልስ የተሰጠበት', hideBelow: 'lg', sortable: true, value: (r) => r.replied_at ?? '', cell: (r) => (r.replied_at ? dateTimeAm(r.replied_at) : '—') },
      { key: '__open', header: UI.details, sortable: false, cell: (r) => <Button size="sm" variant="outline" onClick={() => open(r)}>ክፈት</Button> },
    ],
    [names, identity]
  );

  function exportWorklist() {
    exportCsv(
      [
        { header: 'የደረሰበት', key: 'created_at' },
        { header: 'እንደተሰየመ', key: 'name_am' },
        { header: 'ኢሜይል', key: 'email' },
        { header: 'ስልክ', key: 'phone' },
        { header: 'ርዕስ', key: 'subject_am' },
        { header: 'ጉዳይ', key: 'topic' },
        { header: 'ሁኔታ', key: 'status' },
        { header: 'መልክቱ', key: 'message_am' },
        { header: 'የተሰጠ መልስ', key: 'reply_body' },
      ],
      rows as unknown as Record<string, unknown>[],
      `contact-messages-${queue || 'all'}-${dateAm(new Date()).replace(/\s/g, '')}`
    );
    toast.success('CSV ተዘጋጅቷል');
  }

  if (!isSupabaseConfigured) return <ErrorNote message="የመልእክት ሳጥን ለማቅረጥ መረጃዎቹ ገና አልተገናኙም።" />;

  return (
    <div className="space-y-5">
      <PageHeading
        title="የግንኙነት መልእክቶች"
        description="መልስ መስጠት በ `reply_to_message` ብቻ ይፈጸማል፤ ሁኔታውና የተሰᠠመው መልስ በሰርቪሱ ይመዘገባሉ።"
        actions={
          <>
            {can('reports.export') ? (
              <Button variant="outline" size="sm" onClick={exportWorklist} disabled={rows.length === 0} icon={<Download className="h-4 w-4" aria-hidden />}>
                CSV
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" onClick={() => void load()} loading={loading} icon={<RefreshCw className="h-4 w-4" aria-hidden />}>
              እንደገና
            </Button>
          </>
        }
      />

      {!mayRead ? <ErrorNote message={UI.permissionDenied} /> : null}
      {error ? <ErrorNote message={error} onRetry={() => void load()} /> : null}

      <Card>
        <CardBody className="flex flex-wrap items-end gap-4">
          <Tabs
            className="w-full"
            items={tabs}
            value={queue}
            onValueChange={(next) => {
              setQueue(next as Queue);
              setStatus('');
            }}
          >
            <TabPanel value={queue} className="pt-3">
              <div className="flex flex-wrap items-end gap-3">
                <Field label="ጉዳዩ" htmlFor="msg-topic" className="w-44">
                  <Select id="msg-topic" value={topic} placeholder={UI.all} options={TOPIC_OPTIONS} onChange={(e) => setTopic(e.target.value)} />
                </Field>
                <Field label={UI.status} htmlFor="msg-status" className="w-44">
                  <Select id="msg-status" value={status} placeholder={UI.all} options={MESSAGE_STATUS_OPTIONS} onChange={(e) => setStatus(e.target.value)} />
                </Field>
                <Field label={UI.search} htmlFor="msg-term" className="w-64">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <Input id="msg-term" className="ps-9" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="ስም፣ ርዕስ፣ ኢሜይል ወይም ስልክ" />
                  </div>
                </Field>
                <div className="ms-auto flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <StatusBadge tone="info">{num(rows.length)} በዚህ ዝርዝር</StatusBadge>
                  <StatusBadge tone={openCount > 0 ? 'warning' : 'success'}>{num(openCount)} ያልተመለሱ</StatusBadge>
                </div>
              </div>
            </TabPanel>
          </Tabs>
        </CardBody>
      </Card>

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        loading={loading}
        onRowClick={open}
        pageSize={20}
        emptyTitle={term || topic || status ? 'በእነዚህ ማጣሪያዎች መልእክት የለም' : 'አዲስ መልእክት የለም'}
        emptyDescription="ከድረ ገጹ “ኛን ሐዘር” ቅጽ የሚደርሱ መልእክቶች እዚህ ይታያሉ።"
        caption="የግንኙነት መልእክቶች"
      />

      <Modal
        open={selected !== null}
        onOpenChange={(next) => {
          if (!next) {
            setSelected(null);
            setReply('');
            setEmailState(null);
          }
        }}
        size="lg"
        title={selected ? `${selected.name_am} — ${truncate(selected.subject_am, 60)}` : UI.details}
        description={selected ? `${labelOf(TOPIC_OPTIONS, selected.topic)} · የደረሰበት ${dateTimeAm(selected.created_at)}` : undefined}
        footer={
          mayWrite && selected ? (
            <>
              <Button variant="ghost" onClick={() => { setSelected(null); setReply(''); }}>
                {UI.close}
              </Button>
              <Button variant="outline" onClick={() => void patch({ assigned_to: identity?.userId }, 'መልእክቱ ለራስዎ ተሐይሏል።')} icon={<UserPlus className="h-4 w-4" aria-hidden />}>
                ለእኔ ይዘው
              </Button>
              <Button onClick={() => void sendReply()} loading={busy} disabled={reply.trim().length < 5} icon={<Send className="h-4 w-4" aria-hidden />}>
                መልስ ስጥ
              </Button>
            </>
          ) : (
            <Button variant="ghost" onClick={() => setSelected(null)}>
              {UI.close}
            </Button>
          )
        }
      >
        {selected ? (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 text-sm">
                <p className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" aria-hidden />
                  {selected.email || 'ኢሜይል የለውም'}
                </p>
                <p className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" aria-hidden />
                  {phoneAm(selected.phone)}
                </p>
                <p className="text-xs text-muted-foreground">ቋንቋ፦ {selected.lang} · ተመድቧል፦ {ownerLabel(selected.assigned_to, names, identity?.userId)}</p>
                {selected.source_url ? (
                  <a className="block truncate text-xs text-leaf underline underline-offset-2" href={selected.source_url} target="_blank" rel="noreferrer" title={selected.source_url}>
                    {selected.source_url}
                  </a>
                ) : null}
              </div>
              <div className="flex flex-wrap items-start gap-2">
                <StatusBadge tone={MESSAGE_TONE[selected.status] ?? 'neutral'}>{labelOf(MESSAGE_STATUS_OPTIONS, selected.status)}</StatusBadge>
                {selected.replied_at ? <StatusBadge tone="success">መልስ {relativeAm(selected.replied_at)}</StatusBadge> : null}
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">መልእክቱ</CardTitle>
              </CardHeader>
              <CardBody>
                <p className="whitespace-pre-line text-sm leading-relaxed">{selected.message_am}</p>
              </CardBody>
            </Card>

            {selected.reply_body ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">የተሰጠ መልስ</CardTitle>
                  <CardDescription>{selected.replied_at ? dateTimeAm(selected.replied_at) : ''}</CardDescription>
                </CardHeader>
                <CardBody>
                  <p className="whitespace-pre-line text-sm leading-relaxed">{selected.reply_body}</p>
                </CardBody>
              </Card>
            ) : null}

            {emailState ? (
              <p className={`rounded-md border px-3 py-2 text-xs ${emailState.tone === 'danger' ? 'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100' : emailState.tone === 'success' ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100' : 'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100'}`} role="status">
                {emailState.text}
              </p>
            ) : null}

            {!mayWrite ? (
              <p className="text-sm text-muted-foreground">መልስ ለመስጠትና ለመመደብ “መልእክት መልሰው ማሳለጥ” መብት ያስፈልጋል።</p>
            ) : (
              <div className="space-y-4">
                <Field label="መልስ" htmlFor="msg-reply" required hint="ይህ ጽሑፍ በ `reply_to_message` ውስጥ `reply_body` ሆኖ ይቀመጣል፤ ሁኔታው “መልስ ተሰጥቷል” ይሆናል።">
                  <textarea
                    id="msg-reply"
                    rows={6}
                    className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="እንኳን ለመጻፍዎ እናመሰግናለን…"
                  />
                </Field>

                <div className="flex items-center gap-3">
                  <Switch id="msg-email" checked={sendEmail} disabled={!selected.email} onChange={(e) => setSendEmail(e.target.checked)} />
                  <label htmlFor="msg-email" className="text-sm">
                    {selected.email ? `ወደ ${selected.email} ኢሜይልም ይላክ` : 'ይህ መልእክት የኢሜይል አድራሻ የለውም'}
                  </label>
                </div>

                <Field
                  label={UI.status}
                  htmlFor="msg-patch-status"
                  className="max-w-xs"
                  hint="ሁኔታ ብቻ ለመቀየር “አስቀምጥ” ይጫኑ — መልስ ማስፈጸም አያስፈልግም። “መልስ ተሰጥቷል”ን የሚመዘግበው ግን `reply_to_message` ብቻ ነው።"
                >
                  <div className="flex items-end gap-2">
                    <Select id="msg-patch-status" value={statusDraft} options={manualStatuses} onChange={(e) => setStatusDraft(e.target.value)} />
                    <Button
                      variant="outline"
                      size="md"
                      disabled={busy || statusDraft === selected.status}
                      icon={<MailCheck className="h-4 w-4" aria-hidden />}
                      onClick={() =>
                        void patch(
                          { status: statusDraft },
                          `ሁኔታው ${labelOf(MESSAGE_STATUS_OPTIONS, statusDraft)} ሆኗል።`
                        )
                      }
                    >
                      {UI.save}
                    </Button>
                  </div>
                </Field>
              </div>
            )}
          </div>
        ) : (
          <EmptyState icon={<Inbox className="h-7 w-7" aria-hidden />} title={UI.empty} />
        )}
      </Modal>
    </div>
  );
}

// ─── 4 · prayer requests ─────────────────────────────────────────────────────

export function PrayersScreen() {
  const { identity, can } = useAuth();
  const mayRead = can('communication.read');
  const mayWrite = can('communication.write');
  const names = useProfileNames();

  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [onlyPublic, setOnlyPublic] = useState(false);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [rows, setRows] = useState<Row<'prayer_requests'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Row<'prayer_requests'> | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!identity || !isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    if (!can('communication.read')) {
      setLoading(false);
      setError(UI.permissionDenied);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // No RPC here: these are plain reads, and the prayer_requests policies decide.
      let query = supabase.from('prayer_requests').select('*').order('requested_on', { ascending: false }).limit(400);
      if (category) query = query.eq('category', category);
      if (status) query = query.eq('status', status);
      else if (onlyOpen) query = query.in('status', ['pending', 'active']);
      if (onlyPublic) query = query.eq('is_public', true);
      if (term.trim()) {
        const like = `%${term.trim().replace(/[%_]/g, '')}%`;
        query = query.or(`name_am.ilike.${like},for_whom.ilike.${like},request_am.ilike.${like}`);
      }
      setRows(await listRows(query));
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [identity, can, category, status, onlyOpen, onlyPublic, term]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), term ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, term]);

  const answeredCount = useMemo(() => rows.filter((r) => r.status === 'answered').length, [rows]);
  const publicCount = useMemo(() => rows.filter((r) => r.is_public).length, [rows]);

  async function patch(row: Row<'prayer_requests'>, patches: Record<string, unknown>, message: string) {
    setBusy(true);
    try {
      const { error: updateError } = await supabase.from('prayer_requests').update(patches as never).eq('id', row.id);
      if (updateError) throw new Error(friendlyError(updateError));
      toast.success(message);
      const fresh = await listRows(supabase.from('prayer_requests').select('*').eq('id', row.id).limit(1));
      setSelected(fresh[0] ?? row);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : UI.serverError);
    } finally {
      setBusy(false);
    }
  }

  const columns = useMemo<Column<Row<'prayer_requests'>>[]>(
    () => [
      { key: 'requested_on', header: 'የተጠየቀበት', sortable: true, value: (r) => r.requested_on, cell: (r) => <span className="whitespace-nowrap text-xs">{dateAm(r.requested_on)}</span> },
      { key: 'name_am', header: 'ስም', cell: (r) => (r.name_am ? r.name_am : <span className="italic text-muted-foreground">ለስላሳ</span>) },
      { key: 'for_whom', header: 'ለማን', hideBelow: 'sm', cell: (r) => r.for_whom ?? '—' },
      { key: 'category', header: 'ምድብ', cell: (r) => <StatusBadge tone="neutral">{labelOf(PRAYER_CATEGORY_OPTIONS, r.category)}</StatusBadge> },
      { key: 'status', header: 'ሁኔታ', cell: (r) => <StatusBadge tone={PRAYER_TONE[r.status] ?? 'neutral'}>{labelOf(PRAYER_STATUS_OPTIONS, r.status)}</StatusBadge> },
      { key: 'is_public', header: 'ለሕዝብ', cell: (r) => (r.is_public ? <StatusBadge tone="gold">ታውቋል</StatusBadge> : <span className="text-xs text-muted-foreground">የተደበቀ</span>) },
      { key: 'prayed_by', header: 'የጸለየለት', hideBelow: 'md', cell: (r) => ownerLabel(r.prayed_by, names, identity?.userId) },
      {
        key: '__open',
        header: UI.details,
        sortable: false,
        cell: (r) => (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setSelected(r);
              setNote(r.answered_note ?? '');
            }}
          >
            ዝርዝር
          </Button>
        ),
      },
    ],
    [names, identity]
  );

  if (!isSupabaseConfigured) return <ErrorNote message="የጸሎት ጥያቄዎች ለማቅረጥ መረጃዎቹ ገና አልተገናኙም።" />;

  return (
    <div className="space-y-5">
      <PageHeading
        title="የጸሎት ጥያቄዎች"
        description="እዚህ የሚታዩት በቀጥታ በ `prayer_requests` ሰንጠረዥ ላይ ያሉ ለውጦች ናቸው — ማዘጋጀያ አገልግሎት የለም፤ የደህንነት ሕጉ ብቻ ይከላከላል።"
        actions={
          <Button variant="ghost" size="sm" onClick={() => void load()} loading={loading} icon={<RefreshCw className="h-4 w-4" aria-hidden />}>
            እንደገና
          </Button>
        }
      />

      {!mayRead ? <ErrorNote message={UI.permissionDenied} /> : null}
      {error ? <ErrorNote message={error} onRetry={() => void load()} /> : null}

      <Card>
        <CardBody className="flex flex-wrap items-end gap-4">
          <Field label="ምድብ" htmlFor="pr-category" className="w-40">
            <Select id="pr-category" value={category} placeholder={UI.all} options={PRAYER_CATEGORY_OPTIONS} onChange={(e) => setCategory(e.target.value)} />
          </Field>
          <Field label={UI.status} htmlFor="pr-status" className="w-40">
            <Select id="pr-status" value={status} placeholder={UI.all} options={PRAYER_STATUS_OPTIONS} onChange={(e) => setStatus(e.target.value)} />
          </Field>
          <Field label={UI.search} htmlFor="pr-term" className="w-56">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input id="pr-term" className="ps-9" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="ስም፣ ለማን ወይም ጥያቄ" />
            </div>
          </Field>
          <div className="flex items-center gap-2 pb-2">
            <Switch id="pr-open" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
            <label htmlFor="pr-open" className="text-sm">
              ያልተመለሱ ብቻ
            </label>
          </div>
          <div className="flex items-center gap-2 pb-2">
            <Switch id="pr-public" checked={onlyPublic} onChange={(e) => setOnlyPublic(e.target.checked)} />
            <label htmlFor="pr-public" className="text-sm">
              ለሕዝብ የታወቁ ብቻ
            </label>
          </div>
          <div className="ms-auto flex flex-wrap items-center gap-2 text-xs">
            <StatusBadge tone="info">{num(rows.length)} የተጠየቁ</StatusBadge>
            <StatusBadge tone={answeredCount > 0 ? 'success' : 'neutral'}>{num(answeredCount)} የተመለሱ</StatusBadge>
            <StatusBadge tone="gold">{num(publicCount)} በድረ ገጹ ላይ</StatusBadge>
          </div>
        </CardBody>
      </Card>

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        loading={loading}
        pageSize={20}
        emptyTitle={term || category || status ? 'በእነዚህ ማጣሪያዎች ጥያቄ የለም' : 'የጸሎት ጥያቄ የለም'}
        emptyDescription="ከድረ ገጹ “ጸሎት” ገጽ የሚመጡ ጥያቄዎች እዚህ ይደርሳሉ።"
        caption="የጸሎት ጥያቄዎች"
      />

      <Modal
        open={selected !== null}
        onOpenChange={(next) => {
          if (!next) {
            setSelected(null);
            setNote('');
          }
        }}
        size="md"
        title={selected ? `${selected.name_am || 'ለስላሳ ጥያቄ'} — ${labelOf(PRAYER_CATEGORY_OPTIONS, selected.category)}` : UI.details}
        description={selected ? `ለ${selected.for_whom ?? 'ያልተገለጸ'} · ${dateAm(selected.requested_on)}` : undefined}
        footer={
          <Button variant="ghost" onClick={() => setSelected(null)}>
            {UI.close}
          </Button>
        }
      >
        {selected ? (
          <div className="space-y-5">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">ጥያቄ</CardTitle>
              </CardHeader>
              <CardBody>
                <p className="whitespace-pre-line text-sm leading-relaxed">{selected.request_am}</p>
                {selected.contact ? <p className="mt-2 text-xs text-muted-foreground">የመገናኛ መረጃ፦ {selected.contact}</p> : null}
              </CardBody>
            </Card>

            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={PRAYER_TONE[selected.status] ?? 'neutral'}>{labelOf(PRAYER_STATUS_OPTIONS, selected.status)}</StatusBadge>
              <StatusBadge tone={selected.is_public ? 'gold' : 'neutral'}>{selected.is_public ? 'በድረ ገጹ ላይ ይታያል' : 'ለሕዝብ አይታይም'}</StatusBadge>
              <StatusBadge tone="info">የጸለየለት፦ {ownerLabel(selected.prayed_by, names, identity?.userId)}</StatusBadge>
            </div>

            {!mayWrite ? (
              <p className="text-sm text-muted-foreground">ለመመዘገብና ለመመለስ “መልእክት መልሰው ማሳለጥ” መብት ያስፈልጋል።</p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Button variant="outline" disabled={busy} onClick={() => void patch(selected, { is_public: !selected.is_public }, selected.is_public ? 'ጥያቄው ከድረ ገጹ ተወግዷል።' : 'ጥያቄው በድረ ገጹ ላይ ይታያል።')} icon={<Globe className="h-4 w-4" aria-hidden />}>
                    {selected.is_public ? 'ከድረ ገጹ አውጣ' : 'ለሕዝብ አውጣ'}
                  </Button>
                  <Button
                    variant={selected.prayed_by === identity?.userId ? 'gold' : 'outline'}
                    disabled={busy || selected.prayed_by === identity?.userId}
                    onClick={() => void patch(selected, { prayed_by: identity?.userId, status: selected.status === 'pending' ? 'active' : selected.status }, 'እንደ ጸለዩት ተመዝግቧል።')}
                    icon={<HeartHandshake className="h-4 w-4" aria-hidden />}
                  >
                    {selected.prayed_by === identity?.userId ? 'አጽልየዋለሁ' : 'አጸልየዋለሁ ብል'}
                  </Button>
                </div>

                <Field label="የመልስ ማስታወሻ" htmlFor="pr-note" hint="መልክ ወይም ምስጋና ሲመጣ እዚህ ይመዘገባል፤ “መልሱ ተሰጥቷል” ሲባል አስፈላጊ ነው።">
                  <textarea
                    id="pr-note"
                    rows={4}
                    className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="ለምሳሌ በሕክምና መመርመሩ ላይ ልንገናኝ ተስማምተናል…"
                  />
                </Field>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Button disabled={busy} onClick={() => { if (note.trim().length < 3) { toast.error('መልሱ የተሰጠውን ማስታወሻ መጻፍ ያስፈልጋል።'); return; } void patch(selected, { status: 'answered', answered_note: note.trim() }, 'ጥያቄው የተመለሰ ተብሏል።'); }}>
                    መልሱ ተሰጥቷል አድርግ
                  </Button>
                  <Select
                    id="pr-status-patch"
                    aria-label="ሁኔታ ብቻ ቀይር"
                    value={selected.status}
                    options={PRAYER_STATUS_OPTIONS.filter((o) => o.value !== 'answered' || selected.status === 'answered')}
                    onChange={(e) => {
                      const next = e.target.value;
                      if (next !== selected.status) void patch(selected, { status: next }, `ሁኔታው ${labelOf(PRAYER_STATUS_OPTIONS, next)} ሆኗል።`);
                    }}
                  />
                </div>

                {selected.answered_note ? (
                  <p className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100">
                    የተመዘገበ መልስ፦ {selected.answered_note}
                  </p>
                ) : null}
              </>
            )}
          </div>
        ) : (
          <EmptyState title={UI.empty} description="ጥያቄ ለማየት ከሰንጠረዡ “ዝርዝር” ይጫኑ።" />
        )}
      </Modal>
    </div>
  );
}
