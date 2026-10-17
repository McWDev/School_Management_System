import { ShieldX } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "./page-header";

/** Shown when the signed-in user lacks the permission for a page. */
export function NoAccess({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <Card>
        <EmptyState
          icon={ShieldX}
          title="You don't have access to this page"
          description="Ask your school administrator if you need access."
        />
      </Card>
    </>
  );
}
