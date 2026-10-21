import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { NoAccess } from "@/components/layout/no-access";
import { Letterhead } from "@/components/print/letterhead";
import { PrintButton } from "@/components/print/print-button";
import { monthLabel, paymentMethodLabels } from "@/features/fees/schemas";
import { getPayslip } from "@/features/payroll/repository";
import { getOwnSchool, getSchoolLogoVersion } from "@/features/tenants/repository";
import { getTenantContextFor } from "@/lib/authz";
import { NotFoundError } from "@/lib/errors";
import { formatMoney, toCents } from "@/lib/money";

export const metadata: Metadata = { title: "Payslip" };

// Loads permission-scoped data before rendering; navigations may block (loading.tsx shows a skeleton).
export const instant = false;

function formatDate(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", {
    dateStyle: "long",
    timeZone: "UTC",
  });
}

/** A printable payslip on the school's letterhead. */
export default async function PayslipPage({ params }: PageProps<"/staff/salaries/payslips/[id]">) {
  const ctx = await getTenantContextFor("staff.read");
  if (!ctx) return <NoAccess title="Payslip" />;

  const { id } = await params;
  const [slip, school, logoVersion] = await Promise.all([
    getPayslip(ctx, id).catch((error) => {
      if (error instanceof NotFoundError) notFound();
      throw error;
    }),
    getOwnSchool(ctx),
    getSchoolLogoVersion(ctx),
  ]);
  const money = (amount: string) => formatMoney(amount, slip.currencyCode);
  const reversed = slip.status === "reversed";
  const lines: [string, string, boolean?][] = [
    ["Monthly salary", money(slip.baseSalary)],
    ["Bonus", toCents(slip.bonus) > BigInt(0) ? `+ ${money(slip.bonus)}` : "—"],
    ["Deduction", toCents(slip.deduction) > BigInt(0) ? `− ${money(slip.deduction)}` : "—"],
    ["Net pay", money(slip.net), true],
  ];

  return (
    <>
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <Link
          href={`/staff/salaries?month=${slip.month.slice(0, 7)}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Salaries · {monthLabel(slip.month)}
        </Link>
        <PrintButton label="Print payslip" />
      </div>

      <article
        aria-label={`Payslip ${slip.payslipNumber}`}
        className="mx-auto w-full max-w-2xl rounded-md border bg-white p-6 text-black shadow-card print:max-w-none print:border-0 print:p-0 print:shadow-none"
      >
        <Letterhead
          school={school}
          logoSrc={logoVersion ? `/api/school-logo?v=${logoVersion}` : null}
        />
        <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-xl font-bold uppercase tracking-wide">Payslip</h1>
          <p className="text-sm">
            No. <strong className="tabular-nums">{slip.payslipNumber}</strong>
          </p>
        </div>
        {reversed && (
          <p
            role="status"
            className="mt-3 rounded-md border-2 border-red-700 p-2 text-center font-bold uppercase text-red-700"
          >
            Cancelled — not valid. Reason: {slip.reversalReason}
          </p>
        )}

        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr_auto_1fr]">
          <dt className="text-neutral-600">Staff</dt>
          <dd className="font-medium">{slip.staff.fullName}</dd>
          <dt className="text-neutral-600">Work type</dt>
          <dd>{slip.staff.workTypeName}</dd>
          <dt className="text-neutral-600">Pay month</dt>
          <dd>{monthLabel(slip.month)}</dd>
          <dt className="text-neutral-600">Payment date</dt>
          <dd>{formatDate(slip.paymentDate)}</dd>
          <dt className="text-neutral-600">Method</dt>
          <dd>{paymentMethodLabels[slip.method]}</dd>
          {slip.reference && (
            <>
              <dt className="text-neutral-600">Reference</dt>
              <dd>{slip.reference}</dd>
            </>
          )}
        </dl>

        <table className="mt-4 w-full border-collapse text-sm">
          <tbody>
            {lines.map(([name, value, strong]) => (
              <tr
                key={name}
                className={
                  strong ? "border-t-2 border-black font-bold" : "border-b border-neutral-300"
                }
              >
                <th scope="row" className="py-1.5 text-left font-[inherit]">
                  {name}
                </th>
                <td className="py-1.5 text-right tabular-nums">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {slip.note && <p className="mt-1 text-xs text-neutral-600">Note: {slip.note}</p>}

        <table className="mt-4 w-full border-collapse text-sm">
          <tbody>
            <tr className="bg-neutral-100 font-bold">
              <th scope="row" className="px-2 py-2 text-left">
                Paid with this payslip
              </th>
              <td className="px-2 py-2 text-right tabular-nums">{money(slip.amount)}</td>
            </tr>
            <tr className="border-b border-neutral-300">
              <th scope="row" className="px-2 py-1.5 text-left font-normal">
                Paid for {monthLabel(slip.month)} so far
              </th>
              <td className="px-2 py-1.5 text-right tabular-nums">{money(slip.paidToDate)}</td>
            </tr>
            <tr>
              <th scope="row" className="px-2 py-1.5 text-left font-normal">
                Still to pay
              </th>
              <td className="px-2 py-1.5 text-right tabular-nums">{money(slip.remaining)}</td>
            </tr>
          </tbody>
        </table>

        <div className="mt-12 flex flex-wrap justify-between gap-6 text-sm">
          <p>
            Paid by: <span className="font-medium">{slip.recordedBy ?? "—"}</span>
          </p>
          <p className="min-w-48 border-t border-black pt-1 text-center">Received by (signature)</p>
        </div>
      </article>
    </>
  );
}
