import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Banknote, HandCoins, Receipt, Search, Wallet } from "lucide-react";
import { Pagination } from "@/components/data-table/pagination";
import { ConfirmAction } from "@/components/forms/confirm-action";
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
import { KpiTile } from "@/features/dashboard/components/kpi-tile";
import { chargeMonthAction } from "@/features/fees/actions";
import {
  currentSchoolMonth,
  getFeeOptions,
  getFeeSummary,
  listFeeBalances,
} from "@/features/fees/repository";
import { monthLabel, monthSchema } from "@/features/fees/schemas";
import { feeTypeLabels } from "@/features/students/schemas";
import { getTenantContextFor } from "@/lib/authz";
import { formatMoney } from "@/lib/money";
import { can, hasAllBranches } from "@/lib/tenant-context";

export const metadata: Metadata = { title: "Student Fees" };

// Loads permission-scoped data before rendering; navigations may block (loading.tsx shows a skeleton).
export const instant = false;

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", {
    dateStyle: "medium",
    timeZone: "UTC",
  });
}

export default async function StudentFeesPage({ searchParams }: PageProps<"/fees">) {
  const ctx = await getTenantContextFor("fees.read");
  if (!ctx) return <NoAccess title="Student Fees" />;

  const params = await searchParams;
  const search = typeof params.search === "string" ? params.search : undefined;
  const classId = typeof params.classId === "string" ? params.classId : undefined;
  const balance = typeof params.balance === "string" ? params.balance : undefined;
  const chosenMonth = monthSchema.safeParse(params.month);
  const month = chosenMonth.success ? chosenMonth.data : await currentSchoolMonth(ctx);

  const [summary, page, options] = await Promise.all([
    getFeeSummary(ctx, month),
    listFeeBalances(ctx, { search, classId, balance }, { page: params.page }),
    getFeeOptions(ctx),
  ]);
  const currency = options.currencyCode;
  const money = (amount: string) => formatMoney(amount, currency);
  const allBranches = hasAllBranches(ctx);
  const canCharge = can(ctx, "fees.manage_structure") && allBranches;
  const canCollect = can(ctx, "fees.record_payment") && allBranches;
  const filtered = Boolean(search || classId || balance);
  const label = monthLabel(month);

  return (
    <>
      <PageHeader
        title="Student Fees"
        description="Charge monthly fees, collect payments and see who still owes."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/fees/payments">
                <Receipt className="size-4" aria-hidden="true" />
                Payments
              </Link>
            </Button>
            {canCharge && summary.toCharge.count > 0 && (
              <ConfirmAction
                label={`Charge ${label}`}
                variant="primary"
                size="md"
                title={`Charge fees for ${label}?`}
                description={`${summary.toCharge.count} Active ${summary.toCharge.count === 1 ? "student is" : "students are"} charged their monthly fee, ${money(summary.toCharge.total)} in total. Students already charged for ${label} are skipped.`}
                confirmLabel={`Charge ${label}`}
                action={chargeMonthAction.bind(null, month, currency)}
              />
            )}
          </>
        }
      />

      <form className="flex flex-wrap items-end gap-2" aria-label="Choose month">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Month
          <Input name="month" type="month" defaultValue={month.slice(0, 7)} className="w-auto" />
        </label>
        <Button type="submit" variant="outline">
          Show
        </Button>
        {canCharge && summary.toCharge.count === 0 && (
          <p className="pb-2 text-sm text-muted-foreground">
            Every fee-paying student is charged for {label}.
          </p>
        )}
      </form>

      <section aria-label={`Fee figures for ${label}`} className="grid gap-3 sm:grid-cols-3">
        <KpiTile icon={Banknote} label={`Charged for ${label}`} value={money(summary.charged)} />
        <KpiTile
          icon={HandCoins}
          tone="success"
          label={`Collected in ${label}`}
          value={money(summary.collected)}
          href={`/fees/payments?month=${month.slice(0, 7)}`}
        />
        <KpiTile
          icon={Wallet}
          tone="warning"
          label="Still owed (all months)"
          value={money(summary.outstanding)}
          hint={`${summary.studentsOwing} ${summary.studentsOwing === 1 ? "student owes" : "students owe"}`}
          href="/fees?balance=owing"
        />
      </section>

      {summary.missingAmount.length > 0 && (
        <div
          role="note"
          className="flex gap-3 rounded-md border border-warning bg-warning-soft p-3 text-sm"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <p>
            {summary.missingAmount.length === 1 ? "This student has" : "These students have"} no fee
            amount and cannot be charged:{" "}
            {summary.missingAmount.map((s) => `${s.fullName} (${s.studentNumber})`).join(", ")}. Add
            the amount they pay on the Students page.
          </p>
        </div>
      )}

      <form role="search" className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="month" value={month.slice(0, 7)} />
        <div className="relative w-full sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            name="search"
            type="search"
            defaultValue={search}
            placeholder="Search by name, Student ID or phone"
            aria-label="Search by name, Student ID or phone"
            className="pl-8"
          />
        </div>
        <Select name="classId" defaultValue={classId ?? ""} aria-label="Class" className="w-auto">
          <option value="">All classes</option>
          {options.classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select name="balance" defaultValue={balance ?? ""} aria-label="Balance" className="w-auto">
          <option value="">All balances</option>
          <option value="owing">Owing</option>
          <option value="paid">Paid up</option>
        </Select>
        <Button type="submit" variant="outline">
          Apply
        </Button>
      </form>

      {page.total === 0 ? (
        <Card>
          <EmptyState
            icon={Wallet}
            title={filtered ? "No students match your filters" : "No students yet"}
            description={
              filtered
                ? "Try a different search, class or balance."
                : "Register students on the Students page, then charge the month here."
            }
          />
        </Card>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead className="hidden md:table-cell">Class</TableHead>
                <TableHead className="hidden lg:table-cell">Fee</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="hidden xl:table-cell">Last payment</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.items.map((row) => {
                const owes = /[1-9]/.test(row.balance);
                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <span className="block font-medium">{row.fullName}</span>
                      <span className="block text-xs text-muted-foreground tabular-nums">
                        {row.studentNumber}
                        {row.status !== "active" &&
                          ` · ${row.status[0].toUpperCase()}${row.status.slice(1)}`}
                      </span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{row.className ?? "—"}</TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className="block">{feeTypeLabels[row.feeType]}</span>
                      {row.feeAmount && (
                        <span className="block text-xs text-muted-foreground">
                          {money(row.feeAmount)} a month
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {owes ? (
                        <>
                          <span className="block font-semibold tabular-nums text-danger">
                            {money(row.balance)}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {row.unpaidCount} unpaid {row.unpaidCount === 1 ? "fee" : "fees"}
                          </span>
                        </>
                      ) : (
                        <Badge tone="success">Paid up</Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      {formatDate(row.lastPaymentDate)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        {canCollect && owes && (
                          <Button asChild size="sm">
                            <Link href={`/fees/students/${row.id}?collect=1`}>Collect</Link>
                          </Button>
                        )}
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/fees/students/${row.id}`}>
                            Details<span className="sr-only"> for {row.fullName}</span>
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <Pagination
            page={page}
            basePath="/fees"
            params={{ search, classId, balance, month: month.slice(0, 7) }}
          />
        </>
      )}
    </>
  );
}
