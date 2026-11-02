// Tabs, separators, progress and avatar — the remaining Radix primitives the
// module screens compose instead of restyling.
import * as RadixAvatar from '@radix-ui/react-avatar';
import * as RadixProgress from '@radix-ui/react-progress';
import * as RadixSeparator from '@radix-ui/react-separator';
import * as RadixTabs from '@radix-ui/react-tabs';
import * as RadixAccordion from '@radix-ui/react-accordion';
import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';

import { initials } from '@/lib/format';
import { cn } from '@/lib/utils';

export type TabItem = { value: string; label: ReactNode; count?: number };

export function Tabs({
  items,
  value,
  onValueChange,
  children,
  className,
}: {
  items: readonly TabItem[];
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <RadixTabs.Root value={value} onValueChange={onValueChange} className={className}>
      <RadixTabs.List className="flex flex-wrap gap-1 border-b border-border">
        {items.map((item) => (
          <RadixTabs.Trigger
            key={item.value}
            value={item.value}
            className={cn(
              '-mb-px rounded-t-md border-b-2 border-transparent px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:border-primary data-[state=active]:text-foreground'
            )}
          >
            {item.label}
            {typeof item.count === 'number' ? (
              <span className="ms-1.5 rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{item.count}</span>
            ) : null}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {children}
    </RadixTabs.Root>
  );
}

export function TabPanel({ value, children, className }: { value: string; children: ReactNode; className?: string }) {
  return <RadixTabs.Content value={value} className={cn('pt-4 outline-none', className)}>{children}</RadixTabs.Content>;
}

export function Separator({ className, vertical }: { className?: string; vertical?: boolean }) {
  return <RadixSeparator.Root orientation={vertical ? 'vertical' : 'horizontal'} className={cn(vertical ? 'h-full w-px' : 'h-px w-full', 'bg-border', className)} />;
}

export function ProgressBar({ value, label, className }: { value: number; label?: string; className?: string }) {
  return (
    <div className={cn('space-y-1', className)}>
      {label ? <p className="text-xs text-muted-foreground">{label}</p> : null}
      <RadixProgress.Root value={value} className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <RadixProgress.Indicator className="h-full bg-primary transition-transform" style={{ transform: `translateX(${value - 100}%)` }} />
      </RadixProgress.Root>
    </div>
  );
}

export function Avatar({ name, src, size = 36, className }: { name: string | null | undefined; src?: string | null; size?: number; className?: string }) {
  return (
    <RadixAvatar.Root
      className={cn('inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-accent font-medium text-accent-foreground', className)}
      style={{ width: size, height: size }}
    >
      {src ? <RadixAvatar.Image src={src} alt={name ?? ''} className="h-full w-full object-cover" /> : null}
      <RadixAvatar.Fallback className="flex h-full w-full items-center justify-center" delayMs={300}>
        {initials(name)}
      </RadixAvatar.Fallback>
    </RadixAvatar.Root>
  );
}

export type AccordionItemData = { value: string; title: ReactNode; content: ReactNode };

export function Accordion({ items, className }: { items: readonly AccordionItemData[]; className?: string }) {
  return (
    <RadixAccordion.Root type="single" collapsible className={cn('divide-y divide-border rounded-lg border border-border bg-card', className)}>
      {items.map((item) => (
        <RadixAccordion.Item key={item.value} value={item.value}>
          <RadixAccordion.Header>
            <RadixAccordion.Trigger className="group flex w-full items-center justify-between gap-3 px-4 py-3 text-start font-medium outline-none hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring">
              {item.title}
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" aria-hidden />
            </RadixAccordion.Trigger>
          </RadixAccordion.Header>
          <RadixAccordion.Content className="overflow-hidden px-4 pb-4 text-sm data-[state=closed]:hidden">{item.content}</RadixAccordion.Content>
        </RadixAccordion.Item>
      ))}
    </RadixAccordion.Root>
  );
}
