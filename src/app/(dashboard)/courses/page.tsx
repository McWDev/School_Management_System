import { redirect } from "next/navigation";

/** Courses / Subjects became the Subjects tab (2026-10-19). */
export default function CoursesPage() {
  redirect("/subjects");
}
