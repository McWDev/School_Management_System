// @vitest-environment node
import { describe, expect, it } from "vitest";
import { academicYearInputSchema } from "@/features/academic-years/schemas";

function messages(input: Record<string, unknown>) {
  const result = academicYearInputSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => i.message);
}

describe("academic year input", () => {
  it("needs only a name and defaults to Upcoming", () => {
    expect(academicYearInputSchema.parse({ name: " 2026–2027 " })).toEqual({
      name: "2026–2027",
      status: "upcoming",
    });
  });

  it("explains a missing or too long name", () => {
    expect(messages({ name: "" })).toEqual(["Enter the academic year name."]);
    expect(messages({ name: "x".repeat(41) })).toEqual(["Use at most 40 characters."]);
  });

  it("accepts Upcoming, Current and Closed only", () => {
    for (const status of ["upcoming", "current", "closed"]) {
      expect(messages({ name: "2026", status })).toEqual([]);
    }
    expect(messages({ name: "2026", status: "active" })).toEqual(["Choose a status."]);
  });
});
