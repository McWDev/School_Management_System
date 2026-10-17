import { describe, expect, it } from "vitest";
import {
  allNavItems,
  filterNavGroups,
  findActiveNavItem,
  navGroups,
} from "@/components/layout/nav-config";
import { isPermission } from "@/lib/permissions/catalog";

describe("navigation config", () => {
  it("shows only the Dashboard tab in the sidebar", () => {
    expect(navGroups.flatMap((g) => g.items.map((i) => i.title))).toEqual(["Dashboard"]);
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
    expect(findActiveNavItem("/fees")?.title).toBe("School Fees");
    expect(findActiveNavItem("/studentsx")).toBeUndefined();
  });
});
