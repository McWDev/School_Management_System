import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Receipt, Search } from "lucide-react";
import { Pagination } from "@/components/data-table/pagination";
import { NoAccess } from "@/components/layout/no-access";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getFeeOptions, listPayments } from "@/features/fees/repository";
import {
  monthLabel,
  monthSchema,
  PAYMENT_METHODS,
  paymentMethodLabels,
} from "@/features/fees/schemas";
import { getTenantContextFor } from "@/lib/authz";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Payments" };

// Loads permission-scoped data before rendering; navigations may block (loading.tsx shows a skeleton).
export const instant = false;

function formatDate(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", {
    dateStyle: "medium",
    timeZone: "UTC",
  });
}

export default async function PaymentsPage({ searchParams }: PageProps<"/fees/payments">) {
  const ctx = await getTenantContextFor("fees.read");
  if (!ctx) return <NoAccess title="Payments" />;

  const params = await searchParams;
  const search = typeof params.search === "string" ? params.search : undefined;
  const method = typeof params.method === "string" ? params.method : undefined;
  const parsedMonth = monthSchema.safeParse(params.month);
  const month = parsedMonth.success ? parsedMonth.data : undefined;
  const [page, options] = await Promise.all([
    listPayments(ctx, { search, month, method }, { page: params.page }),
    getFeeOptions(ctx),
  ]);
  const money = (amount: string) => formatMoney(amount, options.currencyCode);
  const filtered = Boolean(search || month || method);

  return (
    <>
      <Link
        href="/fees"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Student Fees
      </Link>
      <PageHeader
        title="Payments"
        description="Every payment recorded, with its receipt. Reversed payments stay listed."
      />

      <form role="search" className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            name="search"
            type="search"
            defaultValue={search}
            placeholder="Search by receipt, name or Student ID"
            aria-label="Search by receipt, name or Student ID"
            className="pl-8"
          />
        </div>
        <Input
          name="month"
          type="month"
          defaultValue={month?.slice(0, 7)}
          aria-label="Month"
          className="w-auto"
        />
        <Select name="method" defaultValue={method ?? ""} aria-label="Method" className="w-auto">
          <option value="">All methods</option>
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {paymentMethodLabels[m]}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="outline">
          Apply
        </Button>
      </form>

      <p className="text-sm">
        {month ? `Collected in ${monthLabel(month)}` : "Collected"}
        {filtered
          ? " (matching the filters, reversed payments excluded)"
          : " (reversed payments excluded)"}
        : <strong className="tabular-nums">{money(page.totalCollected)}</strong>
      </p>

      {page.total === 0 ? (
        <Card>
          <EmptyState
            icon={Receipt}
            title={filtered ? "No payments match your filters" : "No payments yet"}
            description={
              filtered
                ? "Try a different search, month or method."
                : "Payments appear here when you collect them on Student Fees."
            }
          />
        </Card>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Receipt</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Student</TableHead>
                <TableHead className="hidden md:table-cell">Method</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.items.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium tabular-nums">{p.receiptNumber}</TableCell>
                  <TableCell>{formatDate(p.paymentDate)}</TableCell>
                  <TableCell>
                    <Link href={`/fees/students/${p.studentId}`} className="hover:underline">
                      {p.fullName}
                    </Link>
                    <span className="block text-xs text-muted-foreground tabular-nums">
                      {p.studentNumber}
                    </span>
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
                        Reversed
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/fees/receipts/${p.id}`}>
                          Receipt<span className="sr-only"> {p.receiptNumber}</span>
                        </Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination
            page={page}
            basePath="/fees/payments"
            params={{ search, method, month: month?.slice(0, 7) }}
          />
        </>
      )}
    </>
  );
}
