import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/** Link back to the School Settings sections, shown above each section page. */
export function BackToSettings() {
  return (
    <Link
      href="/settings"
      className="no-print inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      School Settings
    </Link>
  );
}
