import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder shown while the session and permissions load. */
export function ShellSkeleton() {
  return (
    <div className="flex min-h-dvh" role="status" aria-label="Loading">
      <div className="hidden w-64 shrink-0 flex-col gap-3 border-r bg-sidebar p-4 lg:flex">
        <Skeleton className="h-8 w-40" />
        {Array.from({ length: 9 }, (_, i) => (
          <Skeleton key={i} className="h-7" />
        ))}
      </div>
      <div className="flex flex-1 flex-col">
        <div className="flex h-14 items-center border-b bg-surface px-4">
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="flex flex-col gap-4 p-4 sm:p-6">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-40" />
        </div>
      </div>
    </div>
  );
}
