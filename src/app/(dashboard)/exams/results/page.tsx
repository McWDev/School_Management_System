import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileSpreadsheet, Users } from "lucide-react";
import { NoAccess } from "@/components/layout/no-access";
import { PageHeader } from "@/components/layout/page-header";
import { Letterhead } from "@/components/print/letterhead";
import { PrintButton } from "@/components/print/print-button";
import { PrintPageStyle } from "@/components/print/print-page-style";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getClassResults } from "@/features/exams/repository";
import { examSelectionSchema, PASS_MARK } from "@/features/exams/schemas";
import { getOwnSchool, getSchoolLogoVersion } from "@/features/tenants/repository";
import { getTenantContextFor } from "@/lib/authz";
import { NotFoundError } from "@/lib/errors";

export const metadata: Metadata = { title: "Class results" };

// Loads permission-scoped data before rendering; navigations may block (loading.tsx shows a skeleton).
export const instant = false;

/** Each student's subject totals, total, average and Pass/Fail. Printable. */
export default async function ClassResultsPage({ searchParams }: PageProps<"/exams/results">) {
  const ctx = await getTenantContextFor("exams.read");
  if (!ctx) return <NoAccess title="Examinations" />;

  const { academicYearId, classId } = examSelectionSchema.parse(await searchParams);
  if (!academicYearId || !classId) notFound();
  const [results, school, logoVersion] = await Promise.all([
    getClassResults(ctx, { academicYearId, classId }).catch((error) => {
      if (error instanceof NotFoundError) notFound();
      throw error;
    }),
    getOwnSchool(ctx),
    getSchoolLogoVersion(ctx),
  ]);
  const passed = results.rows.filter((r) => r.result === "pass").length;

  return (
    <>
      {/* A sheet with many subjects fits a landscape page; only this page prints that way. */}
      <PrintPageStyle size="A4 landscape" />
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <Link
          href={`/exams?academicYearId=${academicYearId}&classId=${classId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {results.className} subjects
        </Link>
        <div className="flex flex-wrap gap-2">
          {results.rows.length > 0 && results.subjects.length > 0 && (
            <Button asChild variant="outline">
              {/* A file download, so a plain link rather than client navigation. */}
              <a
                href={`/api/exams/results-export?academicYearId=${academicYearId}&classId=${classId}`}
                download
              >
                <FileSpreadsheet className="size-4" aria-hidden="true" />
                Export to Excel
              </a>
            </Button>
          )}
          <PrintButton label="Print results" />
        </div>
      </div>
      <div className="no-print">
        <PageHeader
          title={`Results · ${results.className}`}
          description={`${results.academicYearName}. Each subject is out of 100 (Midterm 30 + Activities 20 + Final 50). Pass: average of ${PASS_MARK} or more.`}
        />
      </div>

      {results.rows.length === 0 || results.subjects.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title={results.rows.length === 0 ? "No students in this class" : "No subjects yet"}
            description={
              results.rows.length === 0
                ? `No Active students are placed in ${results.className} for ${results.academicYearName}.`
                : "Add subjects on the Subjects page first."
            }
          />
        </Card>
      ) : (
        <article
          aria-label={`Results of ${results.className}`}
          className="print-sheet rounded-md border bg-white p-4 text-black shadow-card print:border-0 print:p-0 print:shadow-none"
        >
          <div className="hidden print:block">
            <Letterhead
              school={school}
              logoSrc={logoVersion ? `/api/school-logo?v=${logoVersion}` : null}
            />
            <h1 className="mt-3 text-lg font-bold">
              Results · {results.className} · {results.academicYearName}
            </h1>
          </div>
          <p className="mb-2 text-sm">
            {passed} of {results.rows.length} {results.rows.length === 1 ? "student" : "students"}{" "}
            passed.
          </p>
          <div className="print-scroll overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-black text-left">
                  <th scope="col" className="py-2 pr-3">
                    #
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    Student
                  </th>
                  {results.subjects.map((s) => (
                    <th key={s.id} scope="col" className="px-2 py-2 text-right">
                      {s.name}
                      <span className="block text-xs font-normal text-neutral-600">/100</span>
                    </th>
                  ))}
                  <th scope="col" className="px-2 py-2 text-right">
                    Total
                    <span className="block text-xs font-normal text-neutral-600">
                      /{results.subjects.length * 100}
                    </span>
                  </th>
                  <th scope="col" className="px-2 py-2 text-right">
                    Average
                  </th>
                  <th scope="col" className="py-2 pl-2 text-left">
                    Grade
                  </th>
                </tr>
              </thead>
              <tbody>
                {results.rows.map((row, index) => (
                  <tr key={row.studentId} className="border-b border-neutral-300">
                    <td className="py-1.5 pr-3 tabular-nums text-neutral-600">{index + 1}</td>
                    <th scope="row" className="py-1.5 pr-3 text-left font-medium">
                      <Link
                        href={`/exams/results/student?academicYearId=${academicYearId}&classId=${classId}&studentId=${row.studentId}`}
                        className="underline-offset-2 hover:underline print:no-underline"
                      >
                        {row.fullName}
                      </Link>
                      <span className="block text-xs font-normal text-neutral-600 tabular-nums">
                        {row.studentNumber}
                      </span>
                    </th>
                    {results.subjects.map((s) => (
                      <td key={s.id} className="px-2 py-1.5 text-right tabular-nums">
                        {row.totals[s.id] ?? <span className="text-neutral-500">—</span>}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right font-semibold tabular-nums">
                      {row.total}
                    </td>
                    <td className="px-2 py-1.5 text-right font-semibold tabular-nums">
                      {row.average}
                    </td>
                    <td className="py-1.5 pl-2">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-xs font-bold uppercase ${row.result === "pass" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}
                      >
                        {row.result === "pass" ? "Pass" : "Fail"}
                      </span>
                      {row.missing > 0 && (
                        <span className="block text-xs text-neutral-600">
                          {row.missing} {row.missing === 1 ? "subject" : "subjects"} missing
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-neutral-600">
            “—” means no marks entered for that subject; it counts as 0. The total and average
            include all subjects.
          </p>
        </article>
      )}
    </>
  );
}
