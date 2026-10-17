"use client";

import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { MobileNav } from "./mobile-nav";
import { findActiveNavItem } from "./nav-config";

const menuContentClasses = "z-50 min-w-56 rounded-md border bg-surface p-1 text-sm shadow-lg";

export function TopBar({
  permissions,
  account,
  contextLabel,
}: {
  permissions?: readonly string[];
  /** Account menu, rendered by the server after the session is read. */
  account?: React.ReactNode;
  contextLabel?: string;
}) {
  const pathname = usePathname();
  const current = findActiveNavItem(pathname);

  return (
    <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-surface/95 px-3 backdrop-blur sm:px-4">
      <MobileNav permissions={permissions} />
      <div className="flex min-w-0 flex-col leading-tight">
        <p className="truncate text-sm font-medium" aria-live="polite">
          {current?.title ?? "School Management System"}
        </p>
        {contextLabel && <p className="truncate text-xs text-muted-foreground">{contextLabel}</p>}
      </div>

      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button variant="ghost" size="icon" aria-label="Notifications">
              <Bell aria-hidden="true" />
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={6} className={menuContentClasses}>
              <DropdownMenu.Label className="px-2 py-1.5 font-semibold">
                Notifications
              </DropdownMenu.Label>
              <p className="px-2 pb-2 text-muted-foreground">You have no notifications.</p>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        {account}
      </div>
    </header>
  );
}
