// The list every ERP module is built from.
//
// By default it sorts and paginates the rows it is given. A screen that pages
// the database instead passes `page`, `pageCount` and `onPageChange`, and the
// table stops slicing — the same component, one difference in who counts.
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, ChevronUp } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';

import { Button } from './button';
import { EmptyState, ErrorNote, Spinner } from './surface';
import { cn } from '@/lib/utils';

export type SortDirection = 'asc' | 'desc';

export type Column<T> = {
  key: string;
  header: ReactNode;
  /** Cell renderer; falls back to the raw value. */
  cell?: (row: T) => ReactNode;
  /** Comparable value for sorting and searching. */
  value?: (row: T) => string | number | null | undefined;
  sortable?: boolean;
  align?: 'start' | 'center' | 'end';
  className?: string;
  /** Column text is hidden under this breakpoint — for dense ERP lists on phones. */
  hideBelow?: 'sm' | 'md' | 'lg';
};

export type DataTableProps<T> = {
  rows: readonly T[];
  columns: readonly Column<T>[];
  rowKey: (row: T, index: number) => string | number;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyTitle?: ReactNode;
  emptyDescription?: ReactNode;
  onRowClick?: (row: T) => void;
  pageSize?: number;
  /** Server paging: pass the current page and its total count. */
  page?: number;
  pageCount?: number;
  onPageChange?: (page: number) => void;
  toolbar?: ReactNode;
  caption?: string;
  className?: string;
};

const ALIGN = { start: 'text-start', center: 'text-center', end: 'text-end' } as const;
const HIDE = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell' } as const;

function cellValue<T>(column: Column<T>, row: T): string | number | null | undefined {
  return column.value ? column.value(row) : (row as Record<string, unknown>)[column.key] as string | number | null | undefined;
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  loading = false,
  error = null,
  onRetry,
  emptyTitle = 'ምንም መረጃ የለም',
  emptyDescription,
  onRowClick,
  pageSize = 25,
  page,
  pageCount,
  onPageChange,
  toolbar,
  caption,
  className,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<{ key: string; direction: SortDirection } | null>(null);
  const [clientPage, setClientPage] = useState(0);
  const serverPaged = typeof onPageChange === 'function';

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((c) => c.key === sort.key);
    if (!column) return rows;
    const factor = sort.direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = cellValue(column, a);
      const bv = cellValue(column, b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * factor;
      return String(av).localeCompare(String(bv), 'am') * factor;
    });
  }, [rows, columns, sort]);

  const totalClientPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const visible = serverPaged ? sorted : sorted.slice(clientPage * pageSize, clientPage * pageSize + pageSize);
  const currentPage = serverPaged ? (page ?? 0) : clientPage;
  const totalPages = serverPaged ? (pageCount ?? 1) : totalClientPages;

  function toggleSort(column: Column<T>) {
    if (!column.sortable) return;
    setSort((prev) =>
      prev?.key === column.key ? { key: column.key, direction: prev.direction === 'asc' ? 'desc' : 'asc' } : { key: column.key, direction: 'asc' }
    );
    setClientPage(0);
  }

  if (error) {
    return (
      <div className={cn('space-y-3', className)}>
        {toolbar}
        <ErrorNote message={error} onRetry={onRetry} />
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {toolbar}
      {loading ? (
        <div className="flex items-center justify-center gap-3 rounded-lg border border-border bg-card px-4 py-10">
          <Spinner label="በመጫን ላይ…" />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full border-collapse text-sm">
            {caption ? <caption className="sr-only">{caption}</caption> : null}
            <thead>
              <tr className="border-b border-border bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                {columns.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={sort?.key === column.key ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className={cn('px-3 py-2.5 font-medium', ALIGN[column.align ?? 'start'], column.hideBelow && HIDE[column.hideBelow])}
                  >
                    {column.sortable ? (
                      <button type="button" onClick={() => toggleSort(column)} className="inline-flex items-center gap-1 hover:text-foreground">
                        {column.header}
                        {sort?.key !== column.key ? (
                          <ChevronsUpDown className="h-3.5 w-3.5" aria-hidden />
                        ) : sort.direction === 'asc' ? (
                          <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                        )}
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((row, index) => (
                <tr
                  key={rowKey(row, index)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn('border-b border-border last:border-0', onRowClick && 'cursor-pointer hover:bg-accent/50')}
                >
                  {columns.map((column) => (
                    <td key={column.key} className={cn('px-3 py-2.5 align-top', ALIGN[column.align ?? 'start'], column.hideBelow && HIDE[column.hideBelow], column.className)}>
                      {column.cell ? column.cell(row) : (cellValue(column, row) ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && visible.length > 0 && totalPages > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>
            {serverPaged ? 'ገጽ ' : `${visible.length} ረድፎች በገጽ `}
            <strong className="text-foreground">{currentPage + 1}</strong> / {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={currentPage === 0} onClick={() => (serverPaged ? onPageChange?.(currentPage - 1) : setClientPage((p) => Math.max(0, p - 1)))}>
              <ChevronLeft className="h-4 w-4" /> ቀዳሚ
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage + 1 >= totalPages}
              onClick={() => (serverPaged ? onPageChange?.(currentPage + 1) : setClientPage((p) => Math.min(totalPages - 1, p + 1)))}
            >
              ቀጣይ <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
