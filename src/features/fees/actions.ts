"use server";

import { revalidatePath } from "next/cache";
import { tenantAction } from "@/lib/authz";
import { field, toFormResult, type FormResult } from "@/lib/form-result";
import { formatMoney } from "@/lib/money";
import { chargeMonth, recordPayment, reversePayment, waiveCharge } from "./repository";
import { monthLabel } from "./schemas";

/** Fee figures appear on the fee pages and on student records. */
function revalidate() {
  revalidatePath("/fees", "layout");
  revalidatePath("/students");
}

export async function chargeMonthAction(
  month: string,
  currencyCode: string,
): Promise<FormResult<unknown>> {
  const result = await tenantAction("fees.manage_structure", (ctx) => chargeMonth(ctx, month));
  if (result.ok) revalidate();
  return toFormResult(
    result,
    result.ok
      ? `Charged ${result.data.charged} ${result.data.charged === 1 ? "student" : "students"} for ${monthLabel(result.data.month)} (${formatMoney(result.data.total, currencyCode)}).`
      : undefined,
  );
}

/**
 * Lines come from the collect form: a ticked `pay` checkbox per charge with
 * its `amount:<chargeId>` field.
 */
function paymentInput(studentId: string, formData: FormData) {
  return {
    studentId,
    paymentDate: field(formData, "paymentDate"),
    method: field(formData, "method"),
    reference: field(formData, "reference"),
    notes: field(formData, "notes"),
    lines: formData
      .getAll("pay")
      .filter((value): value is string => typeof value === "string")
      .map((chargeId) => ({ chargeId, amount: field(formData, `amount:${chargeId}`) })),
  };
}

export async function recordPaymentAction(
  studentId: string,
  _prev: FormResult<{ paymentId: string; receiptNumber: string }>,
  formData: FormData,
): Promise<FormResult<{ paymentId: string; receiptNumber: string }>> {
  const result = await tenantAction("fees.record_payment", async (ctx) => {
    const payment = await recordPayment(ctx, paymentInput(studentId, formData));
    return { paymentId: payment.id, receiptNumber: payment.receiptNumber };
  });
  if (result.ok) revalidate();
  return toFormResult(
    result,
    result.ok ? `Payment recorded: ${result.data.receiptNumber}.` : undefined,
  );
}

export async function reversePaymentAction(
  paymentId: string,
  _prev: FormResult<unknown>,
  formData: FormData,
): Promise<FormResult<unknown>> {
  const result = await tenantAction("fees.reverse_payment", (ctx) =>
    reversePayment(ctx, paymentId, { reason: field(formData, "reason") }),
  );
  if (result.ok) revalidate();
  return toFormResult(result, "Payment reversed.");
}

export async function waiveChargeAction(
  chargeId: string,
  _prev: FormResult<unknown>,
  formData: FormData,
): Promise<FormResult<unknown>> {
  const result = await tenantAction("fees.manage_structure", (ctx) =>
    waiveCharge(ctx, chargeId, { reason: field(formData, "reason") }),
  );
  if (result.ok) revalidate();
  return toFormResult(result, "Fee waived.");
}
