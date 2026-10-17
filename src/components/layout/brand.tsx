import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export function Brand({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href="/dashboard"
      onClick={onNavigate}
      className={cn(
        "flex h-14 items-center gap-2 px-4 font-semibold",
        collapsed && "justify-center px-0",
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <GraduationCap className="size-4" aria-hidden="true" />
      </span>
      <span className={cn("truncate", collapsed && "sr-only")}>School Management</span>
    </Link>
  );
}
