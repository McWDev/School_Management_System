"use client";

import { useTransition } from "react";
import { CircleUserRound, LogOut } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/features/auth/actions";

const menuItemClasses =
  "flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-left outline-none data-[disabled]:opacity-50 data-[highlighted]:bg-muted";

export function AccountMenu({
  fullName,
  email,
}: {
  fullName: string;
  /** Email, or the username for staff who sign in without one. */
  email: string;
}) {
  const [signingOut, startTransition] = useTransition();

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Account menu for ${fullName}`}>
          <CircleUserRound aria-hidden="true" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-56 rounded-md border bg-surface p-1 text-sm shadow-lg"
        >
          <DropdownMenu.Label className="px-2 py-1.5">
            <span className="block font-semibold">{fullName}</span>
            <span className="block truncate text-xs text-muted-foreground">{email}</span>
          </DropdownMenu.Label>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          {/* Call the server action directly: the menu unmounts on select, so a
              <form> inside it would be removed before it could submit. */}
          <DropdownMenu.Item
            className={menuItemClasses}
            disabled={signingOut}
            onSelect={() => startTransition(() => logoutAction())}
          >
            <LogOut className="size-4" aria-hidden="true" />
            {signingOut ? "Signing out…" : "Sign out"}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
