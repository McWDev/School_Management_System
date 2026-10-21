import ExcelJS from "exceljs";
import { connection } from "next/server";
import { monthLabel, paymentMethodLabels } from "@/features/fees/schemas";
import { getSalaryPaymentReport } from "@/features/payroll/repository";
import { getOwnSchool } from "@/features/tenants/repository";
import { getAccess } from "@/lib/authz";

/**
 * GET /api/staff/salary-payments-export?from=…&to=…&staffId=…&month=…&method=…&status=…
 * — the All salary payments report as an Excel workbook. Private: only users
 * of the same school with staff.read receive it; everyone else gets 404.
 */
export async function GET(request: Request) {
  await connection();
  const access = await getAccess();
  const ctx = access?.tenant;
  if (!ctx?.permissions.has("staff.read")) return new Response("Not found", { status: 404 });

  const params = Object.fromEntries(
    [...new URL(request.url).searchParams].filter(([, value]) => value !== ""),
  );
  const [report, school] = await Promise.all([
    getSalaryPaymentReport(ctx, params),
    getOwnSchool(ctx),
  ]);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = school.name;
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Salary payments", {
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    views: [{ state: "frozen", ySplit: 4 }],
  });
  const columns = [
    "Payslip",
    "Payment date",
    "Staff",
    "Work type",
    "Pay month",
    "Method",
    "Reference",
    `Amount (${school.currencyCode})`,
    "Status",
  ];
  sheet.mergeCells(1, 1, 1, columns.length);
  sheet.getCell(1, 1).value = school.name;
  sheet.getCell(1, 1).font = { bold: true, size: 14 };
  sheet.mergeCells(2, 1, 2, columns.length);
  sheet.getCell(2, 1).value = "Salary payments";
  sheet.getCell(2, 1).font = { bold: true, size: 12 };

  const header = sheet.getRow(4);
  header.values = columns;
  header.font = { bold: true };
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
    cell.border = { bottom: { style: "thin" } };
  });

  for (const p of report.rows) {
    const row = sheet.addRow([
      p.payslipNumber,
      // Real dates, so Excel can sort and filter them.
      new Date(`${p.paymentDate}T00:00:00Z`),
      p.fullName,
      p.workTypeName,
      monthLabel(p.month),
      paymentMethodLabels[p.method],
      p.reference ?? "",
      // Exact decimal text with two places; Excel stores it as a number.
      Number(p.amount),
      p.status === "valid" ? "Valid" : `Cancelled: ${p.reversalReason ?? ""}`,
    ]);
    if (p.status === "reversed") row.font = { color: { argb: "FF6B7280" }, strike: true };
  }
  sheet.addRow([]);
  const total = sheet.addRow([
    "",
    "",
    `${report.validCount} valid ${report.validCount === 1 ? "payment" : "payments"}`,
    "",
    "",
    "",
    "Total paid",
    Number(report.totalPaid),
    "",
  ]);
  total.font = { bold: true };

  [12, 14, 26, 16, 16, 14, 18, 14, 28].forEach((width, i) => {
    sheet.getColumn(i + 1).width = width;
  });
  sheet.getColumn(2).numFmt = "dd mmm yyyy";
  sheet.getColumn(8).numFmt = "#,##0.00";

  const buffer = await workbook.xlsx.writeBuffer();
  const today = new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Salary-payments-${today}.xlsx"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
