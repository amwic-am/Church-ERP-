// What one ERP screen is made of: a table, the fields a person may edit on it,
// the permissions that gate it, and any workflow the rows move through.
//
// Roughly forty of the specification's modules are the same shape — a list, a
// form, a delete, and for content a draft→submit→approve→publish ladder — so the
// shape is described once here and the real work (which columns, which grants,
// which RPC) stays in the resource files. Nothing in this module touches React, so
// `scripts/verify-lib.mjs` can exercise the schema and payload rules directly.

// Relative `.ts` specifiers keep this loadable in plain node.
import { z } from 'zod';
import type { Insert, Row, TableName } from '../../lib/supabase.ts';
import type { PermissionKey } from '../../lib/permissions.ts';
import { amName, amText, amountField, ethEmail, ethPhone, isoDate, slugField } from '../../lib/validation.ts';

export type Option = { value: string; label: string; disabled?: boolean };

export type FieldKind =
  | 'text'
  | 'textarea'
  | 'rich'
  | 'number'
  | 'money'
  | 'percent'
  | 'date'
  | 'datetime'
  | 'time'
  | 'select'
  | 'multiselect'
  | 'checkbox'
  | 'email'
  | 'phone'
  | 'url'
  | 'slug'
  | 'json'
  | 'tags'
  | 'image'
  | 'media';

export type Field<T extends TableName> = {
  key: Extract<keyof Row<T>, string>;
  label: string;
  kind: FieldKind;
  required?: boolean;
  help?: string;
  placeholder?: string;
  /** Static choices (enums, yes/no, a small fixed list). */
  options?: readonly Option[];
  /** Choices fetched when the form opens — foreign keys and other live lists. */
  load?: () => Promise<readonly Option[]>;
  default?: string | number | boolean | null;
  /** Read-only in the form; still shown in the list. */
  computed?: boolean;
  /** Hide from the table (long bodies, secret-ish values). */
  hideFromList?: boolean;
  /** Hide from the form (a column that is only ever set by an RPC). */
  hideFromForm?: boolean;
  maxLength?: number;
  min?: number;
  max?: number;
  /** Column width in the table. */
  width?: 'sm' | 'md' | 'lg';
};

/** A per-row button that is not create/edit/delete — approve, promote, release. */
export type RowAction<T extends TableName> = {
  key: string;
  label: string;
  perms: PermissionKey[];
  /** Omitted when the action needs no confirmation; otherwise this is the question. */
  confirm?: string;
  /** An extra note collected before running, e.g. a rejection reason. */
  askNote?: string;
  destructive?: boolean;
  run: (row: Row<T>, note: string) => Promise<void>;
};

export type Resource<T extends TableName> = {
  table: T;
  titleAm: string;
  singularAm: string;
  description?: string;
  /** Grants that open the screen. Left undefined means "signed in is enough". */
  read?: PermissionKey;
  write?: PermissionKey;
  remove?: PermissionKey;
  /** Who may move a row to the public site, and who may decide a submission. */
  publish?: PermissionKey;
  approve?: PermissionKey;
  /**
   * The content type when rows move through draft→submitted→approved→published.
   * The value is the `p_type` the workflow RPCs expect, e.g. `news`.
   */
  workflow?: string;
  /** Which column carries the state; `state` for nearly every content table. */
  stateKey?: Extract<keyof Row<T>, string>;
  /**
   * The columns that identify a row for update and delete — `id` for almost every
   * table. Settings tables are keyed by `key`, and a link table needs both halves
   * of its composite primary key, in order.
   */
  keyFields?: readonly Extract<keyof Row<T>, string>[];
  search?: readonly (Extract<keyof Row<T>, string>)[];
  order?: { by: Extract<keyof Row<T>, string>; descending?: boolean };
  fields: readonly Field<T>[];
  actions?: readonly RowAction<T>[];
  /** Rows written here are stamped with the session user in these columns. */
  ownedBy?: { createdBy?: Extract<keyof Row<T>, string>; author?: Extract<keyof Row<T>, string> };
  defaults?: Partial<Insert<T>>;
  /** Cap the list at this many rows; the screen says so instead of hiding it. */
  limit?: number;
  /** Ask the database for pages instead of slicing them here. */
  serverPaged?: boolean;
  pageSize?: number;
};

export type FormValues = Record<string, unknown>;

/** The list columns are the fields that are not bodies, secrets or computed-only. */
export function listFields<T extends TableName>(resource: Resource<T>): Field<T>[] {
  return resource.fields.filter((f) => !f.hideFromList && f.kind !== 'json');
}

export function formFields<T extends TableName>(resource: Resource<T>): Field<T>[] {
  return resource.fields.filter((f) => !f.hideFromForm && !f.computed && f.key !== 'id');
}

/** The parts of a field a validator needs, without the table generic. */
export type FieldLike = {
  key: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  min?: number;
  max?: number;
  maxLength?: number;
  options?: readonly Option[];
  placeholder?: string;
  help?: string;
};

/** One field's zod rule, mirroring what the database will accept. */
export function fieldSchema(field: FieldLike): z.ZodTypeAny {
  const optional = !field.required;

  switch (field.kind) {
    case 'textarea':
    case 'rich':
    case 'text':
    case 'url': {
      const max = field.maxLength ?? (field.kind === 'textarea' || field.kind === 'rich' ? 20_000 : 500);
      const rule = amText(field.label, { min: field.kind === 'text' && field.required ? 2 : 0, max, required: field.required });
      return optional ? rule.optional() : rule;
    }
    case 'slug':
      return optional ? slugField(field.label).optional().or(z.literal('')) : slugField(field.label);
    case 'email':
      return optional ? ethEmail(field.label).optional().or(z.literal('')) : ethEmail(field.label, { required: true });
    case 'phone':
      return optional ? ethPhone(field.label).optional().or(z.literal('')) : ethPhone(field.label, { required: true });
    case 'number':
    case 'percent': {
      const rule = z
        .union([z.string(), z.number()])
        .transform((v) => (v === '' || v === null || v === undefined ? NaN : Number(String(v).replace(/,/g, ''))))
        .refine((v) => (optional && Number.isNaN(v)) || Number.isFinite(v), { message: `${field.label} በቁጥር መሆን አለበት` })
        .refine((v) => Number.isNaN(v) || (field.min === undefined ? true : v >= field.min), {
          message: `${field.label} ከ${field.min ?? 0} ማነስ የለበትም`,
        })
        .refine((v) => Number.isNaN(v) || (field.max === undefined ? true : v <= field.max), {
          message: `${field.label} ከ${field.max ?? ''} መብለጥ የለበትም`,
        });
      return rule.transform((v) => (Number.isNaN(v) ? null : v));
    }
    case 'money': {
      const rule = amountField(field.label, { min: field.min ?? 0, max: field.max ?? 100_000_000 });
      return optional ? z.union([z.literal(''), z.literal('0')]).transform(() => 0).or(rule) : rule;
    }
    case 'date':
      return optional ? isoDate(field.label).optional().or(z.literal('')) : isoDate(field.label);
    case 'datetime':
      return optional
        ? z.string().trim().optional().refine((v) => !v || !Number.isNaN(Date.parse(v)), `${field.label} ትክክለኛ ሰዓት አይደለም`)
        : z.string().trim().min(1, `እባክዎ ${field.label} ይሙሉ`).refine((v) => !Number.isNaN(Date.parse(v)), `${field.label} ትክክለኛ ሰዓት አይደለም`);
    case 'time':
      return optional
        ? z.string().trim().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, `${field.label} በ00:00 መልክ ይጻፉ`).optional().or(z.literal(''))
        : z.string().trim().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, `${field.label} በ00:00 መልክ ይጻፉ`);
    case 'checkbox':
      return z.boolean().optional().transform((v) => Boolean(v));
    case 'select':
      return optional
        ? z.string().trim().optional().or(z.literal(''))
        : z.string().trim().min(1, `እባክዎ ${field.label} ይምረጡ`);
    case 'multiselect':
      return z.array(z.string()).optional();
    case 'json':
      return z
        .union([z.string(), z.object({}).passthrough(), z.array(z.any())])
        .optional()
        .transform((v) => {
          if (v === undefined || v === null || v === '') return null;
          if (typeof v !== 'string') return v;
          try {
            return JSON.parse(v);
          } catch {
            return v;
          }
        });
    case 'tags':
      return z.string().trim().optional().transform((v) => (v && v.length ? v : ''));
    case 'image':
    case 'media':
      return optional ? z.string().trim().optional().or(z.literal('')) : z.string().trim().min(1, `እባክዎ ${field.label} ይምረጡ`);
    default:
      return z.unknown();
  }
}

/** The whole form as one zod schema. */
export function formSchema<T extends TableName>(resource: Resource<T>): z.ZodType<FormValues> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of formFields(resource)) shape[field.key] = fieldSchema(field);
  return z.object(shape).passthrough() as unknown as z.ZodType<FormValues>;
}

/** Values the form shows for an existing row, in the shape each control wants. */
export function toFormValues<T extends TableName>(resource: Resource<T>, row: Row<T> | null): FormValues {
  const out: FormValues = {};
  for (const field of formFields(resource)) {
    const raw = (row as Record<string, unknown> | null)?.[field.key];
    if (field.kind === 'checkbox') out[field.key] = Boolean(raw);
    else if (field.kind === 'json') out[field.key] = raw == null ? '' : JSON.stringify(raw, null, 2);
    else if (field.kind === 'tags') out[field.key] = Array.isArray(raw) ? raw.join(', ') : '';
    else if (raw === null || raw === undefined) out[field.key] = field.default ?? '';
    else if (typeof raw === 'object') out[field.key] = String((raw as { id?: string }).id ?? '');
    else out[field.key] = raw as string | number | boolean;
  }
  return out;
}

/** Empty form for a new row. */
export function blankValues<T extends TableName>(resource: Resource<T>): FormValues {
  return toFormValues(resource, null);
}

/**
 * Only what the person actually touched, so an edit cannot blank a column that
 * the form does not show. Numbers, money and checkboxes are coerced; an empty
 * optional text field is dropped rather than written as an empty string.
 */
export function changedPayload<T extends TableName>(
  resource: Resource<T>,
  values: FormValues,
  original: Row<T> | null
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  for (const field of formFields(resource)) {
    const next = values[field.key];
    const prev = original ? ((original as Record<string, unknown>)[field.key] ?? null) : null;

    if (field.kind === 'checkbox') {
      const b = Boolean(next);
      if (original === null || b !== Boolean(prev)) payload[field.key] = b;
      continue;
    }

    if (next === '' || next === null || next === undefined) {
      // Nothing typed: create omits it, update leaves the stored value alone.
      if (original === null && field.required && field.kind === 'multiselect') payload[field.key] = [];
      continue;
    }

    let value: unknown = next;
    if (field.kind === 'number' || field.kind === 'money' || field.kind === 'percent') value = Number(next);
    if (field.kind === 'json') value = typeof next === 'string' ? JSON.parse(next) : next;
    if (field.kind === 'datetime' || field.kind === 'date') value = String(next);
    if (field.kind === 'multiselect' && Array.isArray(next)) value = next;
    if (field.kind === 'tags') value = String(next).split(',').map((t) => t.trim()).filter(Boolean);

    const same =
      prev !== null &&
      prev !== undefined &&
      (prev === value ||
        String(prev) === String(value) ||
        (Array.isArray(prev) && Array.isArray(next) && prev.join(',') === next.join(',')));

    if (!same) payload[field.key] = value;
  }

  return payload;
}

/** The name shown in a confirmation dialog for one row. */
export function rowLabel<T extends TableName>(resource: Resource<T>, row: Row<T>): string {
  const first = resource.fields.find((f) => !f.hideFromForm && (f.kind === 'text' || f.kind === 'slug'));
  const value = first ? (row as Record<string, unknown>)[first.key] : null;
  return typeof value === 'string' && value ? value : rowKey(resource, row);
}

/** The columns that identify a row for an update or a delete; `id` unless told otherwise. */
export function keyColumns<T extends TableName>(resource: Resource<T>): readonly string[] {
  return (resource.keyFields ?? ['id']) as readonly string[];
}

/** Every key column's value joined, so a composite-key row still has one label and one React key. */
export function rowKey<T extends TableName>(resource: Resource<T>, row: Row<T>): string {
  return keyColumns(resource)
    .map((column) => String((row as Record<string, unknown>)[column] ?? ''))
    .join(' · ');
}

/** `amName` is used by several resources directly; re-exported for convenience. */
export { amName };

/** Edit rights: the module's own write grant, or its read grant when there is no write. */
export function mayEdit<T extends TableName>(resource: Resource<T>, can: (...keys: PermissionKey[]) => boolean): boolean {
  if (resource.write) return can(resource.write);
  if (resource.read) return can(resource.read);
  return can('system.write');
}

/** Who may push a row onto the public site, and who may decide a submission. */
export function mayPublish<T extends TableName>(resource: Resource<T>, can: (...keys: PermissionKey[]) => boolean): boolean {
  if (!resource.workflow) return false;
  return can(resource.publish ?? resource.write ?? 'system.write');
}

export function mayApprove<T extends TableName>(resource: Resource<T>, can: (...keys: PermissionKey[]) => boolean): boolean {
  if (!resource.workflow) return false;
  return can(resource.approve ?? resource.publish ?? resource.write ?? 'system.write');
}
