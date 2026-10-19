// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  formatReceiptNumber,
  monthEnd,
  monthLabel,
  monthSchema,
  paymentInputSchema,
} from "@/features/fees/schemas";

const valid = {
  studentId: "6f1b1f3e-8a4b-4b6e-9a43-2f0f3f1b2c11",
  paymentDate: "2025-10-05",
  method: "cash",
  lines: [{ chargeId: "2a4c1d7e-3b5f-4c6a-8d9e-1f2a3b4c5d6e", amount: "25.50" }],
};

function messages(input: Record<string, unknown>) {
  const result = paymentInputSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => i.message);
}

describe("fee schemas", () => {
  it("reads months and their labels", () => {
    expect(monthSchema.parse("2026-10")).toBe("2026-10-01");
    expect(monthSchema.safeParse("2026-13").success).toBe(false);
    expect(monthLabel("2026-10-01")).toBe("October 2026");
    expect(monthEnd("2026-02-01")).toBe("2026-02-28");
    expect(monthEnd("2028-02-01")).toBe("2028-02-29");
  });

  it("accepts a payment with at least one fee", () => {
    expect(paymentInputSchema.parse(valid)).toMatchObject({ method: "cash" });
    expect(messages({ ...valid, lines: [] })).toEqual(["Choose at least one fee to pay."]);
    expect(messages({ ...valid, lines: [{ ...valid.lines[0], amount: "0" }] })).toEqual([
      "The amount must be more than 0.",
    ]);
    expect(messages({ ...valid, lines: [{ ...valid.lines[0], amount: "1.234" }] })).toEqual([
      "Enter an amount like 25 or 25.50.",
    ]);
    expect(messages({ ...valid, paymentDate: "2999-01-01" })).toEqual([
      "The payment date cannot be in the future.",
    ]);
    expect(messages({ ...valid, method: "card" })).toEqual(["Choose a payment method."]);
  });

  it("formats receipt numbers", () => {
    expect(formatReceiptNumber(1)).toBe("RCT-000001");
    expect(formatReceiptNumber(1234567)).toBe("RCT-1234567");
  });
});
