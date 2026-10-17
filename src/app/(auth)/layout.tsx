import { GraduationCap } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-6 px-4 py-10">
      <div className="flex items-center gap-2 font-semibold">
        <span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <GraduationCap className="size-5" aria-hidden="true" />
        </span>
        School Management System
      </div>
      <div className="w-full max-w-sm rounded-lg border bg-surface p-6 shadow-card">{children}</div>
    </main>
  );
}
