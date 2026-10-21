import { GraduationCap, LogOut } from "lucide-react";
import { logoutAction } from "@/features/auth/actions";
import { getOwnSchool, getSchoolLogoVersion } from "@/features/tenants/repository";
import { Button } from "@/components/ui/button";
import { requirePortalStudent } from "../access";
import { PortalNav } from "./portal-nav";

/** Header with the school and student, the portal tabs, and the page. */
export async function PortalShell({ children }: { children: React.ReactNode }) {
  const { student, ctx } = await requirePortalStudent();
  const [school, logoVersion] = await Promise.all([getOwnSchool(ctx), getSchoolLogoVersion(ctx)]);
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:shadow-lg"
      >
        Skip to main content
      </a>
      <header className="no-print border-b bg-surface">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-primary-soft text-primary">
              {logoVersion ? (
                // eslint-disable-next-line @next/next/no-img-element -- private, session-protected image route
                <img
                  src={`/api/school-logo?v=${logoVersion}`}
                  alt=""
                  className="size-full object-contain"
                />
              ) : (
                <GraduationCap className="size-5" aria-hidden="true" />
              )}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-semibold">{school.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                Students Portal · {student.fullName} ({student.studentNumber})
              </span>
            </span>
          </div>
          <form action={logoutAction}>
            <Button type="submit" variant="outline" size="sm">
              <LogOut className="size-4" aria-hidden="true" />
              Sign out
            </Button>
          </form>
        </div>
        <div className="mx-auto w-full max-w-5xl px-4">
          <PortalNav />
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6">{children}</div>
      </main>
    </div>
  );
}
