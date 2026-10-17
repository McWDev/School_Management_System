import { describe, expect, it } from "vitest";
import {
  allNavItems,
  filterNavGroups,
  findActiveNavItem,
  navGroups,
} from "@/components/layout/nav-config";

describe("navigation config", () => {
  it("follows the approved structure from the UI document", () => {
    expect(navGroups.map((g) => g.title)).toEqual([null, "Academic", "Finance", null, "Settings"]);
    expect(navGroups[1].items.map((i) => i.title)).toEqual([
      "Classes",
      "Students",
      "Teachers",
      "Courses / Subjects",
      "Exams",
      "Attendance",
      "Timetable",
    ]);
    expect(navGroups[4].items.map((i) => i.title)).toEqual([
      "Academic Years",
      "Branches",
      "School Registrations",
      "Users",
      "Roles & Permissions",
      "School Profile",
      "General Settings",
    ]);
  });

  it("has unique hrefs and a permission on every item", () => {
    const hrefs = allNavItems.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const item of allNavItems) expect(item.permission).toMatch(/^[a-z_]+\.[a-z_]+$/);
  });

  it("resolves the most specific active item", () => {
    expect(findActiveNavItem("/fees/payments")?.title).toBe("Payments");
    expect(findActiveNavItem("/fees")?.title).toBe("School Fees");
    expect(findActiveNavItem("/students/123/edit")?.title).toBe("Students");
    expect(findActiveNavItem("/studentsx")).toBeUndefined();
  });

  it("filters items by permission and drops empty groups", () => {
    const groups = filterNavGroups(navGroups, new Set(["dashboard.read", "fees.read"]));
    expect(groups.map((g) => g.title)).toEqual([null, "Finance"]);
    expect(groups.flatMap((g) => g.items.map((i) => i.title))).toEqual([
      "Dashboard",
      "School Fees",
      "Payments",
    ]);
    expect(filterNavGroups(navGroups, new Set())).toEqual([]);
  });
});
