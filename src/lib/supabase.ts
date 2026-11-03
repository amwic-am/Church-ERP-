// The single Supabase entry point.
//
// Everything the app does with the database goes through this typed client, so
// row level security is the only authority: the client holds the anon key, a
// signed-in user gets their own JWT, and every read or write is filtered by the
// policies in the migrations — never by code that decides who may see a row.

import { createClient, type PostgrestError, type Session, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { Database, MediaFilesRow } from '@/types/database';
import { env, isSupabaseConfigured } from './env.ts';
import { friendlyError } from './errors.ts';

/** The media kind the `media_files.kind` CHECK allows, derived from a file. */
export type MediaKind = 'image' | 'audio' | 'video' | 'document' | 'archive';

export type DbSchema = Database['public'];
export type TableName = keyof DbSchema['Tables'];
export type ViewName = keyof DbSchema['Views'];
export type FunctionName = keyof DbSchema['Functions'];
export type Row<T extends TableName> = DbSchema['Tables'][T]['Row'];
export type Insert<T extends TableName> = DbSchema['Tables'][T]['Insert'];
export type Update<T extends TableName> = DbSchema['Tables'][T]['Update'];
export type ViewRow<T extends ViewName> = DbSchema['Views'][T]['Row'];
export type Args<F extends FunctionName> = DbSchema['Functions'][F]['Args'];
export type Returns<F extends FunctionName> = DbSchema['Functions'][F]['Returns'];

// A syntactically valid but unusable pair keeps the client constructible when
// `.env` is missing; `isSupabaseConfigured` is what the UI checks before asking
// for data, so the failure is a readable banner instead of a crash at import.
const FALLBACK_URL = 'http://127.0.0.1:54321';
const FALLBACK_KEY = 'anon-key-not-configured';

export const supabase: SupabaseClient<Database> = createClient<Database>(
  isSupabaseConfigured ? env.supabaseUrl : FALLBACK_URL,
  isSupabaseConfigured ? env.supabaseAnonKey : FALLBACK_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'tekle-teoflos-auth',
    },
    global: { headers: { 'x-application-name': 'tekle-teoflos-platform' } },
  }
);

/** Wraps a Postgres failure in an Error whose message is already Amharic. */
export class DbFailure extends Error {
  code: string;
  details?: string;
  hint?: string;

  constructor(error: PostgrestError) {
    super(friendlyError(error));
    this.name = 'DbFailure';
    this.code = error.code ?? '';
    this.details = error.details ?? undefined;
    this.hint = error.hint ?? undefined;
    // The untranslated text stays where an engineer can see it.
    console.error('[db]', error.code, error.message, error.details ?? '', error.hint ?? '');
  }
}

type Result<T> = PromiseLike<{ data: T | null; error: PostgrestError | null }>;

/** `await listRows(supabase.from('students').select('*'))` — rows or an Amharic error. */
export async function listRows<T>(query: Result<T[]>): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new DbFailure(error);
  return data ?? [];
}

export async function oneRow<T>(query: Result<T>): Promise<T | null> {
  const { data, error } = await query;
  if (error) throw new DbFailure(error);
  return data ?? null;
}

/** Options for the hand-rolled read helpers below. */
export type ReadOptions = {
  select?: string;
  eq?: readonly [string, string];
  order?: string;
  ascending?: boolean;
  limit?: number;
};

// The Supabase client types `from()` against `Tables` only and narrows `eq()` to
// that one table's columns, so a generic table-or-view name collapses to `never`.
// These two helpers keep the cast in a single place: callers still get typed rows.
type LooseBuilder = {
  select: (columns: string) => LooseBuilder;
  eq: (column: string, value: string) => LooseBuilder;
  order: (column: string, options: { ascending: boolean }) => LooseBuilder;
  limit: (count: number) => LooseBuilder;
  then: (run: (value: { data: unknown; error: PostgrestError | null }) => void) => void;
};

function loose(table: string, options: ReadOptions): LooseBuilder {
  let query = (supabase as unknown as { from: (name: string) => LooseBuilder }).from(table).select(options.select ?? '*');
  if (options.eq) query = query.eq(options.eq[0], options.eq[1]);
  if (options.order) query = query.order(options.order, { ascending: options.ascending ?? false });
  if (options.limit) query = query.limit(options.limit);
  return query;
}

/** Read rows from any table *or* view by name. */
export async function fetchRows<T>(table: string, options: ReadOptions = {}): Promise<T[]> {
  const { data, error } = await loose(table, options);
  if (error) throw new DbFailure(error);
  return (data ?? []) as T[];
}

export async function fetchOne<T>(table: string, options: ReadOptions = {}): Promise<T | null> {
  const rows = await fetchRows<T>(table, { ...options, limit: 1 });
  return rows[0] ?? null;
}

/** Typed, throwing RPC call — the path every public form and workflow action uses. */
export async function callFn<F extends FunctionName>(name: F, args: Args<F>): Promise<Returns<F>> {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw new DbFailure(error);
  return data as Returns<F>;
}

export async function currentSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function currentUser(): Promise<User | null> {
  const { data } = await supabase.auth.getUser();
  return data.user;
}

export function onAuthChange(handler: (session: Session | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => handler(session));
  return () => data.subscription.unsubscribe();
}

/** The public object URL for a media row, when the site is allowed to show it. */
export function storagePublicUrl(bucket: string | null | undefined, objectPath: string | null | undefined): string | null {
  if (!objectPath || !isSupabaseConfigured) return null;
  if (/^https?:\/\//.test(objectPath)) return objectPath;
  return `${env.supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/${bucket || env.mediaBucket}/${objectPath.replace(/^\/+/, '')}`;
}

/** Media lives in one private bucket; the ERP reads it through signed URLs. */export async function signedMediaUrl(objectPath: string, ttlSeconds = 60 * 30): Promise<string | null> {
  if (!objectPath) return null;
  const { data, error } = await supabase.storage.from(env.mediaBucket).createSignedUrl(objectPath, ttlSeconds);
  if (error) {
    console.error('[storage]', error.message);
    return null;
  }
  return data?.signedUrl ?? null;
}

export async function uploadMedia(objectPath: string, file: File): Promise<{ path: string; error: string | null }> {
  const { error } = await supabase.storage.from(env.mediaBucket).upload(objectPath, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || 'application/octet-stream',
  });
  return { path: objectPath, error: error ? friendlyError(error) : null };
}

export async function removeMedia(objectPath: string): Promise<boolean> {
  const { error } = await supabase.storage.from(env.mediaBucket).remove([objectPath]);
  return !error;
}

/**
 * One real write of the media pipeline: put the bytes in the `media` bucket, then
 * register a `media_files` row, and hand back the new row so a field can store its
 * ID (never a URL). The object path is `scope/uuid.ext` — the caller's filename is
 * only ever used for the display `name`, never as a path segment, so nobody can
 * traverse or collide into another upload by naming a file.
 *
 * If the row insert is refused (RLS, a duplicate path, a missing bucket) the object
 * that just landed is removed again and the failure is thrown, so a half-completed
 * upload never lingers. Throwing an `Error` whose message is already Amharic lets
 * the caller surface it as a toast instead of a blank spinner.
 */
export async function persistMediaFile(params: {
  file: File;
  scope: string;
  ext: string;
  kind: MediaKind;
  name?: string;
  titleAm?: string | null;
  width?: number | null;
  height?: number | null;
  durationSecs?: number | null;
  uploadedBy?: string | null;
}): Promise<{ id: string; storagePath: string; publicUrl: string | null; row: MediaFilesRow | null }> {
  const safeScope = (params.scope || 'media').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'media';
  const safeExt = (params.ext || 'bin').replace(/[^a-zA-Z0-9]+/g, '').toLowerCase().slice(0, 8) || 'bin';
  const objectPath = `${safeScope}/${crypto.randomUUID()}.${safeExt}`;

  const { error: uploadError } = await uploadMedia(objectPath, params.file);
  if (uploadError) throw new Error(uploadError);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const publicUrl = storagePublicUrl(env.mediaBucket, objectPath);

  const record = {
    id,
    bucket: env.mediaBucket,
    storage_path: objectPath,
    name: params.name || params.file.name || objectPath,
    kind: params.kind,
    tags: [],
    state: 'published',
    is_public: true,
    download_count: 0,
    created_at: now,
    updated_at: now,
    mime_type: params.file.type || null,
    byte_size: params.file.size,
    public_url: publicUrl,
    title_am: params.titleAm ?? null,
    width: params.width ?? null,
    height: params.height ?? null,
    duration_secs: params.durationSecs ?? null,
    uploaded_by: params.uploadedBy ?? null,
  };

  const { data, error: insertError } = await supabase.from('media_files').insert(record as never).select().single();
  if (insertError) {
    // Roll the bytes back so a refused row does not orphan an object in the bucket.
    await removeMedia(objectPath);
    throw new Error(friendlyError(insertError));
  }

  return { id, storagePath: objectPath, publicUrl, row: (data as MediaFilesRow) ?? null };
}

/** The display URL for a media row: its stored public URL, else the bucket path. */
export function mediaRowUrl(row: { bucket?: string | null; storage_path?: string | null; public_url?: string | null } | null | undefined): string | null {
  if (!row) return null;
  return row.public_url || storagePublicUrl(row.bucket, row.storage_path);
}
