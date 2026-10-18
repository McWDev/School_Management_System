import type { Metadata } from "next";
import { GraduationCap, Search, UserRound } from "lucide-react";
import { Pagination } from "@/components/data-table/pagination";
import { ConfirmAction } from "@/components/forms/confirm-action";
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
import { ageFrom } from "@/features/staff/schemas";
import {
  createStudentAction,
  deleteStudentAction,
  updateStudentAction,
} from "@/features/students/actions";
import { StudentFormDialog } from "@/features/students/components/student-form-dialog";
import { canSeeFees, getStudentFormOptions, listStudents } from "@/features/students/repository";
import { feeTypeLabels, STUDENT_STATUSES, studentStatusLabels } from "@/features/students/schemas";
import { formatMoney } from "@/lib/money";
import { getTenantContextFor } from "@/lib/authz";
import { can, hasAllBranches } from "@/lib/tenant-context";

export const metadata: Metadata = { title: "Students" };

// Loads permission-scoped data before rendering; navigations may block (loading.tsx shows a skeleton).
export const instant = false;

const STATUS_TONE = {
  active: "success",
  graduated: "primary",
  transferred: "warning",
  left: "neutral",
} as const;

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", {
    dateStyle: "medium",
    timeZone: "UTC",
  });
}

export default async function StudentsPage({ searchParams }: PageProps<"/students">) {
  const ctx = await getTenantContextFor("students.read");
  if (!ctx) return <NoAccess title="Students" />;

  const params = await searchParams;
  const search = typeof params.search === "string" ? params.search : undefined;
  const status = typeof params.status === "string" ? params.status : undefined;
  const classId = typeof params.classId === "string" ? params.classId : undefined;
  const academicYearId =
    typeof params.academicYearId === "string" ? params.academicYearId : undefined;
  const [page, options] = await Promise.all([
    listStudents(ctx, { search, status, classId, academicYearId }, { page: params.page }),
    getStudentFormOptions(ctx),
  ]);
  const allBranches = hasAllBranches(ctx);
  const canCreate = can(ctx, "students.create") && allBranches;
  const canUpdate = can(ctx, "students.update") && allBranches;
  const canArchive = can(ctx, "students.archive") && allBranches;
  const filtered = Boolean(search || status || classId || academicYearId);
  const showFees = canSeeFees(ctx);
  const setupMissing = options.classes.length === 0 || options.academicYears.length === 0;

  return (
    <>
      <PageHeader
        title="Students"
        description="Register students and manage their class, guardian and status."
        actions={
          canCreate && (
            <StudentFormDialog mode="create" options={options} action={createStudentAction} />
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
            placeholder="Search by name, Student ID or phone"
            aria-label="Search by name, Student ID or phone"
            className="pl-8"
          />
        </div>
        <Select
          name="academicYearId"
          defaultValue={academicYearId ?? ""}
          aria-label="Academic year"
          className="w-auto"
        >
          <option value="">All academic years</option>
          {options.academicYears.map((y) => (
            <option key={y.id} value={y.id}>
              {y.name}
            </option>
          ))}
        </Select>
        <Select name="classId" defaultValue={classId ?? ""} aria-label="Class" className="w-auto">
          <option value="">All classes</option>
          {options.classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select name="status" defaultValue={status ?? ""} aria-label="Status" className="w-auto">
          <option value="">All statuses</option>
          {STUDENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {studentStatusLabels[s]}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="outline">
          Apply
        </Button>
      </form>

      {page.total === 0 ? (
        <Card>
          <EmptyState
            icon={GraduationCap}
            title={filtered ? "No students match your filters" : "No students registered yet"}
            description={
              filtered
                ? "Try a different search, academic year, class or status."
                : canCreate
                  ? setupMissing
                    ? "First add an academic year and a class, then register students with “Register student”."
                    : "Register your first student with “Register student”."
                  : "No students have been registered yet."
            }
          />
        </Card>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Class</TableHead>
                <TableHead className="hidden lg:table-cell">Gender / Age</TableHead>
                <TableHead className="hidden md:table-cell">Guardian</TableHead>
                {showFees && <TableHead className="hidden lg:table-cell">Fees</TableHead>}
                <TableHead className="hidden xl:table-cell">Admission date</TableHead>
                <TableHead>Status</TableHead>
                {(canUpdate || canArchive) && (
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.items.map((student) => {
                const photoSrc = student.photoVersion
                  ? `/api/student-photo/${student.id}?v=${student.photoVersion}`
                  : null;
                const age = ageFrom(student.dateOfBirth);
                return (
                  <TableRow key={student.id}>
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
                          <span className="block font-medium">{student.fullName}</span>
                          <span className="block text-xs text-muted-foreground tabular-nums">
                            {student.studentNumber}
                          </span>
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="block">{student.className ?? "—"}</span>
                      {student.academicYearName && (
                        <span className="block text-xs text-muted-foreground">
                          {student.academicYearName}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {[
                        student.gender === "male" ? "Male" : "Female",
                        age !== null ? `${age} yrs` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="block">{student.guardianName}</span>
                      <span className="block text-xs text-muted-foreground">
                        {student.guardianPhone}
                      </span>
                    </TableCell>
                    {showFees && (
                      <TableCell className="hidden lg:table-cell">
                        {student.fees && (
                          <>
                            <span className="block">
                              {feeTypeLabels[student.fees.feeType]}
                              {student.fees.feeAmount &&
                                ` · ${formatMoney(student.fees.feeAmount, options.currencyCode)}`}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {/[1-9]/.test(student.fees.registrationFee)
                                ? `Registration ${formatMoney(student.fees.registrationFee, options.currencyCode)} · ${student.fees.registrationFeePaid ? "Paid" : "Unpaid"}`
                                : "No registration fee"}
                            </span>
                          </>
                        )}
                      </TableCell>
                    )}
                    <TableCell className="hidden xl:table-cell">
                      {formatDate(student.admissionDate)}
                    </TableCell>
                    <TableCell>
                      <Badge tone={STATUS_TONE[student.status]}>
                        {studentStatusLabels[student.status]}
                      </Badge>
                    </TableCell>
                    {(canUpdate || canArchive) && (
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          {canUpdate && (
                            <StudentFormDialog
                              mode="edit"
                              options={options}
                              initial={student}
                              photoSrc={photoSrc}
                              canChangeStatus={canArchive}
                              action={updateStudentAction.bind(null, student.id)}
                            />
                          )}
                          {canArchive && (
                            <ConfirmAction
                              label="Delete"
                              title={`Delete ${student.fullName}?`}
                              description={`This permanently deletes ${student.fullName} (${student.studentNumber}), their class placement and photo. This cannot be undone. For a student who finished or left, change the status instead to keep their record.`}
                              confirmLabel="Delete student"
                              variant="destructive"
                              action={deleteStudentAction.bind(null, student.id)}
                            />
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <Pagination
            page={page}
            basePath="/students"
            params={{ search, status, classId, academicYearId }}
          />
        </>
      )}
    </>
  );
}
