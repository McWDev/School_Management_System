// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  describeParts,
  examRulesFrom,
  average,
  fromHundredths,
  marksInputSchema,
  passes,
  subjectTotal,
  toHundredths,
} from "@/features/exams/schemas";

const studentId = "6f1b1f3e-8a4b-4b6e-9a43-2f0f3f1b2c11";

describe("marks input", () => {
  it("accepts marks like 25 or 25.5 and empty parts", () => {
    const ok = (midterm: string) =>
      marksInputSchema.safeParse({ entries: [{ studentId, midterm, activities: "", final: "" }] })
        .success;
    expect([ok("25"), ok("25.5"), ok("0"), ok("")]).toEqual([true, true, true, true]);
    expect([ok("-1"), ok("2.555"), ok("abc"), ok("100")]).toEqual([false, false, false, false]);
  });
});

describe("marks arithmetic", () => {
  it("adds Midterm, Activities and Final exactly (missing parts count as 0)", () => {
    expect(fromHundredths(subjectTotal({ midterm: "25.5", activities: "18", final: "45" }))).toBe(
      "88.5",
    );
    expect(fromHundredths(subjectTotal({ midterm: "20", activities: null, final: "30" }))).toBe(
      "50",
    );
    expect(fromHundredths(toHundredths("0.05"))).toBe("0.05");
  });

  it("averages subject totals to one decimal (rounded down) and passes from 50", () => {
    expect(average([toHundredths("90"), toHundredths("45.5")])).toBe("67.7"); // 67.75
    expect(average([toHundredths("50"), toHundredths("49.9")])).toBe("49.9"); // 49.95, a Fail
    expect(average([toHundredths("100"), toHundredths("100")])).toBe("100.0");
    expect(average([])).toBe("0.0");
    const h = (...values: string[]) => values.map(toHundredths);
    // Pass/Fail uses the exact average: 49.95 fails.
    expect(passes(h("50", "49.9"), 50)).toBe(false);
    expect(passes(h("50", "50"), 50)).toBe(true);
    expect(passes(h("100", "0"), 50)).toBe(true);
    expect(passes([], 50)).toBe(false);
  });
});

describe("exam rules from settings", () => {
  it("builds each part's maximum and a description", () => {
    const rules = examRulesFrom({ passMark: 40, midtermMax: 20, activitiesMax: 20, finalMax: 60 });
    expect(rules.passMark).toBe(40);
    expect(rules.parts.map((p) => [p.key, p.max])).toEqual([
      ["midterm", 20],
      ["activities", 20],
      ["final", 60],
    ]);
    expect(describeParts(rules)).toBe("Midterm 20 + Activities 20 + Final 60");
    // A higher pass mark makes the same totals fail.
    expect(passes([toHundredths("55")], 60)).toBe(false);
  });
});
