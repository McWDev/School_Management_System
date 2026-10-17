import { Badge, statusTone } from "./badge";

const LABELS: Record<string, string> = {
  active: "Active",
  archived: "Archived",
  pending: "Pending",
  suspended: "Suspended",
  disabled: "Disabled",
};

/** Status shown as text plus color (never color alone). */
export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "disabled" ? "danger" : (statusTone[status as keyof typeof statusTone] ?? "neutral");
  return <Badge tone={tone}>{LABELS[status] ?? status}</Badge>;
}
