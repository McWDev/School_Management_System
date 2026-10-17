import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Page } from "@/lib/pagination";

/** Previous/next links that keep the current filters in the URL. */
export function Pagination({
  page,
  basePath,
  params,
}: {
  page: Pick<Page<unknown>, "page" | "pageCount" | "total" | "pageSize">;
  basePath: string;
  params: Record<string, string | undefined>;
}) {
  const href = (target: number) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
    if (target > 1) query.set("page", String(target));
    const qs = query.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  const first = page.total === 0 ? 0 : (page.page - 1) * page.pageSize + 1;
  const last = Math.min(page.page * page.pageSize, page.total);

  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between gap-2 text-sm text-muted-foreground"
    >
      <p>{page.total === 0 ? "No results" : `Showing ${first}–${last} of ${page.total}`}</p>
      <div className="flex gap-2">
        {page.page > 1 ? (
          <Button asChild variant="outline" size="sm">
            <Link href={href(page.page - 1)}>
              <ChevronLeft aria-hidden="true" /> Previous
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            <ChevronLeft aria-hidden="true" /> Previous
          </Button>
        )}
        {page.page < page.pageCount ? (
          <Button asChild variant="outline" size="sm">
            <Link href={href(page.page + 1)}>
              Next <ChevronRight aria-hidden="true" />
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Next <ChevronRight aria-hidden="true" />
          </Button>
        )}
      </div>
    </nav>
  );
}
