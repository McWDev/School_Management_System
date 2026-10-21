import type { Metadata } from "next";
import Link from "next/link";
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
import { getFeeOptions, getStudentFeeAccount } from "@/features/fees/repository";
import { paymentMethodLabels } from "@/features/fees/schemas";
import { requirePortalStudent } from "@/features/portal/access";
import { feeTypeLabels } from "@/features/students/schemas";
import { formatMoney, toCents } from "@/lib/money";

export const metadata: Metadata = { title: "My fees" };

export const instant = false;

function formatDate(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", {
    dateStyle: "medium",
    timeZone: "UTC",
  });
}

/** The signed-in student's fees, payments and balance (view only). */
export default async function PortalFeesPage() {
  const { student, ctx } = await requirePortalStudent();
  const [account, options] = await Promise.all([
    getStudentFeeAccount(ctx, student.id),
    getFeeOptions(ctx),
  ]);
  const money = (amount: string) => formatMoney(amount, options.currencyCode);
  const isZero = (amount: string) => toCents(amount) <= BigInt(0);
  const owes = !isZero(account.balance);

  return (
    <>
      <PageHeader
        title="My fees"
        description="Your fees, payments and receipts. Pay at the school office."
      />
      <section aria-label="Fee summary" className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <span className="text-sm text-muted-foreground">Balance</span>
            <span className={`text-2xl font-semibold tabular-nums ${owes ? "text-danger" : ""}`}>
              {money(account.balance)}
            </span>
            <span className="text-xs text-muted-foreground">
              {owes ? "Still to pay" : "Nothing to pay"}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <span className="text-sm text-muted-foreground">Fee type</span>
            <span className="text-lg font-medium">
              {feeTypeLabels[account.student.feeType]}
              {account.student.feeAmount && ` · ${money(account.student.feeAmount)} a month`}
            </span>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Fees charged</CardTitle>
        </CardHeader>
        <CardContent>
          {account.charges.length === 0 ? (
            <p className="text-sm text-muted-foreground">No fees charged yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fee</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Paid</TableHead>
                  <TableHead className="text-right">Owed</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {account.charges.map((c) => {
                  const status = c.waivedAt
                    ? { label: "Waived", tone: "neutral" as const }
                    : isZero(c.remaining)
                      ? { label: "Paid", tone: "success" as const }
                      : isZero(c.paid)
                        ? { label: "Unpaid", tone: "danger" as const }
                        : { label: "Part paid", tone: "warning" as const };
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.label}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(c.amount)}</TableCell>
                      <TableCell className="hidden text-right tabular-nums sm:table-cell">
                        {money(c.paid)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {c.waivedAt ? "—" : money(c.remaining)}
                      </TableCell>
                      <TableCell>
                        <Badge tone={status.tone}>{status.label}</Badge>
                      </TableCell>
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
          <CardTitle>My payments</CardTitle>
        </CardHeader>
        <CardContent>
          {account.payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments yet.</p>
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
                {account.payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium tabular-nums">{p.receiptNumber}</TableCell>
                    <TableCell>{formatDate(p.paymentDate)}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      {p.lines.map((l) => l.label).join(", ")}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
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
                          Reversed
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/portal/fees/receipts/${p.id}`}>
                            Receipt<span className="sr-only"> {p.receiptNumber}</span>
                          </Link>
                        </Button>
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
