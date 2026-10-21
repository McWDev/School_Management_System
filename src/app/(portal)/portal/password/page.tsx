import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { changeOwnPasswordAction } from "@/features/portal/actions";
import { requirePortalStudent } from "@/features/portal/access";
import { ChangePasswordForm } from "@/features/portal/components/change-password-form";

export const metadata: Metadata = { title: "Change password" };

export const instant = false;

/** The signed-in student changes their own password. */
export default async function PortalPasswordPage() {
  const { student } = await requirePortalStudent();
  return (
    <>
      <PageHeader
        title="Change password"
        description={`You sign in with your Student ID, ${student.studentNumber}. Your new password must be 6 digits; your school can see it.`}
      />
      <Card>
        <CardContent className="p-6">
          <ChangePasswordForm action={changeOwnPasswordAction} />
        </CardContent>
      </Card>
    </>
  );
}
