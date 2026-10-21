"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";

const TABS = [
  { href: "/portal", label: "My profile" },
  { href: "/portal/results", label: "My results" },
  { href: "/portal/fees", label: "My fees" },
  { href: "/portal/password", label: "Change password" },
] as const;

/** The Students Portal tabs; the current one is marked. */
export function PortalNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Students Portal" className="-mb-px flex gap-1 overflow-x-auto">
      {TABS.map((tab) => {
        const active =
          tab.href === "/portal" ? pathname === "/portal" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
