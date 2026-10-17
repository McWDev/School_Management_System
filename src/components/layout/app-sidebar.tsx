"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { Brand } from "./brand";
import { SidebarNav } from "./sidebar-nav";
import { useSidebarCollapsed } from "./use-sidebar-collapsed";

/** Desktop sidebar (lg and up). On smaller screens MobileNav is used instead. */
export function AppSidebar({ permissions }: { permissions?: readonly string[] }) {
  const { collapsed, toggle } = useSidebarCollapsed();

  return (
    <aside
      className={cn(
        "no-print sticky top-0 hidden h-dvh shrink-0 flex-col border-r bg-sidebar transition-[width] duration-200 lg:flex",
        collapsed ? "w-16" : "w-64",
      )}
    >
      <Brand collapsed={collapsed} />
      <div className="flex-1 overflow-y-auto">
        <SidebarNav permissions={permissions} collapsed={collapsed} />
      </div>
      <div className={cn("border-t p-2", collapsed && "flex justify-center")}>
        <Button
          variant="ghost"
          size={collapsed ? "icon" : "sm"}
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          className={cn(!collapsed && "w-full justify-start")}
        >
          {collapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
          {!collapsed && <span>Collapse</span>}
        </Button>
      </div>
    </aside>
  );
}
