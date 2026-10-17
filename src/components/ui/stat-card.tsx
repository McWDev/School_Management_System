import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

type StatCardProps = {
  label: string;
  icon: LucideIcon;
  /**
   * Formatted value from real data. Leave undefined when there is no data yet;
   * the card then shows a dash and `emptyHint`, never an invented number.
   */
  value?: string;
  emptyHint?: string;
};

export function StatCard({ label, icon: Icon, value, emptyHint = "No data yet" }: StatCardProps) {
  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
      </div>
      {value === undefined ? (
        <>
          <p
            className="text-2xl font-semibold text-muted-foreground"
            aria-label={`${label}: no data`}
          >
            —
          </p>
          <p className="text-xs text-muted-foreground">{emptyHint}</p>
        </>
      ) : (
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
      )}
    </Card>
  );
}
