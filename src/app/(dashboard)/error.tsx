"use client";

import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Never show error details to users; they are logged on the server.
  return (
    <Card role="alert">
      <EmptyState
        icon={TriangleAlert}
        title="Something went wrong"
        description="This page could not be loaded. Please try again. If the problem continues, contact your administrator."
        action={<Button onClick={reset}>Try again</Button>}
      />
    </Card>
  );
}
