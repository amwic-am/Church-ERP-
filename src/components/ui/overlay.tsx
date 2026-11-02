// Overlays: the dialogs a workflow needs (confirm before approve, confirm before
// delete), dropdown row actions, side panels, tooltips and popovers.
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import * as Dialog from '@radix-ui/react-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Popover from '@radix-ui/react-popover';
import * as Tooltip from '@radix-ui/react-tooltip';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from './button';
import { cn } from '@/lib/utils';

const PANEL = 'rounded-lg border border-border bg-card text-card-foreground shadow-xl';

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  footer,
  children,
  size = 'md',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/60 backdrop-blur-[2px]" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto p-5 focus:outline-none',
            PANEL,
            size === 'sm' && 'max-w-md',
            size === 'md' && 'max-w-xl',
            size === 'lg' && 'max-w-3xl',
            size === 'xl' && 'max-w-5xl'
          )}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Dialog.Title className="font-display text-lg font-semibold leading-tight">{title}</Dialog.Title>
              {description ? <Dialog.Description className="mt-1 text-sm text-muted-foreground">{description}</Dialog.Description> : null}
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="ዝጋ"><X className="h-4 w-4" /></Button>
            </Dialog.Close>
          </div>
          {children}
          {footer ? <div className="mt-5 flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">{footer}</div> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** The only way a destructive or workflow action fires: a stated consequence. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'አዝምር',
  cancelLabel = 'ተወው',
  destructive = false,
  busy = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-ink/60" />
        <AlertDialog.Content className={cn('fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 p-5 focus:outline-none', PANEL)}>
          <AlertDialog.Title className="font-display text-base font-semibold">{title}</AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">{description}</AlertDialog.Description>
          <div className="mt-5 flex justify-end gap-3">
            <AlertDialog.Cancel asChild>
              <Button variant="outline">{cancelLabel}</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button variant={destructive ? 'destructive' : 'primary'} loading={busy} onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

/** Slide-over panel for record details that would not fit a table row. */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  side = 'right',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  side?: 'right' | 'bottom';
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/60" />
        <Dialog.Content
          className={cn(
            'fixed z-50 flex flex-col overflow-hidden bg-card shadow-xl focus:outline-none',
            side === 'right' ? 'inset-y-0 end-0 w-full max-w-xl border-s' : 'inset-x-0 bottom-0 max-h-[85vh] rounded-t-lg border-t'
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <Dialog.Title className="font-display text-lg font-semibold leading-tight">{title}</Dialog.Title>
              {description ? <Dialog.Description className="mt-1 text-sm text-muted-foreground">{description}</Dialog.Description> : null}
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="ዝጋ"><X className="h-4 w-4" /></Button>
            </Dialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export const Menu = DropdownMenu.Root;

export function MenuTrigger({ children, className, label }: { children: ReactNode; className?: string; label: string }) {
  return (
    <DropdownMenu.Trigger className={cn('inline-flex items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', className)} aria-label={label}>
      {children}
    </DropdownMenu.Trigger>
  );
}

export function MenuContent({ children, align = 'end', className }: { children: ReactNode; align?: 'start' | 'center' | 'end'; className?: string }) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        align={align}
        sideOffset={6}
        className={cn('z-50 min-w-[11rem] overflow-hidden p-1 text-sm', PANEL, className)}
      >
        {children}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  );
}

export function MenuItem({ children, onSelect, disabled, destructive, icon }: { children: ReactNode; onSelect?: () => void; disabled?: boolean; destructive?: boolean; icon?: ReactNode }) {
  return (
    <DropdownMenu.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        'flex cursor-pointer select-none items-center gap-2 rounded-[4px] px-2.5 py-1.5 outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        destructive ? 'text-destructive focus:bg-destructive/10' : 'focus:bg-accent focus:text-accent-foreground'
      )}
    >
      {icon}
      {children}
    </DropdownMenu.Item>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <DropdownMenu.Label className="px-2.5 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{children}</DropdownMenu.Label>;
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className="my-1 h-px bg-border" />;
}

export function TooltipProvider({ children, delayDuration = 300 }: { children: ReactNode; delayDuration?: number }) {
  return <Tooltip.Provider delayDuration={delayDuration}>{children}</Tooltip.Provider>;
}

export function TooltipLabel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="z-50 rounded-md bg-ink px-2.5 py-1.5 text-xs text-parchment shadow-md" sideOffset={6}>
          {label}
          <Tooltip.Arrow className="fill-ink" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function PopoverPanel({ trigger, children, className }: { trigger: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className={cn('z-50 w-[22rem] max-w-[calc(100vw-2rem)] p-4 focus:outline-none', PANEL, className)} sideOffset={8}>
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
