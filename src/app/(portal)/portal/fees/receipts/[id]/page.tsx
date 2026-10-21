import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PrintButton } from "@/components/print/print-button";
import { ReceiptDocument } from "@/features/fees/components/receipt-document";
import { getReceipt } from "@/features/fees/repository";
import { requirePortalStudent } from "@/features/portal/access";
import { getOwnSchool, getSchoolLogoVersion } from "@/features/tenants/repository";
import { NotFoundError } from "@/lib/errors";

export const metadata: Metadata = { title: "Receipt" };

export const instant = false;

/** One of the signed-in student's own receipts, printable. */
export default async function PortalReceiptPage({
  params,
}: PageProps<"/portal/fees/receipts/[id]">) {
  const { student, ctx } = await requirePortalStudent();
  const { id } = await params;
  const receipt = await getReceipt(ctx, id).catch((error) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  // Another student's receipt does not exist for this student.
  if (receipt.studentId !== student.id) notFound();
  const [school, logoVersion] = await Promise.all([getOwnSchool(ctx), getSchoolLogoVersion(ctx)]);

  return (
    <>
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/portal/fees"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          My fees
        </Link>
        <PrintButton label="Print receipt" />
      </div>
      <ReceiptDocument
        receipt={receipt}
        school={school}
        logoSrc={logoVersion ? `/api/school-logo?v=${logoVersion}` : null}
      />
    </>
  );
}
