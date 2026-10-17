import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
  {
    variants: {
      tone: {
        neutral: "bg-muted text-muted-foreground",
        primary: "bg-primary-soft text-primary",
        success: "bg-success-soft text-success",
        warning: "bg-warning-soft text-warning",
        danger: "bg-danger-soft text-danger",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

/**
 * Status badge. Always pass readable text as children so status is never
 * conveyed by color alone.
 */
export function Badge({
  className,
  tone,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

/** Map common record statuses to badge tones. */
export const statusTone = {
  active: "success",
  archived: "neutral",
  draft: "neutral",
  published: "primary",
  paid: "success",
  partial: "warning",
  overdue: "danger",
  pending: "warning",
  suspended: "danger",
} as const satisfies Record<string, VariantProps<typeof badgeVariants>["tone"]>;
