"use server";

import { revalidatePath } from "next/cache";
import { tenantAction } from "@/lib/authz";
import { field, toFormResult, type FormResult } from "@/lib/form-result";
import { cancelSalaryPayment, paySalary } from "./repository";

function revalidate() {
  revalidatePath("/staff", "layout");
}

export async function paySalaryAction(
  month: string,
  staffId: string,
  _prev: FormResult<{ paymentId: string; payslipNumber: string }>,
  formData: FormData,
): Promise<FormResult<{ paymentId: string; payslipNumber: string }>> {
  const result = await tenantAction("staff.manage", async (ctx) => {
    const payment = await paySalary(ctx, month, {
      staffId,
      amount: field(formData, "amount"),
      paymentDate: field(formData, "paymentDate"),
      method: field(formData, "method"),
      reference: field(formData, "reference"),
      bonus: field(formData, "bonus"),
      deduction: field(formData, "deduction"),
      note: field(formData, "note"),
    });
    return { paymentId: payment.id, payslipNumber: payment.payslipNumber };
  });
  if (result.ok) revalidate();
  return toFormResult(
    result,
    result.ok ? `Salary paid: payslip ${result.data.payslipNumber}.` : undefined,
  );
}

export async function cancelSalaryPaymentAction(
  paymentId: string,
  _prev: FormResult<unknown>,
  formData: FormData,
): Promise<FormResult<unknown>> {
  const result = await tenantAction("staff.manage", (ctx) =>
    cancelSalaryPayment(ctx, paymentId, { reason: field(formData, "reason") }),
  );
  if (result.ok) revalidate();
  return toFormResult(result, "Payment cancelled.");
}
