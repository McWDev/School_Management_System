import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { NoAccess } from "@/components/layout/no-access";
import { PrintButton } from "@/components/print/print-button";
import { ReceiptDocument } from "@/features/fees/components/receipt-document";
import { getReceipt } from "@/features/fees/repository";
import { getOwnSchool, getSchoolLogoVersion } from "@/features/tenants/repository";
import { getTenantContextFor } from "@/lib/authz";
import { NotFoundError } from "@/lib/errors";

export const metadata: Metadata = { title: "Receipt" };

// Loads permission-scoped data before rendering; navigations may block (loading.tsx shows a skeleton).
export const instant = false;

/** A printable payment receipt on the school's letterhead. */
export default async function ReceiptPage({ params }: PageProps<"/fees/receipts/[id]">) {
  const ctx = await getTenantContextFor("fees.read");
  if (!ctx) return <NoAccess title="Receipt" />;

  const { id } = await params;
  const [receipt, school, logoVersion] = await Promise.all([
    getReceipt(ctx, id).catch((error) => {
      if (error instanceof NotFoundError) notFound();
      throw error;
    }),
    getOwnSchool(ctx),
    getSchoolLogoVersion(ctx),
  ]);

  return (
    <>
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <Link
          href={`/fees/students/${receipt.studentId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {receipt.student.fullName}
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
