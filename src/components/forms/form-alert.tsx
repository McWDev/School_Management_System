import { CircleAlert, CircleCheck } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/** Form-level error or success message, announced to screen readers. */
export function FormAlert({
  tone = "danger",
  children,
  className,
}: {
  tone?: "danger" | "success";
  children: React.ReactNode;
  className?: string;
}) {
  const Icon = tone === "danger" ? CircleAlert : CircleCheck;
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-md px-3 py-2 text-sm",
        tone === "danger" ? "bg-danger-soft text-danger" : "bg-success-soft text-success",
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
