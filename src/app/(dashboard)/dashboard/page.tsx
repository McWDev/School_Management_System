import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  CalendarCheck,
  ChartLine,
  ClipboardList,
  GraduationCap,
  Presentation,
  Receipt,
  School,
  TriangleAlert,
  Wallet,
  CalendarClock,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";

export const metadata: Metadata = { title: "Dashboard" };

const quickActions = [
  { label: "Add Student", href: "/students", icon: GraduationCap },
  { label: "Add Teacher", href: "/teachers", icon: Presentation },
  { label: "Record Payment", href: "/fees/payments", icon: Receipt },
  { label: "Take Attendance", href: "/attendance", icon: CalendarCheck },
  { label: "Create Exam", href: "/exams", icon: ClipboardList },
];

/*
 * Metrics are intentionally empty until the modules and database exist
 * (Task 16 connects them). Never put sample numbers here.
 */
const stats = [
  { label: "Active Students", icon: GraduationCap },
  { label: "Active Teachers", icon: Presentation },
  { label: "Classes", icon: School },
  { label: "Fees Collected", icon: Wallet },
  { label: "Outstanding Fees", icon: TriangleAlert },
  { label: "Attendance Rate", icon: CalendarCheck },
  { label: "Upcoming Exams", icon: ClipboardList },
];

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="An overview of your school. Figures appear here as records are added."
      />

      <section aria-labelledby="quick-actions-heading" className="flex flex-col gap-2">
        <h2 id="quick-actions-heading" className="sr-only">
          Quick actions
        </h2>
        <div className="flex flex-wrap gap-2">
          {quickActions.map(({ label, href, icon: Icon }) => (
            <Button key={label} variant="outline" size="sm" asChild>
              <Link href={href}>
                <Icon aria-hidden="true" />
                {label}
              </Link>
            </Button>
          ))}
        </div>
      </section>

      <section aria-labelledby="key-figures-heading">
        <h2 id="key-figures-heading" className="sr-only">
          Key figures
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {stats.map((stat) => (
            <StatCard key={stat.label} label={stat.label} icon={stat.icon} />
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Fees collection trend</CardTitle>
            <CardDescription>Payments recorded over time.</CardDescription>
          </CardHeader>
          <CardContent>
            <EmptyState
              icon={ChartLine}
              title="No payments recorded yet"
              description="The trend appears once payments are recorded in School Fees."
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Attendance trend</CardTitle>
            <CardDescription>Daily attendance rate.</CardDescription>
          </CardHeader>
          <CardContent>
            <EmptyState
              icon={ChartLine}
              title="No attendance taken yet"
              description="The trend appears once attendance is taken for your classes."
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Upcoming</CardTitle>
            <CardDescription>Exams and today&apos;s timetable.</CardDescription>
          </CardHeader>
          <CardContent>
            <EmptyState
              icon={CalendarClock}
              title="Nothing scheduled"
              description="Scheduled exams and timetable entries will be listed here."
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>Latest changes across your school.</CardDescription>
          </CardHeader>
          <CardContent>
            <EmptyState
              icon={Activity}
              title="No activity yet"
              description="Actions such as new students, payments and published results will appear here."
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
