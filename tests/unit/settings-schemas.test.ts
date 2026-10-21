// @vitest-environment node
import { describe, expect, it } from "vitest";
import { generalSettingsSchema } from "@/features/settings/schemas";

const valid = {
  passMark: "50",
  midtermMax: "30",
  activitiesMax: "20",
  finalMax: "50",
  studentPrefix: "stu",
  receiptPrefix: "RCT",
  payslipPrefix: "PAY",
};

function messages(input: Record<string, unknown>) {
  const result = generalSettingsSchema.safeParse(input);
  return result.success
    ? {}
    : Object.fromEntries(result.error.issues.map((i) => [i.path.join("."), i.message]));
}

describe("general settings", () => {
  it("reads numbers and upper-cases prefixes", () => {
    expect(generalSettingsSchema.parse(valid)).toEqual({
      passMark: 50,
      midtermMax: 30,
      activitiesMax: 20,
      finalMax: 50,
      studentPrefix: "STU",
      receiptPrefix: "RCT",
      payslipPrefix: "PAY",
    });
  });

  it("needs the parts to add up to 100", () => {
    expect(messages({ ...valid, finalMax: "40" })).toEqual({
      finalMax: "Midterm, Activities and Final must add up to 100 (now 90).",
    });
  });

  it("explains bad numbers and prefixes", () => {
    expect(messages({ ...valid, passMark: "0" })).toEqual({ passMark: "Use at least 1." });
    expect(messages({ ...valid, passMark: "101" })).toEqual({ passMark: "Use at most 100." });
    expect(messages({ ...valid, passMark: "4.5" })).toEqual({ passMark: "Use a whole number." });
    expect(messages({ ...valid, studentPrefix: "" })).toEqual({
      studentPrefix: "Enter the Student ID prefix.",
    });
    expect(messages({ ...valid, receiptPrefix: "RC-T" })).toEqual({
      receiptPrefix: "Use 1–6 letters or digits, e.g. STU.",
    });
    expect(messages({ ...valid, payslipPrefix: "PAYSLIP" })).toEqual({
      payslipPrefix: "Use 1–6 letters or digits, e.g. STU.",
    });
  });
});
