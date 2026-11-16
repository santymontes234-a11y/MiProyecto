import { forwardRef, useId, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const control =
  "w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-ink placeholder:text-ink-muted/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:bg-subtle aria-[invalid=true]:border-alert/40";

interface FieldWrapProps {
  label: string;
  error?: string;
  hint?: string;
  id: string;
  children: React.ReactNode;
  className?: string;
}

function FieldWrap({ label, error, hint, id, children, className }: FieldWrapProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-medium text-ink">{label}</label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="text-xs text-ink-muted">{hint}</p>}
      {error && <p id={`${id}-error`} role="alert" className="text-xs text-alert">{error}</p>}
    </div>
  );
}

function describedBy(id: string, error?: string, hint?: string) {
  return error ? `${id}-error` : hint ? `${id}-hint` : undefined;
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string; wrapperClassName?: string };

export const TextField = forwardRef<HTMLInputElement, InputProps>(function TextField({ label, error, hint, id, className, wrapperClassName, ...props }, ref) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldWrap label={label} error={error} hint={hint} id={fid} className={wrapperClassName}>
      <input ref={ref} id={fid} aria-invalid={!!error} aria-describedby={describedBy(fid, error, hint)} className={cn(control, "h-10", className)} {...props} />
    </FieldWrap>
  );
});

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string; hint?: string; options: { value: string; label: string }[]; wrapperClassName?: string };

export const SelectField = forwardRef<HTMLSelectElement, SelectProps>(function SelectField({ label, error, hint, id, options, className, wrapperClassName, ...props }, ref) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldWrap label={label} error={error} hint={hint} id={fid} className={wrapperClassName}>
      <select ref={ref} id={fid} aria-invalid={!!error} aria-describedby={describedBy(fid, error, hint)} className={cn(control, "h-10", className)} {...props}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </FieldWrap>
  );
});

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string; hint?: string };

export const TextareaField = forwardRef<HTMLTextAreaElement, TextareaProps>(function TextareaField({ label, error, hint, id, className, ...props }, ref) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldWrap label={label} error={error} hint={hint} id={fid}>
      <textarea ref={ref} id={fid} aria-invalid={!!error} aria-describedby={describedBy(fid, error, hint)} className={cn(control, "min-h-24", className)} {...props} />
    </FieldWrap>
  );
});

type CheckboxProps = InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode; error?: string; description?: string };

export const CheckboxField = forwardRef<HTMLInputElement, CheckboxProps>(function CheckboxField({ label, error, description, id, ...props }, ref) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div>
      <div className="flex items-start gap-3">
        <input ref={ref} id={fid} type="checkbox" aria-invalid={!!error} aria-describedby={error ? `${fid}-error` : undefined} className="mt-0.5 size-4 rounded border-line accent-brand" {...props} />
        <label htmlFor={fid} className="text-sm text-ink">
          {label}
          {description && <span className="block text-xs text-ink-muted">{description}</span>}
        </label>
      </div>
      {error && <p id={`${fid}-error`} role="alert" className="mt-1 text-xs text-alert">{error}</p>}
    </div>
  );
});

/** Control compacto para barras de filtros (sin label visible). */
export function FilterSelect({ label, value, onChange, options, className }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; className?: string }) {
  return (
    <label className={cn("flex flex-col gap-1 text-xs font-medium text-ink-muted", className)}>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className={cn(control, "h-9 min-w-36")}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export function FilterInput({ label, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className={cn("flex flex-col gap-1 text-xs font-medium text-ink-muted", className)}>
      {label}
      <input className={cn(control, "h-9")} {...props} />
    </label>
  );
}
