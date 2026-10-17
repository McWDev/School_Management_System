"use client";

import { usePathname } from "next/navigation";
import { Bell, CircleHelp, CircleUserRound } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { MobileNav } from "./mobile-nav";
import { findActiveNavItem } from "./nav-config";

const menuContentClasses = "z-50 min-w-56 rounded-md border bg-surface p-1 text-sm shadow-lg";
const menuItemClasses =
  "flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 outline-none data-[disabled]:opacity-50 data-[highlighted]:bg-muted";

export function TopBar({ permissions }: { permissions?: readonly string[] }) {
  const pathname = usePathname();
  const current = findActiveNavItem(pathname);

  return (
    <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-surface/95 px-3 backdrop-blur sm:px-4">
      <MobileNav permissions={permissions} />
      <p className="truncate text-sm font-medium text-muted-foreground" aria-live="polite">
        {current?.title ?? "School Management System"}
      </p>

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

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button variant="ghost" size="icon" aria-label="Account menu">
              <CircleUserRound aria-hidden="true" />
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={6} className={menuContentClasses}>
              <DropdownMenu.Label className="px-2 py-1.5">
                <span className="block font-semibold">Not signed in</span>
                <span className="block text-xs text-muted-foreground">
                  Sign-in will be available soon.
                </span>
              </DropdownMenu.Label>
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
              <DropdownMenu.Item className={menuItemClasses} disabled>
                <CircleHelp className="size-4" aria-hidden="true" />
                Help
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </header>
  );
}
