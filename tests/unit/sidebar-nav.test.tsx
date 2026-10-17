import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SidebarNav } from "@/components/layout/sidebar-nav";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));

describe("SidebarNav", () => {
  it("shows only permitted tabs and marks the current one", () => {
    render(<SidebarNav permissions={["students.read", "users.manage"]} />);
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["Dashboard"]);
    expect(links[0]).toHaveAttribute("aria-current", "page");
  });

  it("shows School Staff to users with staff.read", () => {
    render(<SidebarNav permissions={["staff.read"]} />);
    expect(screen.getAllByRole("link").map((l) => l.textContent)).toEqual([
      "Dashboard",
      "School Staff",
    ]);
  });

  it("keeps accessible names when collapsed", () => {
    render(<SidebarNav collapsed />);
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
  });
});
