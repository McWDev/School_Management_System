import { Label } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";

type FormFieldProps = {
  /** id of the control; used to link the label, helper text and error. */
  id: string;
  label: string;
  required?: boolean;
  helperText?: string;
  error?: string;
  className?: string;
  /** Receives the aria props to spread onto the control. */
  children: (controlProps: {
    id: string;
    "aria-invalid": boolean;
    "aria-describedby"?: string;
    required?: boolean;
  }) => React.ReactNode;
};

/** Label + control + helper text + validation error, with accessible wiring. */
export function FormField({
  id,
  label,
  required,
  helperText,
  error,
  className,
  children,
}: FormFieldProps) {
  const helperId = helperText ? `${id}-helper` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helperId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required && (
          <span className="text-danger" aria-hidden="true">
            {" "}
            *
          </span>
        )}
      </Label>
      {children({ id, "aria-invalid": !!error, "aria-describedby": describedBy, required })}
      {helperText && (
        <p id={helperId} className="text-xs text-muted-foreground">
          {helperText}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
