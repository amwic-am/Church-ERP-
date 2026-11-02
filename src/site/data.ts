// Reading the public side of the database.
//
// The website never invents content: each page asks for published rows — through
// the `v_public_*` views where one exists, through the table itself where a body
// or a settings blob is needed — and shows the loading, empty or failed state the
// surface components already know how to draw. An anonymous visitor gets exactly
// what row level security lets them see, which is the whole point.
import { useCallback, useEffect, useRef, useState } from 'react';

import { isSupabaseConfigured } from '@/lib/env';
import { fetchRows, storagePublicUrl, type ReadOptions } from '@/lib/supabase';
import { friendlyError } from '@/lib/errors';
import type { MediaFilesRow } from '@/types/database';

export type AsyncState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
};

/** Run a loader on mount and whenever `deps` change; keep the latest result. */
export function useAsyncData<T>(loader: () => Promise<T>, deps: readonly unknown[]): AsyncState<T> {
  const ref = useRef(loader);
  ref.current = loader;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    ref
      .current()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(friendlyError(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { data, loading, error, reload };
}

export function useRows<T>(table: string, options: ReadOptions = {}, key = table): AsyncState<T[]> {
  const state = useAsyncData<T[]>(
    () => fetchRows<T>(table, options),
    // A serialised option object, so the query re-runs only when it really changed.
    [key, JSON.stringify(options)]
  );
  return { ...state, data: state.data ?? [] };
}

export function useRow<T>(table: string, options: ReadOptions = {}, key = table): AsyncState<T | null> {
  const state = useAsyncData<T | null>(
    () => fetchRows<T>(table, { ...options, limit: 1 }).then((rows) => rows[0] ?? null),
    [key, JSON.stringify(options)]
  );
  return state;
}

/** The URL a block's `media_id` points at, or null when it points at nothing. */
export function useMediaUrl(mediaId: string | null | undefined): string | null {
  const state = useRow<MediaFilesRow>('media_files', { eq: ['id', mediaId ?? ''] }, `media:${mediaId ?? ''}`);
  const row = state.data;
  if (!mediaId || !row) return null;
  return row.public_url ?? storagePublicUrl(row.bucket, row.storage_path);
}
