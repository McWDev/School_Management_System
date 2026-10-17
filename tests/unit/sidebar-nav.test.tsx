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

  it("lists every tab but links only the permitted ones", () => {
    render(<SidebarNav permissions={["students.read"]} />);
    expect(screen.getAllByRole("link").map((l) => l.textContent)).toEqual([
      "Dashboard",
      "Students",
    ]);
    // Other tabs stay visible, disabled, with an accessible "no access" hint.
    const users = screen.getByText("Users").closest("[aria-disabled]");
    expect(users).toHaveAttribute("aria-disabled", "true");
    expect(users).toHaveTextContent("Users (no access)");
    expect(screen.getByText("School Fees").closest("[aria-disabled]")).not.toBeNull();
  });

  it("keeps accessible names when collapsed", () => {
    render(<SidebarNav collapsed />);
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
  });
});
