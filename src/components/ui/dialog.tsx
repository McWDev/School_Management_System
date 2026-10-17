"use client";

import { X } from "lucide-react";
import { Dialog as RadixDialog } from "radix-ui";
import { cn } from "@/lib/utils/cn";

export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

/** Centered modal with title, optional description, focus trap and Escape to close. */
export function DialogContent({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
      <RadixDialog.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-lg border bg-surface p-5 shadow-lg",
          className,
        )}
        {...(description ? {} : { "aria-describedby": undefined })}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <RadixDialog.Title className="text-lg font-semibold">{title}</RadixDialog.Title>
            {description && (
              <RadixDialog.Description className="text-sm text-muted-foreground">
                {description}
              </RadixDialog.Description>
            )}
          </div>
          <RadixDialog.Close
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
            aria-label="Close"
          >
            <X className="size-4" aria-hidden="true" />
          </RadixDialog.Close>
        </div>
        {children}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}
