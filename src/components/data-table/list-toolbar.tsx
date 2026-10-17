import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";

/**
 * Search + status filter as a plain GET form, so filters live in the URL
 * (shareable, back-button friendly) and work without JavaScript.
 */
export function ListToolbar({
  search,
  status,
  statusOptions,
  searchPlaceholder = "Search",
  children,
}: {
  search?: string;
  status?: string;
  statusOptions: { value: string; label: string }[];
  searchPlaceholder?: string;
  /** Primary action(s) shown at the end, e.g. an "Add" button. */
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <form role="search" className="flex flex-1 flex-wrap items-center gap-2">
        <div className="relative w-full sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            name="search"
            type="search"
            defaultValue={search}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="pl-8"
          />
        </div>
        <Select name="status" defaultValue={status ?? ""} aria-label="Status" className="w-auto">
          <option value="">All statuses</option>
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="outline">
          Apply
        </Button>
      </form>
      {children && <div className="flex gap-2">{children}</div>}
    </div>
  );
}
