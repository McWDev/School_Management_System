import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { NoAccess } from "@/components/layout/no-access";
import { PageHeader } from "@/components/layout/page-header";
import { PrintButton } from "@/components/print/print-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { saveStudentMarksAction } from "@/features/exams/actions";
import { ordinal, ResultSlip } from "@/features/exams/components/result-slip";
import { StudentMarksForm } from "@/features/exams/components/student-marks-form";
import { getStudentResult } from "@/features/exams/repository";
import { schoolToday } from "@/features/fees/repository";
import { getOwnSchool, getSchoolLogoVersion } from "@/features/tenants/repository";
import { getDb } from "@/db";
import { getTenantContextFor } from "@/lib/authz";
import { NotFoundError } from "@/lib/errors";
import { uuidSchema } from "@/lib/validation/fields";
import { z } from "zod";

export const metadata: Metadata = { title: "Student result" };

// Loads permission-scoped data before rendering; navigations may block (loading.tsx shows a skeleton).
export const instant = false;

const paramsSchema = z.object({
  academicYearId: uuidSchema,
  classId: uuidSchema,
  studentId: uuidSchema,
});

/** One student's result: manage the marks on screen, print a result slip. */
export default async function StudentResultPage({
  searchParams,
}: PageProps<"/exams/results/student">) {
  const ctx = await getTenantContextFor("exams.read");
  if (!ctx) return <NoAccess title="Examinations" />;

  const parsed = paramsSchema.safeParse(await searchParams);
  if (!parsed.success) notFound();
  const { academicYearId, classId, studentId } = parsed.data;
  const [result, school, logoVersion, today] = await Promise.all([
    getStudentResult(ctx, parsed.data).catch((error) => {
      if (error instanceof NotFoundError) notFound();
      throw error;
    }),
    getOwnSchool(ctx),
    getSchoolLogoVersion(ctx),
    schoolToday(getDb(), ctx.tenantId),
  ]);
  const reportDate = new Date(`${today}T00:00:00Z`).toLocaleDateString("en-GB", {
    dateStyle: "long",
    timeZone: "UTC",
  });
  const link = (id: string) =>
    `/exams/results/student?academicYearId=${academicYearId}&classId=${classId}&studentId=${id}`;
  const passed = result.result === "pass";

  return (
    <>
      {/* ------------------------------------------------ screen: manage */}
      <div className="no-print flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link
            href={`/exams/results?academicYearId=${academicYearId}&classId=${classId}`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Results of {result.className}
          </Link>
          <div className="flex flex-wrap gap-2">
            {result.previous && (
              <Button asChild size="sm" variant="outline">
                <Link href={link(result.previous.id)}>
                  <ChevronLeft className="size-4" aria-hidden="true" />
                  Previous student
                  <span className="sr-only">: {result.previous.fullName}</span>
                </Link>
              </Button>
            )}
            {result.next && (
              <Button asChild size="sm" variant="outline">
                <Link href={link(result.next.id)}>
                  Next student
                  <span className="sr-only">: {result.next.fullName}</span>
                  <ChevronRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
            )}
            <PrintButton label="Print result" />
          </div>
        </div>
        <PageHeader
          title={result.student.fullName}
          description={`${result.student.studentNumber} · ${result.className} · ${result.academicYearName}`}
        />

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
          <p className="text-sm text-muted-foreground">Add subjects on the Subjects page first.</p>
        ) : (
          <StudentMarksForm
            parts={result.rules.parts}
            key={studentId}
            subjects={result.subjects}
            action={saveStudentMarksAction.bind(null, academicYearId, classId, studentId)}
          />
        )}
      </div>

      {/* --------------------------------------------- print: result slip */}
      <ResultSlip
        result={result}
        school={school}
        logoSrc={logoVersion ? `/api/school-logo?v=${logoVersion}` : null}
        reportDate={reportDate}
      />
    </>
  );
}
