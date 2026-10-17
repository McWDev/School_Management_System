import type { Metadata } from "next";
import { Search, UserRound, Users } from "lucide-react";
import { Pagination } from "@/components/data-table/pagination";
import { NoAccess } from "@/components/layout/no-access";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createStaffAction,
  createWorkTypeAction,
  deleteWorkTypeAction,
  renameWorkTypeAction,
  updateStaffAction,
} from "@/features/staff/actions";
import { StaffFormDialog } from "@/features/staff/components/staff-form-dialog";
import { WorkTypesDialog } from "@/features/staff/components/work-types-dialog";
import { listStaff, listWorkTypes } from "@/features/staff/repository";
import { ageFrom } from "@/features/staff/schemas";
import { getTenantContextFor } from "@/lib/authz";
import { can, hasAllBranches } from "@/lib/tenant-context";

export const metadata: Metadata = { title: "School Staff" };

// Loads permission-scoped data before rendering; navigations may block (loading.tsx shows a skeleton).
export const instant = false;

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", {
    dateStyle: "medium",
    timeZone: "UTC",
  });
}

export default async function StaffPage({ searchParams }: PageProps<"/staff">) {
  const ctx = await getTenantContextFor("staff.read");
  if (!ctx) return <NoAccess title="School Staff" />;

  const params = await searchParams;
  const search = typeof params.search === "string" ? params.search : undefined;
  const status = typeof params.status === "string" ? params.status : undefined;
  const workTypeId = typeof params.workTypeId === "string" ? params.workTypeId : undefined;
  const [page, workTypes] = await Promise.all([
    listStaff(ctx, { search, status, workTypeId }, { page: params.page }),
    listWorkTypes(ctx),
  ]);
  const canManage = can(ctx, "staff.manage") && hasAllBranches(ctx);
  const typeOptions = workTypes.map(({ id, name }) => ({ id, name }));
  const filtered = Boolean(search || status || workTypeId);

  return (
    <>
      <PageHeader
        title="School Staff"
        description="Everyone who works at your school and their work type."
        actions={
          canManage && (
            <>
              <WorkTypesDialog
                create={createWorkTypeAction}
                workTypes={workTypes.map((type) => ({
                  ...type,
                  rename: renameWorkTypeAction.bind(null, type.id),
                  remove: deleteWorkTypeAction.bind(null, type.id),
                }))}
              />
              <StaffFormDialog mode="create" workTypes={typeOptions} action={createStaffAction} />
            </>
          )
        }
      />

      <form role="search" className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            name="search"
            type="search"
            defaultValue={search}
            placeholder="Search by name, phone or email"
            aria-label="Search by name, phone or email"
            className="pl-8"
          />
        </div>
        <Select
          name="workTypeId"
          defaultValue={workTypeId ?? ""}
          aria-label="Work type"
          className="w-auto"
        >
          <option value="">All work types</option>
          {typeOptions.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
        <Select name="status" defaultValue={status ?? ""} aria-label="Status" className="w-auto">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="left">Left</option>
        </Select>
        <Button type="submit" variant="outline">
          Apply
        </Button>
      </form>

      {page.total === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title={filtered ? "No staff match your filters" : "No staff added yet"}
            description={
              filtered
                ? "Try a different search, work type or status."
                : canManage
                  ? "Add your first staff member with “Add staff”."
                  : "No staff have been added yet."
            }
          />
        </Card>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Work type</TableHead>
                <TableHead className="hidden md:table-cell">Phone</TableHead>
                <TableHead className="hidden lg:table-cell">Gender / Age</TableHead>
                <TableHead className="hidden lg:table-cell">Location</TableHead>
                <TableHead className="hidden xl:table-cell">Hire date</TableHead>
                <TableHead>Status</TableHead>
                {canManage && (
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.items.map((member) => {
                const photoSrc = member.photoVersion
                  ? `/api/staff-photo/${member.id}?v=${member.photoVersion}`
                  : null;
                const age = ageFrom(member.dateOfBirth);
                return (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
                          {photoSrc ? (
                            // eslint-disable-next-line @next/next/no-img-element -- private, session-protected photo route
                            <img src={photoSrc} alt="" className="size-full object-cover" />
                          ) : (
                            <UserRound
                              className="size-4 text-muted-foreground"
                              aria-hidden="true"
                            />
                          )}
                        </span>
                        <span>
                          <span className="block font-medium">{member.fullName}</span>
                          {member.email && (
                            <span className="block text-xs text-muted-foreground">
                              {member.email}
                            </span>
                          )}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge tone="primary">{member.workTypeName}</Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{member.phone ?? "—"}</TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {[
                        member.gender === "male"
                          ? "Male"
                          : member.gender === "female"
                            ? "Female"
                            : null,
                        age !== null ? `${age} yrs` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">{member.location ?? "—"}</TableCell>
                    <TableCell className="hidden xl:table-cell">
                      {formatDate(member.hireDate)}
                    </TableCell>
                    <TableCell>
                      <Badge tone={member.status === "active" ? "success" : "neutral"}>
                        {member.status === "active" ? "Active" : "Left"}
                      </Badge>
                    </TableCell>
                    {canManage && (
                      <TableCell>
                        <div className="flex justify-end">
                          <StaffFormDialog
                            mode="edit"
                            workTypes={typeOptions}
                            initial={member}
                            photoSrc={photoSrc}
                            action={updateStaffAction.bind(null, member.id)}
                          />
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <Pagination page={page} basePath="/staff" params={{ search, status, workTypeId }} />
        </>
      )}
    </>
  );
}
