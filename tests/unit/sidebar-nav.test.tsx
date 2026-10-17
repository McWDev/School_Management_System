import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SidebarNav } from "@/components/layout/sidebar-nav";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));

describe("SidebarNav", () => {
  it("shows only the Dashboard tab and marks it active", () => {
    render(<SidebarNav permissions={["students.read", "users.manage"]} />);
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["Dashboard"]);
    expect(links[0]).toHaveAttribute("aria-current", "page");
  });

  it("keeps accessible names when collapsed", () => {
    render(<SidebarNav collapsed />);
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
  });
});
