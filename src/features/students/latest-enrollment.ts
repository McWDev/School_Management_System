import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { studentEnrollments, students } from "@/db/schema";

/**
 * Lateral subquery: the latest enrollment of each student (their current class
 * and year). Join with `.leftJoinLateral(latestEnrollment(), sql`true`)`.
 */
export function latestEnrollment() {
  return getDb()
    .select({
      enrollmentId: studentEnrollments.id,
      classId: studentEnrollments.classId,
      academicYearId: studentEnrollments.academicYearId,
    })
    .from(studentEnrollments)
    .where(
      and(
        eq(studentEnrollments.tenantId, students.tenantId),
        eq(studentEnrollments.studentId, students.id),
      ),
    )
    .orderBy(desc(studentEnrollments.createdAt))
    .limit(1)
    .as("latest");
}
