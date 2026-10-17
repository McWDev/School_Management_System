"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { filterNavGroups, findActiveNavItem, navGroups } from "./nav-config";

type SidebarNavProps = {
  /**
   * Permission keys of the current user. Until authentication exists (Task 05/06)
   * this is omitted and every item is shown.
   */
  permissions?: readonly string[];
  /** Icon-only mode for the collapsed desktop sidebar. */
  collapsed?: boolean;
  /** Called after a link is chosen (closes the mobile drawer). */
  onNavigate?: () => void;
};

export function SidebarNav({ permissions, collapsed = false, onNavigate }: SidebarNavProps) {
  const pathname = usePathname();
  const activeHref = findActiveNavItem(pathname)?.href;
  const groups = permissions ? filterNavGroups(navGroups, new Set(permissions)) : navGroups;

  return (
    <nav aria-label="Main navigation" className="flex flex-col gap-4 px-2 py-3">
      {groups.map((group, index) => (
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
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    title={collapsed ? item.title : undefined}
                    className={cn(
                      "flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-muted",
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
