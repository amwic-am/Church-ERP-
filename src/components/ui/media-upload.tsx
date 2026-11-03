// A real media control for the ERP. It replaces the "dummy" image fields that
// were faked as `<Select>` lists or asked for a typed URL: here a person drags,
// browses, or pastes a file, the bytes go to the `media` bucket through Supabase,
// a `media_files` row is registered, and the field stores that row's **ID** — never
// a URL. So the same photo can be reused across news, events and gallery without a
// copy of the bytes, and the public site resolves id → URL through one helper.
//
// Every string is Amharic, every button does real work, and a refused upload (a
// missing bucket, an RLS denial) surfaces as a toast rather than a blank spinner.
import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type RefObject } from 'react';
import { toast } from 'sonner';
import {
  Archive,
  Check,
  FileText,
  Film,
  Image as ImageIcon,
  Library,
  Loader2,
  Music,
  RefreshCw,
  Search,
  Trash2,
  UploadCloud,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/form';
import { Modal } from '@/components/ui/overlay';
import { EmptyState } from '@/components/ui/surface';
import type { MediaFilesRow } from '@/types/database';
import {
  currentUser,
  listRows,
  mediaRowUrl,
  persistMediaFile,
  supabase,
  type MediaKind,
} from '@/lib/supabase';

// The client-side guard. Extensions are authoritative (a file's declared MIME type
// is attacker-controlled), MIME is a second check. SVG is deliberately left out:
// the `media` bucket is public-read and serves bytes raw, so an inline SVG could
// carry script. Add it only once a rendering proxy is in place.
const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp'];
const AUDIO_EXT = ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'flac', 'opus'];
const VIDEO_EXT = ['mp4', 'webm', 'mov', 'm4v', 'ogv'];
const DOC_EXT = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'csv'];
const ARCHIVE_EXT = ['zip', 'rar', '7z', 'tar', 'gz'];
const ALL_EXT = new Set([...IMAGE_EXT, ...AUDIO_EXT, ...VIDEO_EXT, ...DOC_EXT, ...ARCHIVE_EXT]);

const EXT_CATEGORY: Record<string, MediaKind> = {
  ...Object.fromEntries(IMAGE_EXT.map((e) => [e, 'image' as MediaKind])),
  ...Object.fromEntries(AUDIO_EXT.map((e) => [e, 'audio' as MediaKind])),
  ...Object.fromEntries(VIDEO_EXT.map((e) => [e, 'video' as MediaKind])),
  ...Object.fromEntries(DOC_EXT.map((e) => [e, 'document' as MediaKind])),
  ...Object.fromEntries(ARCHIVE_EXT.map((e) => [e, 'archive' as MediaKind])),
};

const MIME_PREFIX: Record<MediaKind, string> = {
  image: 'image/',
  audio: 'audio/',
  video: 'video/',
  document: '',
  archive: '',
};

function extensionOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name || '');
  return m ? m[1].toLowerCase() : '';
}

/** null when the file passes; an Amharic reason when it must be refused. */
function validateFile(file: File, maxSizeMb: number): { ext: string; kind: MediaKind } | { error: string } {
  const ext = extensionOf(file.name);
  if (!ext || !ALL_EXT.has(ext)) {
    return { error: 'ይህ የፋይል ዓይነት አልተፈቀደም። የሚቻሉት፦ ምስል፣ ድምጽ፣ ቪዲዮ፣ ሰነድ ወይም ማህደር (archive) ብቻ ናቸው።' };
  }
  const kind = EXT_CATEGORY[ext];
  const declared = (file.type || '').toLowerCase();
  const wanted = MIME_PREFIX[kind];
  if (declared && wanted && !declared.startsWith(wanted)) {
    return { error: `የፋይሉ ዓይነት (${file.type}) ከስማቸው (${ext}) ጋር አይስማማም፤ እባክዎ ትክክለኛውን ፋይል ይምረጡ።` };
  }
  if (file.size > maxSizeMb * 1024 * 1024) {
    return { error: `ፋይሉ በጣም ትልቅ ነው። ከፍተኛው መጠን ${maxSizeMb} MB ሲሆን የዚህ ፋይል መጠን ${(file.size / (1024 * 1024)).toFixed(1)} MB ነው።` };
  }
  if (file.size === 0) return { error: 'ፋይሉ ባዶ ነው፤ እባክዎ ሌላ ፋይል ይምረጡ።' };
  return { ext, kind };
}

/** Read an image's natural size so the media row records width/height; never throws. */
async function measureImage(file: File): Promise<{ width: number | null; height: number | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth || null, height: img.naturalHeight || null });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve({ width: null, height: null });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

type Phase = 'idle' | 'uploading' | 'saving';
const PHASE_LABEL: Record<Phase, string> = {
  idle: '',
  uploading: 'ፋይሉ ይላካል (ይወጣል) ላይ…',
  saving: 'ወደ ሐቀፍ ማህደር ይመዝገባል ላይ…',
};

const KIND_ICON: Record<MediaKind, typeof ImageIcon> = {
  image: ImageIcon,
  audio: Music,
  video: Film,
  document: FileText,
  archive: Archive,
};

export interface MediaUploadProps {
  /** The stored value: a `media_files` id, or empty. The field never holds a URL. */
  value: string;
  onChange: (nextId: string) => void;
  /** Amharic label of the owning field, reused in toasts. */
  fieldLabel?: string;
  /** Path segment under the bucket, e.g. the table or column — never the filename. */
  scope?: string;
  required?: boolean;
  disabled?: boolean;
  maxSizeMb?: number;
}

export function MediaUpload({
  value,
  onChange,
  fieldLabel = 'ሐቀፍ',
  scope = 'media',
  required = false,
  disabled = false,
  maxSizeMb = 25,
}: MediaUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [row, setRow] = useState<MediaFilesRow | null>(null);
  const [resolving, setResolving] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [dragging, setDragging] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);

  // Resolve the stored id → its media_files row so we can show a real thumbnail.
  useEffect(() => {
    if (!value) {
      setRow(null);
      return;
    }
    let cancelled = false;
    setResolving(true);
    void (async () => {
      try {
        const rows = await listRows<MediaFilesRow>(
          supabase.from('media_files').select('*').eq('id', value).limit(1)
        );
        if (!cancelled) setRow(rows[0] ?? null);
      } catch {
        if (!cancelled) setRow(null);
      } finally {
        if (!cancelled) setResolving(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [value]);

  const busy = phase !== 'idle';

  const runUpload = useCallback(
    async (file: File) => {
      if (busy || disabled) return;
      const checked = validateFile(file, maxSizeMb);
      if ('error' in checked) {
        toast.error(checked.error);
        return;
      }
      const { ext, kind } = checked;
      const dims = kind === 'image' ? await measureImage(file) : { width: null, height: null };
      const user = await currentUser().catch(() => null);

      setPhase('uploading');
      try {
        const saved = await persistMediaFile({
          file,
          scope,
          ext,
          kind,
          name: file.name,
          width: dims.width,
          height: dims.height,
          uploadedBy: user?.id ?? null,
        });
        setPhase('saving');
        onChange(saved.id);
        setRow(saved.row ?? null);
        toast.success(`${fieldLabel} በድረ-ገጹ ሐቀፍ ማህደር ተቀምጧል።`);
      } catch (e) {
        // persistMediaFile already removes the orphaned object and returns Amharic.
        toast.error(e instanceof Error ? e.message : 'ማሳለፉ አልተሳካም፤ እንደገና ይሞክሩ።');
      } finally {
        setPhase('idle');
      }
    },
    [busy, disabled, fieldLabel, maxSizeMb, onChange, scope]
  );

  function pickFile() {
    if (!busy && !disabled) inputRef.current?.click();
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void runUpload(file);
  }

  function onPaste(e: ClipboardEvent) {
    const file = Array.from(e.clipboardData?.files ?? [])[0];
    if (file) void runUpload(file);
  }

  function clearField() {
    if (busy || disabled) return;
    // Safe remove: detach the value from THIS field only. The bytes and the
    // media_files row stay — other rows may reference the same media, and deleting
    // needs media.delete on the storage object, which a field owner may not have.
    onChange('');
    setRow(null);
    toast.info('ከዚህ መስክ ቀርቷል፤ ፋይሉ በሐቀፍ ማህደሩ ውስጥ ቀርቷል።');
  }

  const url = mediaRowUrl(row);
  const kind = (row?.kind as MediaKind) ?? 'image';
  const Icon = KIND_ICON[kind] ?? ImageIcon;

  // ---- Empty state: drag / browse / paste / pick-from-library --------------------
  if (!value) {
    return (
      <div className="space-y-2">
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-label={`${fieldLabel} ለስቅለት ዝግጁ`}
          onClick={pickFile}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
              e.preventDefault();
              pickFile();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={disabled ? undefined : onDrop}
          onPaste={disabled ? undefined : onPaste}
          className={
            'flex min-h-[6rem] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center transition-colors ' +
            (dragging ? 'border-leaf bg-leaf/5' : 'border-input hover:bg-accent/60') +
            (disabled ? ' cursor-not-allowed opacity-60' : '')
          }
        >
          <UploadCloud className={'h-7 w-7 ' + (dragging ? 'text-leaf' : 'text-muted-foreground')} aria-hidden />
          <p className="text-sm font-medium">
            ፋይል እዚህ ይጎትቱ፣ ወይም <span className="text-primary">ከኮምፒዩተር ይምረጡ</span>
          </p>
          <p className="text-xs text-muted-foreground">ወይም ሐደሽ ከገለጸ ፋይል እዚህ ይለጥፉ (Ctrl+V)። ከፍተኛው መጠን {maxSizeMb} MB።</p>
          {required ? <span className="text-xs font-medium text-destructive">ይህ መስክ አስፈላጊ ነው።</span> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setLibraryOpen(true)} disabled={disabled || busy} icon={<Library className="h-4 w-4" />}>
            ከማህደር ይምረጡ
          </Button>
        </div>
        {busy ? <ProgressRow phase={phase} /> : null}
        <HiddenInput inputRef={inputRef} onFile={runUpload} disabled={disabled} />
        <LibraryDialog
          open={libraryOpen}
          onOpenChange={setLibraryOpen}
          onPick={(id) => {
            onChange(id);
            setLibraryOpen(false);
          }}
        />
      </div>
    );
  }

  // ---- Populated: thumbnail preview with replace / remove / re-pick ----------------
  return (
    <div className="space-y-2">
      <div className={'flex items-center gap-3 rounded-lg border border-input bg-card p-3 ' + (disabled ? 'opacity-60' : '')}>
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
          {resolving ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
          ) : url && kind === 'image' ? (
            <img src={url} alt={row?.alt_am || row?.name || fieldLabel} className="h-full w-full object-cover" />
          ) : (
            <Icon className="h-7 w-7 text-muted-foreground" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={row?.name ?? undefined}>
            {row?.name || (value ? 'የተመዘገበ ሐቀፍ' : '—')}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {row ? `${row.mime_type || kind}${row.byte_size ? ` · ${(row.byte_size / 1024).toFixed(0)} KB` : ''}` : 'ID · ' + value.slice(0, 8)}
          </p>
        </div>
        {row && url && kind !== 'image' ? (
          <a href={url} target="_blank" rel="noreferrer" className="shrink-0 text-xs text-primary hover:underline">
            ይክፈቱ
          </a>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={pickFile} disabled={disabled || busy} icon={<RefreshCw className="h-4 w-4" />}>
          ተክት
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setLibraryOpen(true)} disabled={disabled || busy} icon={<Library className="h-4 w-4" />}>
          ከማህደር ይምረጡ
        </Button>
        <Button type="button" variant="destructive" size="sm" onClick={clearField} disabled={disabled || busy} icon={<Trash2 className="h-4 w-4" />}>
          አስወግድ
        </Button>
      </div>

      {busy ? <ProgressRow phase={phase} /> : null}
      <HiddenInput inputRef={inputRef} onFile={runUpload} disabled={disabled} />
      <LibraryDialog
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        currentId={value}
        onPick={(id) => {
          onChange(id);
          setLibraryOpen(false);
        }}
      />
    </div>
  );
}

function ProgressRow({ phase }: { phase: Phase }) {
  // Determinate by phase, because Supabase's storage client reports no byte count —
  // this is honest progress, not a fabricated percent.
  const pct = phase === 'uploading' ? 45 : phase === 'saving' ? 85 : 0;
  return (
    <div className="space-y-1" role="status" aria-live="polite">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-leaf transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> {PHASE_LABEL[phase]}
      </p>
    </div>
  );
}

function HiddenInput({
  inputRef,
  onFile,
  disabled,
}: {
  inputRef: RefObject<HTMLInputElement>;
  onFile: (file: File) => void;
  disabled?: boolean;
}) {
  return (
    <input
      ref={inputRef}
      type="file"
      className="hidden"
      disabled={disabled}
      accept={ALL_EXT.size ? `.${[...ALL_EXT].join(',.')}` : undefined}
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) onFile(file);
        e.target.value = '';
      }}
    />
  );
}

const LIBRARY_PAGE = 24;

/** "ከማህደር ይምረጡ": recent media_files, searchable + paged, sets the field to an id. */
function LibraryDialog({
  open,
  onOpenChange,
  onPick,
  currentId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (id: string) => void;
  currentId?: string;
}) {
  const [rows, setRows] = useState<MediaFilesRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [term, setTerm] = useState('');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const fetchPage = useCallback(
    async (from: number, search: string) => {
      setLoading(true);
      setError(null);
      try {
        let query = supabase
          .from('media_files')
          .select('*')
          .order('created_at', { ascending: false });
        const like = `%${search.trim().replace(/[%_]/g, '')}%`;
        if (search.trim()) query = query.or(`name.ilike.${like},title_am.ilike.${like}`);
        query = query.range(from, from + LIBRARY_PAGE - 1);
        const page = await listRows<MediaFilesRow>(query);
        setRows((prev) => (from === 0 ? page : [...prev, ...page]));
        setOffset(from + page.length);
        setHasMore(page.length === LIBRARY_PAGE);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'ዝርዝሩን መጫን አልተሳካም።');
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!open) return;
    setOffset(0);
    setHasMore(true);
    void fetchPage(0, term);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="ከማህደር ይምረጡ"
      description="አስቀድሞ የተቀመጡ ሐቀፎች፤ አንዱን ይምረጡ ወይም ፍለጉ።"
    >
      <div className="space-y-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            className="pl-9"
            value={term}
            placeholder="በስም ወይም በአርዕስት ይፈልግ…"
            aria-label="ሐቀፍ ይፈልግ"
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void fetchPage(0, term);
            }}
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void fetchPage(0, term)} icon={<Search className="h-4 w-4" />}>
            ፈልግ
          </Button>
          <Button type="button" size="sm" onClick={() => void fetchPage(0, term)} icon={<RefreshCw className="h-4 w-4" />} disabled={loading}>
            እንደገና
          </Button>
        </div>

        {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}

        {rows.length === 0 && !loading ? (
          <EmptyState title="ምንም ሐቀፍ የለም" description="ገና ማህደሩ ባዶ ነው። ፋይል ከጎተቱት በኋላ እዚህ ይታያል።" />
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {rows.map((r) => {
              const thumb = mediaRowUrl(r);
              const k = (r.kind as MediaKind) ?? 'image';
              const RIcon = KIND_ICON[k] ?? ImageIcon;
              const selected = currentId === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onPick(r.id)}
                  className={
                    'group relative flex aspect-square flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border p-2 text-center transition-colors ' +
                    (selected ? 'border-leaf bg-leaf/10' : 'border-border hover:border-leaf/60 hover:bg-accent/60')
                  }
                  title={r.name}
                >
                  {thumb && k === 'image' ? (
                    <img src={thumb} alt={r.alt_am || r.name} className="h-full w-full rounded object-cover" />
                  ) : (
                    <RIcon className="h-8 w-8 text-muted-foreground" aria-hidden />
                  )}
                  <span className="w-full truncate text-[11px] leading-tight">{r.title_am || r.name}</span>
                  {selected ? <Check className="absolute right-1 top-1 h-4 w-4 text-leaf" aria-hidden /> : null}
                </button>
              );
            })}
          </div>
        )}

        {hasMore && rows.length > 0 ? (
          <div className="flex justify-center pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => void fetchPage(offset, term)} disabled={loading}>
              {loading ? 'በመጫን ላይ…' : 'ተጨማሪ አሳይ'}
            </Button>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

/** A library-populating upload button for the media screen's toolbar. */
export function MediaLibraryUploadButton({
  scope = 'library',
  fieldLabel = 'ሐቀፍ',
  maxSizeMb = 25,
  onUploaded,
}: {
  scope?: string;
  fieldLabel?: string;
  maxSizeMb?: number;
  onUploaded: () => void | Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    const checked = validateFile(file, maxSizeMb);
    if ('error' in checked) {
      toast.error(checked.error);
      return;
    }
    const { ext, kind } = checked;
    const dims = kind === 'image' ? await measureImage(file) : { width: null, height: null };
    const user = await currentUser().catch(() => null);
    setBusy(true);
    try {
      await persistMediaFile({
        file,
        scope,
        ext,
        kind,
        name: file.name,
        width: dims.width,
        height: dims.height,
        uploadedBy: user?.id ?? null,
      });
      toast.success(`${fieldLabel} ወደ ሐቀፍ ማህደር ተቀምጧል።`);
      await onUploaded();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'ማሳለፉ አልተሳካም።');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        onClick={() => inputRef.current?.click()}
        loading={busy}
        icon={<UploadCloud className="h-4 w-4" />}
      >
        ከፋይል ክፍለ ግብ
      </Button>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={`.${[...ALL_EXT].join(',.')}`}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = '';
        }}
      />
    </>
  );
}
