"use server";

import { revalidatePath } from "next/cache";
import { tenantAction } from "@/lib/authz";
import { field, toFormResult, type FormResult } from "@/lib/form-result";
import { saveStudentMarks, saveSubjectMarks } from "./repository";

export async function saveSubjectMarksAction(
  academicYearId: string,
  classId: string,
  subjectId: string,
  _prev: FormResult<unknown>,
  formData: FormData,
): Promise<FormResult<unknown>> {
  const studentIds = formData.getAll("studentIds").filter((v) => typeof v === "string");
  // Teachers may enter marks too; the repository checks the subject is theirs.
  const result = await tenantAction(["exams.manage", "exams.enter_marks"], (ctx) =>
    saveSubjectMarks(
      ctx,
      { academicYearId, classId, subjectId },
      {
        entries: studentIds.map((studentId) => ({
          studentId,
          midterm: field(formData, `midterm:${studentId}`),
          activities: field(formData, `activities:${studentId}`),
          final: field(formData, `final:${studentId}`),
        })),
      },
    ),
  );
  if (result.ok) revalidatePath("/exams", "layout");
  return toFormResult(
    result,
    result.ok
      ? `Marks saved for ${result.data.saved} ${result.data.saved === 1 ? "student" : "students"}.`
      : undefined,
  );
}

export async function saveStudentMarksAction(
  academicYearId: string,
  classId: string,
  studentId: string,
  _prev: FormResult<unknown>,
  formData: FormData,
): Promise<FormResult<unknown>> {
  const subjectIds = formData.getAll("subjectIds").filter((v) => typeof v === "string");
  // Teachers may save their own subjects; the repository checks each one.
  const result = await tenantAction(["exams.manage", "exams.enter_marks"], (ctx) =>
    saveStudentMarks(
      ctx,
      { academicYearId, classId, studentId },
      {
        entries: subjectIds.map((subjectId) => ({
          subjectId,
          midterm: field(formData, `midterm:${subjectId}`),
          activities: field(formData, `activities:${subjectId}`),
          final: field(formData, `final:${subjectId}`),
        })),
      },
    ),
  );
  if (result.ok) revalidatePath("/exams", "layout");
  return toFormResult(result, "Marks saved.");
}
