import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, FileSpreadsheet, Receipt } from "lucide-react";
import { NoAccess } from "@/components/layout/no-access";
import { PageHeader } from "@/components/layout/page-header";
import { Letterhead } from "@/components/print/letterhead";
import { PrintButton } from "@/components/print/print-button";
import { PrintPageStyle } from "@/components/print/print-page-style";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/input";
import { monthLabel, PAYMENT_METHODS, paymentMethodLabels } from "@/features/fees/schemas";
import {
  getSalaryPaymentReport,
  listStaffForReport,
  SALARY_REPORT_LIMIT,
} from "@/features/payroll/repository";
import { getOwnSchool, getSchoolLogoVersion } from "@/features/tenants/repository";
import { getTenantContextFor } from "@/lib/authz";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "All salary payments" };

// Loads permission-scoped data before rendering; navigations may block (loading.tsx shows a skeleton).
export const instant = false;

function formatDate(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", {
    dateStyle: "medium",
    timeZone: "UTC",
  });
}

/** Every salary payment, filtered by date, staff, pay month, method and status. */
export default async function SalaryPaymentsReportPage({
  searchParams,
}: PageProps<"/staff/salaries/payments">) {
  const ctx = await getTenantContextFor("staff.read");
  if (!ctx) return <NoAccess title="Salaries" />;

  const params = await searchParams;
  const raw = Object.fromEntries(
    Object.entries(params).filter(([, v]) => typeof v === "string" && v !== ""),
  ) as Record<string, string>;
  const [report, staffOptions, school, logoVersion] = await Promise.all([
    getSalaryPaymentReport(ctx, raw),
    listStaffForReport(ctx),
    getOwnSchool(ctx),
    getSchoolLogoVersion(ctx),
  ]);
  const { filters } = report;
  const money = (amount: string) => formatMoney(amount, school.currencyCode);
  const query = new URLSearchParams(raw).toString();
  const filtered = Object.keys(raw).length > 0;
  const staffName = staffOptions.find((s) => s.id === filters.staffId)?.fullName;
  // A plain-language summary of the filters, for the printed report.
  const described = [
    filters.from && `from ${formatDate(filters.from)}`,
    filters.to && `to ${formatDate(filters.to)}`,
    staffName && `staff: ${staffName}`,
    filters.month && `pay month: ${monthLabel(filters.month)}`,
    filters.method && `method: ${paymentMethodLabels[filters.method]}`,
    filters.status && (filters.status === "valid" ? "valid payments" : "cancelled payments"),
  ].filter(Boolean);

  return (
    <>
      <PrintPageStyle size="A4 landscape" />
      <div className="no-print flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link
            href="/staff/salaries"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Salaries
          </Link>
          {report.rows.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                {/* A file download, so a plain link rather than client navigation. */}
                <a href={`/api/staff/salary-payments-export?${query}`} download>
                  <FileSpreadsheet className="size-4" aria-hidden="true" />
                  Export to Excel
                </a>
              </Button>
              <PrintButton label="Print report" />
            </div>
          )}
        </div>
        <PageHeader
          title="All salary payments"
          description="Every salary payment. Filter by payment date, staff member, pay month, method or status."
        />

        <form
          className="flex flex-wrap items-end gap-3 rounded-md border p-3"
          aria-label="Filter payments"
        >
          {[
            ["from", "Paid from", "date", filters.from],
            ["to", "Paid to", "date", filters.to],
            ["month", "Pay month", "month", filters.month?.slice(0, 7)],
          ].map(([name, label, type, value]) => (
            <div key={name} className="flex flex-col gap-1">
              <label htmlFor={`report-${name}`} className="text-sm font-medium">
                {label}
              </label>
              <Input
                id={`report-${name}`}
                name={name}
                type={type}
                defaultValue={value ?? ""}
                className="w-auto"
              />
            </div>
          ))}
          <div className="flex flex-col gap-1">
            <label htmlFor="report-staff" className="text-sm font-medium">
              Staff
            </label>
            <Select
              id="report-staff"
              name="staffId"
              defaultValue={filters.staffId ?? ""}
              className="w-auto"
            >
              <option value="">All staff</option>
              {staffOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="report-method" className="text-sm font-medium">
              Method
            </label>
            <Select
              id="report-method"
              name="method"
              defaultValue={filters.method ?? ""}
              className="w-auto"
            >
              <option value="">All methods</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {paymentMethodLabels[m]}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="report-status" className="text-sm font-medium">
              Status
            </label>
            <Select
              id="report-status"
              name="status"
              defaultValue={filters.status ?? ""}
              className="w-auto"
            >
              <option value="">Valid and cancelled</option>
              <option value="valid">Valid</option>
              <option value="reversed">Cancelled</option>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button type="submit">Apply filters</Button>
            {filtered && (
              <Button asChild variant="ghost">
                <Link href="/staff/salaries/payments">Clear</Link>
              </Button>
            )}
          </div>
        </form>
      </div>

      {report.rows.length === 0 ? (
        <Card className="no-print">
          <EmptyState
            icon={Receipt}
            title={filtered ? "No payments match your filters" : "No salary payments yet"}
            description={
              filtered
                ? "Try different dates, staff, month, method or status."
                : "Payments appear here when salaries are paid on the Salaries page."
            }
          />
        </Card>
      ) : (
        <article
          aria-label="Salary payments"
          className="print-sheet rounded-md border bg-white p-4 text-black shadow-card print:border-0 print:p-0 print:shadow-none"
        >
          <div className="hidden print:block">
            <Letterhead
              school={school}
              logoSrc={logoVersion ? `/api/school-logo?v=${logoVersion}` : null}
            />
            <h1 className="mt-3 text-lg font-bold">Salary payments</h1>
            <p className="text-sm">{described.length ? described.join(" · ") : "All payments"}</p>
          </div>
          <p className="mb-2 text-sm" role="status">
            {report.validCount} {report.validCount === 1 ? "payment" : "payments"} · Total paid:{" "}
            <strong className="tabular-nums">{money(report.totalPaid)}</strong>
            {report.reversedCount > 0 && ` · ${report.reversedCount} cancelled (not counted)`}
          </p>
          {report.rows.length >= SALARY_REPORT_LIMIT && (
            <p className="mb-2 text-xs text-neutral-600">
              Showing the latest {SALARY_REPORT_LIMIT} payments. Narrow the filters to see others.
            </p>
          )}
          <div className="print-scroll overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-black text-left">
                  <th scope="col" className="py-2 pr-3">
                    Payslip
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    Date
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    Staff
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    Pay month
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    Method
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    Reference
                  </th>
                  <th scope="col" className="py-2 text-right">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((p) => (
                  <tr key={p.id} className="border-b border-neutral-300">
                    <td className="py-1.5 pr-3 tabular-nums">
                      <Link
                        href={`/staff/salaries/payslips/${p.id}`}
                        className="font-medium underline-offset-2 hover:underline"
                      >
                        {p.payslipNumber}
                      </Link>
                    </td>
                    <td className="py-1.5 pr-3">{formatDate(p.paymentDate)}</td>
                    <td className="py-1.5 pr-3">
                      {p.fullName}
                      <span className="block text-xs text-neutral-600">{p.workTypeName}</span>
                    </td>
                    <td className="py-1.5 pr-3">{monthLabel(p.month)}</td>
                    <td className="py-1.5 pr-3">{paymentMethodLabels[p.method]}</td>
                    <td className="py-1.5 pr-3">{p.reference ?? "—"}</td>
                    <td className="py-1.5 text-right">
                      <span
                        className={`tabular-nums ${p.status === "reversed" ? "text-neutral-500 line-through" : "font-medium"}`}
                      >
                        {money(p.amount)}
                      </span>
                      {p.status === "reversed" && (
                        <Badge tone="neutral" className="ml-2">
                          Cancelled
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-bold">
                  <th scope="row" colSpan={6} className="py-2 text-left">
                    Total paid (valid payments)
                  </th>
                  <td className="py-2 text-right tabular-nums">{money(report.totalPaid)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </article>
      )}
    </>
  );
}
