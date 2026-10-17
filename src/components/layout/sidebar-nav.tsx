"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { findActiveNavItem, isNavItemVisible, navGroups } from "./nav-config";

type SidebarNavProps = {
  /**
   * Permission keys of the current user. Every tab is always listed; tabs the
   * user has no permission for are shown disabled (04-UI-UX: "hidden or
   * disabled"). Omitted = everything enabled.
   */
  permissions?: readonly string[];
  /** Icon-only mode for the collapsed desktop sidebar. */
  collapsed?: boolean;
  /** Called after a link is chosen (closes the mobile drawer). */
  onNavigate?: () => void;
};

const itemClasses =
  "flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium text-sidebar-foreground transition-colors";

export function SidebarNav({ permissions, collapsed = false, onNavigate }: SidebarNavProps) {
  const pathname = usePathname();
  const activeHref = findActiveNavItem(pathname)?.href;
  const granted = permissions ? new Set(permissions) : null;

  return (
    <nav aria-label="Main navigation" className="flex flex-col gap-4 px-2 py-3">
      {navGroups.map((group, index) => (
        <div key={group.title ?? `group-${index}`} className="flex flex-col gap-0.5">
          {group.title &&
            (collapsed ? (
              <div className="mx-2 my-1 border-t" role="separator" aria-label={group.title} />
            ) : (
              <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.title}
              </p>
            ))}
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active = item.href === activeHref;
              const enabled = granted === null || isNavItemVisible(item, granted);
              const Icon = item.icon;

              if (!enabled) {
                // Not a link: hiding/disabling a tab is convenience only; the
                // page itself refuses access on the server.
                return (
                  <li key={item.href}>
                    <span
                      aria-disabled="true"
                      title={`${item.title} — you don't have access`}
                      className={cn(
                        itemClasses,
                        "cursor-not-allowed opacity-50",
                        collapsed && "justify-center px-0",
                      )}
                    >
                      <Icon className="size-4 shrink-0" aria-hidden="true" />
                      <span className={cn("flex-1 truncate", collapsed && "sr-only")}>
                        {item.title}
                        <span className="sr-only"> (no access)</span>
                      </span>
                      {!collapsed && <Lock className="size-3.5 shrink-0" aria-hidden="true" />}
                    </span>
                  </li>
                );
              }

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    title={collapsed ? item.title : undefined}
                    className={cn(
                      itemClasses,
                      "hover:bg-muted",
                      active &&
                        "bg-sidebar-active text-sidebar-active-foreground hover:bg-sidebar-active",
                      collapsed && "justify-center px-0",
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    <span className={cn("truncate", collapsed && "sr-only")}>{item.title}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
