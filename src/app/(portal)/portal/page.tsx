import type { Metadata } from "next";
import { UserRound } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requirePortalStudent } from "@/features/portal/access";
import { getPortalProfile } from "@/features/portal/repository";
import { studentStatusLabels } from "@/features/students/schemas";

export const metadata: Metadata = { title: "My profile" };

export const instant = false;

function formatDate(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", {
    dateStyle: "long",
    timeZone: "UTC",
  });
}

/** The signed-in student's own details (view only). */
export default async function PortalProfilePage() {
  const { student } = await requirePortalStudent();
  const profile = await getPortalProfile(student);
  const photoSrc = profile.photoVersion
    ? `/api/student-photo/${profile.id}?v=${profile.photoVersion}`
    : null;
  const details: [string, string][] = [
    ["Student ID", profile.studentNumber],
    ["Class", profile.className ?? "—"],
    ["Academic year", profile.academicYearName ?? "—"],
    ["Gender", profile.gender === "male" ? "Male" : "Female"],
    ["Date of birth", formatDate(profile.dateOfBirth)],
    ["Admission date", formatDate(profile.admissionDate)],
    ["Guardian", profile.guardianName],
    ["Guardian phone", profile.guardianPhone],
    ["Phone", profile.phone ?? "—"],
    ["Address", profile.address ?? "—"],
  ];

  return (
    <>
      <PageHeader
        title={`Welcome, ${profile.fullName}`}
        description="Your details at school. Ask the school office if something is wrong."
      />
      <Card>
        <CardContent className="flex flex-col gap-6 p-6 sm:flex-row">
          <div className="flex size-32 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
            {photoSrc ? (
              // eslint-disable-next-line @next/next/no-img-element -- private, session-protected photo route
              <img src={photoSrc} alt="Your photo" className="size-full object-cover" />
            ) : (
              <UserRound className="size-14 text-muted-foreground" aria-label="No photo" />
            )}
          </div>
          <div className="flex flex-1 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold">{profile.fullName}</h2>
              <Badge tone={profile.status === "active" ? "success" : "neutral"}>
                {studentStatusLabels[profile.status]}
              </Badge>
            </div>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              {details.map(([label, value]) => (
                <div key={label} className="flex flex-col">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
