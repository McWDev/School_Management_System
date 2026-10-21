import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BookOpen, ClipboardList, Users } from "lucide-react";
import { NoAccess } from "@/components/layout/no-access";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { saveSubjectMarksAction } from "@/features/exams/actions";
import { MarksSheetForm } from "@/features/exams/components/marks-sheet-form";
import { countMarkedBySubject, getExamChoices, getSubjectMarks } from "@/features/exams/repository";
import { examSelectionSchema } from "@/features/exams/schemas";
import { getTenantContextFor } from "@/lib/authz";

export const metadata: Metadata = { title: "Examinations" };

// Loads permission-scoped data before rendering; navigations may block (loading.tsx shows a skeleton).
export const instant = false;

/**
 * Examinations: choose the year and class, then a subject, and fill each
 * student's Midterm, Activities and Final.
 */
export default async function ExamsPage({ searchParams }: PageProps<"/exams">) {
  const ctx = await getTenantContextFor("exams.read");
  if (!ctx) return <NoAccess title="Examinations" />;

  const choices = await getExamChoices(ctx);
  const picked = examSelectionSchema.parse(await searchParams);
  const year =
    choices.academicYears.find((y) => y.id === picked.academicYearId) ??
    choices.academicYears.find((y) => y.status === "current") ??
    choices.academicYears[0];
  const cls = choices.classes.find((c) => c.id === picked.classId);
  const subject = cls ? choices.subjects.find((s) => s.id === picked.subjectId) : undefined;
  const base = year && cls ? `/exams?academicYearId=${year.id}&classId=${cls.id}` : "/exams";

  const [counts, sheet] = await Promise.all([
    year && cls && !subject
      ? countMarkedBySubject(ctx, { academicYearId: year.id, classId: cls.id })
      : null,
    year && cls && subject
      ? getSubjectMarks(ctx, { academicYearId: year.id, classId: cls.id, subjectId: subject.id })
      : null,
  ]);

  return (
    <>
      <PageHeader
        title="Examinations"
        description="Choose a class and a subject, then fill each student's Midterm, Activities and Final."
        actions={
          year &&
          cls && (
            <Button asChild variant="outline">
              <Link href={`/exams/results?academicYearId=${year.id}&classId=${cls.id}`}>
                Class results
              </Link>
            </Button>
          )
        }
      />

      <form className="flex flex-wrap items-end gap-2" aria-label="Choose academic year and class">
        <div className="flex flex-col gap-1">
          <label htmlFor="exams-year" className="text-sm font-medium">
            Academic year
          </label>
          <Select
            id="exams-year"
            name="academicYearId"
            defaultValue={year?.id ?? ""}
            className="w-auto"
          >
            {choices.academicYears.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
                {y.status === "current" ? " (Current)" : ""}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="exams-class" className="text-sm font-medium">
            Class
          </label>
          <Select id="exams-class" name="classId" defaultValue={cls?.id ?? ""} className="w-auto">
            <option value="" disabled>
              Choose a class
            </option>
            {choices.classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" variant="outline">
          Show students
        </Button>
      </form>

      {!year || choices.classes.length === 0 || choices.subjects.length === 0 ? (
        <Card>
          <EmptyState
            icon={ClipboardList}
            title="Set up the school first"
            description="Examinations need an academic year, classes and subjects. Add them on the Academic Year, Classes and Subjects pages."
          />
        </Card>
      ) : !cls ? (
        <Card>
          <EmptyState
            icon={Users}
            title="Choose a class"
            description="Choose the academic year and class, then “Show students”."
          />
        </Card>
      ) : sheet && subject ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <Link
                href={base}
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
                All subjects of {cls.name}
              </Link>
              <h2 className="mt-1 text-lg font-semibold">
                {subject.name} · {cls.name} · {year.name}
              </h2>
              {subject.teacherName && (
                <p className="text-sm text-muted-foreground">Teacher: {subject.teacherName}</p>
              )}
            </div>
          </div>
          {!subject.canEnter && (
            <p className="text-sm text-muted-foreground">
              Only this subject&apos;s teacher or an exam administrator can enter these marks.
            </p>
          )}
          {sheet.rows.length === 0 ? (
            <Card>
              <EmptyState
                icon={Users}
                title="No students in this class"
                description={`No Active students are placed in ${cls.name} for ${year.name}.`}
              />
            </Card>
          ) : (
            <MarksSheetForm
              parts={sheet.rules.parts}
              key={`${year.id}:${cls.id}:${subject.id}`}
              rows={sheet.rows}
              readOnly={!subject.canEnter}
              action={saveSubjectMarksAction.bind(null, year.id, cls.id, subject.id)}
            />
          )}
        </>
      ) : (
        counts && (
          <>
            <h2 className="text-lg font-semibold">
              {cls.name} · {year.name}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                · {counts.students} {counts.students === 1 ? "student" : "students"}
              </span>
            </h2>
            <Table aria-label={`Subjects of ${cls.name}`}>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead className="hidden sm:table-cell">Teacher</TableHead>
                  <TableHead>Marks entered</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {choices.subjects.map((s) => {
                  const marked = counts.marked[s.id] ?? 0;
                  const complete = counts.students > 0 && marked >= counts.students;
                  return (
                    <TableRow key={s.id}>
                      <TableCell>
                        <span className="flex items-center gap-2 font-medium">
                          <BookOpen className="size-4 text-muted-foreground" aria-hidden="true" />
                          {s.name}
                        </span>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">{s.teacherName ?? "—"}</TableCell>
                      <TableCell>
                        <Badge tone={complete ? "success" : marked > 0 ? "warning" : "neutral"}>
                          {marked} of {counts.students}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          <Button asChild size="sm" variant={s.canEnter ? "primary" : "outline"}>
                            <Link href={`${base}&subjectId=${s.id}`}>
                              {s.canEnter ? "Enter marks" : "View marks"}
                              <span className="sr-only"> for {s.name}</span>
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </>
        )
      )}
    </>
  );
}
