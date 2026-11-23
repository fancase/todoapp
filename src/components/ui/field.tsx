import { useId, type ReactElement, type ReactNode } from "react";
import { cloneElement } from "react";
import { cn } from "@/lib/utils";

export const controlClass =
  "h-10 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground/80 outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 disabled:opacity-60";

interface FieldProps {
  label: string;
  /** Used for `data-testid="field-error-<name>"`. */
  name: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactElement<{ id?: string; "aria-invalid"?: boolean; "aria-describedby"?: string }>;
  className?: string;
  extra?: ReactNode;
}

/** Label + control + inline error, wired with aria-describedby/aria-invalid. */
export function Field({ label, name, error, hint, required, children, className, extra }: FieldProps) {
  const id = useId();
  const errId = `${id}-err`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {required && (
          <span aria-hidden className="ml-0.5 text-destructive">
            *
          </span>
        )}
      </label>
      {cloneElement(children, {
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy,
      })}
      {extra}
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} role="alert" data-testid={`field-error-${name}`} className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
