import { describe, expect, it } from "vitest";
import {
  allNavItems,
  filterNavGroups,
  findActiveNavItem,
  navGroups,
} from "@/components/layout/nav-config";
import { isPermission } from "@/lib/permissions/catalog";

describe("navigation config", () => {
  it("shows Dashboard, Academic Year, Classes, Subjects, Students, Student Fees and School Staff in that order", () => {
    expect(navGroups.flatMap((g) => g.items.map((i) => i.title))).toEqual([
      "Dashboard",
      "Academic Year",
      "Classes",
      "Subjects",
      "Students",
      "Student Fees",
      "School Staff",
    ]);
  });

  it("shows School Staff only with staff.read", () => {
    const titles = (perms: string[]) =>
      filterNavGroups(navGroups, new Set(perms)).flatMap((g) => g.items.map((i) => i.title));
    expect(titles(["staff.read"])).toEqual(["Dashboard", "School Staff"]);
    expect(titles(["classes.read"])).toEqual(["Dashboard", "Classes"]);
    expect(titles(["classes.read", "staff.read"])).toEqual([
      "Dashboard",
      "Classes",
      "School Staff",
    ]);
    expect(titles(["academic_years.read"])).toEqual(["Dashboard", "Academic Year"]);
    expect(titles(["students.read"])).toEqual(["Dashboard", "Students"]);
    expect(titles(["fees.read"])).toEqual(["Dashboard", "Student Fees"]);
    expect(titles(["courses.read"])).toEqual(["Dashboard", "Subjects"]);
  });

  it("shows Dashboard to every signed-in user", () => {
    expect(
      filterNavGroups(navGroups, new Set()).flatMap((g) => g.items.map((i) => i.title)),
    ).toEqual(["Dashboard"]);
  });

  it("keeps a catalogue of module pages with unique hrefs and real permission keys", () => {
    const hrefs = allNavItems.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const item of allNavItems) {
      const keys = item.permission === null ? [] : [item.permission].flat();
      for (const key of keys) expect(isPermission(key)).toBe(true);
    }
  });

  it("resolves the most specific page title", () => {
    expect(findActiveNavItem("/fees/payments")?.title).toBe("Payments");
    expect(findActiveNavItem("/fees")?.title).toBe("Student Fees");
    expect(findActiveNavItem("/studentsx")).toBeUndefined();
  });
});
