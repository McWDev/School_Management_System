import type { Metadata } from "next";
import { NoAccess } from "@/components/layout/no-access";
import { PageHeader } from "@/components/layout/page-header";
import { Letterhead } from "@/components/print/letterhead";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  removeSchoolLogoAction,
  updateSchoolProfileAction,
  uploadSchoolLogoAction,
} from "@/features/tenants/actions";
import { LogoUploader } from "@/features/tenants/components/logo-uploader";
import { SchoolProfileForm } from "@/features/tenants/components/school-profile-form";
import { getOwnSchool, getSchoolLogoVersion } from "@/features/tenants/repository";
import { getTenantContextFor } from "@/lib/authz";
import { hasAllBranches } from "@/lib/tenant-context";
import { BackToSettings } from "@/features/settings/components/back-to-settings";

export const metadata: Metadata = { title: "School Profile" };

// Loads permission-scoped data before rendering; navigations may block (loading.tsx shows a skeleton).
export const instant = false;

/** The school's letterhead: details printed on report sheets and letters. */
export default async function SchoolProfilePage() {
  const ctx = await getTenantContextFor("settings.manage");
  if (!ctx) return <NoAccess title="School Profile" />;

  const [school, logoVersion] = await Promise.all([getOwnSchool(ctx), getSchoolLogoVersion(ctx)]);
  const logoSrc = logoVersion ? `/api/school-logo?v=${logoVersion}` : null;
  const canEdit = hasAllBranches(ctx);

  return (
    <>
      <BackToSettings />
      <PageHeader
        title="School Profile"
        description={`These details appear at the top of report sheets and letters. School code: ${school.schoolCode}`}
      />

      <Card>
        <CardHeader>
          <CardTitle>Letterhead preview</CardTitle>
          <CardDescription>How your school appears on printed reports and letters.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border bg-white p-4 text-black">
            <Letterhead school={school} logoSrc={logoSrc} />
          </div>
        </CardContent>
      </Card>

      {canEdit ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Logo</CardTitle>
            </CardHeader>
            <CardContent>
              <LogoUploader
                logoSrc={logoSrc}
                schoolName={school.name}
                uploadAction={uploadSchoolLogoAction}
                removeAction={removeSchoolLogoAction}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>School details</CardTitle>
              <CardDescription>
                Name, manager and contact details for the letterhead.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SchoolProfileForm initial={school} action={updateSchoolProfileAction} />
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="pt-5 text-sm text-muted-foreground">
            Only users with access to all branches can edit the school profile.
          </CardContent>
        </Card>
      )}
    </>
  );
}
