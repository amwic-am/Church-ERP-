// Form controls. They stay presentational on purpose: screens drive them with
// react-hook-form (`{...field}` plus `field.id`), and the rules in
// src/lib/validation.ts are the same ones the database CHECKs enforce.
import { Check, ChevronDown } from 'lucide-react';
import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

import { formatEthiopian } from '@/lib/ethiopian';
import { cn } from '@/lib/utils';

const CONTROL =
  'w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60';
const INVALID = 'border-destructive focus-visible:ring-destructive';

export function Label({ htmlFor, required, children, className }: { htmlFor?: string; required?: boolean; children: ReactNode; className?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn('mb-1.5 block text-sm font-medium', className)}>
      {children}
      {required ? <span className="ms-1 text-destructive" aria-hidden>*</span> : null}
    </label>
  );
}

/** Label + control + hint/error, the layout every field in the platform uses. */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  className,
  children,
}: {
  label?: ReactNode;
  htmlFor?: string;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      {label ? <Label htmlFor={htmlFor} required={required}>{label}</Label> : null}
      {children}
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-destructive" role="alert">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, invalid, ...props }, ref) {
  return <input ref={ref} className={cn(CONTROL, invalid && INVALID, className)} aria-invalid={invalid || undefined} {...props} />;
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ className, invalid, rows = 4, ...props }, ref) {
  return <textarea ref={ref} rows={rows} className={cn(CONTROL, 'min-h-[5rem] leading-relaxed', invalid && INVALID, className)} aria-invalid={invalid || undefined} {...props} />;
});

export type Option = { value: string; label: string; disabled?: boolean };

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
  options: readonly Option[];
  placeholder?: string;
}

/** A styled native select: keyboard, mobile and Amharic all behave. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, invalid, options, placeholder, value, ...props },
  ref
) {
  return (
    <div className="relative">
      <select
        ref={ref}
        value={value}
        className={cn(CONTROL, 'appearance-none pe-9', invalid && INVALID, className)}
        aria-invalid={invalid || undefined}
        {...props}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
    </div>
  );
});

export const Checkbox = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Checkbox(
  { className, checked, ...props },
  ref
) {
  return (
    <span className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center">
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        className={cn(
          'peer h-5 w-5 cursor-pointer appearance-none rounded border border-input bg-card transition-colors checked:border-primary checked:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60',
          className
        )}
        {...props}
      />
      <Check className="pointer-events-none absolute h-3.5 w-3.5 text-primary-foreground opacity-0 peer-checked:opacity-100" aria-hidden />
    </span>
  );
});

/** Label beside the box, for the yes/no choices in settings and forms. */
export function CheckboxField({ label, hint, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; hint?: ReactNode }) {
  return (
    <div className={cn('flex items-start gap-2.5', className)}>
      <Checkbox {...props} />
      <div className="min-w-0">
        <label className="block cursor-pointer text-sm">{label}</label>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
}

/** On/off as a real checkbox styled as a switch, so forms keep the native contract. */
export const Switch = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Switch(
  { className, checked, ...props },
  ref
) {
  return (
    <span className="relative inline-flex h-6 w-11 shrink-0">
      <input
        ref={ref}
        type="checkbox"
        role="switch"
        checked={checked}
        className={cn(
          'peer h-6 w-11 cursor-pointer appearance-none rounded-full border border-input bg-muted transition-colors checked:border-primary checked:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60',
          className
        )}
        {...props}
      />
      <span className="pointer-events-none absolute left-1 top-1 h-4 w-4 rounded-full bg-card shadow transition-transform peer-checked:translate-x-5" aria-hidden />
    </span>
  );
});

/**
 * A Gregorian date input that also says what the parish cares about — the
 * Ethiopian date. Storage stays ISO `YYYY-MM-DD`, exactly the column type.
 */
export function DateInput({
  value,
  onValueChange,
  id,
  name,
  invalid,
  disabled,
  required,
  min,
  max,
}: {
  value: string;
  onValueChange: (next: string) => void;
  id?: string;
  name?: string;
  invalid?: boolean;
  disabled?: boolean;
  required?: boolean;
  min?: string;
  max?: string;
}) {
  return (
    <div className="space-y-1">
      <Input
        id={id}
        name={name}
        type="date"
        value={value}
        required={required}
        disabled={disabled}
        min={min}
        max={max}
        invalid={invalid}
        onChange={(e) => onValueChange(e.target.value)}
      />
      {/^\d{4}-\d{2}-\d{2}$/.test(value) ? (
        <p className="text-xs text-muted-foreground" aria-live="polite">{formatEthiopian(value)}</p>
      ) : null}
    </div>
  );
}

/** A grouped block of fields with an Amharic legend. */
export function FormSection({ legend, description, children, className }: { legend: ReactNode; description?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <fieldset className={cn('rounded-lg border border-border p-4', className)}>
      <legend className="px-1 font-display text-sm font-semibold text-foreground">{legend}</legend>
      {description ? <p className="mb-3 text-xs text-muted-foreground">{description}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

/** Save/cancel row; sticky so long forms never lose their button. */
export function FormActions({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('sticky bottom-0 -mx-1 flex flex-wrap items-center gap-3 border-t border-border bg-background/95 px-1 py-3 backdrop-blur', className)}>{children}</div>;
}
