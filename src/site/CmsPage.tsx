// A CMS page: the row in `pages` plus the blocks the editor arranged under it.
//
// `/about`, `/history`, `/sunday-school` and every other page the office creates
// render through here. A page row carries the title, the excerpt and the seo
// fields; the words themselves are blocks, so a page with no blocks yet is shown
// as what it is — a heading waiting for content — instead of a broken layout.
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { EmptyState, ErrorNote, Spinner } from '@/components/ui/surface';
import { fetchRows } from '@/lib/supabase';
import type { PageBlocksRow, PagesRow } from '@/types/database';
import { dateAm } from '@/lib/format';

import { BlockList } from './blocks';
import { PageHeader } from './common';
import { Seo } from './Seo';
import { useAsyncData, useRow } from './data';

export function useCmsPage(slug: string | undefined) {
  const page = useRow<PagesRow>('pages', { eq: ['slug', slug ?? ''] }, `page:${slug ?? ''}`);
  const pageId = page.data?.id;
  const blocks = useAsyncData<PageBlocksRow[]>(
    () => (pageId ? fetchRows<PageBlocksRow>('page_blocks', { eq: ['page_id', pageId], order: 'sort_order', ascending: true }) : Promise.resolve([])),
    [pageId]
  );
  return { page, blocks: blocks.data ?? [], blocksLoading: blocks.loading };
}

export function CmsPage({
  slug,
  fallbackTitle,
  fallbackBody,
}: {
  slug: string;
  fallbackTitle?: string;
  fallbackBody?: string;
}) {
  const { page, blocks, blocksLoading } = useCmsPage(slug);
  const row = page.data;
  const seo = (row?.seo ?? {}) as { title_am?: string; description_am?: string };
  const title = row?.title_am ?? fallbackTitle ?? slug;
  const description = row?.excerpt_am ?? seo.description_am ?? fallbackBody ?? '';

  if (page.loading) {
    return (
      <div className="site-section py-20">
        <Spinner />
      </div>
    );
  }

  // A page nobody has written yet is not an error — say so and point at the office.
  if (!row) {
    return (
      <>
        <Seo title={title} description={fallbackBody} />
        <PageHeader title={title} description={fallbackBody} />
        <div className="site-section py-12">
          {page.error ? <ErrorNote message={page.error} onRetry={page.reload} /> : null}
          <EmptyState
            title="ይገባኛል!"
            description={fallbackBody || 'ይህ ገጽ ገና በአስተዳደሩ ክፍል አልተጻፈም።'}
            action={
              <Button asChild variant="outline">
                <Link to="/contact">አክስጩ</Link>
              </Button>
            }
          />
        </div>
      </>
    );
  }

  return (
    <>
      <Seo title={seo.title_am || row.title_am} description={description} />
      <PageHeader title={row.title_am} description={description} eyebrow="ከድረ ገጱ">
        {row.published_at ? <span className="text-xs text-muted-foreground">የታተመችበት ቀን፦ {dateAm(row.published_at)}</span> : null}
      </PageHeader>
      {blocks.length > 0 ? (
        <BlockList blocks={blocks} />
      ) : blocksLoading ? (
        <div className="site-section py-12">
          <Spinner />
        </div>
      ) : (
        <article className="site-section max-w-3xl py-12">
          <EmptyState title="ይህ ገጽ ዝርዝር ገና የለውም" description="አርዕስቡና መግለጫው ቀርተዋል፤ ክፍሎቹ (ብሎኮቹ) በአስተዳደሩ ይጨምራሉ።" />
        </article>
      )}
    </>
  );
}
