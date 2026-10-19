// @vitest-environment node
import { describe, expect, it } from "vitest";
import { formatSubjectCode, subjectInputSchema } from "@/features/subjects/schemas";

function messages(input: Record<string, unknown>) {
  const result = subjectInputSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => i.message);
}

describe("subject input", () => {
  it("needs only a name and is Active by default; a typed code is ignored", () => {
    expect(subjectInputSchema.parse({ name: " Mathematics ", code: "X" })).toEqual({
      name: "Mathematics",
      status: "active",
    });
    expect(messages({ name: "" })).toEqual(["Enter the subject name."]);
    expect(messages({ name: "x".repeat(81) })).toEqual(["Use at most 80 characters."]);
  });

  it("formats automatic subject codes", () => {
    expect(formatSubjectCode(1)).toBe("SUB-001");
    expect(formatSubjectCode(1234)).toBe("SUB-1234");
  });
});
