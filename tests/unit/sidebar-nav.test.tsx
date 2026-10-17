import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SidebarNav } from "@/components/layout/sidebar-nav";

vi.mock("next/navigation", () => ({ usePathname: () => "/fees/payments" }));

describe("SidebarNav", () => {
  it("marks only the current page as active", () => {
    render(<SidebarNav />);
    expect(screen.getByRole("link", { name: "Payments" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "School Fees" })).not.toHaveAttribute("aria-current");
  });

  it("shows only permitted items when permissions are given", () => {
    render(<SidebarNav permissions={["dashboard.read", "students.read"]} />);
    expect(screen.getAllByRole("link").map((l) => l.textContent)).toEqual([
      "Dashboard",
      "Students",
    ]);
  });

  it("keeps accessible names when collapsed", () => {
    render(<SidebarNav collapsed />);
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
  });
});
