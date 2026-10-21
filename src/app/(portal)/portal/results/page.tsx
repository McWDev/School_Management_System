import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PrintButton } from "@/components/print/print-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getDb } from "@/db";
import { ordinal, ResultSlip } from "@/features/exams/components/result-slip";
import { getStudentResult } from "@/features/exams/repository";
import { SUBJECT_MAX } from "@/features/exams/schemas";
import { schoolToday } from "@/features/fees/repository";
import { requirePortalStudent } from "@/features/portal/access";
import { getPortalEnrollments } from "@/features/portal/repository";
import { getOwnSchool, getSchoolLogoVersion } from "@/features/tenants/repository";

export const metadata: Metadata = { title: "My results" };

export const instant = false;

/** The signed-in student's marks, total, average and Pass/Fail for a year. */
export default async function PortalResultsPage({ searchParams }: PageProps<"/portal/results">) {
  const { student, ctx } = await requirePortalStudent();
  const enrollments = await getPortalEnrollments(student);
  const { year } = await searchParams;
  const chosen = enrollments.find((e) => e.academicYearId === year) ?? enrollments[0];

  if (!chosen) {
    return (
      <>
        <PageHeader title="My results" />
        <Card>
          <EmptyState
            icon={ClipboardList}
            title="No results yet"
            description="You are not placed in a class yet."
          />
        </Card>
      </>
    );
  }

  const [result, school, logoVersion, today] = await Promise.all([
    // Only this student's own result (their id, their class and year).
    getStudentResult(ctx, {
      academicYearId: chosen.academicYearId,
      classId: chosen.classId,
      studentId: student.id,
    }),
    getOwnSchool(ctx),
    getSchoolLogoVersion(ctx),
    schoolToday(getDb(), student.tenantId),
  ]);
  const passed = result.result === "pass";
  const reportDate = new Date(`${today}T00:00:00Z`).toLocaleDateString("en-GB", {
    dateStyle: "long",
    timeZone: "UTC",
  });

  return (
    <>
      <div className="no-print flex flex-col gap-6">
        <PageHeader
          title="My results"
          description={`${result.className} · ${result.academicYearName}`}
          actions={<PrintButton label="Print result" />}
        />
        {enrollments.length > 1 && (
          <form className="flex flex-wrap items-end gap-2" aria-label="Choose academic year">
            <div className="flex flex-col gap-1">
              <label htmlFor="portal-year" className="text-sm font-medium">
                Academic year
              </label>
              <Select
                id="portal-year"
                name="year"
                defaultValue={chosen.academicYearId}
                className="w-auto"
              >
                {enrollments.map((e) => (
                  <option key={e.academicYearId} value={e.academicYearId}>
                    {e.academicYearName} · {e.className}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" variant="outline">
              Show
            </Button>
          </form>
        )}

        <section aria-label="Result summary" className="grid gap-3 sm:grid-cols-4">
          {[
            ["Total", `${result.total} / ${result.maxTotal}`],
            ["Average", result.average],
            ["Position", `${ordinal(result.position)} of ${result.classSize}`],
          ].map(([label, value]) => (
            <Card key={label}>
              <CardContent className="flex flex-col gap-1 p-4">
                <span className="text-sm text-muted-foreground">{label}</span>
                <span className="text-2xl font-semibold tabular-nums">{value}</span>
              </CardContent>
            </Card>
          ))}
          <Card>
            <CardContent className="flex flex-col gap-1 p-4">
              <span className="text-sm text-muted-foreground">Grade</span>
              <span>
                <Badge tone={passed ? "success" : "danger"} className="px-3 py-1 text-base">
                  {passed ? "Pass" : "Fail"}
                </Badge>
              </span>
            </CardContent>
          </Card>
        </section>

        {result.subjects.length === 0 ? (
          <p className="text-sm text-muted-foreground">No subjects yet.</p>
        ) : (
          <Table aria-label="My marks">
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                {result.rules.parts.map((p) => (
                  <TableHead key={p.key} className="text-right">
                    {p.label} <span className="font-normal text-muted-foreground">/{p.max}</span>
                  </TableHead>
                ))}
                <TableHead className="text-right">
                  Total <span className="font-normal text-muted-foreground">/{SUBJECT_MAX}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.subjects.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  {result.rules.parts.map((p) => (
                    <TableCell key={p.key} className="text-right tabular-nums">
                      {s[p.key] ?? "—"}
                    </TableCell>
                  ))}
                  <TableCell className="text-right font-semibold tabular-nums">
                    {s.total ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <p className="text-xs text-muted-foreground">
          “—” means no marks yet; a subject without marks counts as 0. Pass: average of{" "}
          {result.rules.passMark} or more.
        </p>
      </div>

      <ResultSlip
        result={result}
        school={school}
        logoSrc={logoVersion ? `/api/school-logo?v=${logoVersion}` : null}
        reportDate={reportDate}
      />
    </>
  );
}
