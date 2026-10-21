import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { NoAccess } from "@/components/layout/no-access";
import { PageHeader } from "@/components/layout/page-header";
import { updateGeneralSettingsAction } from "@/features/settings/actions";
import { GeneralSettingsForm } from "@/features/settings/components/general-settings-form";
import { getGeneralSettings } from "@/features/settings/repository";
import { getTenantContextFor } from "@/lib/authz";
import { hasAllBranches } from "@/lib/tenant-context";

export const metadata: Metadata = { title: "General Settings" };

// Loads permission-scoped data before rendering; navigations may block (loading.tsx shows a skeleton).
export const instant = false;

/** Exam rules and number prefixes of the school. */
export default async function GeneralSettingsPage() {
  const ctx = await getTenantContextFor("settings.manage");
  if (!ctx) return <NoAccess title="General Settings" />;

  const settings = await getGeneralSettings(ctx);
  return (
    <>
      <Link
        href="/settings"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        School Settings
      </Link>
      <PageHeader
        title="General Settings"
        description="Exam rules and the prefixes of Student IDs, receipts and payslips."
      />
      <GeneralSettingsForm
        initial={settings}
        canEdit={hasAllBranches(ctx)}
        action={updateGeneralSettingsAction}
      />
    </>
  );
}
