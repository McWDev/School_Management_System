import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { NoAccess } from "@/components/layout/no-access";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  recordPaymentAction,
  reversePaymentAction,
  waiveChargeAction,
} from "@/features/fees/actions";
import { CollectPaymentDialog } from "@/features/fees/components/collect-payment-dialog";
import { getFeeOptions, getStudentFeeAccount } from "@/features/fees/repository";
import { paymentMethodLabels } from "@/features/fees/schemas";
import { feeTypeLabels, studentStatusLabels } from "@/features/students/schemas";
import { getTenantContextFor } from "@/lib/authz";
import { NotFoundError } from "@/lib/errors";
import { formatMoney, toCents } from "@/lib/money";
import { can, hasAllBranches } from "@/lib/tenant-context";

export const metadata: Metadata = { title: "Student fees" };

// Loads permission-scoped data before rendering; navigations may block (loading.tsx shows a skeleton).
export const instant = false;

function formatDate(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", {
    dateStyle: "medium",
    timeZone: "UTC",
  });
}

export default async function StudentFeeAccountPage({
  params,
  searchParams,
}: PageProps<"/fees/students/[id]">) {
  const ctx = await getTenantContextFor("fees.read");
  if (!ctx) return <NoAccess title="Student Fees" />;

  const { id } = await params;
  const { collect } = await searchParams;
  const [account, options] = await Promise.all([
    getStudentFeeAccount(ctx, id).catch((error) => {
      if (error instanceof NotFoundError) notFound();
      throw error;
    }),
    getFeeOptions(ctx),
  ]);
  const { student } = account;
  const money = (amount: string) => formatMoney(amount, options.currencyCode);
  const allBranches = hasAllBranches(ctx);
  const canCollect = can(ctx, "fees.record_payment") && allBranches;
  const canReverse = can(ctx, "fees.reverse_payment") && allBranches;
  const canWaive = can(ctx, "fees.manage_structure") && allBranches;
  const isZero = (amount: string) => toCents(amount) <= BigInt(0);
  // Oldest first, so the earliest months are paid first.
  const open = account.charges
    .filter((c) => !c.waivedAt && !isZero(c.remaining))
    .reverse()
    .map((c) => ({ id: c.id, label: c.label, remaining: c.remaining }));

  return (
    <>
      <Link
        href="/fees"
        className="no-print inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Student Fees
      </Link>
      <PageHeader
        title={student.fullName}
        description={[
          student.studentNumber,
          student.className &&
            `${student.className}${student.academicYearName ? ` · ${student.academicYearName}` : ""}`,
          studentStatusLabels[student.status],
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          canCollect && (
            <CollectPaymentDialog
              studentName={student.fullName}
              charges={open}
              currencyCode={options.currencyCode}
              today={options.today}
              defaultOpen={collect === "1" && open.length > 0}
              action={recordPaymentAction.bind(null, student.id)}
            />
          )
        }
      />

      <section aria-label="Fee summary" className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <span className="text-sm text-muted-foreground">Balance</span>
            <span
              className={`text-2xl font-semibold tabular-nums ${isZero(account.balance) ? "" : "text-danger"}`}
            >
              {money(account.balance)}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <span className="text-sm text-muted-foreground">Fee type</span>
            <span className="text-lg font-medium">
              {feeTypeLabels[student.feeType]}
              {student.feeAmount && ` · ${money(student.feeAmount)} a month`}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <span className="text-sm text-muted-foreground">Guardian</span>
            <span className="text-lg font-medium">{student.guardianName}</span>
            <span className="text-sm text-muted-foreground">{student.guardianPhone}</span>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Fees charged</CardTitle>
        </CardHeader>
        <CardContent>
          {account.charges.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No fees charged yet. Monthly fees are charged with “Charge month” on Student Fees.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fee</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Paid</TableHead>
                  <TableHead className="text-right">Owed</TableHead>
                  <TableHead>Status</TableHead>
                  {canWaive && (
                    <TableHead>
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {account.charges.map((charge) => {
                  const status = charge.waivedAt
                    ? { label: "Waived", tone: "neutral" as const }
                    : isZero(charge.remaining)
                      ? { label: "Paid", tone: "success" as const }
                      : isZero(charge.paid)
                        ? { label: "Unpaid", tone: "danger" as const }
                        : { label: "Part paid", tone: "warning" as const };
                  return (
                    <TableRow key={charge.id}>
                      <TableCell>
                        <span className="block font-medium">{charge.label}</span>
                        {charge.waiveReason && (
                          <span className="block text-xs text-muted-foreground">
                            Waived: {charge.waiveReason}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(charge.amount)}
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums sm:table-cell">
                        {money(charge.paid)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {charge.waivedAt ? "—" : money(charge.remaining)}
                      </TableCell>
                      <TableCell>
                        <Badge tone={status.tone}>{status.label}</Badge>
                      </TableCell>
                      {canWaive && (
                        <TableCell>
                          {!charge.waivedAt && isZero(charge.paid) && (
                            <div className="flex justify-end">
                              <ConfirmAction
                                label="Waive"
                                title={`Waive ${charge.label}?`}
                                description={`${student.fullName} will no longer owe ${money(charge.amount)} for ${charge.label}. The charge stays on record as waived.`}
                                confirmLabel="Waive fee"
                                reason="required"
                                action={waiveChargeAction.bind(null, charge.id)}
                              />
                            </div>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payments</CardTitle>
        </CardHeader>
        <CardContent>
          {account.payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Receipt</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="hidden md:table-cell">Paid for</TableHead>
                  <TableHead className="hidden sm:table-cell">Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {account.payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>
                      <span className="block font-medium tabular-nums">
                        {payment.receiptNumber}
                      </span>
                      {payment.status === "reversed" && (
                        <span className="block text-xs text-muted-foreground">
                          Reversed: {payment.reversalReason}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{formatDate(payment.paymentDate)}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      {payment.lines.map((l) => l.label).join(", ")}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {paymentMethodLabels[payment.method]}
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={`tabular-nums ${payment.status === "reversed" ? "text-muted-foreground line-through" : "font-medium"}`}
                      >
                        {money(payment.amount)}
                      </span>
                      {payment.status === "reversed" && (
                        <Badge tone="neutral" className="ml-2">
                          Reversed
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/fees/receipts/${payment.id}`}>
                            Receipt<span className="sr-only"> {payment.receiptNumber}</span>
                          </Link>
                        </Button>
                        {canReverse && payment.status === "valid" && (
                          <ConfirmAction
                            label="Reverse"
                            title={`Reverse payment ${payment.receiptNumber}?`}
                            description={`The ${money(payment.amount)} paid on ${formatDate(payment.paymentDate)} will no longer count, and the fees it paid will be owed again. The payment stays on record as reversed.`}
                            confirmLabel="Reverse payment"
                            variant="destructive"
                            reason="required"
                            action={reversePaymentAction.bind(null, payment.id)}
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
