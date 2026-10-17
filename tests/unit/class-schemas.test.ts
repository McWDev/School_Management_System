// @vitest-environment node
import { describe, expect, it } from "vitest";
import { classInputSchema, MAX_CLASS_SEATS } from "@/features/classes/schemas";

function messages(input: Record<string, unknown>) {
  const result = classInputSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => i.message);
}

describe("class input", () => {
  it("needs a class name and seats, and defaults to Active", () => {
    expect(classInputSchema.parse({ name: " Grade 1A ", seats: " 40 " })).toEqual({
      name: "Grade 1A",
      seats: 40,
      status: "active",
    });
  });

  it("explains what is missing", () => {
    expect(messages({ name: "", seats: "" })).toEqual([
      "Enter the class name.",
      "Enter the number of seats.",
    ]);
  });

  it.each([
    ["0", "A class needs at least 1 seat."],
    [String(MAX_CLASS_SEATS + 1), `Use at most ${MAX_CLASS_SEATS} seats.`],
    ["12.5", "Enter a whole number of seats."],
    ["-3", "Enter a whole number of seats."],
    ["forty", "Enter a whole number of seats."],
  ])("rejects %j seats", (seats, message) => {
    expect(messages({ name: "Grade 1A", seats })).toContain(message);
  });

  it.each(["1", "35", String(MAX_CLASS_SEATS)])("accepts %s seats", (seats) => {
    expect(messages({ name: "Grade 1A", seats })).toEqual([]);
  });

  it("accepts Active and Inactive only", () => {
    expect(messages({ name: "A", seats: "10", status: "inactive" })).toEqual([]);
    expect(messages({ name: "A", seats: "10", status: "closed" })).not.toEqual([]);
  });
});
