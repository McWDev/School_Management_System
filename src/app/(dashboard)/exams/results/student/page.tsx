import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, UserRound } from "lucide-react";
import { NoAccess } from "@/components/layout/no-access";
import { PageHeader } from "@/components/layout/page-header";
import { Letterhead } from "@/components/print/letterhead";
import { PrintButton } from "@/components/print/print-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { saveStudentMarksAction } from "@/features/exams/actions";
import { StudentMarksForm } from "@/features/exams/components/student-marks-form";
import { getStudentResult } from "@/features/exams/repository";
import { schoolToday } from "@/features/fees/repository";
import { describeParts, SUBJECT_MAX } from "@/features/exams/schemas";
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

function ordinal(n: number) {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${{ 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th"}`;
}

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
  const photoSrc = result.student.photoVersion
    ? `/api/student-photo/${result.student.id}?v=${result.student.photoVersion}`
    : null;
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
      <article className="hidden bg-white text-black print:block">
        <Letterhead
          school={school}
          logoSrc={logoVersion ? `/api/school-logo?v=${logoVersion}` : null}
        />
        <div className="mt-4 flex items-baseline justify-between gap-4">
          <h1 className="text-xl font-bold uppercase tracking-wide">Student result</h1>
          <p className="text-sm">
            Report date: <strong>{reportDate}</strong>
          </p>
        </div>
        <div className="mt-4 flex items-start gap-5">
          <div className="flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-md border border-neutral-400">
            {photoSrc ? (
              // eslint-disable-next-line @next/next/no-img-element -- private, session-protected photo route
              <img
                src={photoSrc}
                alt={`Photo of ${result.student.fullName}`}
                className="size-full object-cover"
              />
            ) : (
              <UserRound className="size-12 text-neutral-400" aria-label="No photo" />
            )}
          </div>
          <dl className="grid flex-1 grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-neutral-600">Student</dt>
            <dd className="font-medium">{result.student.fullName}</dd>
            <dt className="text-neutral-600">Student ID</dt>
            <dd className="tabular-nums">{result.student.studentNumber}</dd>
            <dt className="text-neutral-600">Gender</dt>
            <dd>{result.student.gender === "male" ? "Male" : "Female"}</dd>
            <dt className="text-neutral-600">Class</dt>
            <dd>{result.className}</dd>
            <dt className="text-neutral-600">Academic year</dt>
            <dd>{result.academicYearName}</dd>
          </dl>
        </div>
        <table className="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-black text-left">
              <th scope="col" className="py-1.5">
                Subject
              </th>
              {result.rules.parts.map((p) => (
                <th key={p.key} scope="col" className="py-1.5 text-right">
                  {p.label} /{p.max}
                </th>
              ))}
              <th scope="col" className="py-1.5 text-right">
                Total /{SUBJECT_MAX}
              </th>
            </tr>
          </thead>
          <tbody>
            {result.subjects.map((s) => (
              <tr key={s.id} className="border-b border-neutral-300">
                <td className="py-1.5">{s.name}</td>
                {result.rules.parts.map((p) => (
                  <td key={p.key} className="py-1.5 text-right tabular-nums">
                    {s[p.key] ?? "—"}
                  </td>
                ))}
                <td className="py-1.5 text-right font-semibold tabular-nums">{s.total ?? "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-bold">
              <th scope="row" colSpan={result.rules.parts.length + 1} className="py-2 text-left">
                Total
              </th>
              <td className="py-2 text-right tabular-nums">
                {result.total} / {result.maxTotal}
              </td>
            </tr>
          </tfoot>
        </table>
        <div className="mt-3 flex flex-wrap gap-x-8 gap-y-1 text-sm">
          <p>
            Average: <strong className="tabular-nums">{result.average}</strong>
          </p>
          <p>
            Position:{" "}
            <strong>
              {ordinal(result.position)} of {result.classSize}
            </strong>
          </p>
          <p>
            Grade: <strong className="uppercase">{passed ? "Pass" : "Fail"}</strong>
          </p>
        </div>
        <p className="mt-2 text-xs text-neutral-600">
          Each subject is out of 100 ({describeParts(result.rules)}). A subject without marks counts
          as 0. Pass: average of {result.rules.passMark} or more.
        </p>
        <div className="mt-12 flex justify-between gap-8 text-sm">
          <p className="min-w-48 border-t border-black pt-1 text-center">Class teacher</p>
          <p className="min-w-48 border-t border-black pt-1 text-center">
            {school.managerName ? `${school.managerName} (Manager)` : "Manager"}
          </p>
        </div>
      </article>
    </>
  );
}
