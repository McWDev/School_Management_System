import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  ClipboardCheck,
  Clock,
  School,
  UserCheck,
  UserMinus,
  UserPlus,
  UserRound,
  UserX,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { GenderChart } from "@/features/dashboard/components/gender-chart";
import { KpiTile } from "@/features/dashboard/components/kpi-tile";
import { WelcomeBanner } from "@/features/dashboard/components/welcome-banner";
import { WorkTypeChart } from "@/features/dashboard/components/work-type-chart";
import {
  getOwnStaffRecord,
  getPlatformDashboard,
  getStaffDashboard,
} from "@/features/dashboard/queries";
import { getCurrentAcademicYear } from "@/features/academic-years/repository";
import { getOwnSchool, getSchoolLogoVersion } from "@/features/tenants/repository";
import { requireAccess, type Access } from "@/lib/authz";
import { can, type TenantContext } from "@/lib/tenant-context";

export const metadata: Metadata = { title: "Dashboard" };

// Reads the session and live figures; navigations may block (loading.tsx shows a skeleton).
export const instant = false;

const STATUS_LABEL = { active: "Active", inactive: "Inactive", left: "Left" } as const;
const STATUS_TONE = { active: "success", inactive: "warning", left: "neutral" } as const;

function formatDate(value: string | Date | null, timezone = "UTC") {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(`${value}T00:00:00Z`) : value;
  return date.toLocaleDateString("en-GB", {
    dateStyle: "medium",
    timeZone: typeof value === "string" ? "UTC" : timezone,
  });
}

export default async function DashboardPage() {
  const access = await requireAccess();
  if (access.platform) return <PlatformDashboard access={access} />;
  if (access.tenant) return <SchoolDashboard access={access} ctx={access.tenant} />;
  return null;
}

// ------------------------------------------------------------------ school

async function SchoolDashboard({ access, ctx }: { access: Access; ctx: TenantContext }) {
  const [school, logoVersion, academicYear] = await Promise.all([
    getOwnSchool(ctx),
    getSchoolLogoVersion(ctx),
    can(ctx, "academic_years.read") ? getCurrentAcademicYear(ctx) : undefined,
  ]);
  const logoSrc = logoVersion ? `/api/school-logo?v=${logoVersion}` : null;
  const banner = {
    userName: access.user.fullName,
    schoolName: school.name,
    motto: school.motto,
    logoSrc,
    timezone: school.timezone,
    academicYear: academicYear === undefined ? undefined : (academicYear?.name ?? null),
  };

  if (!can(ctx, "staff.read")) {
    const own = await getOwnStaffRecord(ctx, access.user.id);
    return (
      <>
        <WelcomeBanner {...banner} />
        <Card>
          <CardHeader>
            <CardTitle>Your details</CardTitle>
            <CardDescription>As recorded by your school.</CardDescription>
          </CardHeader>
          <CardContent>
            {own ? (
              <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-muted-foreground">Work type</dt>
                  <dd className="font-medium">{own.workTypeName}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Phone</dt>
                  <dd className="font-medium">{own.phone ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Location</dt>
                  <dd className="font-medium">{own.location ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Hire date</dt>
                  <dd className="font-medium">{formatDate(own.hireDate)}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">
                Welcome to {school.name}. More features will appear here as your school sets them
                up.
              </p>
            )}
          </CardContent>
        </Card>
      </>
    );
  }

  const data = await getStaffDashboard(ctx);
  const current = data.status.active + data.status.inactive;
  const canManage = can(ctx, "staff.manage");

  return (
    <>
      <WelcomeBanner
        {...banner}
        heroValue={current}
        heroLabel={current === 1 ? "current staff member" : "current staff members"}
      />

      {canManage && (
        <section aria-labelledby="quick-actions" className="flex flex-col gap-2">
          <h2 id="quick-actions" className="text-sm font-semibold text-muted-foreground">
            Quick actions
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/staff">
                <UserPlus aria-hidden="true" /> Add staff
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/staff?status=inactive">
                <UserMinus aria-hidden="true" /> Review inactive staff
              </Link>
            </Button>
          </div>
        </section>
      )}

      <section aria-labelledby="key-figures">
        <h2 id="key-figures" className="sr-only">
          Key figures
        </h2>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <KpiTile
            label="Active staff"
            value={data.status.active}
            hint="Working now"
            icon={UserCheck}
            tone="success"
            href="/staff?status=active"
          />
          <KpiTile
            label="Inactive staff"
            value={data.status.inactive}
            hint="Login blocked"
            icon={UserMinus}
            tone="warning"
            href="/staff?status=inactive"
          />
          <KpiTile
            label="Staff who left"
            value={data.status.left}
            hint="Kept on record"
            icon={UserX}
            tone="neutral"
            href="/staff?status=left"
          />
          <KpiTile
            label="Active branches"
            value={data.activeBranches}
            hint="Campuses of your school"
            icon={Building2}
            tone="primary"
          />
        </div>
      </section>

      {data.status.total === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title="No staff yet"
            description="Add your staff and their work types to see your team at a glance here."
            action={
              canManage && (
                <Button asChild>
                  <Link href="/staff">
                    <UserPlus aria-hidden="true" /> Add your first staff member
                  </Link>
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Staff by work type</CardTitle>
              <CardDescription>Current staff (active and inactive).</CardDescription>
            </CardHeader>
            <CardContent>
              {data.byWorkType.length ? (
                <WorkTypeChart data={data.byWorkType} />
              ) : (
                <p className="text-sm text-muted-foreground">No current staff.</p>
              )}
            </CardContent>
          </Card>

          <div className="flex flex-col gap-4 lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Gender</CardTitle>
                <CardDescription>Current staff.</CardDescription>
              </CardHeader>
              <CardContent>
                {data.gender.male + data.gender.female > 0 ? (
                  <GenderChart male={data.gender.male} female={data.gender.female} />
                ) : (
                  <p className="text-sm text-muted-foreground">No current staff.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <div className="flex flex-col gap-1">
                  <CardTitle>Recently added</CardTitle>
                  <CardDescription>Latest staff records.</CardDescription>
                </div>
                <Link
                  href="/staff"
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  View all <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col divide-y">
                  {data.recent.map((member) => (
                    <li
                      key={member.id}
                      className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
                        {member.photoVersion ? (
                          // eslint-disable-next-line @next/next/no-img-element -- private, session-protected photo route
                          <img
                            src={`/api/staff-photo/${member.id}?v=${member.photoVersion}`}
                            alt=""
                            className="size-full object-cover"
                          />
                        ) : (
                          <UserRound className="size-4 text-muted-foreground" aria-hidden="true" />
                        )}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-medium">{member.fullName}</span>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="size-3" aria-hidden="true" />
                          Added {formatDate(member.createdAt, school.timezone)} ·{" "}
                          {member.workTypeName}
                        </span>
                      </span>
                      <Badge tone={STATUS_TONE[member.status]}>{STATUS_LABEL[member.status]}</Badge>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- platform

async function PlatformDashboard({ access }: { access: Access }) {
  const counts =
    access.platform && can(access.platform, "schools.read")
      ? await getPlatformDashboard(access.platform)
      : null;
  const total = counts ? counts.active + counts.pending + counts.suspended + counts.archived : 0;

  return (
    <>
      <WelcomeBanner
        userName={access.user.fullName}
        schoolName="Platform administration"
        timezone="Africa/Mogadishu"
        heroValue={counts ? total : undefined}
        heroLabel={total === 1 ? "registered school" : "registered schools"}
      />
      {counts && (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <KpiTile label="Active schools" value={counts.active} icon={School} tone="success" />
          <KpiTile
            label="Awaiting approval"
            value={counts.pending}
            icon={ClipboardCheck}
            tone="warning"
            href="/settings/school-registrations?status=pending"
          />
          <KpiTile label="Suspended" value={counts.suspended} icon={UserMinus} tone="neutral" />
          <KpiTile label="Archived" value={counts.archived} icon={UserX} tone="neutral" />
        </div>
      )}
    </>
  );
}
