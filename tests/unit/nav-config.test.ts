import { describe, expect, it } from "vitest";
import {
  allNavItems,
  filterNavGroups,
  findActiveNavItem,
  isNavItemVisible,
  navGroups,
} from "@/components/layout/nav-config";
import { isPermission } from "@/lib/permissions/catalog";

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
      "Users",
      "Roles & Permissions",
      "School Profile",
      "General Settings",
    ]);
  });

  it("has unique hrefs and only real permission keys", () => {
    const hrefs = allNavItems.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const item of allNavItems) {
      const keys = item.permission === null ? [] : [item.permission].flat();
      for (const key of keys) expect(isPermission(key)).toBe(true);
    }
  });

  it("combines School Registrations into School Profile", () => {
    expect(allNavItems.some((i) => i.title === "School Registrations")).toBe(false);
    const profile = allNavItems.find((i) => i.title === "School Profile")!;
    expect(isNavItemVisible(profile, new Set(["schools.read"]))).toBe(true);
    expect(isNavItemVisible(profile, new Set(["settings.manage"]))).toBe(true);
    expect(isNavItemVisible(profile, new Set(["students.read"]))).toBe(false);
  });

  it("resolves the most specific active item", () => {
    expect(findActiveNavItem("/fees/payments")?.title).toBe("Payments");
    expect(findActiveNavItem("/fees")?.title).toBe("School Fees");
    expect(findActiveNavItem("/students/123/edit")?.title).toBe("Students");
    expect(findActiveNavItem("/studentsx")).toBeUndefined();
  });

  it("filters items by permission and drops empty groups", () => {
    const groups = filterNavGroups(navGroups, new Set(["fees.read"]));
    expect(groups.map((g) => g.title)).toEqual([null, "Finance"]);
    expect(groups.flatMap((g) => g.items.map((i) => i.title))).toEqual([
      "Dashboard",
      "School Fees",
      "Payments",
    ]);
    // Dashboard is visible to every signed-in user.
    expect(
      filterNavGroups(navGroups, new Set()).flatMap((g) => g.items.map((i) => i.title)),
    ).toEqual(["Dashboard"]);
  });
});
