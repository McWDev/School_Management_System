import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Banknote, FileText, HandCoins, Wallet } from "lucide-react";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { NoAccess } from "@/components/layout/no-access";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getDb } from "@/db";
import { KpiTile } from "@/features/dashboard/components/kpi-tile";
import { currentSchoolMonth, schoolToday } from "@/features/fees/repository";
import { monthLabel, monthSchema, paymentMethodLabels } from "@/features/fees/schemas";
import { cancelSalaryPaymentAction, paySalaryAction } from "@/features/payroll/actions";
import { PaySalaryDialog } from "@/features/payroll/components/pay-salary-dialog";
import { getPayroll, listMonthPayments } from "@/features/payroll/repository";
import { getOwnSchool } from "@/features/tenants/repository";
import { getTenantContextFor } from "@/lib/authz";
import { formatMoney, toCents } from "@/lib/money";
import { can, hasAllBranches } from "@/lib/tenant-context";

export const metadata: Metadata = { title: "Salaries" };

// Loads permission-scoped data before rendering; navigations may block (loading.tsx shows a skeleton).
export const instant = false;

const STATE = {
  unpaid: { label: "Unpaid", tone: "danger" },
  part: { label: "Part paid", tone: "warning" },
  paid: { label: "Paid", tone: "success" },
} as const;

function formatDate(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", {
    dateStyle: "medium",
    timeZone: "UTC",
  });
}

/** The month's payroll: salary, bonus, deduction, net pay and payments. */
export default async function SalariesPage({ searchParams }: PageProps<"/staff/salaries">) {
  const ctx = await getTenantContextFor("staff.read");
  if (!ctx) return <NoAccess title="Salaries" />;

  const params = await searchParams;
  const chosen = monthSchema.safeParse(params.month);
  const month = chosen.success ? chosen.data : await currentSchoolMonth(ctx);
  const [payroll, payments, school, today] = await Promise.all([
    getPayroll(ctx, month),
    listMonthPayments(ctx, month),
    getOwnSchool(ctx),
    schoolToday(getDb(), ctx.tenantId),
  ]);
  const currency = school.currencyCode;
  const money = (amount: string) => formatMoney(amount, currency);
  const canPay = can(ctx, "staff.manage") && hasAllBranches(ctx);
  const label = monthLabel(month);

  return (
    <>
      <Link
        href="/staff"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        School Staff
      </Link>
      <PageHeader
        title="Salaries"
        description="Pay each staff member's monthly salary, with an optional bonus or deduction."
        actions={
          <Button asChild variant="outline">
            <Link href="/staff/salaries/payments">
              <FileText className="size-4" aria-hidden="true" />
              All payments report
            </Link>
          </Button>
        }
      />

      <form className="flex flex-wrap items-end gap-2" aria-label="Choose month">
        <div className="flex flex-col gap-1">
          <label htmlFor="salary-month" className="text-sm font-medium">
            Month
          </label>
          <Input
            id="salary-month"
            name="month"
            type="month"
            defaultValue={month.slice(0, 7)}
            className="w-auto"
          />
        </div>
        <Button type="submit" variant="outline">
          Show
        </Button>
      </form>

      <section aria-label={`Salary figures for ${label}`} className="grid gap-3 sm:grid-cols-3">
        <KpiTile icon={Banknote} label={`Payroll for ${label}`} value={money(payroll.totals.net)} />
        <KpiTile icon={HandCoins} tone="success" label="Paid" value={money(payroll.totals.paid)} />
        <KpiTile
          icon={Wallet}
          tone="warning"
          label="Still to pay"
          value={money(payroll.totals.remaining)}
          hint={`${payroll.rows.filter((r) => r.state !== "paid").length} of ${payroll.rows.length} staff`}
        />
      </section>

      {payroll.withoutSalary.length > 0 && (
        <div
          role="note"
          className="flex gap-3 rounded-md border border-warning bg-warning-soft p-3 text-sm"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <p>
            Not on the payroll (no salary):{" "}
            {payroll.withoutSalary.map((s) => s.fullName).join(", ")}. Add their monthly salary on
            School Staff.
          </p>
        </div>
      )}

      {payroll.rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={Banknote}
            title="Nobody on the payroll"
            description="Give staff a monthly salary on School Staff (Edit → Monthly salary)."
          />
        </Card>
      ) : (
        <Table aria-label={`Payroll for ${label}`}>
          <TableHeader>
            <TableRow>
              <TableHead>Staff</TableHead>
              <TableHead className="text-right">Salary</TableHead>
              <TableHead className="hidden text-right md:table-cell">Bonus</TableHead>
              <TableHead className="hidden text-right md:table-cell">Deduction</TableHead>
              <TableHead className="text-right">Net pay</TableHead>
              <TableHead className="hidden text-right lg:table-cell">Paid</TableHead>
              <TableHead>Status</TableHead>
              {canPay && (
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {payroll.rows.map((row) => (
              <TableRow key={row.staffId}>
                <TableCell>
                  <span className="block font-medium">{row.fullName}</span>
                  <span className="block text-xs text-muted-foreground">
                    {row.workTypeName}
                    {row.status !== "active" && ` · ${row.status === "left" ? "Left" : "Inactive"}`}
                  </span>
                  {row.note && (
                    <span className="block text-xs text-muted-foreground">{row.note}</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{money(row.baseSalary)}</TableCell>
                <TableCell className="hidden text-right tabular-nums md:table-cell">
                  {toCents(row.bonus) > BigInt(0) ? money(row.bonus) : "—"}
                </TableCell>
                <TableCell className="hidden text-right tabular-nums md:table-cell">
                  {toCents(row.deduction) > BigInt(0) ? money(row.deduction) : "—"}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {money(row.net)}
                </TableCell>
                <TableCell className="hidden text-right tabular-nums lg:table-cell">
                  {money(row.paid)}
                </TableCell>
                <TableCell>
                  <Badge tone={STATE[row.state].tone}>{STATE[row.state].label}</Badge>
                </TableCell>
                {canPay && (
                  <TableCell>
                    <div className="flex justify-end">
                      {row.state !== "paid" && (
                        <PaySalaryDialog
                          staffName={row.fullName}
                          monthLabel={label}
                          baseSalary={row.baseSalary}
                          bonus={row.bonus}
                          deduction={row.deduction}
                          note={row.note}
                          paid={row.paid}
                          currencyCode={currency}
                          today={today}
                          action={paySalaryAction.bind(null, month, row.staffId)}
                        />
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Payments for {label}</CardTitle>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No salary payments for {label} yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payslip</TableHead>
                  <TableHead>Staff</TableHead>
                  <TableHead className="hidden sm:table-cell">Date</TableHead>
                  <TableHead className="hidden md:table-cell">Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <span className="block font-medium tabular-nums">{p.payslipNumber}</span>
                      {p.status === "reversed" && (
                        <span className="block text-xs text-muted-foreground">
                          Cancelled: {p.reversalReason}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{p.fullName}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {formatDate(p.paymentDate)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {paymentMethodLabels[p.method]}
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={`tabular-nums ${p.status === "reversed" ? "text-muted-foreground line-through" : "font-medium"}`}
                      >
                        {money(p.amount)}
                      </span>
                      {p.status === "reversed" && (
                        <Badge tone="neutral" className="ml-2">
                          Cancelled
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/staff/salaries/payslips/${p.id}`}>
                            Payslip<span className="sr-only"> {p.payslipNumber}</span>
                          </Link>
                        </Button>
                        {canPay && p.status === "valid" && (
                          <ConfirmAction
                            label="Cancel payment"
                            title={`Cancel payslip ${p.payslipNumber}?`}
                            description={`The ${money(p.amount)} paid to ${p.fullName} on ${formatDate(p.paymentDate)} will no longer count and will be owed again. If it is the only payment of the month, its bonus, deduction and note are cleared too. The payslip stays on record as cancelled.`}
                            confirmLabel="Cancel payment"
                            variant="destructive"
                            reason="required"
                            action={cancelSalaryPaymentAction.bind(null, p.id)}
                          />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
