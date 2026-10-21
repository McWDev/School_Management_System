import ExcelJS from "exceljs";
import { connection } from "next/server";
import { getClassResults } from "@/features/exams/repository";
import { describeParts, examSelectionSchema } from "@/features/exams/schemas";
import { getOwnSchool } from "@/features/tenants/repository";
import { getAccess } from "@/lib/authz";
import { AppError } from "@/lib/errors";

/** "Form 1" → "Form-1", safe for a file name. */
function slug(text: string) {
  return text.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "") || "results";
}

/**
 * GET /api/exams/results-export?academicYearId=…&classId=… — the class
 * results as an Excel workbook. Private: only users of the same school with
 * exams.read receive it; everyone else gets 404.
 */
export async function GET(request: Request) {
  await connection();
  const access = await getAccess();
  const ctx = access?.tenant;
  if (!ctx?.permissions.has("exams.read")) return new Response("Not found", { status: 404 });

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const { academicYearId, classId } = examSelectionSchema.parse(params);
  if (!academicYearId || !classId) return new Response("Not found", { status: 404 });

  let results;
  try {
    results = await getClassResults(ctx, { academicYearId, classId });
  } catch (error) {
    if (error instanceof AppError) return new Response("Not found", { status: 404 });
    throw error;
  }
  const school = await getOwnSchool(ctx);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = school.name;
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Results", {
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    views: [{ state: "frozen", ySplit: 5, xSplit: 3 }],
  });

  const columns = [
    "#",
    "Student ID",
    "Student",
    ...results.subjects.map((s) => `${s.name} (/100)`),
    `Total (/${results.subjects.length * 100})`,
    "Average",
    "Grade",
  ];
  sheet.mergeCells(1, 1, 1, columns.length);
  sheet.getCell(1, 1).value = school.name;
  sheet.getCell(1, 1).font = { bold: true, size: 14 };
  sheet.mergeCells(2, 1, 2, columns.length);
  sheet.getCell(2, 1).value = `Results · ${results.className} · ${results.academicYearName}`;
  sheet.getCell(2, 1).font = { bold: true, size: 12 };
  sheet.mergeCells(3, 1, 3, columns.length);
  sheet.getCell(3, 1).value =
    `Each subject is out of 100 (${describeParts(results.rules)}). A subject without marks counts as 0. Pass: average of ${results.rules.passMark} or more.`;
  sheet.getCell(3, 1).font = { italic: true, size: 9, color: { argb: "FF555555" } };

  const header = sheet.getRow(5);
  header.values = columns;
  header.font = { bold: true };
  header.alignment = { vertical: "middle", wrapText: true };
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
    cell.border = { bottom: { style: "thin" } };
  });

  // Marks are exact decimal text with at most two places; Excel stores them as numbers.
  const asNumber = (value: string | null) => (value === null ? null : Number(value));
  results.rows.forEach((row, index) => {
    const line = sheet.addRow([
      index + 1,
      row.studentNumber,
      row.fullName,
      ...results.subjects.map((s) => asNumber(row.totals[s.id])),
      asNumber(row.total),
      asNumber(row.average),
      row.result === "pass" ? "Pass" : "Fail",
    ]);
    const grade = line.getCell(columns.length);
    grade.font = { bold: true, color: { argb: row.result === "pass" ? "FF166534" : "FF991B1B" } };
  });

  sheet.getColumn(1).width = 5;
  sheet.getColumn(2).width = 12;
  sheet.getColumn(3).width = 28;
  for (let c = 4; c <= columns.length; c++) {
    sheet.getColumn(c).width = 12;
    sheet.getColumn(c).alignment = { horizontal: c === columns.length ? "left" : "right" };
  }
  sheet.getColumn(columns.length - 1).numFmt = "0.0";

  const passed = results.rows.filter((r) => r.result === "pass").length;
  sheet.addRow([]);
  const noun = results.rows.length === 1 ? "student" : "students";
  sheet.addRow(["", "", `${passed} of ${results.rows.length} ${noun} passed.`]);

  const buffer = await workbook.xlsx.writeBuffer();
  const fileName = `Results-${slug(results.className)}-${slug(results.academicYearName)}.xlsx`;
  return new Response(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
