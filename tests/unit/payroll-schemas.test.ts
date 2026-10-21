// @vitest-environment node
import { describe, expect, it } from "vitest";
import { formatPayslipNumber, salaryPaymentInputSchema } from "@/features/payroll/schemas";

const valid = {
  staffId: "6f1b1f3e-8a4b-4b6e-9a43-2f0f3f1b2c11",
  amount: "300",
  paymentDate: "2026-10-01",
  method: "cash",
};

function messages(input: Record<string, unknown>) {
  const result = salaryPaymentInputSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => i.message);
}

describe("salary payment input", () => {
  it("treats empty bonus and deduction as 0", () => {
    expect(salaryPaymentInputSchema.parse({ ...valid, bonus: "", deduction: "" })).toMatchObject({
      amount: "300",
      bonus: "0",
      deduction: "0",
    });
    expect(
      salaryPaymentInputSchema.parse({ ...valid, bonus: "25.5", deduction: "10" }),
    ).toMatchObject({
      bonus: "25.5",
      deduction: "10",
    });
  });

  it("explains missing or bad amounts and dates", () => {
    expect(messages({ ...valid, amount: "", bonus: "", deduction: "" })).toEqual([
      "Enter the amount paid.",
    ]);
    expect(messages({ ...valid, amount: "0", bonus: "", deduction: "" })).toEqual([
      "The amount must be more than 0.",
    ]);
    expect(messages({ ...valid, bonus: "1.234", deduction: "" })).toEqual([
      "Enter an amount like 300 or 300.50.",
    ]);
    expect(messages({ ...valid, paymentDate: "2999-01-01", bonus: "", deduction: "" })).toEqual([
      "The payment date cannot be in the future.",
    ]);
  });

  it("formats payslip numbers", () => {
    expect(formatPayslipNumber(1)).toBe("PAY-000001");
  });
});
