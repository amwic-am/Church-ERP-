// One screen that is genuinely every list-and-form module in the ERP.
//
// It reads through the anon key, so row level security decides what comes back;
// writes are inserts and updates on the table itself, with only the fields that
// changed, and the content ladder runs through the workflow RPCs the migrations
// define. A resource file that names a table, its fields and its grants is
// therefore a working screen — not a mock-up of one.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Download, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';

import { useAuth } from '@/components/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { DateInput, Field, FormSection, Input, Select, Switch, Textarea } from '@/components/ui/form';
import { MediaLibraryUploadButton, MediaUpload } from '@/components/ui/media-upload';
import { ConfirmDialog, Modal } from '@/components/ui/overlay';
import { PageHeading, StatusBadge, type Tone } from '@/components/ui/surface';
import { CONTENT_STATE, UI } from '@/lib/i18n';
import { br, dateAm, dateTimeAm } from '@/lib/format';
import { exportExcel } from '@/lib/export';
import { friendlyError } from '@/lib/errors';
import { callFn, listRows, supabase, type Row, type TableName } from '@/lib/supabase';
import {
  changedPayload,
  formFields,
  formSchema,
  listFields,
  mayApprove,
  mayEdit,
  mayPublish,
  keyColumns,
  rowKey,
  rowLabel,
  toFormValues,
  type FormValues,
  type FieldLike,
  type Option,
  type Resource,
} from './resource';

const STATE_TONE: Record<string, Tone> = {
  draft: 'neutral',
  submitted: 'info',
  changes_requested: 'warning',
  approved: 'success',
  published: 'gold',
  archived: 'neutral',
};

function displayValue(field: FieldLike, row: Record<string, unknown>): string {
  const raw = row[field.key];
  if (raw === null || raw === undefined || raw === '') return '—';
  if (field.kind === 'checkbox') return raw ? 'አዎ' : 'አይ';
  if (field.kind === 'money') return br(Number(raw));
  if (field.kind === 'percent' || field.kind === 'number') return String(raw);
  if (field.kind === 'date') return dateAm(String(raw));
  if (field.kind === 'datetime') return dateTimeAm(String(raw));
  if (field.kind === 'select' && field.options) {
    const hit = field.options.find((o) => o.value === String(raw));
    if (hit) return hit.label;
  }
  if (field.kind === 'json') return '—';
  if (typeof raw === 'object') return String((raw as { id?: string }).id ?? JSON.stringify(raw));
  return String(raw);
}

function Control({
  field,
  value,
  options,
  scope,
  onChange,
}: {
  field: FieldLike;
  value: unknown;
  options: readonly Option[] | undefined;
  scope: string;
  onChange: (next: unknown) => void;
}) {
  const id = `f-${field.key}`;

  if (field.kind === 'checkbox') {
    return (
      <div className="flex items-center gap-3 py-1">
        <Switch id={id} checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
        <label htmlFor={id} className="text-sm">
          {field.label}
        </label>
      </div>
    );
  }

  if (field.kind === 'textarea' || field.kind === 'rich' || field.kind === 'json') {
    return (
      <Textarea
        id={id}
        rows={field.kind === 'json' ? 6 : field.kind === 'rich' ? 8 : 3}
        value={String(value ?? '')}
        placeholder={field.placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  // Genuine media: drag/browse/paste a file, register it, store the row's ID.
  if (field.kind === 'image' || field.kind === 'media') {
    return (
      <MediaUpload
        value={String(value ?? '')}
        fieldLabel={field.label}
        scope={scope}
        required={field.required}
        onChange={(next) => onChange(next)}
      />
    );
  }

  // A plain foreign key: the live option list, chosen from a select.
  if (field.kind === 'select') {
    return (
      <Select
        id={id}
        value={String(value ?? '')}
        options={options ?? field.options ?? []}
        placeholder={field.required ? '— ይምረጡ —' : '— አለ —'}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  if (field.kind === 'date') {
    return <DateInput id={id} value={String(value ?? '')} onValueChange={(next) => onChange(next)} />;
  }

  if (field.kind === 'datetime') {
    return <Input id={id} type="datetime-local" value={String(value ?? '').slice(0, 16)} onChange={(e) => onChange(e.target.value)} />;
  }

  const type =
    field.kind === 'number' || field.kind === 'money' || field.kind === 'percent'
      ? 'number'
      : field.kind === 'email'
        ? 'email'
        : field.kind === 'time'
          ? 'time'
          : field.kind === 'url'
            ? 'url'
            : 'text';

  return (
    <Input
      id={id}
      type={type}
      value={String(value ?? '')}
      placeholder={field.placeholder}
      step={field.kind === 'money' || field.kind === 'percent' ? '0.01' : undefined}
      onChange={(e) => onChange(type === 'number' ? e.target.value : e.target.value)}
    />
  );
}

export function ResourceScreen<T extends TableName>({ resource }: { resource: Resource<T> }) {
  const { identity, can } = useAuth();
  const [rows, setRows] = useState<Row<T>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [term, setTerm] = useState('');
  const [editing, setEditing] = useState<Row<T> | null>(null);
  const [creating, setCreating] = useState(false);
  const [values, setValues] = useState<FormValues>({});
  const [choices, setChoices] = useState<Record<string, readonly Option[]>>({});
  const [confirmDelete, setConfirmDelete] = useState<Row<T> | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ key: string; row: Row<T>; label: string; question: string; askNote?: string } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const writable = mayEdit(resource, can);
  const deletable = Boolean(resource.remove && can(resource.remove));

  const load = useCallback(async () => {
    if (!identity) return;
    setLoading(true);
    setError(null);
    try {
      let query = supabase.from(resource.table).select('*');
      if (resource.search && resource.search.length > 0 && term.trim()) {
        const like = `%${term.trim().replace(/[%_]/g, '')}%`;
        query = query.or(resource.search.map((column) => `${column}.ilike.${like}`).join(','));
      }
      query = resource.order ? query.order(resource.order.by, { ascending: !resource.order.descending }) : query.order('created_at', { ascending: false });
      query = query.limit(resource.limit ?? 500);
      setRows((await listRows(query)) as unknown as Row<T>[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : UI.serverError);
    } finally {
      setLoading(false);
    }
  }, [identity, resource, term]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), term ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, term]);

  // Async option lists (foreign keys) load once per screen, not per keystroke.
  useEffect(() => {
    const loaders = formFields(resource).filter((f) => f.load);
    if (loaders.length === 0) return;
    let cancelled = false;
    void Promise.all(loaders.map(async (f) => [f.key, await f.load!()] as const))
      .then((pairs) => {
        if (!cancelled) setChoices(Object.fromEntries(pairs));
      })
      .catch((e) => setError(friendlyError(e)));
    return () => {
      cancelled = true;
    };
  }, [resource]);

  const columns = useMemo<Column<Row<T>>[]>(() => {
    const base: Column<Row<T>>[] = listFields(resource).map((field) => ({
      key: field.key,
      header: field.label,
      hideBelow: field.width === 'sm' ? 'md' : field.width === 'lg' ? undefined : 'sm',
      sortable: true,
      cell: (row) => {
        if (resource.stateKey && field.key === resource.stateKey) {
          const state = String((row as Record<string, unknown>)[field.key] ?? '');
          return <StatusBadge tone={STATE_TONE[state] ?? 'neutral'}>{CONTENT_STATE[state as keyof typeof CONTENT_STATE] ?? state}</StatusBadge>;
        }
        return displayValue(field, row as Record<string, unknown>);
      },
    }));

    if (!deletable && !writable && !resource.actions?.length && !resource.workflow) return base;

    base.push({
      key: '__actions',
      header: UI.actions,
      sortable: false,
      cell: (row) => <RowButtons resource={resource} row={row} onEdit={() => openEdit(row)} onDelete={() => setConfirmDelete(row)} onAction={(key, label, question, askNote) => setConfirmAction({ key, row, label, question, askNote })} />,
    });
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource, rows, writable, deletable]);

  function openCreate() {
    setEditing(null);
    setValues(toFormValues(resource, null));
    setCreating(true);
  }

  function openEdit(row: Row<T>) {
    setEditing(row);
    setValues(toFormValues(resource, row));
    setCreating(true);
  }

  async function save() {
    const parsed = formSchema(resource).safeParse(values);
    if (!parsed.success) {
      toast.error(parsed.error.errors[0]?.message ?? 'እባክዎ መረጃውን ያረጋግጡ');
      return;
    }

    const payload = changedPayload(resource, parsed.data, editing);
    if (Object.keys(payload).length === 0 && editing) {
      toast.info('የተቀየረ ነገር የለም');
      setCreating(false);
      return;
    }

    setBusy(true);
    try {
      if (editing) {
        // `resource.table` is a type parameter, so the builder cannot narrow the
        // column name — hence the casts. A composite-key row gets one `.eq()` per column.
        let update = supabase.from(resource.table).update(payload as never);
        for (const column of keyColumns(resource)) {
          update = update.eq(column as never, (editing as Record<string, unknown>)[column] as never);
        }
        const { error: updateError } = await update;
        if (updateError) throw new Error(friendlyError(updateError));
        toast.success(UI.saved);
      } else {
        const insert = { ...resource.defaults, ...payload } as never;
        if (resource.ownedBy?.createdBy) (insert as Record<string, unknown>)[resource.ownedBy.createdBy] = identity?.userId;
        if (resource.ownedBy?.author) (insert as Record<string, unknown>)[resource.ownedBy.author] = identity?.userId;
        const { error: insertError } = await supabase.from(resource.table).insert(insert);
        if (insertError) throw new Error(friendlyError(insertError));
        toast.success('ተመዝግቧል');
      }
      setCreating(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : UI.serverError);
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: Row<T>) {
    setBusy(true);
    try {
      let del = supabase.from(resource.table).delete();
      for (const column of keyColumns(resource)) {
        del = del.eq(column as never, (row as Record<string, unknown>)[column] as never);
      }
      const { error: removeError } = await del;
      if (removeError) throw new Error(friendlyError(removeError));
      toast.success('ተሰርዟል');
      setConfirmDelete(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : UI.serverError);
    } finally {
      setBusy(false);
    }
  }

  async function runConfirm() {
    if (!confirmAction) return;
    setBusy(true);
    try {
      const custom = (resource.actions ?? []).find((a) => a.key === confirmAction.key);
      if (custom) {
        await custom.run(confirmAction.row as Row<T>, note);
      } else {
        await workflowAct(resource, confirmAction, note);
      }
      toast.success('ተፈጽሟል');
      setConfirmAction(null);
      setNote('');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : UI.serverError);
    } finally {
      setBusy(false);
    }
  }

  function exportAll() {
    const fields = listFields(resource);
    exportExcel(
      [
        {
          name: resource.titleAm,
          columns: fields.map((f) => ({ header: f.label, key: f.key })),
          rows: rows.map((row) => row as Record<string, unknown>),
        },
      ],
      `${String(resource.table)}.xlsx`
    );
  }

  const open = creating || editing !== null;

  return (
    <div className="space-y-5">
      <PageHeading
        title={resource.titleAm}
        description={resource.description}
        actions={
          <>
            {resource.table === 'media_files' && writable ? (
              <MediaLibraryUploadButton scope="library" onUploaded={() => load()} />
            ) : null}
            {can('reports.export', 'finance.export') ? (
              <Button variant="outline" size="sm" onClick={exportAll} icon={<Download className="h-4 w-4" />} disabled={rows.length === 0}>
                {UI.exportExcel}
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" onClick={() => void load()} icon={<RefreshCw className="h-4 w-4" />}>
              እንደገና
            </Button>
            {writable ? (
              <Button size="sm" onClick={openCreate} icon={<Plus className="h-4 w-4" />}>
                {UI.add} {resource.singularAm}
              </Button>
            ) : null}
          </>
        }
      />

      {resource.search && resource.search.length > 0 ? (
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input className="pl-9" value={term} onChange={(e) => setTerm(e.target.value)} placeholder={`${UI.search} — ${resource.titleAm}`} aria-label={UI.search} />
        </div>
      ) : null}

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(row) => rowKey(resource, row) || JSON.stringify(row).slice(0, 40)}
        loading={loading}
        error={error}
        onRetry={() => void load()}
        pageSize={resource.pageSize ?? 25}
        emptyTitle={rows.length === 0 && term ? UI.emptySearch : UI.empty}
        emptyDescription={writable ? `${UI.add} ተከታዩ` : undefined}
        caption={resource.titleAm}
      />

      <Modal
        open={open}
        onOpenChange={(next) => {
          if (!next) setCreating(false);
        }}
        size="lg"
        title={editing ? `${UI.edit}: ${editing ? rowLabel(resource, editing) : ''}` : `${UI.add} ${resource.singularAm}`}
        description={resource.description}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              {UI.cancel}
            </Button>
            <Button onClick={() => void save()} loading={busy} disabled={!open}>
              {UI.save}
            </Button>
          </>
        }
      >
        <form ref={formRef} className="space-y-5" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          {formFields(resource).map((field) => (
            <Field key={field.key} label={field.label} htmlFor={`f-${field.key}`} required={field.required} hint={field.help}>
              <Control
                field={field}
                value={values[field.key]}
                options={choices[field.key] ?? field.options}
                scope={String(resource.table)}
                onChange={(next) => setValues((prev) => ({ ...prev, [field.key]: next }))}
              />
            </Field>
          ))}
          {formFields(resource).length === 0 ? <FormSection legend="ማስታወሻ">ይህ ገጽ ለማረጋገጥ ብቻ ነው።</FormSection> : null}
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmDelete !== null}
        busy={busy}
        destructive
        title={`${UI.delete}: ${confirmDelete ? rowLabel(resource, confirmDelete) : ''}`}
        description="ይህ ሐደሽ በኋላ አይመለስም።"
        confirmLabel={UI.delete}
        onConfirm={() => confirmDelete && void remove(confirmDelete)}
        onOpenChange={(next) => {
          if (!next) setConfirmDelete(null);
        }}
      />

      <ConfirmDialog
        open={confirmAction !== null}
        busy={busy}
        destructive={Boolean((resource.actions ?? []).find((a) => a.key === confirmAction?.key)?.destructive)}
        title={confirmAction?.label ?? ''}
        description={
          <>
            <p>{confirmAction?.question ?? ''}</p>
            {confirmAction?.askNote ? (
              <Field label={confirmAction.askNote} htmlFor="action-note" className="mt-3">
                <Textarea id="action-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
            ) : null}
          </>
        }
        confirmLabel={UI.confirm}
        onConfirm={() => void runConfirm()}
        onOpenChange={(next) => {
          if (!next) {
            setConfirmAction(null);
            setNote('');
          }
        }}
      />
    </div>
  );
}

/** draft → submitted → approved → published, exactly as the RPCs enforce it. */
async function workflowAct<T extends TableName>(resource: Resource<T>, pending: { key: string; row: Row<T> }, note: string): Promise<void> {
  const type = resource.workflow;
  if (!type) return;
  const id = rowKey(resource, pending.row);
  const args: Record<string, unknown> = { p_type: type, p_id: id };
  if (note) args.p_note = note;

  if (pending.key === 'submit') await callFn('submit_content', args as never);
  else if (pending.key === 'decide') await callFn('decide_content', { ...args, p_decision: 'approve' } as never);
  else if (pending.key === 'return') await callFn('decide_content', { ...args, p_decision: 'changes_requested' } as never);
  else if (pending.key === 'publish') await callFn('set_content_state', { ...args, p_state: 'published' } as never);
  else if (pending.key === 'unpublish') await callFn('set_content_state', { ...args, p_state: 'draft' } as never);
}

function RowButtons<T extends TableName>({
  resource,
  row,
  onEdit,
  onDelete,
  onAction,
}: {
  resource: Resource<T>;
  row: Row<T>;
  onEdit: () => void;
  onDelete: () => void;
  onAction: (key: string, label: string, question: string, askNote?: string) => void;
}) {
  const { can } = useAuth();
  const record = row as Record<string, unknown>;
  const state = resource.stateKey ? String(record[resource.stateKey] ?? '') : null;
  const editable = mayEdit(resource, can);
  const publishable = mayPublish(resource, can);
  const decidable = mayApprove(resource, can);

  const asks: { key: string; label: string; question: string; askNote?: string; when: boolean }[] = [
    { key: 'submit', label: UI.submitForApproval, question: 'ይህ ዝርዝር ለማጽደቅ ይቀርባል? አስተካካይ ማድረግ አይቻልም።', when: Boolean(editable) && (state === 'draft' || state === 'changes_requested') },
    { key: 'decide', label: UI.approve, question: 'ጸድቋል ብለው ይረጋግጡ? በድረ ገጹ ላይ ለማሳየት እንደገና ማወቅ ያስፈልጋል።', when: Boolean(decidable) && state === 'submitted' },
    { key: 'return', label: UI.returnForEdit, question: 'ለአስተካካይ ለመመለስ ምክንያቱን ይጻፉ።', askNote: 'ምክንያት', when: Boolean(decidable) && state === 'submitted' },
    { key: 'publish', label: UI.publish, question: 'በድረ ገጹ ላይ ይወጣል? ሁሉም ደረጃ ያለው ገጽ ታይቷል።', when: Boolean(publishable) && state === 'approved' },
    { key: 'unpublish', label: UI.unpublish, question: 'ከድረ ገጹ ይወጣል? ይዘቱ ይቆያል።', when: Boolean(publishable) && state === 'published' },
  ];

  const custom = (resource.actions ?? []).filter((action) => action.perms.every((key) => can(key)));

  return (
    <div className="flex flex-wrap items-center gap-1">
      {editable ? (
        <Button variant="ghost" size="sm" onClick={onEdit}>
          {UI.edit}
        </Button>
      ) : null}
      {resource.workflow
        ? asks
            .filter((a) => a.when)
            .map((a) => (
              <Button key={a.key} variant="outline" size="sm" onClick={() => onAction(a.key, a.label, a.question, a.askNote)}>
                {a.label}
              </Button>
            ))
        : null}
      {custom.map((action) => (
        <Button
          key={action.key}
          variant={action.destructive ? 'destructive' : 'outline'}
          size="sm"
          onClick={() => onAction(action.key, action.label, action.confirm ?? 'እርግጠኛ ነዎት?', action.askNote)}
        >
          {action.label}
        </Button>
      ))}
      {resource.remove && can(resource.remove) ? (
        <Button variant="ghost" size="sm" onClick={onDelete} icon={<Trash2 className="h-4 w-4" aria-hidden />}>
          {UI.delete}
        </Button>
      ) : null}
    </div>
  );
}
