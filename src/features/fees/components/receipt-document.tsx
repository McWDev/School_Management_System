import { Letterhead, type LetterheadSchool } from "@/components/print/letterhead";
import { formatMoney } from "@/lib/money";
import type { Receipt } from "../repository";
import { paymentMethodLabels } from "../schemas";

function formatDate(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", {
    dateStyle: "long",
    timeZone: "UTC",
  });
}

/**
 * A payment receipt on the school's letterhead, for screen and print. Used
 * by Student Fees and the Students Portal.
 */
export function ReceiptDocument({
  receipt,
  school,
  logoSrc,
}: {
  receipt: Receipt;
  school: LetterheadSchool;
  logoSrc: string | null;
}) {
  const money = (amount: string) => formatMoney(amount, receipt.currencyCode);
  return (
    <article
      aria-label={`Receipt ${receipt.receiptNumber}`}
      className="mx-auto w-full max-w-2xl rounded-md border bg-white p-6 text-black shadow-card print:max-w-none print:border-0 print:p-0 print:shadow-none"
    >
      <Letterhead school={school} logoSrc={logoSrc} />

      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-bold uppercase tracking-wide">Payment receipt</h1>
        <p className="text-sm">
          No. <strong className="tabular-nums">{receipt.receiptNumber}</strong>
        </p>
      </div>
      {receipt.status === "reversed" && (
        <p
          role="status"
          className="mt-3 rounded-md border-2 border-red-700 p-2 text-center font-bold uppercase text-red-700"
        >
          Reversed — not valid. Reason: {receipt.reversalReason}
        </p>
      )}

      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr_auto_1fr]">
        <dt className="text-neutral-600">Date</dt>
        <dd>{formatDate(receipt.paymentDate)}</dd>
        <dt className="text-neutral-600">Student ID</dt>
        <dd className="tabular-nums">{receipt.student.studentNumber}</dd>
        <dt className="text-neutral-600">Student</dt>
        <dd className="font-medium">{receipt.student.fullName}</dd>
        <dt className="text-neutral-600">Class</dt>
        <dd>
          {receipt.student.className ?? "—"}
          {receipt.student.academicYearName && ` (${receipt.student.academicYearName})`}
        </dd>
        <dt className="text-neutral-600">Method</dt>
        <dd>{paymentMethodLabels[receipt.method]}</dd>
        {receipt.reference && (
          <>
            <dt className="text-neutral-600">Reference</dt>
            <dd>{receipt.reference}</dd>
          </>
        )}
      </dl>

      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-black text-left">
            <th scope="col" className="py-1.5">
              Paid for
            </th>
            <th scope="col" className="py-1.5 text-right">
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {receipt.lines.map((line) => (
            <tr key={line.label} className="border-b border-neutral-300">
              <td className="py-1.5">{line.label}</td>
              <td className="py-1.5 text-right tabular-nums">{money(line.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-bold">
            <th scope="row" className="py-2 text-left">
              Total paid
            </th>
            <td className="py-2 text-right tabular-nums">{money(receipt.amount)}</td>
          </tr>
        </tfoot>
      </table>

      {receipt.notes && <p className="mt-2 text-sm">Notes: {receipt.notes}</p>}

      <div className="mt-10 flex flex-wrap justify-between gap-6 text-sm">
        <p>
          Received by: <span className="font-medium">{receipt.recordedBy ?? "—"}</span>
        </p>
        <p className="min-w-48 border-t border-black pt-1 text-center">Signature</p>
      </div>
    </article>
  );
}
