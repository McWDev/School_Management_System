"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Opens the browser's print dialog. Hidden on the printed page. */
export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <Button type="button" className="no-print" onClick={() => window.print()}>
      <Printer className="size-4" aria-hidden="true" />
      {label}
    </Button>
  );
}
