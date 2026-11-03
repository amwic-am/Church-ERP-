// The three website-administration screens the CRUD engine cannot express.
//
// The engine turns one table plus its fields into a list-and-form screen, which is
// exactly right for `news` or `menu_items` and exactly wrong for these three:
//
//   · የመነሻ ገጽ አዘገጃጀት — an *ordered* list of `page_blocks` rows for one `pages`
//     row, where each block's own settings live inside the `settings`/`items` jsonb
//     and which keys exist depends on the block type the public site renders in
//     `src/site/blocks.tsx`. Ordering is written straight to `sort_order`, because
//     the schema has no reorder RPC (verified: no function touches page_blocks).
//   · የፍለጋ ቅንብር — the `seo` jsonb of pages/news/events plus the `seo` group of
//     `site_settings`, with a real search-result preview and a sitemap built from
//     the published rows and the `v_public_*` views, because there is no sitemap RPC.
//   · ማጽደቅ የሚጠብቁ — `pending_approvals('content')` narrowed by the `content_types`
//     registry, so a button only appears where `decide_content` will actually honour
//     it (the right `.publish` grant, and never on the person's own submission).
//
// Reads go through the anon key so row level security decides what comes back; every
// write names a real column and every transition names a real RPC.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Download, ExternalLink, Eye, EyeOff, Plus, RefreshCw, Trash2 } from 'lucide-react';

import { useAuth } from '@/components/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Field, Input, Select, Switch, Textarea } from '@/components/ui/form';
import { MediaUpload } from '@/components/ui/media-upload';
import { ConfirmDialog, Modal } from '@/components/ui/overlay';
import { Card, CardBody, CardHeader, CardTitle, EmptyState, ErrorNote, PageHeading, Spinner, StatusBadge, type Tone } from '@/components/ui/surface';
import { Accordion, Tabs, TabPanel } from '@/components/ui/tabs';
import { BLOCK_TYPES, fkOptions } from '@/erp/crud/options';
import {
  changedPayload,
  fieldSchema,
  formFields,
  formSchema,
  keyColumns,
  rowKey,
  rowLabel,
  type FieldLike,
  type FormValues,
  type Option,
} from '@/erp/crud/resource';
import { pageBlocksResource } from '@/erp/resources/website';
import { isSupabaseConfigured, missingConfigHint, publicUrl, env } from '@/lib/env';
import { downloadTextFile } from '@/lib/export';
import { CONTENT_STATE, UI } from '@/lib/i18n';
import { dateTimeAm, relativeAm, truncate } from '@/lib/format';
import { firstIssue } from '@/lib/validation';
import { friendlyError } from '@/lib/errors';
import { callFn, fetchRows, listRows, supabase, type Args, type DbSchema, type Row, type ViewRow } from '@/lib/supabase';
import { ALL_PERMISSION_KEYS, type PermissionKey } from '@/lib/permissions';

type Rec = Record<string, unknown>;
type QueueRow = DbSchema['Functions']['pending_approvals']['Returns'][number];

const STATE_TONE: Record<string, Tone> = {
  draft: 'neutral',
  submitted: 'info',
  changes_requested: 'warning',
  approved: 'success',
  published: 'gold',
  archived: 'neutral',
};

/** A jsonb column that is allowed to be anything is read through these three. */
function asRecord(value: unknown): Rec {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Rec) : {};
}

function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function stateBadge(value: unknown): JSX.Element {
  const state = textOf(value);
  return <StatusBadge tone={STATE_TONE[state] ?? 'neutral'}>{CONTENT_STATE[state as keyof typeof CONTENT_STATE] ?? (state || '—')}</StatusBadge>;
}

/** A permission string from the registry is only trusted when the app knows the key. */
function asPermKey(value: string | null | undefined): PermissionKey | null {
  return value && (ALL_PERMISSION_KEYS as readonly string[]).includes(value) ? (value as PermissionKey) : null;
}

function ConfigNote() {
  return <ErrorNote message={missingConfigHint} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1 · የመነሻ ገጽ አዘገጃጀት — the block composer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The block types `src/site/blocks.tsx` actually renders: every case of its
 * `Block` switch plus the keys of `FEEDS`. `contact` is deliberately absent — it
 * is in the engine's `BLOCK_TYPES` list but has no case, and an unknown type only
 * reaches the site as plain text through the switch's default arm.
 *
 * The column's CHECK list (migration 0200, widened in 2200) also carries the names
 * that existed before this vocabulary did — `richtext`, `card_grid`, `media_list`.
 * Those stay editable so old rows are not destroyed; the block list marks them.
 */
const RENDERABLE: readonly string[] = [
  'hero',
  'heading',
  'text',
  'cards',
  'list',
  'stats',
  'verses',
  'quote',
  'cta',
  'map',
  'video',
  'gallery',
  'donate',
  'news',
  'events',
  'sermons',
  'mezmur',
  'publications',
];

const BLOCK_LABEL: Record<string, string> = Object.fromEntries(BLOCK_TYPES.map((o) => [o.value, o.label]));

const BLOCK_OPTIONS: Option[] = RENDERABLE.map((value) => ({
  value,
  label: value === 'publications' ? 'ህትመቶች (publications)' : (BLOCK_LABEL[value] ?? value),
}));

/** The settings keys each block type reads, expressed with the engine's field kinds. */
type BlockSpec = {
  type: string;
  settings?: readonly FieldLike[];
  items?: { label: string; help: string };
  /** The block reads a `media_files` row (`hero` background, `video` source). */
  usesMedia?: boolean;
  hint?: string;
};

const SETTINGS_FIELD = (key: string, label: string, kind: FieldLike['kind'], extra: Partial<FieldLike> = {}): FieldLike => ({ key, label, kind, ...extra });

/** The sort column has to exist in that block's own public view, so each feed
 *  type names its default and its legal choices instead of guessing. */
const FEED_SETTINGS = (defaultOrder: string, columns: string): readonly FieldLike[] => [
  SETTINGS_FIELD('count', 'የሚታዩ ንጥሎች ብዛት', 'number', { min: 1, max: 12, help: 'ከ1 እስከ 12፤ ባዶ ከሆነ የመገልገያው ተጠቃሚ ቁጥር ይወሰዳል።' }),
  SETTINGS_FIELD('order_by', 'የሚሰበርበት አምድ', 'text', {
    placeholder: defaultOrder,
    help: `ባዶ ከሆን በ${defaultOrder} ይሰበራል። ከእነዚህ መምረጥ ይቻላል፦ ${columns}።`,
  }),
];

const BLOCK_SPECS: readonly BlockSpec[] = [
  {
    type: 'hero',
    usesMedia: true,
    settings: [
      SETTINGS_FIELD('eyebrow', 'ከርዕስ በላይ የሚታይ ጽሑፍ', 'text'),
      SETTINGS_FIELD('primary_label', 'የመጀመሪያ ቁሌፍ ስም', 'text'),
      SETTINGS_FIELD('primary_href', 'የመጀመሪያ ቁሌፍ አድራሻ', 'text', { placeholder: '/registration' }),
      SETTINGS_FIELD('secondary_label', 'ሁለተኛው ቁሌፍ ስም', 'text'),
      SETTINGS_FIELD('secondary_href', 'ሁለተኛው ቁሌፍ አድራሻ', 'text', { placeholder: '/donate' }),
    ],
    hint: 'ርዕሱና ጽሑፉ ከክፍሉ መረጃ ይወሰዳሉ፤ የሥዕል መሐቀፍ ከሚዲያ ማህደሩ ይመረጣል።',
  },
  { type: 'heading', hint: 'ርዕሱ ብቻ ይታያል፤ ጽሑፉ ካለ ከርዕሱ ሥር ይከተላል።' },
  { type: 'text', hint: 'እያንዳንዱ ሐዲስ ሐሳብ በባዶ ረድፍ ተለያይቶ ይታያል።' },
  {
    type: 'cards',
    items: { label: 'ካርዶች (JSON)', help: '[{ "title": "", "body": "", "href": "/about", "badge": "" }] — href የተጀመረ በ / ሲሆን ተጨማሪ ያንብቡ ይለኛል።' },
    hint: 'እያንዳንዱ ካርድ ርዕስ፣ ሐዋሳ፣ አገናኝና ብርሐን (badge) አለው።',
  },
  { type: 'list', items: { label: 'ዝርዝር ንጥሎች (JSON)', help: '[{ "title": "", "body": "" }] — በቁጥር ተደርድሮ ይታያል።' } },
  { type: 'stats', items: { label: 'ቁጥሮች (JSON)', help: '[{ "value": 120, "label": "ንቁ ተማሪዎች" }] — እሴቱ ቁጥር ከሆነ በቁጥር ቅርጽ ይታያል።' } },
  { type: 'verses', items: { label: 'የቅዱስ ውቅር ጥቅሶች (JSON)', help: '[{ "text": "", "ref": "ዮሐ 3:16" }]' } },
  { type: 'quote', settings: [SETTINGS_FIELD('author', 'የተናጠረው ስም', 'text')], hint: 'ጽሑፉ በዐይን ምልክት ተዘጋጅቶ ይታያል፤ ስሙ በ “author” ውስጥ።' },
  {
    type: 'cta',
    settings: [
      SETTINGS_FIELD('label', 'የቁሌፍ ስም', 'text', { placeholder: 'አሁን ይቀላቀሉ' }),
      SETTINGS_FIELD('href', 'አድራሻ', 'text', { placeholder: '/registration' }),
    ],
    hint: 'አድራሻው በ / ካልተጀመረ ወደ መነሻ ገጽ ይወስዳል።',
  },
  {
    type: 'map',
    settings: [
      SETTINGS_FIELD('embed_url', 'የካርታ ማስገበሪያ አድራሻ', 'url', { placeholder: 'https://www.google.com/maps/embed?…' }),
      SETTINGS_FIELD('address', 'አድራሻ', 'textarea'),
      SETTINGS_FIELD('phone', 'ስልክ', 'phone'),
    ],
    hint: 'የማስገበሪያ አድራሻ ከተሰጠ ካርታው ይታያል፤ ካልሆነ ግን ቦታው በጽሑፍ ብቻ ይቀርባል።',
  },
  {
    type: 'video',
    usesMedia: true,
    settings: [SETTINGS_FIELD('embed_url', 'የቪዲዮ አገናኝ (ዩቲዩብ/ቪሜዖ)', 'url', { placeholder: 'https://www.youtube.com/embed/…' })],
    hint: 'ማስገበሪያ አድራሻ ከሌለ ከሚዲያ ማህደር የተመረጠው ይጫወታል።',
  },
  { type: 'gallery', hint: 'የቅርብ 8 ሥዕሎች ከ “v_public_media” ይወሰዳሉ — እዚህ ማመዛዘግ አያስፈልግም።' },
  { type: 'donate', hint: 'የቀርባለት ዘመቻ ከ “v_public_campaigns” በራሱ ይነበባል፤ ርዕስና ሐዋሳ ለራስዎ መግለጫ ነው።' },
  { type: 'news', settings: FEED_SETTINGS('published_at', 'published_at · views · title_am'), hint: 'የታወጁ ዜናዎች ብቻ ከ “v_public_news” ይታያሉ።' },
  { type: 'events', settings: FEED_SETTINGS('starts_at', 'starts_at · ends_at · is_featured · title_am'), hint: 'የታወጁ ፕሮግራሞች ከ “v_public_events” ይታያሉ፤ ከstarts_at በላይ ሲሰበር የቅርብ ቀኑ መጀመሪያ ይታያል።' },
  { type: 'sermons', settings: FEED_SETTINGS('delivered_on', 'delivered_on · published_at · created_at · listen_count'), hint: 'የታወጁ ንብዕቶች ከ “v_public_sermons”።' },
  { type: 'mezmur', settings: FEED_SETTINGS('created_at', 'created_at · published_at · title_am · play_count'), hint: 'የታወጁ መዝሙሮች ከ “v_public_mezmur”።' },
  { type: 'publications', settings: FEED_SETTINGS('published_on', 'published_on · created_at · download_count · title_am'), hint: 'የታወጁ ህትመቶች ከ “v_public_publications”።' },
];

const SPEC_BY_TYPE: Record<string, BlockSpec> = Object.fromEntries(BLOCK_SPECS.map((s) => [s.type, s]));

const HOME_SLUG = 'home';

/** The composer's own column list: the engine's fields, minus the two jsonb editors. */
const COLUMN_FIELDS = formFields(pageBlocksResource).filter((f) => f.key !== 'page_id' && f.key !== 'settings' && f.key !== 'items');

export function HomepageComposer() {
  const { identity, can } = useAuth();
  const [pages, setPages] = useState<Row<'pages'>[]>([]);
  const [pageId, setPageId] = useState('');
  const [blocks, setBlocks] = useState<Row<'page_blocks'>[]>([]);
  const [mediaChoices, setMediaChoices] = useState<readonly Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [blocksLoading, setBlocksLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [values, setValues] = useState<FormValues>({});
  const [settingsText, setSettingsText] = useState<Record<string, string>>({});
  const [itemsText, setItemsText] = useState('[]');
  const [issues, setIssues] = useState<Record<string, string>>({});

  const [confirmDelete, setConfirmDelete] = useState<Row<'page_blocks'> | null>(null);

  const writable = can('website.write');
  const page = useMemo(() => pages.find((p) => p.id === pageId) ?? null, [pages, pageId]);
  const spec = SPEC_BY_TYPE[textOf(values.block_type)] ?? null;

  const loadBlocks = useCallback(
    async (id: string) => {
      if (!id) {
        setBlocks([]);
        return;
      }
      setBlocksLoading(true);
      try {
        setBlocks(await listRows(supabase.from('page_blocks').select('*').eq('page_id', id).order('sort_order', { ascending: true }).limit(200)));
      } catch (e) {
        setError(friendlyError(e));
      } finally {
        setBlocksLoading(false);
      }
    },
    []
  );

  const load = useCallback(async () => {
    if (!identity || !isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await listRows(supabase.from('pages').select('*').order('slug').limit(200));
      setPages(rows);
      const home = rows.find((p) => p.slug === HOME_SLUG) ?? rows[0] ?? null;
      setPageId(home?.id ?? '');
      if (home) await loadBlocks(home.id);
      if (writable) setMediaChoices(await fkOptions('media_files', 'name')());
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [identity, writable, loadBlocks]);

  useEffect(() => {
    void load();
  }, [load]);

  const pageOptions: Option[] = useMemo(() => pages.map((p) => ({ value: p.id, label: `${p.title_am} — /${p.slug}` })), [pages]);

  /** The `settings` jsonb keeps keys the composer does not edit; only the listed ones change. */
  function openBlock(block: Row<'page_blocks'> | null) {
    const next: FormValues = block
      ? { ...block, media_id: block.media_id ?? '', title_am: block.title_am ?? '', body_am: block.body_am ?? '', section_key: block.section_key }
      : { page_id: page?.id ?? '', section_key: '', block_type: 'text', title_am: '', body_am: '', media_id: '', is_visible: true, sort_order: nextOrder(blocks) };
    setValues(next);
    const stored = asRecord(block?.settings);
    const fields = SPEC_BY_TYPE[textOf(next.block_type)]?.settings ?? [];
    setSettingsText(Object.fromEntries(fields.map((f) => [f.key, textOf(stored[f.key])])));
    setItemsText(JSON.stringify(Array.isArray(block?.items) ? block?.items : [], null, 2));
    setEditingId(block?.id ?? null);
    setIssues({});
    setOpen(true);
  }

  /** Switching type re-reads the settings keys, keeping whatever the new type shares. */
  function chooseType(value: string) {
    setValues((prev) => ({ ...prev, block_type: value }));
    const stored = asRecord(values.settings ?? (editingId ? blocks.find((b) => b.id === editingId)?.settings : {}));
    setSettingsText(Object.fromEntries((SPEC_BY_TYPE[value]?.settings ?? []).map((f) => [f.key, textOf(stored[f.key])])));
    if (!SPEC_BY_TYPE[value]?.items) setItemsText('[]');
  }

  async function saveBlock() {
    if (!page) return;
    setBusy(true);
    setIssues({});
    try {
      const original = editingId ? (blocks.find((b) => b.id === editingId) ?? null) : null;
      const storedSettings = asRecord(original?.settings);
      const mergedSettings: Rec = { ...storedSettings };
      for (const [key, raw] of Object.entries(settingsText)) {
        const trimmed = raw.trim();
        if (trimmed === '') delete mergedSettings[key];
        else mergedSettings[key] = trimmed;
      }

      const itemsParse = fieldItems(spec, itemsText);
      if (itemsParse.error) {
        setIssues({ items: itemsParse.error });
        toast.error(itemsParse.error);
        return;
      }

      const candidate: FormValues = {
        ...values,
        page_id: page.id,
        settings: JSON.stringify(mergedSettings),
        items: JSON.stringify(itemsParse.value),
      };
      const parsed = formSchema(pageBlocksResource).safeParse(candidate);
      if (!parsed.success) {
        const byKey: Record<string, string> = {};
        for (const issue of parsed.error.errors) byKey[String(issue.path[0] ?? '')] = issue.message;
        setIssues(byKey);
        toast.error(parsed.error.errors[0]?.message ?? 'እባክዎ መረጃውን ያረጋግጡ');
        return;
      }

      const payload = changedPayload(pageBlocksResource, parsed.data, original);
      // The engine's `changedPayload` compares values with String(), which flattens
      // every object to "[object Object]" — the two jsonb columns are compared here.
      for (const column of ['settings', 'items'] as const) {
        const nextValue = parsed.data[column] ?? null;
        if (JSON.stringify(original?.[column] ?? null) !== JSON.stringify(nextValue)) payload[column] = nextValue;
      }

      if (original) {
        let update = supabase.from('page_blocks').update(payload as never);
        for (const column of keyColumns(pageBlocksResource)) update = update.eq(column as never, (original as Record<string, unknown>)[column] as never);
        const { error: updateError } = await update;
        if (updateError) throw new Error(friendlyError(updateError));
        toast.success(UI.saved);
      } else {
        const { error: insertError } = await supabase.from('page_blocks').insert(payload as never);
        if (insertError) throw new Error(friendlyError(insertError));
        toast.success('ክፍል ተጨምሯል');
      }
      setOpen(false);
      await loadBlocks(page.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : UI.serverError);
    } finally {
      setBusy(false);
    }
  }

  /** `sort_order` is the only order column page_blocks has and no RPC reorders it. */
  async function persistOrder(ordered: Row<'page_blocks'>[]) {
    if (!page || !writable) return;
    setBusy(true);
    try {
      const wanted = ordered.map((block, index) => ({ id: block.id, sort_order: (index + 1) * 10 }));
      for (const [index, target] of wanted.entries()) {
        if (ordered[index].sort_order === target.sort_order) continue;
        const { error: updateError } = await supabase.from('page_blocks').update({ sort_order: target.sort_order } as never).eq('id', target.id);
        if (updateError) throw new Error(friendlyError(updateError));
      }
      await loadBlocks(page.id);
      toast.success('ድርድሩ ተቀምጧል');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : UI.serverError);
      await loadBlocks(page.id);
    } finally {
      setBusy(false);
    }
  }

  async function toggleVisible(block: Row<'page_blocks'>) {
    if (!page || !writable) return;
    setBusy(true);
    try {
      const { error: updateError } = await supabase.from('page_blocks').update({ is_visible: !block.is_visible } as never).eq('id', block.id);
      if (updateError) throw new Error(friendlyError(updateError));
      toast.success(block.is_visible ? 'ክፍሉ ተደብቋል' : 'ክፍሉ ግልጽ ሆኗል');
      await loadBlocks(page.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : UI.serverError);
    } finally {
      setBusy(false);
    }
  }

  async function removeBlock(block: Row<'page_blocks'>) {
    if (!page) return;
    setBusy(true);
    try {
      let del = supabase.from('page_blocks').delete();
      for (const column of keyColumns(pageBlocksResource)) del = del.eq(column as never, (block as Record<string, unknown>)[column] as never);
      const { error: deleteError } = await del;
      if (deleteError) throw new Error(friendlyError(deleteError));
      toast.success('ተሰርዟል');
      setConfirmDelete(null);
      await loadBlocks(page.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : UI.serverError);
    } finally {
      setBusy(false);
    }
  }

  async function createHome() {
    setBusy(true);
    try {
      // `template` must be 'home': that is what migration 0200's CHECK allows — the
      // engine's PAGE_TEMPLATES list offers 'landing'/'default', which the database refuses.
      const { error: insertError } = await supabase
        .from('pages')
        .insert({ slug: HOME_SLUG, title_am: 'መነሻ', template: 'home', state: 'draft', is_nav_hidden: true, seo: {} } as never);
      if (insertError) throw new Error(friendlyError(insertError));
      toast.success('የመነሻ ገጽ ተፈጥሯል');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : UI.serverError);
    } finally {
      setBusy(false);
    }
  }

  if (!isSupabaseConfigured) return <ConfigNote />;

  const liveHref = page ? (page.slug === HOME_SLUG ? '/' : `/page/${page.slug}`) : '/';

  return (
    <div className="space-y-5">
      <PageHeading
        title="የመነሻ ገጽ አዘገጃጀት"
        description="የመነሻ ገጹ ክፍሎች (ብሎኮች) በድርድር ይዘጋጃሉ፤ እያንዳንዱ ክፍል በድረ ገጹ ላይ በራሱ ይታያል።"
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => void load()} icon={<RefreshCw className="h-4 w-4" />} disabled={busy}>
              እንደገና
            </Button>
            <Button variant="outline" size="sm" asChild icon={<ExternalLink className="h-4 w-4" />}>
              <Link to={liveHref}>በድረ ገጹ ይመልከቱ</Link>
            </Button>
            {writable && page ? (
              <Button size="sm" onClick={() => openBlock(null)} icon={<Plus className="h-4 w-4" />}>
                {UI.add} ክፍል
              </Button>
            ) : null}
          </>
        }
      />

      {error ? <ErrorNote message={error} onRetry={() => void load()} /> : null}

      {loading ? (
        <Spinner label="ገጾች በመጫን ላይ…" />
      ) : pages.length === 0 ? (
        <EmptyState
          title="ምንም ገጽ የለም"
          description={writable ? 'የመነሻ ገጹ ለመጀመሪያ ጊዜ ሲፈጠር ክፍሎቹ እዚህ ይደረደራሉ።' : 'ገጾች ሲዘጋጁ በ “ገጾች” ገጽ ላይ ይፍጠራሉ።'}
          action={writable ? <Button size="sm" loading={busy} onClick={() => void createHome()}>የመነሻ ገጽ ፍጠር (home)</Button> : null}
        />
      ) : (
        <Card>
          <CardBody className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <Field label="ገጽ ይምረጡ" htmlFor="composer-page" hint="የመነሻ ገጹ “home” የሚባለው ሐጸር አድራሻ ነው።">
              <Select id="composer-page" value={pageId} options={pageOptions} onChange={(e) => { setPageId(e.target.value); void loadBlocks(e.target.value); }} />
            </Field>
            {page ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {stateBadge(page.state)}
                <span className="text-muted-foreground">ሐጸር፦ /{page.slug}</span>
                {page.published_at ? <span className="text-muted-foreground">የወጣበት፦ {dateTimeAm(page.published_at)}</span> : <span className="text-amber-700 dark:text-amber-300">ገና ለድረ ገጹ አልወጣም</span>}
                <Button variant="outline" size="sm" asChild>
                  <Link to="/erp/website/pages">የገጹን ሁኔታ ማዘጋጀት</Link>
                </Button>
              </div>
            ) : null}
          </CardBody>
        </Card>
      )}

      {page && !pages.some((p) => p.slug === HOME_SLUG) && writable ? (
        <Card>
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">“home” የሚባል ገጽ ስላልተገኘ መነሻ ገጹ ገና አይዘጋጅም።</p>
            <Button size="sm" loading={busy} onClick={() => void createHome()}>
              የመነሻ ገጽ ፍጠር
            </Button>
          </CardBody>
        </Card>
      ) : null}

      {page && !loading ? (
        blocksLoading ? (
          <Spinner label="ክፍሎች በመጫን ላይ…" />
        ) : blocks.length === 0 ? (
          <EmptyState
            title="ይህ ገጽ ክፍል የለውም"
            description={writable ? '“ክፍል ጨምር” ብለው የመጀመሪያውን ያስቀምጡ፤ እስኪታይ ድረስ የድረ ገጹ ርዕስና ሐዋሳ ብቻ ያሳያል።' : 'ክፍሎች በሚፈጥሩበት መብት ሲሰጡዎ እዚህ ይዘጋጃሉ።'}
            action={writable ? <Button size="sm" onClick={() => openBlock(null)} icon={<Plus className="h-4 w-4" />}>{UI.add} ክፍል</Button> : null}
          />
        ) : (
          <ol className="space-y-3">
            {blocks.map((block, index) => {
              const known = RENDERABLE.includes(block.block_type);
              return (
                <li key={rowKey(pageBlocksResource, block)}>
                  <Card>
                    <CardBody className="flex flex-wrap items-center gap-3">
                      <span className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-leaf/10 text-sm font-semibold text-leaf' aria-hidden>
                        {index + 1}
                      </span>
                      <div className='min-w-0 flex-1'>
                        <p className='font-display text-base font-semibold'>{block.title_am || block.section_key}</p>
                        <p className='mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground'>
                          <span className='rounded bg-muted px-1.5 py-0.5 font-mono'>{block.section_key}</span>
                          <span>{BLOCK_LABEL[block.block_type] ?? block.block_type}</span>
                          <span>ድርድር {block.sort_order}</span>
                        </p>
                        {!known ? (
                          <p className='mt-1 text-xs text-amber-700 dark:text-amber-300'>
                            “{block.block_type}” በድረ ገጹ ኮድ (<code>blocks.tsx</code>) ስለማይታወቅ እንደ ተራ ጽሑፍ ብቻ ይታያል።
                          </p>
                        ) : null}
                      </div>
                      <StatusBadge tone={block.is_visible ? 'success' : 'neutral'}>{block.is_visible ? 'ግልጽ' : 'ተደብቋል'}</StatusBadge>
                      {writable ? (
                        <div className='flex flex-wrap items-center gap-1'>
                          <Button variant='ghost' size='icon' aria-label='ወደ ላይ ሐዲስ' disabled={busy || index === 0} onClick={() => void persistOrder(moveUp(blocks, index))}>
                            <ArrowUp className='h-4 w-4' aria-hidden />
                          </Button>
                          <Button variant='ghost' size='icon' aria-label='ወደ ታች' disabled={busy || index === blocks.length - 1} onClick={() => void persistOrder(moveDown(blocks, index))}>
                            <ArrowDown className='h-4 w-4' aria-hidden />
                          </Button>
                          <Button variant='outline' size='sm' disabled={busy} icon={block.is_visible ? <EyeOff className='h-4 w-4' aria-hidden /> : <Eye className='h-4 w-4' aria-hidden />} onClick={() => void toggleVisible(block)}>
                            {block.is_visible ? 'አዳብቅ' : 'አሳይ'}
                          </Button>
                          <Button variant='ghost' size='sm' onClick={() => openBlock(block)}>
                            {UI.edit}
                          </Button>
                          {can(pageBlocksResource.remove ?? 'website.write') ? (
                            <Button variant='ghost' size='sm' icon={<Trash2 className='h-4 w-4' aria-hidden />} onClick={() => setConfirmDelete(block)}>
                              {UI.delete}
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </CardBody>
                  </Card>
                </li>
              );
            })}
          </ol>
        )
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>እንዴት እንደሚሠራ</CardTitle>
        </CardHeader>
        <CardBody className='space-y-2 text-sm text-muted-foreground'>
          <p>ክፍሉ ሲደበቅ (<code>is_visible = false</code>) በድረ ገጹ ላይ አይታይም። <code>page_blocks</code> የራሱ የሆነ የሁኔታ (<code>state</code>) ዓምድ ስለሌለው “አውቅ/አዳብቅ” ማለት ይህን ዓምድ መቀየር ብቻ ነው፤ ገጹ ግን በ<code>pages.state</code> ላይ በተመሠረተው የይዘት ዝዓጉል (workflow) መሠረት ይቆጠራል — ስለዚህ ገጹ ወደ <code>published</code> ሳይደርስ ክፍሎቹ ብቻውን አይታዩም።</p>
          <p>ድርድሩ በ <code>sort_order</code> ዓምድ (10፣ 20፣ 30…) በቀጥታ ይቀመጣል፤ በዳታቤዙ ውስጥ ክፍሎችን የሚያዛውር (reorder/move) RPC ስለሌለ ሁለቱ ተጎራባች ድርድሮች ማቀያየር ነው።</p>
        </CardBody>
      </Card>

      <Modal
        open={open}
        onOpenChange={(next) => {
          if (!next) setOpen(false);
        }}
        size="xl"
        title={editingId ? `${UI.edit}: ${rowLabel(pageBlocksResource, blocks.find((b) => b.id === editingId) ?? ({} as Row<'page_blocks'>))}` : `${UI.add} የገጽ ክፍል`}
        description="እዚህ የሚቀመጡ ርዕስ፣ ጽሑፍና ቅንብር በድረ ገጹ ላይ በዚሁ መልክ ይታያሉ።"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {UI.cancel}
            </Button>
            <Button onClick={() => void saveBlock()} loading={busy}>
              {UI.save}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            {COLUMN_FIELDS.map((field) => (
              <Field
                key={field.key}
                label={field.label}
                htmlFor={`bf-${field.key}`}
                required={field.required}
                error={issues[field.key]}
                hint={field.help}
                className={field.kind === 'rich' || field.kind === 'textarea' ? 'sm:col-span-2' : undefined}
              >
                <BlockControl
                  field={field}
                  value={values[field.key]}
                  options={field.key === 'block_type' ? BLOCK_OPTIONS : field.key === 'media_id' ? mediaChoices : undefined}
                  onChange={(next) => {
                    if (field.key === 'block_type') chooseType(String(next));
                    else setValues((prev) => ({ ...prev, [field.key]: next }));
                  }}
                />
              </Field>
            ))}
          </div>

          {spec?.hint ? <p className="text-xs text-muted-foreground">{spec.hint}</p> : null}

          {spec?.settings?.length ? (
            <div className="rounded-lg border border-border p-4">
              <p className="mb-3 font-display text-sm font-semibold">የዓይነቱ ቅንብር — {BLOCK_LABEL[spec.type] ?? spec.type}</p>
              <div className="grid gap-4 sm:grid-cols-2">
                {spec.settings.map((field) => (
                  <Field key={field.key} label={field.label} htmlFor={`bs-${field.key}`} required={field.required} error={issues[`settings.${field.key}`]} hint={field.help} className={field.kind === 'textarea' ? 'sm:col-span-2' : undefined}>
                    <BlockControl
                      field={field}
                      value={settingsText[field.key] ?? ''}
                      onChange={(next) => setSettingsText((prev) => ({ ...prev, [field.key]: textOf(next) }))}
                    />
                  </Field>
                ))}
              </div>
            </div>
          ) : null}

          {spec?.items ? (
            <Field label={spec.items.label} htmlFor="bs-items" error={issues.items} hint={spec.items.help}>
              <Textarea id="bs-items" rows={7} value={itemsText} onChange={(e) => setItemsText(e.target.value)} className="font-mono text-xs" />
            </Field>
          ) : null}

          {!spec && textOf(values.block_type) ? (
            <Field label="ቅንብር (JSON)" htmlFor="bs-raw" hint="የተመረጠው ዓይነት ሐዱስ ቅንብር ስላልፈልግ ባዶ ሊቆይ ይችላል።">
              <Input id="bs-raw" value={textOf(values.settings)} disabled />
            </Field>
          ) : null}
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDelete !== null}
        busy={busy}
        destructive
        title={`${UI.delete}: ${confirmDelete ? rowLabel(pageBlocksResource, confirmDelete) : ''}`}
        description="ክፍሉ ከዳታቤዱ ይሰረዛል፤ መልሶ ማምጣት አይቻልም።"
        confirmLabel={UI.delete}
        onConfirm={() => confirmDelete && void removeBlock(confirmDelete)}
        onOpenChange={(next) => {
          if (!next) setConfirmDelete(null);
        }}
      />
    </div>
  );
}

/** The engine's controls, driven by a field descriptor instead of a whole resource. */
function BlockControl({
  field,
  value,
  options,
  id,
  scope = 'website',
  onChange,
}: {
  field: FieldLike;
  value: unknown;
  options?: readonly Option[];
  id?: string;
  scope?: string;
  onChange: (next: unknown) => void;
}) {
  const controlId = id ?? `bf-${field.key}`;

  if (field.kind === 'checkbox') {
    return (
      <div className="flex items-center gap-3 py-1">
        <Switch id={controlId} checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
        <label htmlFor={controlId} className="text-sm">
          {field.label}
        </label>
      </div>
    );
  }

  if (field.kind === 'textarea' || field.kind === 'rich' || field.kind === 'json') {
    return <Textarea id={controlId} rows={field.kind === 'json' ? 6 : field.kind === 'rich' ? 8 : 3} value={textOf(value)} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />;
  }

  if (field.kind === 'image' || field.kind === 'media') {
    return (
      <MediaUpload
        value={textOf(value)}
        fieldLabel={field.label}
        scope={scope}
        required={field.required}
        onChange={(next) => onChange(next)}
      />
    );
  }

  if (field.kind === 'select') {
    return <Select id={controlId} value={textOf(value)} options={options ?? field.options ?? []} placeholder={field.required ? '— ይምረጡ —' : '— አለ —'} onChange={(e) => onChange(e.target.value)} />;
  }

  const type = field.kind === 'number' || field.kind === 'money' || field.kind === 'percent' ? 'number' : field.kind === 'email' ? 'email' : field.kind === 'time' ? 'time' : field.kind === 'url' ? 'url' : 'text';

  return (
    <Input
      id={controlId}
      type={type}
      value={textOf(value)}
      placeholder={field.placeholder}
      min={field.min}
      max={field.max}
      maxLength={field.maxLength}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** The engine's `json` field rule, with the extra promise the site needs: an array. */
function fieldItems(spec: BlockSpec | null, raw: string): { value: unknown[]; error?: string } {
  const parsed = fieldJson({ key: 'items', label: spec?.items?.label ?? 'ዝርዝር ንጥሎች', kind: 'json' }, raw);
  if (parsed.error) return { value: [], error: parsed.error };
  const value = parsed.value;
  if (value === null || value === undefined || value === '') return { value: [] };
  if (!Array.isArray(value)) return { value: [], error: `${spec?.items?.label ?? 'ዝርዝሩ'} በዝርዝር (array) መልክ መሆን አለበት` };
  return { value };
}

function fieldJson(field: FieldLike, raw: string): { value: unknown; error?: string } {
  const result = fieldSchema(field).safeParse(raw);
  if (!result.success) return { value: null, error: firstIssue(result.error) };
  return { value: result.data };
}

function nextOrder(blocks: readonly Row<'page_blocks'>[]): number {
  return blocks.reduce((max, b) => Math.max(max, b.sort_order), 0) + 10;
}

function moveUp(blocks: Row<'page_blocks'>[], index: number): Row<'page_blocks'>[] {
  const next = [...blocks];
  const [row] = next.splice(index, 1);
  if (!row) return blocks;
  next.splice(Math.max(0, index - 1), 0, row);
  return next;
}

function moveDown(blocks: Row<'page_blocks'>[], index: number): Row<'page_blocks'>[] {
  const next = [...blocks];
  const [row] = next.splice(index, 1);
  if (!row) return blocks;
  next.splice(Math.min(next.length, index + 1), 0, row);
  return next;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2 · የፍለጋ ቅንብር — site settings, per-row seo and the sitemap
// ─────────────────────────────────────────────────────────────────────────────

/** What `src/site/Seo.tsx` writes for one page: title · brand, then the description. */
const TITLE_LIMIT = 60;
const DESCRIPTION_LIMIT = 160;

type SeoTarget = {
  table: 'pages' | 'news' | 'events';
  id: string;
  slug: string;
  titleAm: string;
  state: string;
  seo: Rec;
  excerpt: string;
  path: string;
};

type SitemapEntry = { path: string; lastmod?: string | null };

function xmlEscape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Real rows only: nothing here comes from a hard-coded page list. */
function buildSitemap(origin: string, entries: SitemapEntry[]): string {
  const body = entries
    .filter((entry) => entry.path)
    .map((entry) => {
      const lastmod = entry.lastmod ? new Date(entry.lastmod) : null;
      const stamp = lastmod && !Number.isNaN(lastmod.getTime()) ? lastmod.toISOString().slice(0, 10) : '';
      return `  <url>\n    <loc>${xmlEscape(`${origin}${entry.path}`)}</loc>${stamp ? `\n    <lastmod>${stamp}</lastmod>` : ''}\n  </url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

/** Opens the generated XML in a new tab through a blob URL, so it can be read
 *  in the browser before it is uploaded next to the site. */
function openText(text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  window.open(url, '_blank', 'noopener');
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function selectOptionsFrom(raw: unknown): Option[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    if (typeof entry === 'string' || typeof entry === 'number') return { value: String(entry), label: String(entry) };
    const record = asRecord(entry);
    const value = textOf(record.value ?? record.key ?? record.id);
    return { value, label: textOf(record.label ?? record.label_am) || value };
  });
}

/** `site_settings.value_type` mapped onto a field kind the engine already knows. */
function settingField(row: Row<'site_settings'>): FieldLike {
  const base = { key: row.key, label: row.label_am, help: row.hint_am ?? undefined };
  switch (row.value_type) {
    case 'number':
      return { ...base, kind: 'number' };
    case 'boolean':
      return { ...base, kind: 'checkbox' };
    case 'select':
      return { ...base, kind: 'select', options: selectOptionsFrom(row.options) };
    case 'json':
      return { ...base, kind: 'json' };
    case 'text':
      return { ...base, kind: 'textarea' };
    case 'url':
      return { ...base, kind: 'url' };
    default:
      return { ...base, kind: 'text' };
  }
}

/** A `site_settings.value` (jsonb) in the shape the engine's control expects:
 *  booleans stay booleans, objects and arrays are edited as JSON text. */
function settingDisplay(row: Row<'site_settings'>): unknown {
  if (row.value_type === 'boolean') return Boolean(row.value);
  if (row.value_type === 'json') return JSON.stringify(row.value ?? null, null, 2);
  return textOf(row.value);
}

function SerpPreview({ title, brand, description, path }: { title: string; brand: string; description: string; path: string }) {
  const full = title ? `${title} · ${brand}` : brand;
  return (
    <div className="space-y-1.5 rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-emerald-800 dark:text-emerald-300">{publicUrl(path)}</p>
      <p className="font-display text-base text-blue-800 dark:text-blue-300">{truncate(full, TITLE_LIMIT)}</p>
      <p className="text-sm text-muted-foreground">{description ? truncate(description, DESCRIPTION_LIMIT) : 'የመግለጽ ሐዋሳ ሳይሞላ ፍለጋው የገጹን የመጀመሪያ ሐዋሳ ይወስዳል።'}</p>
      <div className="flex flex-wrap gap-3 pt-1 text-xs">
        <span className={full.length > TITLE_LIMIT ? 'font-medium text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}>
          ርዕስ {full.length}/{TITLE_LIMIT}
        </span>
        <span className={description.length > DESCRIPTION_LIMIT ? 'font-medium text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}>
          መግለጫ {description.length}/{DESCRIPTION_LIMIT}
        </span>
      </div>
    </div>
  );
}

export function SiteSeoScreen() {
  const { identity, can } = useAuth();
  const [settings, setSettings] = useState<Row<'site_settings'>[]>([]);
  const [pages, setPages] = useState<Row<'pages'>[]>([]);
  const [news, setNews] = useState<Row<'news'>[]>([]);
  const [events, setEvents] = useState<Row<'events'>[]>([]);
  const [published, setPublished] = useState<{ pages: Row<'pages'>[]; news: ViewRow<'v_public_news'>[]; events: ViewRow<'v_public_events'>[]; albums: ViewRow<'v_public_albums'>[] }>({
    pages: [],
    news: [],
    events: [],
    albums: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('pages');
  const [draft, setDraft] = useState<SeoTarget | null>(null);
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!identity || !isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [settingRows, pageRows] = await Promise.all([
        listRows(supabase.from('site_settings').select('*').order('sort_order').limit(300)),
        listRows(supabase.from('pages').select('*').order('slug').limit(300)),
      ]);
      setSettings(settingRows);
      setPages(pageRows);

      const reads: Promise<void>[] = [];
      if (can('news.read'))
        reads.push(
          listRows(supabase.from('news').select('*').order('created_at', { ascending: false }).limit(120)).then((rows) => {
            setNews(rows);
          })
        );
      if (can('events.read'))
        reads.push(
          listRows(supabase.from('events').select('*').order('starts_at', { ascending: false }).limit(120)).then((rows) => {
            setEvents(rows);
          })
        );

      const [publishedPages, publishedNews, publishedEvents, publishedAlbums] = await Promise.all([
        fetchRows<Row<'pages'>>('pages', { eq: ['state', 'published'], limit: 200 }),
        fetchRows<ViewRow<'v_public_news'>>('v_public_news', { order: 'published_at', limit: 300 }),
        fetchRows<ViewRow<'v_public_events'>>('v_public_events', { order: 'starts_at', limit: 300 }),
        fetchRows<ViewRow<'v_public_albums'>>('v_public_albums', { order: 'published_at', limit: 200 }),
      ]);
      setPublished({ pages: publishedPages, news: publishedNews, events: publishedEvents, albums: publishedAlbums });
      await Promise.all(reads);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [identity, can]);

  useEffect(() => {
    void load();
  }, [load]);

  const settingValues = useMemo(() => Object.fromEntries(settings.map((row) => [row.key, textOf(row.value)])), [settings]);
  const brand = settingValues['site_title_am'] || settingValues['sunday_school_name_am'] || env.appName;
  const seoGroup = useMemo(() => settings.filter((row) => row.group_name === 'seo'), [settings]);
  const settingsWritable = can('website.write');

  const targets = useMemo<SeoTarget[]>(() => {
    const fromPages: SeoTarget[] = pages.map((row) => ({
      table: 'pages',
      id: row.id,
      slug: row.slug,
      titleAm: row.title_am,
      state: row.state,
      seo: asRecord(row.seo),
      excerpt: row.excerpt_am ?? '',
      path: row.slug === HOME_SLUG ? '/' : `/page/${row.slug}`,
    }));
    const fromNews: SeoTarget[] = news.map((row) => ({
      table: 'news',
      id: row.id,
      slug: row.slug,
      titleAm: row.title_am,
      state: row.state,
      seo: asRecord(row.seo),
      excerpt: row.summary_am ?? '',
      path: `/news/${row.slug}`,
    }));
    const fromEvents: SeoTarget[] = events.map((row) => ({
      table: 'events',
      id: row.id,
      slug: row.slug,
      titleAm: row.title_am,
      state: row.state,
      seo: asRecord(row.seo),
      excerpt: row.summary_am ?? '',
      path: `/events/${row.slug}`,
    }));
    return [...fromPages, ...fromNews, ...fromEvents];
  }, [pages, news, events]);

  const sitemapEntries = useMemo<SitemapEntry[]>(() => {
    const entries: SitemapEntry[] = [];
    for (const row of published.pages) entries.push({ path: row.slug === HOME_SLUG ? '/' : `/page/${row.slug}`, lastmod: row.published_at ?? row.updated_at });
    for (const row of published.news) if (row.slug) entries.push({ path: `/news/${row.slug}`, lastmod: row.published_at ?? null });
    for (const row of published.events) if (row.slug) entries.push({ path: `/events/${row.slug}`, lastmod: null });
    for (const row of published.albums) if (row.slug) entries.push({ path: `/gallery/${row.slug}`, lastmod: row.published_at ?? null });
    const seen = new Set<string>();
    return entries.filter((entry) => (seen.has(entry.path) ? false : (seen.add(entry.path), true)));
  }, [published]);

  const origin = useMemo(() => publicUrl('/').replace(/\/$/, ''), []);
  const sitemapXml = useMemo(() => buildSitemap(origin, sitemapEntries), [origin, sitemapEntries]);

  async function saveSetting(row: Row<'site_settings'>, raw: unknown) {
    setBusy(true);
    try {
      // The engine's json rule keeps an unparseable string as text, which would
      // silently corrupt a jsonb setting — so the JSON types are parsed first.
      let candidate: unknown = raw;
      if (row.value_type === 'json' && typeof raw === 'string' && raw.trim() !== '') {
        try {
          candidate = JSON.parse(raw);
        } catch {
          toast.error(`${row.label_am} በትክክለኛ JSON መልክ መሆን አለበት`);
          return;
        }
      }
      const parsed = fieldSchema(settingField(row)).safeParse(candidate);
      if (!parsed.success) {
        toast.error(firstIssue(parsed.error));
        return;
      }
      const value = row.value_type === 'boolean' ? Boolean(parsed.data) : parsed.data ?? null;
      const { error: updateError } = await supabase
        .from('site_settings')
        .update({ value: value as never, updated_at: new Date().toISOString() } as never)
        .eq('key', row.key);
      if (updateError) throw new Error(friendlyError(updateError));
      toast.success(`${row.label_am} ${UI.saved}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : UI.serverError);
    } finally {
      setBusy(false);
    }
  }

  async function saveVisibility(row: Row<'site_settings'>) {
    setBusy(true);
    try {
      const { error: updateError } = await supabase
        .from('site_settings')
        .update({ is_public: !row.is_public, updated_at: new Date().toISOString() } as never)
        .eq('key', row.key);
      if (updateError) throw new Error(friendlyError(updateError));
      toast.success(row.is_public ? 'ከድረ ገጹ ተደብቋል' : 'ለድረ ገጹ ግልጽ ሆኗል');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : UI.serverError);
    } finally {
      setBusy(false);
    }
  }

  function openDraft(target: SeoTarget) {
    setDraft(target);
    setDraftValues({
      title_am: textOf(target.seo.title_am),
      description_am: textOf(target.seo.description_am),
      image_url: textOf(target.seo.image_url),
      excerpt: target.excerpt,
    });
  }

  async function saveDraft() {
    if (!draft) return;
    setBusy(true);
    try {
      const seo: Rec = { ...draft.seo };
      for (const key of ['title_am', 'description_am', 'image_url'] as const) {
        const value = (draftValues[key] ?? '').trim();
        if (value) seo[key] = value;
        else delete seo[key];
      }
      const payload: Rec = { seo };
      if (draft.table === 'pages') payload.excerpt_am = (draftValues.excerpt ?? '').trim();

      let updateError: { message: string; code?: string } | null = null;
      if (draft.table === 'pages') ({ error: updateError } = await supabase.from('pages').update(payload as never).eq('id', draft.id));
      else if (draft.table === 'news') ({ error: updateError } = await supabase.from('news').update(payload as never).eq('id', draft.id));
      else ({ error: updateError } = await supabase.from('events').update(payload as never).eq('id', draft.id));
      if (updateError) throw new Error(friendlyError(updateError));

      toast.success(UI.saved);
      setDraft(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : UI.serverError);
    } finally {
      setBusy(false);
    }
  }

  if (!isSupabaseConfigured) return <ConfigNote />;

  const tabItems = [
    { value: 'pages', label: 'ገጾች', count: pages.length },
    ...(news.length ? [{ value: 'news', label: 'ዜናዎች', count: news.length }] : []),
    ...(events.length ? [{ value: 'events', label: 'ፕሮግራሞች', count: events.length }] : []),
  ];
  const shown = targets.filter((target) => target.table === tab);

  const columns: Column<SeoTarget>[] = [
    { key: 'titleAm', header: 'ርዕስ', sortable: true, cell: (row) => <span className="font-medium">{row.titleAm}</span> },
    { key: 'path', header: 'አድራሻ', hideBelow: 'sm', cell: (row) => <code className="text-xs">{row.path}</code> },
    { key: 'state', header: 'ሁኔታ', hideBelow: 'md', cell: (row) => stateBadge(row.state) },
    { key: 'seoTitle', header: 'የ SEO ርዕስ', hideBelow: 'md', cell: (row) => textOf(row.seo.title_am) || <span className="text-muted-foreground">ከርዕሱ ይወሰዳል</span> },
    { key: 'seoDescription', header: 'መግለጫ', hideBelow: 'lg', cell: (row) => truncate(textOf(row.seo.description_am) || row.excerpt, 90) || <span className="text-muted-foreground">—</span> },
    {
      key: '__actions',
      header: UI.actions,
      sortable: false,
      cell: (row) => {
        const allowed = row.table === 'pages' ? can('website.write') : row.table === 'news' ? can('news.write') : can('events.write');
        return allowed ? (
          <div className="flex flex-wrap items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => openDraft(row)}>
              {UI.edit}
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to={row.path}>ነብ</Link>
            </Button>
          </div>
        ) : null;
      },
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeading
        title="የፍለጋ ቅንብር (SEO)"
        description="የድረ ገጹ ርዕስና መግለጫ በእያንዳንዱ ገጽ፣ በእያንዳንዱ ዜናና ፕሮግራም ረድፍ ላይ ይቀመጣል፤ ሳይትማፑ ወጥቶ ካሉ ረድፎች ብቻ ይሠራል።"
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => void load()} icon={<RefreshCw className="h-4 w-4" />} disabled={busy}>
              እንደገና
            </Button>
            <Button variant="outline" size="sm" disabled={sitemapEntries.length === 0} onClick={() => openText(sitemapXml, 'application/xml')} icon={<ExternalLink className="h-4 w-4" />}>
              ሳይትማፕ ክፈት
            </Button>
            <Button size="sm" disabled={sitemapEntries.length === 0} onClick={() => downloadTextFile('sitemap.xml', sitemapXml, 'application/xml;charset=utf-8')} icon={<Download className="h-4 w-4" />}>
              sitemap.xml አውርድ
            </Button>
          </>
        }
      />

      {error ? <ErrorNote message={error} onRetry={() => void load()} /> : null}
      {loading ? <Spinner label="ቅንብሮች በመጫን ላይ…" /> : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>አጠቃላይ የመድረክ ቅንብር — <code className="text-sm">site_settings</code></CardTitle>
          </CardHeader>
          <CardBody>
            {!settingsWritable ? <p className="mb-3 text-sm text-muted-foreground">የመቅመጥ መብት ስለሌለዎት ማንበብ ብቻ ይችላሉ።</p> : null}
            {seoGroup.length === 0 && !loading ? (
              <EmptyState title="የ “seo” ቡድን ቅንብር የለም" description="በአጠቃላይ ቅንብሮች ገጽ ላይ አዲስ ቅንብር ሲፈጠር group_name = seo ብለው ያስመልክጡ።" action={<Button variant="outline" size="sm" asChild><Link to="/erp/system/settings">አጠቃላይ ቅንብሮች</Link></Button>} />
            ) : (
              <ul className="space-y-4">
                {seoGroup.map((row) => {
                  const field = settingField(row);
                  return (
                    <li key={row.key} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                      <Field label={row.label_am} htmlFor={`seo-setting-${row.key}`} hint={`${row.key} — በድረ ገጹ <head> ውስጥ ይጻፋል።${row.hint_am ? ` ${row.hint_am}` : ''}`}>
                        {settingsWritable ? (
                          <BlockControl field={field} id={`seo-setting-${row.key}`} value={settingDisplay(row)} onChange={(next) => void saveSetting(row, next)} />
                        ) : (
                          <Input id={`seo-setting-${row.key}`} value={textOf(settingDisplay(row))} readOnly disabled aria-label={row.label_am} />
                        )}
                      </Field>
                      <div className="flex items-center gap-2 pb-1">
                        <Switch
                          id={`seo-public-${row.key}`}
                          checked={row.is_public}
                          disabled={!settingsWritable || busy}
                          onChange={() => void saveVisibility(row)}
                          aria-label={`${row.label_am} ለድረ ገጹ ግልጽ`}
                        />
                        <label htmlFor={`seo-public-${row.key}`} className="text-xs text-muted-foreground">
                          {row.is_public ? 'ለድረ ገጹ ግልጽ' : 'ለድረ ገጹ ደብቋል'}
                        </label>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>የፍለጋ ውጤት ቅድመ እይታ</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            <SerpPreview title="" brand={brand} description={settingValues['site_description_am'] ?? ''} path="/" />
            <p className="text-xs text-muted-foreground">
              እያንዳንዱ ገጽ የራሱ ቅድመ እይታ ያለው ሲሆን ከረድፉ <code>seo</code> (jsonb) ዓምድ ብቻ ይገነባል። <code>Seo.tsx</code> ርዕሱን “ርዕስ · {brand}” አድርጎ ስለሚጽፍ አጭር ርዕስ ይምረጡ።
            </p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>በገጽ ደረጃ የሚቀመጥ SEO</CardTitle>
        </CardHeader>
        <CardBody>
          {tabItems.length === 0 && !loading ? (
            <EmptyState title="የ SEO ዓምድ ያላቸው ሰንጠረዦች የሉም" description="ገጾች፣ ዜናዎችና ፕሮግራሞች በዚህ ገጽ ይዘጋጃሉ።" />
          ) : (
            <Tabs items={tabItems} value={tab} onValueChange={setTab}>
              {tabItems.map((item) => (
                <TabPanel key={item.value} value={item.value}>
                  <DataTable
                    rows={shown}
                    columns={columns}
                    rowKey={(row) => `${row.table}:${row.id}`}
                    loading={loading}
                    error={null}
                    pageSize={15}
                    emptyTitle={item.value === 'pages' ? 'ምንም ገጽ የለም' : `የ ${item.label} ዝርዝር አልተገኘም`}
                    emptyDescription={
                      item.value === 'pages'
                        ? 'በ “ገጾች” ገጽ ላይ ይፍጠሩ።'
                        : item.value === 'news'
                          ? can('news.read')
                            ? 'ምንም ዜና የለም።'
                            : 'የዜና ማንበብ መብት የላይኝም።'
                          : can('events.read')
                            ? 'ምንም ፕሮግራም የለም።'
                            : 'የፕሮግራም ማንበብ መብት የላይኝም።'
                    }
                    caption={`የ ${item.label} SEO ዝርዝር`}
                  />
                </TabPanel>
              ))}
            </Tabs>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ሳይትማፕ — ወጥቶ ካሉ ረድፎች ብቻ</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          {sitemapEntries.length === 0 && !loading ? (
            <ErrorNote message="አሁን ለሳይትማፕ የሚበቃ ወጥቶ የለም፤ በማጽደቅ ወረታው (pending) ላይ ያሉ ዝርዝሮችን አውጥተው ይሞክሩ።" />
          ) : (
            <ul className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <li className="rounded-md border border-border px-3 py-2">ገጾች (published)<strong className="ms-2 font-display">{published.pages.length}</strong></li>
              <li className="rounded-md border border-border px-3 py-2">ዜናዎች (v_public_news)<strong className="ms-2 font-display">{published.news.length}</strong></li>
              <li className="rounded-md border border-border px-3 py-2">ፕሮግራሞች (v_public_events)<strong className="ms-2 font-display">{published.events.length}</strong></li>
              <li className="rounded-md border border-border px-3 py-2">ፎቶ ማህደሮች (v_public_albums)<strong className="ms-2 font-display">{published.albums.length}</strong></li>
            </ul>
          )}
          <Accordion
            items={[
              {
                value: 'xml',
                title: `የተሠራው ኤክስኤምኤል (${sitemapEntries.length} አድራሻዎች)`,
                content: <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs leading-relaxed">{sitemapXml}</pre>,
              },
            ]}
          />
          <p className="text-xs text-muted-foreground">
            በዳታቤዙ ውስጥ ሳይትማፕ የሚሰጥ ማስገበሪያ (RPC) ስለሌለ ኤክስኤምኤሉ በአሳሽው ከእነዚህ ወጥተው ካሉ ረድፎች ብቻ ይሠራል፤ አድራሻዎቹ በ <code>{origin}</code> ላይ የተመሠረሱ ሙሉ አድራሻዎች ናቸው።
          </p>
        </CardBody>
      </Card>

      <Modal
        open={draft !== null}
        onOpenChange={(next) => {
          if (!next) setDraft(null);
        }}
        size="lg"
        title={`${UI.edit} SEO — ${draft?.titleAm ?? ''}`}
        description="እነዚህ ቅንብሮች በረድፉ seo (jsonb) ዓምድ ውስጥ ይቀመጣሉ፤ ድረ ገጹ seo.title_am እና seo.description_am ብቻ ያነባል።"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              {UI.cancel}
            </Button>
            <Button onClick={() => void saveDraft()} loading={busy}>
              {UI.save}
            </Button>
          </>
        }
      >
        {draft ? (
          <div className="space-y-5">
            <Field label="የ SEO ርዕስ (seo.title_am)" htmlFor="seo-title" hint="ባዶ ከሆነ የገጹ ርዕስ ነው የሚወሰደው።">
              <Input id="seo-title" value={draftValues.title_am ?? ''} maxLength={180} onChange={(e) => setDraftValues((prev) => ({ ...prev, title_am: e.target.value }))} />
            </Field>
            <Field label="የ SEO መግለጫ (seo.description_am)" htmlFor="seo-desc" hint="ለፍለጋ ውጤት የሚታይ አጭር ሐዋሳ።">
              <Textarea id="seo-desc" rows={3} value={draftValues.description_am ?? ''} maxLength={300} onChange={(e) => setDraftValues((prev) => ({ ...prev, description_am: e.target.value }))} />
            </Field>
            {draft.table === 'pages' ? (
              <Field label="ማቅረብ ሐዋሳ (excerpt_am)" htmlFor="seo-excerpt" hint="መግለጫው ሲቀር ድረ ገጹ ይህን ይጠቀማል።">
                <Textarea id="seo-excerpt" rows={3} value={draftValues.excerpt ?? ''} maxLength={1000} onChange={(e) => setDraftValues((prev) => ({ ...prev, excerpt: e.target.value }))} />
              </Field>
            ) : null}
            <Field label="የማጋሪያ ሥዕል (seo.image_url)" htmlFor="seo-image" hint="የሚዲያ ማህደሩ ግልጽ አድራሻ፤ ከሚዲያ ማህደሩ ይምረጡ።">
              <Input id="seo-image" type="url" value={draftValues.image_url ?? ''} placeholder="https://…" onChange={(e) => setDraftValues((prev) => ({ ...prev, image_url: e.target.value }))} />
            </Field>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>የማጋሪያ ሥዕል አድራሻ ለማውጣት፦</span>
              <Button variant="outline" size="sm" asChild>
                <Link to="/erp/media/files">ሐቀፍና ድምጽ ማህደር</Link>
              </Button>
            </div>
            <SerpPreview
              title={draftValues.title_am ?? ''}
              brand={brand}
              description={(draftValues.description_am ?? '').trim() || draft.excerpt}
              path={draft.path}
            />
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3 · ማጽደቅ የሚጠብቁ — the workflow queue
// ─────────────────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  news: 'ዜናዎችና መሐል',
  event: 'ፕሮግራሞች',
  page: 'የድረ ገጽ ገጾች',
  sermon: 'ንብዕቶች',
  mezmur: 'መዝሙሮች',
  publication: 'ህትመቶች',
  album: 'ፎቶ ማህደሮች',
  announcement: 'ማስታወቂያዎች',
  faq: 'ተደጋጋሚ ጥያቄዎች',
  leader: 'መሪዎች',
  material: 'የትምህርት ንብረቶች',
};

/** Where each registry key is edited — the real ERP paths, not `content_types.portal_path`. */
const TYPE_ROUTES: Record<string, string> = {
  news: '/erp/website/news',
  event: '/erp/website/events',
  page: '/erp/website/pages',
  sermon: '/erp/website/sermons',
  mezmur: '/erp/website/mezmur',
  publication: '/erp/website/publications',
  album: '/erp/website/gallery',
  faq: '/erp/website/faqs',
  leader: '/erp/website/leadership',
  announcement: '/erp/communication/announcements',
  material: '/erp/academics/materials',
};

type ReadyRow = { type: string; id: string; label: string };

export function PendingWorkflowScreen() {
  const { identity, can } = useAuth();
  const [registry, setRegistry] = useState<Row<'content_types'>[]>([]);
  const [queue, setQueue] = useState<QueueRow[] | null>(null);
  const [ready, setReady] = useState<ReadyRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ type: string; id: string; decision: 'approve' | 'reject' | 'publish'; label: string; question: string; askNote?: string } | null>(null);
  const [note, setNote] = useState('');

  const metaByKey = useMemo(() => Object.fromEntries(registry.map((row) => [row.key, row])) as Record<string, Row<'content_types'>>, [registry]);

  /** Holds the grant the RPC itself demands — approve/reject need the type's approve_permission. */
  const mayDecide = useCallback(
    (type: string | null, submittedBy: string | null): { allowed: boolean; why: string } => {
      const meta = type ? metaByKey[type] : undefined;
      if (!meta) return { allowed: false, why: 'የይዘት ዐይነቱ በመዝገቡ (content_types) ውስጥ አልተገኘም' };
      const perm = asPermKey(meta.approve_permission);
      if (!perm) return { allowed: false, why: 'የማጽደቅ ፍቃዱ በዚህ መተግበሪያ አይታወቅም' };
      if (!can(perm)) return { allowed: false, why: `${perm} መብት የላይኝም` };
      if (identity && submittedBy === identity.userId) return { allowed: false, why: 'የራስዎ ማስገቢያ ስለሆነ ማጽደቅ ወይም ውድቅ ማድረግ አይችሉም' };
      return { allowed: true, why: '' };
    },
    [can, identity, metaByKey]
  );

  const holdsAnyWorkflow = useMemo(
    () =>
      registry.some((row) => {
        const approve = asPermKey(row.approve_permission);
        const submit = asPermKey(row.submit_permission);
        return (approve && can(approve)) || (submit && can(submit));
      }),
    [registry, can]
  );

  const load = useCallback(async () => {
    if (!identity || !isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await listRows(supabase.from('content_types').select('*').order('key'));
      setRegistry(rows);

      // The queue itself is one RPC; the "approved but not published" ladder is
      // read per content type from the registry, only where the person can publish.
      const approvals = await callFn('pending_approvals', { p_domain: 'content' });
      const readyLists = await Promise.all(
        rows
          .filter((meta) => {
            const submit = asPermKey(meta.submit_permission);
            return submit ? can(submit) : false;
          })
          .map(async (meta): Promise<ReadyRow[]> => {
            const columns = `id, ${meta.state_column}, ${meta.label_column}`;
            const found = await fetchRows<Rec>(meta.table_name, { select: columns, eq: [meta.state_column, 'approved'], limit: 60 });
            return found.map((row) => ({ type: meta.key, id: String(row.id ?? ''), label: textOf(row[meta.label_column]) || String(row.id ?? '') }));
          })
      );

      setQueue(approvals);
      setReady(readyLists.flat().filter((row) => row.id));
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [identity, can]);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<string, QueueRow[]>();
    for (const row of queue ?? []) {
      const key = row.content_type ?? '';
      const list = map.get(key);
      if (list) list.push(row);
      else map.set(key, [row]);
    }
    return [...map.entries()];
  }, [queue]);

  const readyGrouped = useMemo(() => {
    const map = new Map<string, ReadyRow[]>();
    for (const row of ready ?? []) {
      const list = map.get(row.type);
      if (list) list.push(row);
      else map.set(row.type, [row]);
    }
    return [...map.entries()];
  }, [ready]);

  async function runDecision() {
    if (!pending) return;
    const { type, id } = pending;
    if (!type || !id) {
      toast.error('የይዘት ዐይነቱ ወይም መለያው አልተገኘም');
      return;
    }
    setBusy(true);
    try {
      const args: Args<'decide_content'> = { p_type: type, p_id: id, p_decision: pending.decision };
      if (note.trim()) args.p_note = note.trim();
      await callFn('decide_content', args);
      toast.success(
        pending.decision === 'approve' ? 'ጸድቋል — ለማውጣት “አውቅ” ይጠቀሙ' : pending.decision === 'reject' ? 'ለአስተካካይ ተመልሷል' : 'በድረ ገጹ ላይ ወጥቷል'
      );
      setPending(null);
      setNote('');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : UI.serverError);
    } finally {
      setBusy(false);
    }
  }

  if (!isSupabaseConfigured) return <ConfigNote />;

  return (
    <div className="space-y-5">
      <PageHeading
        title="ማጽደቅ የሚጠብቁ"
        description="ለእርስዎ የሚጠብቁ ማጽደቂያዎች በይዘት ዓይነታቸው ተከፋፍለው ቀርበዋል፤ ውሳኔው በ decide_content ማስገበሪያ (RPC) በኩል ብቻ ያልፋል — ፍቃድ ከሌለዎት ቁልፉ አይታይም።"
        actions={
          <Button variant="ghost" size="sm" onClick={() => void load()} icon={<RefreshCw className="h-4 w-4" />} disabled={busy}>
            እንደገና
          </Button>
        }
      />

      {error ? <ErrorNote message={error} onRetry={() => void load()} /> : null}
      {loading ? <Spinner label="ዝርዝሩ በመጫን ላይ…" /> : null}

      {!loading && !holdsAnyWorkflow ? (
        <EmptyState
          title="የማጽደቅ ወይም የማውጣት መብት የላይኝም"
          description="ይህ ገጽ የሚከፈተው የይዘት ማጽደቅ (news.publish፣ website.publish፣ media.publish፣ …) ፍቃድ ለያዙ ኃላፊዎች ነው።"
          action={
            <Button variant="outline" size="sm" asChild>
              <Link to="/erp/dashboard">ወደ አጠቃላይ እይታ</Link>
            </Button>
          }
        />
      ) : null}

      {holdsAnyWorkflow ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{UI.pendingApprovals} — ለማጽደቅ የቀረቡ</CardTitle>
            </CardHeader>
            <CardBody className="space-y-6">
              {(queue ?? []).length === 0 && !loading ? (
                <EmptyState title="የሚጠብቅ ዝርዝር የለም" description="አዲስ ለማጽደቅ የቀረበ ነገር ሲኖር እዚህ ይታያል።" />
              ) : (
                grouped.map(([type, rows]) => (
                  <section key={type || 'unknown'} className="space-y-2">
                    <h3 className="flex items-center gap-2 font-display text-sm font-semibold">
                      {TYPE_LABELS[type] ?? (type || 'ያልታወቀ ዐይነት')}
                      <StatusBadge tone="info">{rows.length}</StatusBadge>
                    </h3>
                    <ul className="space-y-2">
                      {rows.map((row) => {
                        const decision = mayDecide(type, row.submitted_by);
                        return (
                          <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm">
                            <span className="min-w-0">
                              <span className="font-medium">{row.entity_label || row.entity_table}</span>
                              <span className="block text-xs text-muted-foreground">
                                {row.submitter_name || 'የማስገቢያ ስም የለም'} · {dateTimeAm(row.submitted_at)} · {relativeAm(row.submitted_at)}
                              </span>
                            </span>
                            <span className="flex flex-wrap items-center gap-1">
                              {TYPE_ROUTES[type] ? (
                                <Button variant="ghost" size="sm" asChild>
                                  <Link to={TYPE_ROUTES[type]!}>{UI.details}</Link>
                                </Button>
                              ) : null}
                              {decision.allowed ? (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      setPending({
                                        type,
                                        id: row.entity_id,
                                        decision: 'approve',
                                        label: `${UI.approve}: ${row.entity_label ?? row.entity_table}`,
                                        question: 'ጸድቋል ብለው ይረጋግጡ? ከጸደቀ በኋላ በ “አውቅ” ብቻ በድረ ገጹ ይወጣል።',
                                      })
                                    }
                                  >
                                    {UI.approve}
                                  </Button>
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() =>
                                      setPending({
                                        type,
                                        id: row.entity_id,
                                        decision: 'reject',
                                        label: `${UI.reject}: ${row.entity_label ?? row.entity_table}`,
                                        question: 'ለአስተካካይ መመለስ የሚሆነው ምክንያቱን ያስገቡ — በዚህ ረድፍ ላይ ባለው ማስታወሻ (review_notes) ዓምድ ይቀመጣል።',
                                        askNote: UI.reason,
                                      })
                                    }
                                  >
                                    {UI.reject}
                                  </Button>
                                </>
                              ) : (
                                <span className="text-xs text-muted-foreground" title={decision.why}>
                                  {decision.why}
                                </span>
                              )}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>የጸደቁ ሳይወጡ የቀሩ — ማውጣት የሚቻል</CardTitle>
            </CardHeader>
            <CardBody className="space-y-4">
              <p className="text-xs text-muted-foreground">
                ማውጣት (<code>decide_content</code> በ <code>publish</code> ውሳኔ ላይ) የይዘት ዓይነቱን <strong>submit_permission</strong> ይጠይቃል — ስለዚህ ማጽደቅ የሚችሉ ኃላፊዎች ሁሉ ለማውጣት አይፈቀድላቸውም።
              </p>
              {!loading && (ready ?? []).length === 0 ? (
                <EmptyState title="ለማውጣት የጸደቀ ነገር የለም" description="በማጽደቅ ወረታው የጸደቀ ዝርዝር ሲኖር እዚህ ይዘጋጃል።" />
              ) : (
                readyGrouped.map(([type, rows]) => (
                  <section key={type} className="space-y-2">
                    <h3 className="flex items-center gap-2 font-display text-sm font-semibold">
                      {TYPE_LABELS[type] ?? type}
                      <StatusBadge tone="success">{rows.length}</StatusBadge>
                    </h3>
                    <ul className="space-y-2">
                      {rows.map((row) => {
                        const perm = asPermKey(metaByKey[type]?.submit_permission);
                        const allowed = Boolean(perm && can(perm));
                        return (
                          <li key={`${type}:${row.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm">
                            <span className="min-w-0 font-medium">{row.label}</span>
                            <span className="flex flex-wrap items-center gap-1">
                              {TYPE_ROUTES[type] ? (
                                <Button variant="ghost" size="sm" asChild>
                                  <Link to={TYPE_ROUTES[type]!}>{UI.details}</Link>
                                </Button>
                              ) : null}
                              {allowed ? (
                                <Button
                                  size="sm"
                                  onClick={() =>
                                    setPending({
                                      type,
                                      id: row.id,
                                      decision: 'publish',
                                      label: `${UI.publish}: ${row.label}`,
                                      question: 'በድረ ገጹ ላይ ይወጣል? ግልጽ እይታዎቹ (v_public_*) ይህን ዝርዝር ያነባሉ።',
                                    })
                                  }
                                >
                                  {UI.publish}
                                </Button>
                              ) : (
                                <span className="text-xs text-muted-foreground">ለማውጣት {perm ?? 'የሌለ'} መብት ያስፈልጋል</span>
                              )}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))
              )}
            </CardBody>
          </Card>
        </>
      ) : null}

      <ConfirmDialog
        open={pending !== null}
        busy={busy}
        destructive={pending?.decision === 'reject'}
        title={pending?.label ?? ''}
        description={
          <>
            <p>{pending?.question ?? ''}</p>
            {pending?.askNote ? (
              <Field label={pending.askNote} htmlFor="decision-note" className="mt-3">
                <Textarea id="decision-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
            ) : null}
          </>
        }
        confirmLabel={UI.confirm}
        onConfirm={() => void runDecision()}
        onOpenChange={(next) => {
          if (!next) {
            setPending(null);
            setNote('');
          }
        }}
      />
    </div>
  );
}
