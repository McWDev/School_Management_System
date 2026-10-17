import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const TONES = {
  primary: "bg-primary-soft text-primary",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  neutral: "bg-muted text-muted-foreground",
} as const;

/** One figure with its label; optionally links to the filtered list. */
export function KpiTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = "primary",
  href,
}: {
  label: string;
  value: number;
  hint?: string;
  icon: LucideIcon;
  tone?: keyof typeof TONES;
  href?: string;
}) {
  const body = (
    <>
      <span
        className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", TONES[tone])}
      >
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-2xl font-semibold tabular-nums">{value.toLocaleString("en-GB")}</span>
        {hint && <span className="truncate text-xs text-muted-foreground">{hint}</span>}
      </span>
    </>
  );
  const classes =
    "flex flex-col items-start gap-2 rounded-lg border bg-surface p-3 shadow-card transition-colors sm:flex-row sm:items-center sm:gap-3 sm:p-4";
  return href ? (
    <Link href={href} className={cn(classes, "hover:border-primary/40 hover:bg-primary-soft/30")}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}
